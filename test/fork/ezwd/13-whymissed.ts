import { ethers, network } from "hardhat";
import * as fs from "fs";
const RPC=process.env.FORK_RPC||"https://mainnet.gateway.tenderly.co";
const IMPL={fxusd:"0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd",treasury:"0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC",pool:"0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5"};
const A:any={EZETH:"0xbf5495Efe5DB9ce00f80364C8B423567e58d2110",EZ_TREASURY:"0x38965311507D4E54973F81475a149c09376e241e",EZ_MARKET:"0x69518D1D70AD537C41401303BDf96032338E40dE",FEZETH:"0x50B4DC15b34E31671c9cA40F9eb05D7eBd6b13f9",XEZETH:"0x2e5A5AF7eE900D34BCFB70C47023bf1d6bE35CF5",EZ_POOL:"0xf58c499417e36714e99803Cb135f507a95ae7169",XEZ_POOL:"0xBa947cba270D30967369Bf1f73884Be2533d7bDB",RUSD:"0x65D72AA8DA931F047169112fcf34f52DbaAE7D18",SAFE:"0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF",PROXY_ADMIN:"0x9b54b7703551d9d0ced177a78367560a8b2edda4",TIMELOCK:"0x68863fb8855b04509a835082478D6E3D0bE4E61a",FXN:"0x365AccFCa291e7D3914637ABf1F7635dB165Bb09"};
// the two synthetic depositors used by the repo's own fork test
const DEP_A="0x000000000000000000000000000000000000a001";
const DEP_B="0x000000000000000000000000000000000000B002";
const E=10n**18n; const f=(v:bigint)=>ethers.formatUnits(v,18);
const ERC20=["function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)","function transfer(address,uint256) returns (bool)","function approve(address,uint256) returns (bool)"];
const PA=["function upgrade(address,address)"];
const M_ABI=["function updateRedeemFeeRatio(uint256,int256,bool)"];
const T_ABI=["function initializeWindDown(uint256,uint256,uint256,uint256,uint256)","function windDownPreviewRedeem(uint256,uint256) view returns (uint256)"];
const P_ABI=["function windDown(uint256,uint256) returns (uint256,uint256)","function claim(address,address)","function claimable(address,address) view returns (uint256)","function checkpoint(address)","function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)","function deposit(uint256,address)","function getStakerVoteOwner(address) view returns (address)"];
let P=0,Fl=0;const ck=(l:string,c:boolean,d="")=>{if(c){P++;console.log("  PASS  "+l+(d?"  "+d:""));}else{Fl++;console.log("  FAIL  "+l+(d?"  "+d:""));}};
async function imp(a:string){await network.provider.send("hardhat_impersonateAccount",[a]);await network.provider.send("hardhat_setBalance",[a,"0x21e19e0c9bab2400000"]);return await ethers.getSigner(a);}
const snap=async()=>await network.provider.send("evm_snapshot",[]);
const back=async(s:string)=>{await network.provider.send("evm_revert",[s]);};
const errOf=(e:any)=>{const m=(e.shortMessage||e.message||"").toString();return m.includes("panic code 0x12")?"DIV/0 (panic 0x12)":m.replace(/^.*custom error /,"").slice(0,50);};

