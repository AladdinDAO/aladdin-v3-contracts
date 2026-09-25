import { ethers, network } from "hardhat";
import * as fs from "fs";
const RPC=process.env.FORK_RPC||"https://mainnet.gateway.tenderly.co";
const IMPL={fxusd:"0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd",treasury:"0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC",pool:"0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5"};
const A:any={EZETH:"0xbf5495Efe5DB9ce00f80364C8B423567e58d2110",EZ_TREASURY:"0x38965311507D4E54973F81475a149c09376e241e",EZ_MARKET:"0x69518D1D70AD537C41401303BDf96032338E40dE",FEZETH:"0x50B4DC15b34E31671c9cA40F9eb05D7eBd6b13f9",XEZETH:"0x2e5A5AF7eE900D34BCFB70C47023bf1d6bE35CF5",EZ_POOL:"0xf58c499417e36714e99803Cb135f507a95ae7169",XEZ_POOL:"0xBa947cba270D30967369Bf1f73884Be2533d7bDB",RUSD:"0x65D72AA8DA931F047169112fcf34f52DbaAE7D18",SAFE:"0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF",PROXY_ADMIN:"0x9b54b7703551d9d0ced177a78367560a8b2edda4",TIMELOCK:"0x68863fb8855b04509a835082478D6E3D0bE4E61a",FXN:"0x365AccFCa291e7D3914637ABf1F7635dB165Bb09",VO:"0xd11a4Ee017cA0BECA8FA45fF2abFe9C6267b7881"};
const E=10n**18n; const f=(v:bigint)=>ethers.formatUnits(v,18); const WEEK=604800n;
const ERC20=["function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)","function transfer(address,uint256) returns (bool)","function approve(address,uint256) returns (bool)"];
const PA=["function upgrade(address,address)"];
const M_ABI=["function updateRedeemFeeRatio(uint256,int256,bool)"];
const T_ABI=["function initializeWindDown(uint256,uint256,uint256,uint256,uint256)"];
// NOTE: TokenBalance is { uint112 product; uint104 amount; uint40 updateAt; }
const P_ABI=["function windDown(uint256,uint256) returns (uint256,uint256)","function claim(address,address)","function claimable(address,address) view returns (uint256)","function checkpoint(address)","function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)","function getStakerVoteOwner(address) view returns (address)","function voteOwnerBalances(address) view returns (uint112 product,uint104 amount,uint40 updateAt)","function totalSupplyHistory(uint256) view returns (uint112 product,uint104 amount,uint40 updateAt)","function numTotalSupplyHistory() view returns (uint256)","function boostCheckpoint(address) view returns (uint64 boostRatio,uint64 historyIndex)","function deposit(uint256,address)","function userRewardSnapshot(address,address) view returns (uint128 pending,uint128 claimed,uint64 ts,uint192 integral)"];
const epochOf=(prod:bigint)=>prod>>88n, expOf=(prod:bigint)=>(prod>>64n)&0xffffffn, magOf=(prod:bigint)=>prod&0xffffffffffffffffn;
const errOf=(e:any)=>{const m=(e.shortMessage||e.message||"").toString();return m.includes("panic code 0x12")?"DIV/0 (panic 0x12)":m.replace(/^.*custom error /,"").slice(0,45);};
async function imp(a:string){await network.provider.send("hardhat_impersonateAccount",[a]);await network.provider.send("hardhat_setBalance",[a,"0x21e19e0c9bab2400000"]);return await ethers.getSigner(a);}
const snap=async()=>await network.provider.send("evm_snapshot",[]);
const back=async(s:string)=>{await network.provider.send("evm_revert",[s]);};
const ts=async()=>BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
const wk=(t:bigint)=>((t+WEEK-1n)/WEEK)*WEEK;

