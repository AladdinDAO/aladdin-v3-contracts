import { ethers, network } from "hardhat";
import * as fs from "fs";
const RPC=process.env.FORK_RPC||"https://mainnet.gateway.tenderly.co";
const IMPL={fxusd:"0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd",treasury:"0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC",pool:"0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5"};
const A:any={EZETH:"0xbf5495Efe5DB9ce00f80364C8B423567e58d2110",EZ_TREASURY:"0x38965311507D4E54973F81475a149c09376e241e",EZ_MARKET:"0x69518D1D70AD537C41401303BDf96032338E40dE",FEZETH:"0x50B4DC15b34E31671c9cA40F9eb05D7eBd6b13f9",XEZETH:"0x2e5A5AF7eE900D34BCFB70C47023bf1d6bE35CF5",EZ_POOL:"0xf58c499417e36714e99803Cb135f507a95ae7169",XEZ_POOL:"0xBa947cba270D30967369Bf1f73884Be2533d7bDB",RUSD:"0x65D72AA8DA931F047169112fcf34f52DbaAE7D18",SAFE:"0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF",PROXY_ADMIN:"0x9b54b7703551d9d0ced177a78367560a8b2edda4",TIMELOCK:"0x68863fb8855b04509a835082478D6E3D0bE4E61a",FXN:"0x365AccFCa291e7D3914637ABf1F7635dB165Bb09",VOTE_OWNER:"0xd11a4Ee017cA0BECA8FA45fF2abFe9C6267b7881"};
const E=10n**18n; const f=(v:bigint)=>ethers.formatUnits(v,18); const WEEK=604800;
const ERC20=["function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)"];
const PA=["function upgrade(address,address)"];
const M_ABI=["function updateRedeemFeeRatio(uint256,int256,bool)"];
const T_ABI=["function initializeWindDown(uint256,uint256,uint256,uint256,uint256)","function windDownPreviewRedeem(uint256,uint256) view returns (uint256)"];
const P_ABI=["function windDown(uint256,uint256) returns (uint256,uint256)","function claim(address,address)","function claimable(address,address) view returns (uint256)","function checkpoint(address)","function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)","function toggleVoteSharing(address)","function getStakerVoteOwner(address) view returns (address)"];
let P=0,F=0;const ck=(l:string,c:boolean,d="")=>{if(c){P++;console.log("  PASS  "+l+(d?"  "+d:""));}else{F++;console.log("  FAIL  "+l+(d?"  "+d:""));}};
async function imp(a:string){await network.provider.send("hardhat_impersonateAccount",[a]);await network.provider.send("hardhat_setBalance",[a,"0x21e19e0c9bab2400000"]);return await ethers.getSigner(a);}
const snap=async()=>await network.provider.send("evm_snapshot",[]);
const back=async(s:string)=>{await network.provider.send("evm_revert",[s]);};
async function upgradeAll(){const tl=await imp(A.TIMELOCK);const pa=new ethers.Contract(A.PROXY_ADMIN,PA,tl);
  for(const [p,i] of [[A.RUSD,IMPL.fxusd],[A.EZ_TREASURY,IMPL.treasury],[A.EZ_POOL,IMPL.pool],[A.XEZ_POOL,IMPL.pool]]) await (await pa.upgrade(p,i)).wait();}
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
  const now=(await ethers.provider.getBlock("latest"))!.timestamp;
  const nextWeek=Math.ceil(now/WEEK)*WEEK;
  console.log(`now ${new Date(now*1000).toISOString()}  next WEEK boundary ${new Date(nextWeek*1000).toISOString()} (in ${((nextWeek-now)/3600).toFixed(1)}h)\n`);

  for(const [mname,mitigate] of [
    ["pre-windDown checkpoint(all)", "checkpoint"],
    ["revoke vote sharing (Convex)", "revoke"],
    ["none", "none"],
  ] as const){
    console.log(`########## mitigation: ${mname} ##########`);
    for(const [dlabel,delay] of [["same block",0],["+1h",3600],["+1d",86400],["just before the week boundary",nextWeek-now-600],["just after the week boundary",nextWeek-now+600],["+2w",2*WEEK],["+6w",6*WEEK]] as const){
      const s=await snap();
      if(mitigate==="revoke"){
        const Pl0=new ethers.Contract(A.EZ_POOL,P_ABI,ethers.provider);
        const vo=await imp(A.VOTE_OWNER);
        for(const [st] of H.ezpool) await (await (Pl0.connect(vo) as any).toggleVoteSharing(st)).wait();
      }
      await upgradeAll(); await initWD(safe);
      const Pl=new ethers.Contract(A.EZ_POOL,P_ABI,ethers.provider);
      if(mitigate==="checkpoint"){ for(const [st] of H.ezpool) await (await (Pl.connect(dev) as any).checkpoint(st)).wait(); }
      await (await (Pl.connect(safe) as any).windDown(await fez.balanceOf(A.EZ_POOL),0)).wait();
      if(delay>0){ await network.provider.send("evm_increaseTime",[Number(delay)]); await network.provider.send("evm_mine",[]); }
      let ok=0,stuck=0n;
      for(const [st] of H.ezpool){
        let c=0n; try{ c=await (Pl as any).claimable(st,A.EZETH); }catch(e){}
        try{ await (await (Pl.connect(dev) as any).claim(st,ethers.ZeroAddress)).wait(); ok++; }catch(e){ stuck+=c; }
      }
      const tag=ok===H.ezpool.length?"ALL OK":`only ${ok}/${H.ezpool.length}`;
      ck(`  ${dlabel.padEnd(30)} ${tag}`, ok===H.ezpool.length, stuck>0n?`stuck ${f(stuck)} ezETH`:"");
      await back(s);
    }
    console.log();
  }

  console.log("########## is checkpoint(address) really permissionless? ##########");
  {
    const s=await snap();
    await upgradeAll(); await initWD(safe);
    const Pl=new ethers.Contract(A.EZ_POOL,P_ABI,ethers.provider);
    const stranger=(await ethers.getSigners())[9];
    try{ await (await (Pl.connect(stranger) as any).checkpoint(H.ezpool[0][0])).wait(); ck("any address can call checkpoint(staker)", true, stranger.address); }
    catch(e:any){ ck("any address can call checkpoint(staker)", false, (e.shortMessage||"").slice(0,60)); }
    await back(s);
  }

  console.log("\n########## can the whole thing be one atomic Safe batch? ##########");
  {
    const s=await snap();
    await upgradeAll(); await initWD(safe);
    const Pl=new ethers.Contract(A.EZ_POOL,P_ABI,ethers.provider);
    const XP=new ethers.Contract(A.XEZ_POOL,P_ABI,ethers.provider);
    // simulate one batch: checkpoint all + windDown, both pools
    for(const [st] of H.ezpool) await (await (Pl.connect(safe) as any).checkpoint(st)).wait();
    await (await (Pl.connect(safe) as any).windDown(await fez.balanceOf(A.EZ_POOL),0)).wait();
    for(const [st] of H.xezpool) await (await (XP.connect(safe) as any).checkpoint(st)).wait();
    await (await (XP.connect(safe) as any).windDown(await fez.balanceOf(A.XEZ_POOL),0)).wait();
    let ok=0,tot=0;
    for(const [name,C,key] of [["ezPool",Pl,"ezpool"],["xezPool",XP,"xezpool"]] as const){
      let o=0; for(const [st] of H[key]){ try{ await (await (C.connect(dev) as any).claim(st,ethers.ZeroAddress)).wait(); o++; }catch(e){} }
      ck(`  ${name}: ${o}/${H[key].length} claim immediately after the batch`, o===H[key].length);
      ok+=o; tot+=H[key].length;
    }
    // now let a week pass and try the ones that had not claimed -> already all claimed, so re-check claimable
    await network.provider.send("evm_increaseTime",[2*WEEK]); await network.provider.send("evm_mine",[]);
    let lateOk=0;
    for(const [name,C,key] of [["ezPool",Pl,"ezpool"],["xezPool",XP,"xezpool"]] as const){
      for(const [st] of H[key]){ try{ await (await (C.connect(dev) as any).claim(st,ethers.ZeroAddress)).wait(); lateOk++; }catch(e){} }
    }
    ck(`  after claiming once, a later claim still works for ${lateOk}/${tot}`, lateOk===tot);
    await back(s);
  }
  console.log("\nPASS "+P+"  FAIL "+F);
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
