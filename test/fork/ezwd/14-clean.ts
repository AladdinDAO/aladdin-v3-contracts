import { ethers, network } from "hardhat";
import * as fs from "fs";
const RPC=process.env.FORK_RPC||"https://mainnet.gateway.tenderly.co";
const IMPL={fxusd:"0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd",treasury:"0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC",pool:"0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5"};
const A:any={EZETH:"0xbf5495Efe5DB9ce00f80364C8B423567e58d2110",EZ_TREASURY:"0x38965311507D4E54973F81475a149c09376e241e",EZ_MARKET:"0x69518D1D70AD537C41401303BDf96032338E40dE",FEZETH:"0x50B4DC15b34E31671c9cA40F9eb05D7eBd6b13f9",XEZETH:"0x2e5A5AF7eE900D34BCFB70C47023bf1d6bE35CF5",EZ_POOL:"0xf58c499417e36714e99803Cb135f507a95ae7169",XEZ_POOL:"0xBa947cba270D30967369Bf1f73884Be2533d7bDB",RUSD:"0x65D72AA8DA931F047169112fcf34f52DbaAE7D18",SAFE:"0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF",PROXY_ADMIN:"0x9b54b7703551d9d0ced177a78367560a8b2edda4",TIMELOCK:"0x68863fb8855b04509a835082478D6E3D0bE4E61a",FXN:"0x365AccFCa291e7D3914637ABf1F7635dB165Bb09"};
const DEP_A="0x000000000000000000000000000000000000a001",DEP_B="0x000000000000000000000000000000000000B002";
const E=10n**18n; const f=(v:bigint)=>ethers.formatUnits(v,18);
const ERC20=["function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)","function transfer(address,uint256) returns (bool)","function approve(address,uint256) returns (bool)"];
const PA=["function upgrade(address,address)"];
const M_ABI=["function updateRedeemFeeRatio(uint256,int256,bool)"];
const T_ABI=["function initializeWindDown(uint256,uint256,uint256,uint256,uint256)","function windDownPreviewRedeem(uint256,uint256) view returns (uint256)"];
const P_ABI=["function windDown(uint256,uint256) returns (uint256,uint256)","function claim(address,address)","function claimable(address,address) view returns (uint256)","function checkpoint(address)","function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)","function deposit(uint256,address)","function getStakerVoteOwner(address) view returns (address)","function numTotalSupplyHistory() view returns (uint256)"];
const errOf=(e:any)=>{const m=(e.shortMessage||e.message||"").toString();return m.includes("panic code 0x12")?"DIV/0":m.replace(/^.*custom error /,"").slice(0,40);};
async function imp(a:string){await network.provider.send("hardhat_impersonateAccount",[a]);await network.provider.send("hardhat_setBalance",[a,"0x21e19e0c9bab2400000"]);return await ethers.getSigner(a);}
const snap=async()=>await network.provider.send("evm_snapshot",[]);
const back=async(s:string)=>{await network.provider.send("evm_revert",[s]);};