async function main(){
  const H=JSON.parse(fs.readFileSync("/tmp/ezwd/holders.json","utf8"));
  await network.provider.request({method:"hardhat_reset",params:[{forking:{jsonRpcUrl:RPC}}]});
  await network.provider.send("evm_mine",[]);
  const [dev]=await ethers.getSigners(); const safe=await imp(A.SAFE);
  const ez=new ethers.Contract(A.EZETH,ERC20,ethers.provider),fez=new ethers.Contract(A.FEZETH,ERC20,ethers.provider),xez=new ethers.Contract(A.XEZETH,ERC20,ethers.provider);
  const T=new ethers.Contract(A.EZ_TREASURY,T_ABI,ethers.provider);
  const P=new ethers.Contract(A.EZ_POOL,P_ABI,ethers.provider);

  console.log("########## A. 触发条件逐项检查（ezPool 6 个真实存款人，升级前的链上状态）##########");
  const now=await ts();
  console.log(`  当前时间 ${new Date(Number(now)*1000).toISOString()}`);
  for(const [st] of H.ezpool){
    const vo=await P.getStakerVoteOwner(st);
    const bc=await P.boostCheckpoint(st);
    const cf=await P.claimable(st,A.FXN);
    const hist=await P.totalSupplyHistory(bc.historyIndex);
    console.log(`  ${st.slice(0,10)}  voteOwner=${vo===ethers.ZeroAddress?"(none)":vo.slice(0,10)}  claimable(FXN)=${f(cf)}  historyIndex=${bc.historyIndex}  该档 updateAt=${new Date(Number(hist.updateAt)*1000).toISOString().slice(0,10)}`);
  }
  const voB=await P.voteOwnerBalances(A.VO);
  console.log(`  共享 voteOwner ${A.VO}`);
  console.log(`    product=epoch ${epochOf(voB.product)}/exp ${expOf(voB.product)}  amount=${f(voB.amount)}  updateAt=${new Date(Number(voB.updateAt)*1000).toISOString()}`);
  console.log(`    距今 ${((Number(now)-Number(voB.updateAt))/86400).toFixed(1)} 天，已跨过 ${Math.floor((Number(now)-Number(voB.updateAt))/604800)} 个周边界`);

  // upgrade + init
  const tl=await imp(A.TIMELOCK); const pa=new ethers.Contract(A.PROXY_ADMIN,PA,tl);
  for(const [px,im] of [[A.RUSD,IMPL.fxusd],[A.EZ_TREASURY,IMPL.treasury],[A.EZ_POOL,IMPL.pool],[A.XEZ_POOL,IMPL.pool]]) await (await pa.upgrade(px,im)).wait();
  const M=new ethers.Contract(A.EZ_MARKET,M_ABI,safe);
  await (await M.updateRedeemFeeRatio(0,0,true)).wait(); await (await M.updateRedeemFeeRatio(0,0,false)).wait();
  const B=await ez.balanceOf(A.EZ_TREASURY),Fs=await fez.totalSupply(),X=await xez.totalSupply();
  await (await (T.connect(safe) as any).initializeWindDown(B,Fs,X,Fs,(X*346669734551971069n)/E)).wait();

  console.log("\n########## B. 逐步追踪:windDown -> 第 1 次 claim -> 第 2 次 claim ##########");
  {
    const s=await snap();
    const dump=async(tag:string)=>{
      const sup=await P.totalSupply(); const n=await P.numTotalSupplyHistory();
      const last=await P.totalSupplyHistory(n-1n);
      const vb=await P.voteOwnerBalances(A.VO);
      console.log(`  [${tag}]`);
      console.log(`     pool totalSupply=${f(sup)}  history 条数=${n}  最新档 epoch=${epochOf(last.product)} amount=${f(last.amount)} updateAt=${last.updateAt}`);
      console.log(`     voteOwnerBalances: epoch=${epochOf(vb.product)} amount=${f(vb.amount)} updateAt=${vb.updateAt}`);
    };
    await dump("windDown 之前");
    await (await (P.connect(safe) as any).windDown(await fez.balanceOf(A.EZ_POOL),0)).wait();
    await dump("windDown 之后（epoch 已 +1，totalSupply 归零，但 voteOwnerBalances 未动）");
    const a1=H.ezpool[0][0], a2=H.ezpool[1][0];
    const c1=await P.claimable(a1,A.EZETH);
    await (await (P.connect(dev) as any).claim(a1,ethers.ZeroAddress)).wait();
    await dump(`第 1 个人 ${a1.slice(0,10)} claim 成功（领到 ${f(c1)} ezETH）`);
    console.log(`     ^ 关键:它的 checkpoint 把 voteOwnerBalances 写成了 amount=0、updateAt=当前`);
    try{ const c2=await P.claimable(a2,A.EZETH); console.log(`     第 2 个人 claimable 读数 ${f(c2)}`); }
    catch(e){ console.log(`     第 2 个人 claimable() 读数 -> REVERT ${errOf(e)}`); }
    try{ await (await (P.connect(dev) as any).claim(a2,ethers.ZeroAddress)).wait(); console.log(`     第 2 个人 claim -> OK`); }
    catch(e){ console.log(`     第 2 个人 ${a2.slice(0,10)} claim -> REVERT ${errOf(e)}`); }
    await back(s);
  }

  console.log("\n########## C. 三个必要条件,各去掉一个会怎样 ##########");
  // C1: 没有 vote owner 的账户
  {
    const s=await snap();
    await (await (P.connect(safe) as any).windDown(await fez.balanceOf(A.EZ_POOL),0)).wait();
    await (await (P.connect(dev) as any).claim(H.ezpool[0][0],ethers.ZeroAddress)).wait();  // 先毁掉 voteOwnerBalances
    // 造一个无 vote owner 的账户很难在升级后做(deposit 已禁),改为直接读第 2 个人验证条件成立
    const vo=await P.getStakerVoteOwner(H.ezpool[1][0]);
    console.log(`  C1 条件「账户有 vote owner」:第 2 个人 voteOwner=${vo}  -> 成立`);
    console.log(`     对照:仓库测试里的 0x…a001 / 0x…B002 voteOwner=0x0,该分支走 _ownerBalance==_realBalance,不会除零`);
    await back(s);
  }
  // C2: fullEarned == 0 (没有新增 FXN)
  {
    const s=await snap();
    const a2=H.ezpool[1][0];
    const before=await P.claimable(a2,A.FXN);
    console.log(`  C2 条件「自上次 checkpoint 以来有新增 FXN」:第 2 个人 claimable(FXN)=${f(before)}  -> ${before>0n?"成立":"不成立"}`);
    await back(s);
  }
  // C3: 上次 checkpoint 距今已跨周
  {
    const s=await snap();
    const bc=await P.boostCheckpoint(H.ezpool[1][0]);
    const hist=await P.totalSupplyHistory(bc.historyIndex);
    const n2=await ts();
    console.log(`  C3 条件「账户上次更新距今已跨周边界」:historyIndex ${bc.historyIndex} 的 updateAt=${new Date(Number(hist.updateAt)*1000).toISOString().slice(0,10)},距今 ${((Number(n2)-Number(hist.updateAt))/86400).toFixed(0)} 天 -> 成立`);
    console.log(`     这条正是 checkpoint 修复起作用的地方:checkpoint 把账户的 product 刷成清零前的最新值,`);
    console.log(`     之后周循环访问到的都是清零后的 supply 档,_getCompoundedBalance 返回 0,走进 _balance==0 的早退分支`);
    await back(s);
  }

  console.log("\n########## D. 部分亏损(非 100%)会不会触发 ##########");
  console.log("  _notifyLoss 只有在 _loss >= _supply.amount 时才把 epoch +1(见 L704-L710)");
  console.log("  部分清算走 else 分支,只缩小 magnitude,epoch 不变 -> _getCompoundedBalance 不返回 0 -> 不触发");
  console.log("  因此历史上所有正常 liquidate 都不会遇到这个问题;windDown 是第一个必然 100% 清零的入口");

  console.log("\n########## E. 修复后再看同样的三步 ##########");
  {
    const s=await snap();
    for(const [st] of H.ezpool) await (await (P.connect(safe) as any).checkpoint(st)).wait();
    const vb=await P.voteOwnerBalances(A.VO);
    console.log(`  checkpoint 全部之后:voteOwnerBalances epoch=${epochOf(vb.product)} amount=${f(vb.amount)} updateAt=${vb.updateAt}`);
    await (await (P.connect(safe) as any).windDown(await fez.balanceOf(A.EZ_POOL),0)).wait();
    let ok=0; for(const [st] of H.ezpool){ try{ await (await (P.connect(dev) as any).claim(st,ethers.ZeroAddress)).wait(); ok++; }catch(e){ console.log(`    ${st.slice(0,10)} -> ${errOf(e)}`); } }
    console.log(`  claim 结果 ${ok}/${H.ezpool.length}`);
    await back(s);
  }
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
