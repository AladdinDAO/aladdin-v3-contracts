import { ethers, network } from "hardhat";
import * as fs from "fs";
const RPC = process.env.FORK_RPC || "https://mainnet.gateway.tenderly.co";
const IMPL = { fxusd: "0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd", treasury: "0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC", pool: "0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5" };
const A: any = { EZETH:"0xbf5495Efe5DB9ce00f80364C8B423567e58d2110", EZ_TREASURY:"0x38965311507D4E54973F81475a149c09376e241e", EZ_MARKET:"0x69518D1D70AD537C41401303BDf96032338E40dE", FEZETH:"0x50B4DC15b34E31671c9cA40F9eb05D7eBd6b13f9", XEZETH:"0x2e5A5AF7eE900D34BCFB70C47023bf1d6bE35CF5", EZ_POOL:"0xf58c499417e36714e99803Cb135f507a95ae7169", XEZ_POOL:"0xBa947cba270D30967369Bf1f73884Be2533d7bDB", RUSD:"0x65D72AA8DA931F047169112fcf34f52DbaAE7D18", SAFE:"0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF", PROXY_ADMIN:"0x9b54b7703551d9d0ced177a78367560a8b2edda4", TIMELOCK:"0x68863fb8855b04509a835082478D6E3D0bE4E61a", FXN:"0x365AccFCa291e7D3914637ABf1F7635dB165Bb09" };
const E=10n**18n; const f=(v:bigint)=>ethers.formatUnits(v,18);
const ERC20=["function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)"];
const PA=["function upgrade(address,address)"];
const M_ABI=["function updateRedeemFeeRatio(uint256,int256,bool)"];
const T_ABI=["function initializeWindDown(uint256,uint256,uint256,uint256,uint256)","function windDownPreviewRedeem(uint256,uint256) view returns (uint256)"];
const P_ABI=["function windDown(uint256,uint256) returns (uint256,uint256)","function claim(address,address)","function claimable(address,address) view returns (uint256)","function checkpoint(address)","function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)","function getStakerVoteOwner(address) view returns (address)","function boostCheckpoint(address) view returns (uint64,uint64)","function voteOwnerBalances(address) view returns (uint104,uint112,uint40)","function numTotalSupplyHistory() view returns (uint256)","function totalSupplyHistory(uint256) view returns (uint104,uint112,uint40)","function getBoostRatio(address) view returns (uint256)","function hasRole(bytes32,address) view returns (bool)"];
async function imp(a:string){await network.provider.send("hardhat_impersonateAccount",[a]);await network.provider.send("hardhat_setBalance",[a,"0x21e19e0c9bab2400000"]);return await ethers.getSigner(a);}
const snap=async()=>await network.provider.send("evm_snapshot",[]);
const back=async(s:string)=>{await network.provider.send("evm_revert",[s]);};

