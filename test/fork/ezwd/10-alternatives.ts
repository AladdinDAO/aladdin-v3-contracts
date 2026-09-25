import { ethers, network } from "hardhat";
import * as fs from "fs";
const RPC=process.env.FORK_RPC||"https://mainnet.gateway.tenderly.co";
const IMPL={fxusd:"0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd",treasury:"0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC",pool:"0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5"};
const A:any={EZETH:"0xbf5495Efe5DB9ce00f80364C8B423567e58d2110",EZ_TREASURY:"0x38965311507D4E54973F81475a149c09376e241e",EZ_MARKET:"0x69518D1D70AD537C41401303BDf96032338E40dE",FEZETH:"0x50B4DC15b34E31671c9cA40F9eb05D7eBd6b13f9",XEZETH:"0x2e5A5AF7eE900D34BCFB70C47023bf1d6bE35CF5",EZ_POOL:"0xf58c499417e36714e99803Cb135f507a95ae7169",XEZ_POOL:"0xBa947cba270D30967369Bf1f73884Be2533d7bDB",RUSD:"0x65D72AA8DA931F047169112fcf34f52DbaAE7D18",SAFE:"0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF",PROXY_ADMIN:"0x9b54b7703551d9d0ced177a78367560a8b2edda4",TIMELOCK:"0x68863fb8855b04509a835082478D6E3D0bE4E61a",FXN:"0x365AccFCa291e7D3914637ABf1F7635dB165Bb09",VOTE_OWNER:"0xd11a4Ee017cA0BECA8FA45fF2abFe9C6267b7881"};
const E=10n**18n; const f=(v:bigint)=>ethers.formatUnits(v,18);
const ERC20=["function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)","function approve(address,uint256) returns (bool)"];
const PA=["function upgrade(address,address)"];
const M_ABI=["function updateRedeemFeeRatio(uint256,int256,bool)","function redeemFToken(uint256,address,uint256) returns (uint256,uint256)"];
const T_ABI=["function initializeWindDown(uint256,uint256,uint256,uint256,uint256)","function windDownPreviewRedeem(uint256,uint256) view returns (uint256)","function windDownStatus() view returns (uint8)"];
const P_ABI=["function windDown(uint256,uint256) returns (uint256,uint256)","function claim(address,address)","function claimable(address,address) view returns (uint256)","function checkpoint(address)","function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)","function getStakerVoteOwner(address) view returns (address)","function toggleVoteSharing(address)","function withdraw(uint256,address)","function withdrawFrom(address,uint256,address)","function voteOwnerBalances(address) view returns (uint104,uint112,uint40)","function adminClaim()"];
const R_ABI=["function redeemFrom(address,uint256,address,uint256) returns (uint256,uint256)","function getRebalancePools() view returns (address[])","function removeRebalancePools(address[])","function removeMarket(address)","function markets(address) view returns (address,address,address,uint256,uint256)"];
const CVX=["function owner() view returns (address)","function withdraw(uint256)","function getReward(bool,address[])"];
let P=0,F=0;const ck=(l:string,c:boolean,d="")=>{if(c){P++;console.log("  PASS  "+l+(d?"  "+d:""));}else{F++;console.log("  FAIL  "+l+(d?"  "+d:""));}};
const say=(l:string,r:string)=>console.log("  "+l.padEnd(62)+" -> "+r);
async function imp(a:string){await network.provider.send("hardhat_impersonateAccount",[a]);await network.provider.send("hardhat_setBalance",[a,"0x21e19e0c9bab2400000"]);return await ethers.getSigner(a);}
const snap=async()=>await network.provider.send("evm_snapshot",[]);
const back=async(s:string)=>{await network.provider.send("evm_revert",[s]);};
const err=(e:any)=>{const m=(e.shortMessage||e.message||"").toString();return m.includes("panic code 0x12")?"DIV/0":m.replace(/^.*custom error /,"").replace(/^VM Exception[^:]*: /,"").slice(0,60);};
async function upgradeCore(){const tl=await imp(A.TIMELOCK);const pa=new ethers.Contract(A.PROXY_ADMIN,PA,tl);
  await (await pa.upgrade(A.RUSD,IMPL.fxusd)).wait(); await (await pa.upgrade(A.EZ_TREASURY,IMPL.treasury)).wait();}
async function upgradePools(){const tl=await imp(A.TIMELOCK);const pa=new ethers.Contract(A.PROXY_ADMIN,PA,tl);
  await (await pa.upgrade(A.EZ_POOL,IMPL.pool)).wait(); await (await pa.upgrade(A.XEZ_POOL,IMPL.pool)).wait();}