async function main(){
  const H=JSON.parse(fs.readFileSync("/tmp/ezwd/holders.json","utf8"));
  await network.provider.request({method:"hardhat_reset",params:[{forking:{jsonRpcUrl:RPC}}]});
  await network.provider.send("evm_mine",[]);
  const [dev]=await ethers.getSigners(); const safe=await imp(A.SAFE);
  const ez=new ethers.Contract(A.EZETH,ERC20,ethers.provider),fez=new ethers.Contract(A.FEZETH,ERC20,ethers.provider),xez=new ethers.Contract(A.XEZETH,ERC20,ethers.provider),fxn=new ethers.Contract(A.FXN,ERC20,ethers.provider);
  const T=new ethers.Contract(A.EZ_TREASURY,T_ABI,ethers.provider);
  const tl=await imp(A.TIMELOCK); const pa=new ethers.Contract(A.PROXY_ADMIN,PA,tl);
  for(const [px,im] of [[A.RUSD,IMPL.fxusd],[A.EZ_TREASURY,IMPL.treasury],[A.EZ_POOL,IMPL.pool],[A.XEZ_POOL,IMPL.pool]]) await (await pa.upgrade(px,im)).wait();
  const M=new ethers.Contract(A.EZ_MARKET,M_ABI,safe);
  await (await M.updateRedeemFeeRatio(0,0,true)).wait(); await (await M.updateRedeemFeeRatio(0,0,false)).wait();
  const B=await ez.balanceOf(A.EZ_TREASURY),Fs=await fez.totalSupply(),X=await xez.totalSupply();
  await (await (T.connect(safe) as any).initializeWindDown(B,Fs,X,Fs,(X*346669734551971069n)/E)).wait();
  const base=await snap();

  async function measure(label:string, withCheckpoint:boolean){
    const s=await snap();
    let outEz=0n,outFxn=0n,okTot=0,tot=0;
    const rows:string[]=[];
    for(const [name,addr,key] of [["ezPool",A.EZ_POOL,"ezpool"],["xezPool",A.XEZ_POOL,"xezpool"]] as const){
      const Pl=new ethers.Contract(addr,P_ABI,ethers.provider);
      if(withCheckpoint) for(const [st] of H[key]) await (await (Pl.connect(safe) as any).checkpoint(st)).wait();
      await (await (Pl.connect(safe) as any).windDown(await fez.balanceOf(addr),0)).wait();
      let ok=0; const det:string[]=[];
      for(const [st] of H[key]){
        try{ await (await (Pl.connect(dev) as any).claim(st,ethers.ZeroAddress)).wait(); ok++; det.push(st.slice(0,8)+":OK"); }
        catch(e){ det.push(st.slice(0,8)+":"+errOf(e)); }
      }
      const le=await ez.balanceOf(addr), lf=await fxn.balanceOf(addr);
      rows.push(`    ${name.padEnd(8)} ${ok}/${H[key].length}  ${det.join(" ")}`);
      rows.push(`             stranded ${f(le)} ezETH + ${f(lf)} FXN`);
      outEz+=le; outFxn+=lf; okTot+=ok; tot+=H[key].length;
    }
    console.log(`  ${label}`);
    rows.forEach(r=>console.log(r));
    console.log(`    TOTAL ${okTot}/${tot} claimed, stranded ${f(outEz)} ezETH + ${f(outFxn)} FXN`);
    await back(s);
    return {outEz,outFxn,okTot,tot};
  }

  console.log("########## clean measurement, no synthetic depositors ##########");
  const bad=await measure("plan as written (no checkpoints):", false);
  console.log();
  const good=await measure("plan + checkpoint() before each windDown:", true);

  console.log("\n########## why the repo fork test passes ##########");
  {
    const s=await snap();
    const EZP=new ethers.Contract(A.EZ_POOL,P_ABI,ethers.provider);
    console.log("  the repo test claims ONLY for its two synthetic depositors:");
    console.log("    _claimPoolReward(EZ_REBALANCE_POOL, POOL_DEPOSITOR_A / _B)");
    console.log("    it never calls claim() for any of the 6 real production depositors");
    console.log("  and those two synthetic accounts have no vote owner:");
    const poolSigner=await imp(A.EZ_POOL);
    // seed them the way the repo test does, on the already-upgraded pool is not possible (deposit disabled),
    // so just show the property that matters
    for(const d of [DEP_A,DEP_B]) console.log(`    ${d}  getStakerVoteOwner = ${await EZP.getStakerVoteOwner(d)}`);
    console.log("  every real depositor shares one vote owner:");
    for(const [st] of H.ezpool.slice(0,3)) console.log(`    ${st}  getStakerVoteOwner = ${await EZP.getStakerVoteOwner(st)}`);
    await back(s);
  }

  console.log("\n########## are the stranded funds recoverable? ##########");
  {
    const s=await snap();
    for(const [name,addr,key] of [["ezPool",A.EZ_POOL,"ezpool"],["xezPool",A.XEZ_POOL,"xezpool"]] as const){
      const Pl=new ethers.Contract(addr,[...P_ABI,"function adminClaim()"],ethers.provider);
      await (await (Pl.connect(safe) as any).windDown(await fez.balanceOf(addr),0)).wait();
      for(const [st] of H[key]){ try{ await (await (Pl.connect(dev) as any).claim(st,ethers.ZeroAddress)).wait(); }catch(e){} }
    }
    // finalize the treasury so pool adminClaim becomes callable
    const Tf=new ethers.Contract(A.EZ_TREASURY,[...T_ABI,"function finalizeWindDown()"],safe);
    await (await Tf.finalizeWindDown()).wait();
    let rec=0n,recF=0n;
    for(const addr of [A.EZ_POOL,A.XEZ_POOL]){
      const Pl=new ethers.Contract(addr,[...P_ABI,"function adminClaim()"],safe);
      const e0=await ez.balanceOf(A.SAFE), f0=await fxn.balanceOf(A.SAFE);
      await (await Pl.adminClaim()).wait();
      rec+=(await ez.balanceOf(A.SAFE))-e0; recF+=(await fxn.balanceOf(A.SAFE))-f0;
    }
    console.log(`  Pool.adminClaim() recovered ${f(rec)} ezETH + ${f(recF)} FXN to the Safe`);
    console.log("  -> nothing is burned; the funds are fully recoverable by the admin and can be refunded off-chain");
    await back(s);
  }
  console.log();
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