async function main(){
  const H=JSON.parse(fs.readFileSync("/tmp/ezwd/holders.json","utf8"));
  await network.provider.request({method:"hardhat_reset",params:[{forking:{jsonRpcUrl:RPC}}]});
  await network.provider.send("evm_mine",[]);
  const [dev]=await ethers.getSigners();
  const tl=await imp(A.TIMELOCK), safe=await imp(A.SAFE);
  const pa=new ethers.Contract(A.PROXY_ADMIN,PA,tl);
  for(const [p,i] of [[A.RUSD,IMPL.fxusd],[A.EZ_TREASURY,IMPL.treasury],[A.EZ_POOL,IMPL.pool],[A.XEZ_POOL,IMPL.pool]]) await (await pa.upgrade(p,i)).wait();
  const M=new ethers.Contract(A.EZ_MARKET,M_ABI,ethers.provider);
  await (await (M.connect(safe) as any).updateRedeemFeeRatio(0,0,true)).wait();
  await (await (M.connect(safe) as any).updateRedeemFeeRatio(0,0,false)).wait();
  const ez=new ethers.Contract(A.EZETH,ERC20,ethers.provider), fez=new ethers.Contract(A.FEZETH,ERC20,ethers.provider), xez=new ethers.Contract(A.XEZETH,ERC20,ethers.provider), fxn=new ethers.Contract(A.FXN,ERC20,ethers.provider);
  const T=new ethers.Contract(A.EZ_TREASURY,T_ABI,ethers.provider);
  const B=await ez.balanceOf(A.EZ_TREASURY),F=await fez.totalSupply(),X=await xez.totalSupply();
  await (await (T.connect(safe) as any).initializeWindDown(B,F,X,F,(X*346669734551971069n)/E)).wait();

  console.log("=== pre-windDown staker state ===");
  for(const [name,addr,key] of [["ezPool",A.EZ_POOL,"ezpool"],["xezPool",A.XEZ_POOL,"xezpool"]] as const){
    const P=new ethers.Contract(addr,P_ABI,ethers.provider);
    console.log(" ",name,"numTotalSupplyHistory",String(await P.numTotalSupplyHistory()));
    for(const [s] of H[key]){
      const owner=await P.getStakerVoteOwner(s);
      const bc=await P.boostCheckpoint(s);
      let vob="-";
      if(owner!==ethers.ZeroAddress){const v=await P.voteOwnerBalances(owner); vob=`amount=${f(v[0])} updateAt=${v[2]}`;}
      console.log(`    ${s}  voteOwner=${owner===ethers.ZeroAddress?"(none)":owner}  boostRatio=${f(bc[0])} historyIndex=${bc[1]}  ownerBal=${vob}`);
    }
  }

  console.log("\n=== claim() at increasing delays after windDown ===");
  for(const [name,addr,key] of [["ezPool",A.EZ_POOL,"ezpool"],["xezPool",A.XEZ_POOL,"xezpool"]] as const){
    const P=new ethers.Contract(addr,P_ABI,ethers.provider);
    for(const [dlabel,delay] of [["t+0",0],["t+1h",3600],["t+1d",86400],["t+1w",604800],["t+3w",1814400],["t+8w",4838400]] as const){
      const s=await snap();
      const bal=await fez.balanceOf(addr);
      await (await (P.connect(safe) as any).windDown(bal,0)).wait();
      if(delay>0){ await network.provider.send("evm_increaseTime",[delay]); await network.provider.send("evm_mine",[]); }
      const results:string[]=[];
      for(const [st] of H[key]){
        try{ const c=await (P as any).claimable(st,A.EZETH); const b0=await ez.balanceOf(st);
          await (await (P.connect(dev) as any).claim(st,ethers.ZeroAddress)).wait();
          const g=(await ez.balanceOf(st))-b0;
          results.push(`${st.slice(0,8)}:OK(${g===c?"exact":"MISMATCH"})`);
        }catch(e:any){ const m=(e.shortMessage||e.message||"").toString();
          results.push(`${st.slice(0,8)}:REVERT(${m.includes("0x12")||m.includes("panic code 0x12")?"DIV/0":m.slice(0,30)})`); }
      }
      console.log(`  ${name} ${dlabel.padEnd(5)} -> ${results.join("  ")}`);
      await back(s);
    }
  }

  console.log("\n=== does the same happen WITHOUT wind-down (baseline, upgraded impl but pool not wound down)? ===");
  for(const [name,addr,key] of [["ezPool",A.EZ_POOL,"ezpool"],["xezPool",A.XEZ_POOL,"xezpool"]] as const){
    const P=new ethers.Contract(addr,P_ABI,ethers.provider);
    for(const [dlabel,delay] of [["t+0",0],["t+1w",604800],["t+8w",4838400]] as const){
      const s=await snap();
      if(delay>0){ await network.provider.send("evm_increaseTime",[delay]); await network.provider.send("evm_mine",[]); }
      const results:string[]=[];
      for(const [st] of H[key]){
        try{ await (await (P.connect(dev) as any).claim(st,ethers.ZeroAddress)).wait(); results.push(`${st.slice(0,8)}:OK`); }
        catch(e:any){ const m=(e.shortMessage||e.message||"").toString(); results.push(`${st.slice(0,8)}:REVERT(${m.includes("0x12")?"DIV/0":m.slice(0,28)})`); }
      }
      console.log(`  ${name} no-winddown ${dlabel.padEnd(5)} -> ${results.join("  ")}`);
      await back(s);
    }
  }

  console.log("\n=== checkpoint() alone (same code path) after windDown, long delay ===");
  for(const [name,addr,key] of [["ezPool",A.EZ_POOL,"ezpool"],["xezPool",A.XEZ_POOL,"xezpool"]] as const){
    const P=new ethers.Contract(addr,P_ABI,ethers.provider);
    const s=await snap();
    const bal=await fez.balanceOf(addr);
    await (await (P.connect(safe) as any).windDown(bal,0)).wait();
    await network.provider.send("evm_increaseTime",[8*604800]); await network.provider.send("evm_mine",[]);
    for(const [st] of H[key]){
      let r="OK";
      try{ await (await (P.connect(dev) as any).checkpoint(st)).wait(); }catch(e:any){ r="REVERT "+((e.shortMessage||e.message||"").toString().includes("0x12")?"DIV/0":(e.shortMessage||"").slice(0,30)); }
      let gb="-"; try{ gb=f(await (P as any).getBoostRatio(st)); }catch(e){ gb="getBoostRatio REVERT"; }
      console.log(`  ${name} ${st.slice(0,10)} checkpoint -> ${r}   getBoostRatio -> ${gb}`);
    }
    await back(s);
  }
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