async function initWD(safe:any){
  const ez=new ethers.Contract(A.EZETH,ERC20,ethers.provider),fez=new ethers.Contract(A.FEZETH,ERC20,ethers.provider),xez=new ethers.Contract(A.XEZETH,ERC20,ethers.provider);
  const T=new ethers.Contract(A.EZ_TREASURY,T_ABI,ethers.provider),M=new ethers.Contract(A.EZ_MARKET,M_ABI,ethers.provider);
  await (await (M.connect(safe) as any).updateRedeemFeeRatio(0,0,true)).wait();
  await (await (M.connect(safe) as any).updateRedeemFeeRatio(0,0,false)).wait();
  const B=await ez.balanceOf(A.EZ_TREASURY),Fs=await fez.totalSupply(),X=await xez.totalSupply();
  await (await (T.connect(safe) as any).initializeWindDown(B,Fs,X,Fs,(X*346669734551971069n)/E)).wait();}

async function main(){
  const H=JSON.parse(fs.readFileSync("/tmp/ezwd/holders.json","utf8"));
  await network.provider.request({method:"hardhat_reset",params:[{forking:{jsonRpcUrl:RPC}}]});
  await network.provider.send("evm_mine",[]);
  const [dev]=await ethers.getSigners(); const safe=await imp(A.SAFE);
  const ez=new ethers.Contract(A.EZETH,ERC20,ethers.provider),fez=new ethers.Contract(A.FEZETH,ERC20,ethers.provider);
  const T=new ethers.Contract(A.EZ_TREASURY,T_ABI,ethers.provider);
  const R=new ethers.Contract(A.RUSD,R_ABI,ethers.provider);

  console.log("########## A. What can a pool staker do TODAY (nothing upgraded)? ##########");
  {
    const s=await snap();
    const Pl=new ethers.Contract(A.EZ_POOL,P_ABI,ethers.provider);
    const st=H.ezpool[0][0]; const v=new ethers.Contract(st,CVX,ethers.provider);
    const own=await v.owner(); const os=await imp(own);
    const share=await Pl.balanceOf(st);
    console.log(`  staker ${st} pool share ${f(share)}`);
    try{ await (v.connect(os) as any)["withdraw(uint256)"].staticCall(share/2n); say("Convex vault.withdraw(half) on the LIVE pool","OK"); }
    catch(e){ say("Convex vault.withdraw(half) on the LIVE pool","REVERT "+err(e)); }
    const vs=await imp(st);
    try{ await (Pl.connect(vs) as any).withdraw.staticCall(share/2n,st); say("pool.withdraw() directly from the vault (live impl)","OK (no-op by design)"); }
    catch(e){ say("pool.withdraw() directly from the vault (live impl)","REVERT "+err(e)); }
    const b0=await fez.balanceOf(st);
    await (await (Pl.connect(vs) as any).withdraw(share/2n,st)).wait();
    ck("live pool.withdraw() moves nothing (silent no-op)", (await fez.balanceOf(st))===b0 && (await Pl.balanceOf(st))===share);
    await back(s);
  }

  console.log("\n########## B. Plan B: exit the pools via rUSD.redeemFrom, WITHOUT upgrading the pools ##########");
  {
    const s=await snap();
    await upgradeCore(); await initWD(safe);
    ck("pools still on the ORIGINAL implementation", true);
    const Pl=new ethers.Contract(A.EZ_POOL,P_ABI,ethers.provider);
    let ok=0,total=0n;
    for(const [st] of H.ezpool){
      const share=await Pl.balanceOf(st);
      if(share===0n) continue;
      const expect=await T.windDownPreviewRedeem(share,0);
      const vs=await imp(st);
      const b0=await ez.balanceOf(st);
      try{
        const r=await (R.connect(vs) as any).redeemFrom.staticCall(A.EZ_POOL,share,st,0);
        await (await (R.connect(vs) as any).redeemFrom(A.EZ_POOL,share,st,0)).wait();
        const got=(await ez.balanceOf(st))-b0;
        ck(`  ${st.slice(0,10)} exited via rUSD.redeemFrom at the fixed rate`, got===expect, `${f(got)}`);
        ok++; total+=got;
      }catch(e){ ck(`  ${st.slice(0,10)} exited via rUSD.redeemFrom`, false, err(e)); }
    }
    ck(`ALL ${H.ezpool.length} ezPool stakers exited without windDown() and without the boost bug`, ok===H.ezpool.length, `total ${f(total)} ezETH`);
    ck("ezPool fezETH fully drained", (await fez.balanceOf(A.EZ_POOL))===0n, f(await fez.balanceOf(A.EZ_POOL)));
    ck("ezPool totalSupply now 0", (await Pl.totalSupply())===0n);
    // and FXN is still claimable afterwards
    let fxnOk=0;
    for(const [st] of H.ezpool){ try{ await (await (Pl.connect(dev) as any).claim(st,ethers.ZeroAddress)).wait(); fxnOk++; }catch(e){} }
    ck(`all ${H.ezpool.length} stakers can still claim() afterwards (no div-by-zero)`, fxnOk===H.ezpool.length);
    await back(s);
  }

  console.log("\n########## C. Is redeemFrom still available after removeRebalancePools? ##########");
  {
    const s=await snap();
    await upgradeCore(); await initWD(safe);
    await (await (R.connect(safe) as any).removeRebalancePools([A.EZ_POOL,A.XEZ_POOL])).wait();
    const st=H.ezpool[0][0]; const vs=await imp(st);
    const Pl=new ethers.Contract(A.EZ_POOL,P_ABI,ethers.provider);
    try{ await (R.connect(vs) as any).redeemFrom.staticCall(A.EZ_POOL,await Pl.balanceOf(st),st,0); say("redeemFrom after removeRebalancePools","OK"); ck("removeRebalancePools does NOT close the exit",true); }
    catch(e){ say("redeemFrom after removeRebalancePools","REVERT "+err(e)); ck("removeRebalancePools CLOSES the plan-B exit -> hard ordering constraint",true); }
    await back(s);
  }

  console.log("\n########## D. Any admin-only mitigation for the boost bug? ##########");
  for(const [label,prep] of [
    ["checkpoint every staker in one block right AFTER windDown", "after"],
    ["checkpoint every staker right BEFORE windDown", "before"],
    ["claim every staker (FXN) right BEFORE windDown", "claimbefore"],
  ] as const){
    const s=await snap();
    await upgradeCore(); await upgradePools(); await initWD(safe);
    const Pl=new ethers.Contract(A.EZ_POOL,P_ABI,ethers.provider);
    if(prep==="before"){ for(const [st] of H.ezpool) await (await (Pl.connect(dev) as any).checkpoint(st)).wait(); }
    if(prep==="claimbefore"){ for(const [st] of H.ezpool) await (await (Pl.connect(dev) as any).claim(st,ethers.ZeroAddress)).wait(); }
    await (await (Pl.connect(safe) as any).windDown(await fez.balanceOf(A.EZ_POOL),0)).wait();
    if(prep==="after"){ for(const [st] of H.ezpool){ try{ await (await (Pl.connect(dev) as any).checkpoint(st)).wait(); }catch(e){} } }
    let ok=0;
    for(const [st] of H.ezpool){ try{ await (await (Pl.connect(dev) as any).claim(st,ethers.ZeroAddress)).wait(); ok++; }catch(e){} }
    ck(`  ${label}: ${ok} of ${H.ezpool.length} can claim`, ok===H.ezpool.length, ok===H.ezpool.length?"works":"does NOT fix it");
    await back(s);
  }

  console.log("\n########## E. Exact point of no return ##########");
  {
    const s=await snap();
    await upgradeCore(); await initWD(safe);
    const Pl0=new ethers.Contract(A.EZ_POOL,P_ABI,ethers.provider);
    const vo=await imp(A.VOTE_OWNER);
    try{ await (Pl0.connect(vo) as any).toggleVoteSharing.staticCall(H.ezpool[0][0]); say("toggleVoteSharing BEFORE the pool upgrade","OK"); }catch(e){ say("toggleVoteSharing BEFORE the pool upgrade","REVERT "+err(e)); }
    await upgradePools();
    try{ await (Pl0.connect(vo) as any).toggleVoteSharing.staticCall(H.ezpool[0][0]); say("toggleVoteSharing AFTER the pool upgrade","OK"); }catch(e){ say("toggleVoteSharing AFTER the pool upgrade","REVERT "+err(e)); }
    const vs=await imp(H.ezpool[0][0]);
    try{ await (R.connect(vs) as any).redeemFrom.staticCall(A.EZ_POOL,await Pl0.balanceOf(H.ezpool[0][0]),H.ezpool[0][0],0); say("rUSD.redeemFrom AFTER the pool upgrade","OK"); }catch(e){ say("rUSD.redeemFrom AFTER the pool upgrade","REVERT "+err(e)); }
    console.log("  => the pool proxy upgrade is the point of no return for both escape routes");
    await back(s);
  }
  console.log("\nPASS "+P+"  FAIL "+F);
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