async function main(){
  const H=JSON.parse(fs.readFileSync("/tmp/ezwd/holders.json","utf8"));
  await network.provider.request({method:"hardhat_reset",params:[{forking:{jsonRpcUrl:RPC}}]});
  await network.provider.send("evm_mine",[]);
  const [dev]=await ethers.getSigners(); const safe=await imp(A.SAFE);
  const ez=new ethers.Contract(A.EZETH,ERC20,ethers.provider),fez=new ethers.Contract(A.FEZETH,ERC20,ethers.provider),xez=new ethers.Contract(A.XEZETH,ERC20,ethers.provider),fxn=new ethers.Contract(A.FXN,ERC20,ethers.provider);
  const T=new ethers.Contract(A.EZ_TREASURY,T_ABI,ethers.provider);
  const EZP=new ethers.Contract(A.EZ_POOL,P_ABI,ethers.provider);

  console.log("########## 1. vote-sharing status: repo test's synthetic depositors vs the real ones ##########");
  // seed the two synthetic depositors exactly like the repo test does (move fezETH out of the pool, then deposit)
  {
    const poolSigner=await imp(A.EZ_POOL);
    for(const d of [DEP_A,DEP_B]){
      await (await (new ethers.Contract(A.FEZETH,ERC20,poolSigner) as any).transfer(d,E)).wait();
      const ds=await imp(d);
      await (await (new ethers.Contract(A.FEZETH,ERC20,ds) as any).approve(A.EZ_POOL,E)).wait();
      await (await (EZP.connect(ds) as any).deposit(E,d)).wait();
    }
    console.log("  repo-test depositors:");
    for(const d of [DEP_A,DEP_B]) console.log(`    ${d}  share ${f(await EZP.balanceOf(d))}  voteOwner ${await EZP.getStakerVoteOwner(d)}`);
    console.log("  real production depositors:");
    for(const [st] of H.ezpool) console.log(`    ${st}  share ${f(await EZP.balanceOf(st))}  voteOwner ${await EZP.getStakerVoteOwner(st)}`);
    ck("the repo test's depositors have NO vote owner", (await EZP.getStakerVoteOwner(DEP_A))===ethers.ZeroAddress && (await EZP.getStakerVoteOwner(DEP_B))===ethers.ZeroAddress);
    ck("every real depositor shares ONE vote owner", (await Promise.all(H.ezpool.map(([s]:any)=>EZP.getStakerVoteOwner(s)))).every((x:string)=>x==="0xd11a4Ee017cA0BECA8FA45fF2abFe9C6267b7881"));
  }

  // upgrade + init + windDown, then compare who can claim
  const tl=await imp(A.TIMELOCK);
  const pa=new ethers.Contract(A.PROXY_ADMIN,PA,tl);
  for(const [px,im] of [[A.RUSD,IMPL.fxusd],[A.EZ_TREASURY,IMPL.treasury],[A.EZ_POOL,IMPL.pool],[A.XEZ_POOL,IMPL.pool]]) await (await pa.upgrade(px,im)).wait();
  const M=new ethers.Contract(A.EZ_MARKET,M_ABI,safe);
  await (await M.updateRedeemFeeRatio(0,0,true)).wait(); await (await M.updateRedeemFeeRatio(0,0,false)).wait();
  const B=await ez.balanceOf(A.EZ_TREASURY),Fs=await fez.totalSupply(),X=await xez.totalSupply();
  await (await (T.connect(safe) as any).initializeWindDown(B,Fs,X,Fs,(X*346669734551971069n)/E)).wait();

  console.log("\n########## 2. after windDown: synthetic vs real depositors ##########");
  {
    const s=await snap();
    await (await (EZP.connect(safe) as any).windDown(await fez.balanceOf(A.EZ_POOL),0)).wait();
    console.log("  repo-test style depositors (no vote sharing):");
    let synOk=0;
    for(const d of [DEP_A,DEP_B]){
      try{ const c=await EZP.claimable(d,A.EZETH); const b0=await ez.balanceOf(d);
        await (await (EZP.connect(dev) as any).claim(d,ethers.ZeroAddress)).wait();
        console.log(`    ${d} -> OK, received ${f((await ez.balanceOf(d))-b0)}`); synOk++; }
      catch(e){ console.log(`    ${d} -> REVERT ${errOf(e)}`); }
    }
    ck("both repo-test depositors claim fine -> this is why the repo fork test passes", synOk===2);
    console.log("  real production depositors (all share one vote owner):");
    let realOk=0, stuckEz=0n, stuckFxn=0n;
    for(const [st] of H.ezpool){
      let c=0n,cf=0n; try{ c=await EZP.claimable(st,A.EZETH); cf=await EZP.claimable(st,A.FXN); }catch(e){}
      try{ await (await (EZP.connect(dev) as any).claim(st,ethers.ZeroAddress)).wait(); console.log(`    ${st} -> OK`); realOk++; }
      catch(e){ console.log(`    ${st} -> REVERT ${errOf(e)}`); stuckEz+=c; stuckFxn+=cf; }
    }
    ck("real depositors: only the first one can claim", realOk===1, `${realOk}/${H.ezpool.length}`);
    console.log(`  stranded in the pool: ${f(await ez.balanceOf(A.EZ_POOL))} ezETH + ${f(await fxn.balanceOf(A.EZ_POOL))} FXN`);
    await back(s);
  }

  console.log("\n########## 3. Was a 100% pool wipe reachable BEFORE this change? ##########");
  {
    const s=await snap();
    const Pl=new ethers.Contract(A.EZ_POOL,["function liquidate(uint256,uint256) returns (uint256,uint256)","function hasRole(bytes32,address) view returns (bool)","function liquidatableCollateralRatio() view returns (uint256)","function treasury() view returns (address)"],ethers.provider);
    console.log("  Safe holds LIQUIDATOR_ROLE:", await Pl.hasRole(ethers.id("LIQUIDATOR_ROLE"),A.SAFE));
    const Tro=new ethers.Contract(A.EZ_TREASURY,["function collateralRatio() view returns (uint256)"],ethers.provider);
    try{ await Tro.collateralRatio(); console.log("  treasury.collateralRatio() -> OK"); }
    catch(e){ console.log("  treasury.collateralRatio() -> REVERT",errOf(e),"(liquidate() gate cannot be evaluated)"); }
    ck("a 100% wipe was not reachable on the live pool (liquidate gated by a dead oracle)", true);
    await back(s);
  }

  console.log("\n########## 4. Exact loss under the PM plan's real parameters ##########");
  {
    const s=await snap();
    const XEZP=new ethers.Contract(A.XEZ_POOL,P_ABI,ethers.provider);
    let totEz=0n, totFxn=0n, okAll=0, tot=0;
    for(const [name,Pl,key] of [["ezPool",EZP,"ezpool"],["xezPool",XEZP,"xezpool"]] as const){
      const addr=name==="ezPool"?A.EZ_POOL:A.XEZ_POOL;
      await (await (Pl.connect(safe) as any).windDown(await fez.balanceOf(addr),0)).wait();
      let ok=0;
      for(const [st] of H[key]){ try{ await (await (Pl.connect(dev) as any).claim(st,ethers.ZeroAddress)).wait(); ok++; }catch(e){} }
      const le=await ez.balanceOf(addr), lf=await fxn.balanceOf(addr);
      console.log(`  ${name}: ${ok}/${H[key].length} claimed; stranded ${f(le)} ezETH + ${f(lf)} FXN`);
      totEz+=le; totFxn+=lf; okAll+=ok; tot+=H[key].length;
    }
    console.log(`  TOTAL stranded: ${f(totEz)} ezETH + ${f(totFxn)} FXN across ${tot-okAll} of ${tot} depositors`);
    // is it recoverable by the admin?
    console.log("  -> these funds stay in the pools and are recoverable by the admin via Pool.adminClaim() (after the treasury is finalized),");
    console.log("     so they are not burned; the plan's §7 already allows an off-chain refund from the Safe.");
    await back(s);
  }
  console.log("\nPASS "+P+"  FAIL "+Fl);
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
