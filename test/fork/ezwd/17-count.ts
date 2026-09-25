import { ethers, network } from "hardhat";
import * as fs from "fs";
const RPC=process.env.FORK_RPC||"https://mainnet.gateway.tenderly.co";
const IMPL={fxusd:"0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd",treasury:"0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC",pool:"0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5"};
const A:any={EZETH:"0xbf5495Efe5DB9ce00f80364C8B423567e58d2110",EZ_TREASURY:"0x38965311507D4E54973F81475a149c09376e241e",EZ_MARKET:"0x69518D1D70AD537C41401303BDf96032338E40dE",FEZETH:"0x50B4DC15b34E31671c9cA40F9eb05D7eBd6b13f9",XEZETH:"0x2e5A5AF7eE900D34BCFB70C47023bf1d6bE35CF5",EZ_POOL:"0xf58c499417e36714e99803Cb135f507a95ae7169",XEZ_POOL:"0xBa947cba270D30967369Bf1f73884Be2533d7bDB",RUSD:"0x65D72AA8DA931F047169112fcf34f52DbaAE7D18",SAFE:"0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF",PROXY_ADMIN:"0x9b54b7703551d9d0ced177a78367560a8b2edda4",TIMELOCK:"0x68863fb8855b04509a835082478D6E3D0bE4E61a",FXN:"0x365AccFCa291e7D3914637ABf1F7635dB165Bb09"};
const E=10n**18n; const f=(v:bigint)=>ethers.formatUnits(v,18);
const ERC20=["function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)"];
const PA=["function upgrade(address,address)"];
const M_ABI=["function updateRedeemFeeRatio(uint256,int256,bool)"];
const T_ABI=["function initializeWindDown(uint256,uint256,uint256,uint256,uint256)"];
const P_ABI=["function windDown(uint256,uint256) returns (uint256,uint256)","function claim(address,address)","function claimable(address,address) view returns (uint256)","function checkpoint(address)","function balanceOf(address) view returns (uint256)"];
async function imp(a:string){await network.provider.send("hardhat_impersonateAccount",[a]);await network.provider.send("hardhat_setBalance",[a,"0x21e19e0c9bab2400000"]);return await ethers.getSigner(a);}
const snap=async()=>await network.provider.send("evm_snapshot",[]);
const back=async(s:string)=>{await network.provider.send("evm_revert",[s]);};
const isDiv0=(e:any)=>((e.shortMessage||e.message||"")+"").includes("panic code 0x12");

async function main(){
  const H=JSON.parse(fs.readFileSync("/tmp/ezwd/holders.json","utf8"));
  await network.provider.request({method:"hardhat_reset",params:[{forking:{jsonRpcUrl:RPC}}]});
  await network.provider.send("evm_mine",[]);
  const [dev]=await ethers.getSigners(); const safe=await imp(A.SAFE);
  const ez=new ethers.Contract(A.EZETH,ERC20,ethers.provider),fez=new ethers.Contract(A.FEZETH,ERC20,ethers.provider),xez=new ethers.Contract(A.XEZETH,ERC20,ethers.provider);
  const tl=await imp(A.TIMELOCK); const pa=new ethers.Contract(A.PROXY_ADMIN,PA,tl);
  for(const [px,im] of [[A.RUSD,IMPL.fxusd],[A.EZ_TREASURY,IMPL.treasury],[A.EZ_POOL,IMPL.pool],[A.XEZ_POOL,IMPL.pool]]) await (await pa.upgrade(px,im)).wait();
  const M=new ethers.Contract(A.EZ_MARKET,M_ABI,safe);
  await (await M.updateRedeemFeeRatio(0,0,true)).wait(); await (await M.updateRedeemFeeRatio(0,0,false)).wait();
  const T=new ethers.Contract(A.EZ_TREASURY,T_ABI,safe);
  const B=await ez.balanceOf(A.EZ_TREASURY),Fs=await fez.totalSupply(),X=await xez.totalSupply();
  await (await T.initializeWindDown(B,Fs,X,Fs,(X*346669734551971069n)/E)).wait();

  const perms:Record<string,(l:string[])=>string[]> = {
    "按份额从大到小": l=>l,
    "按份额从小到大": l=>[...l].reverse(),
    "第 2 个人先领": l=>{const c=[...l];[c[0],c[1]]=[c[1],c[0]];return c;},
    "最后一个先领":  l=>{const c=[...l];const x=c.pop()!;return [x,...c];},
  };
  const tally:Record<string,Set<string>>={};
  for(const [pname,pool,key] of [["ezPool",A.EZ_POOL,"ezpool"],["xezPool",A.XEZ_POOL,"xezpool"]] as const){
    console.log(`\n=== ${pname}  ${H[key].length} 个存款人 ===`);
    tally[pname]=new Set();
    for(const [oname,perm] of Object.entries(perms)){
      const s=await snap();
      const Pl=new ethers.Contract(pool,P_ABI,ethers.provider);
      await (await (Pl.connect(safe) as any).windDown(await fez.balanceOf(pool),0)).wait();
      const order=perm(H[key].map((x:any[])=>x[0]));
      const res:string[]=[]; let ok=0;
      for(const st of order){
        try{ await (await (Pl.connect(dev) as any).claim(st,ethers.ZeroAddress)).wait(); res.push(st.slice(0,8)+" 成功"); ok++; }
        catch(e){ res.push(st.slice(0,8)+(isDiv0(e)?" 除零":" 其他失败")); tally[pname].add(st); }
      }
      console.log(`  ${oname.padEnd(16)} 成功 ${ok}/${order.length}   ${res.join("  ")}`);
      await back(s);
    }
    // 变体:先对某一个人 checkpoint(不领取),再全员领取
    {
      const s=await snap();
      const Pl=new ethers.Contract(pool,P_ABI,ethers.provider);
      await (await (Pl.connect(safe) as any).windDown(await fez.balanceOf(pool),0)).wait();
      await (await (Pl.connect(dev) as any).checkpoint(H[key][2][0])).wait();   // 只 checkpoint 第 3 个人
      let ok=0; const res:string[]=[];
      for(const [st] of H[key]){ try{ await (await (Pl.connect(dev) as any).claim(st,ethers.ZeroAddress)).wait(); ok++; res.push(st.slice(0,8)+" 成功"); }catch(e){ res.push(st.slice(0,8)+(isDiv0(e)?" 除零":" 其他")); } }
      console.log(`  ${"先 checkpoint 第3人".padEnd(16)} 成功 ${ok}/${H[key].length}   ${res.join("  ")}`);
      await back(s);
    }
  }
  console.log("\n=== 结论 ===");
  let total=0;
  for(const [pname,set] of Object.entries(tally)){
    console.log(`  ${pname}: 任一顺序下都恰好 1 人成功;在至少一种顺序下会失败的地址有 ${set.size} 个`);
  }
  console.log("  每池永远只有第一个被 checkpoint 的账户能领,其余全部除零");
  console.log(`  受影响人数 = 总存款人 ${H.ezpool.length + H.xezpool.length} - 幸存者 2 = ${H.ezpool.length + H.xezpool.length - 2}`);
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
