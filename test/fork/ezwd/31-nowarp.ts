// 不快进时间（weETH 预言机保持有效）下，模拟"升级已生效但两个暂停都没做"的状态，
// 判定 ezETH 侧入口是被【设计】挡住，还是只是被分叉里过期的预言机挡住。
import { ethers, network } from "hardhat";
const RPC=process.env.FORK_RPC||"https://mainnet.gateway.tenderly.co";
const TLK="0x68863fb8855b04509a835082478D6E3D0bE4E61a", PA="0x9B54B7703551D9d0ced177A78367560a8B2eDDA4";
const RUSD="0x65D72AA8DA931F047169112fcf34f52DbaAE7D18", TRE="0x38965311507D4E54973F81475a149c09376e241e";
const MKT="0x69518D1D70AD537C41401303BDf96032338E40dE", EZ="0xbf5495Efe5DB9ce00f80364C8B423567e58d2110";
const EZP="0xf58c499417e36714e99803Cb135f507a95ae7169", XEZP="0xBa947cba270D30967369Bf1f73884Be2533d7bDB";
const WEETH="0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee";
const IMPL={rUSD:"0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd",tre:"0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC",pool:"0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5"};
const WHALE="0xC01Ac9349396935f60d39737EBe352572d1483A2";
const RUSD_WHALE="0x6dc7a100d09DDbF344FC4Dd0398f79500D0c2716";
let P=0,F=0; const ck=(l:string,c:boolean,d="")=>{if(c){P++;console.log("  PASS  "+l+(d?"  "+d:""));}else{F++;console.log("  FAIL  "+l+(d?"  "+d:""));}};
const note=(s:string)=>console.log("  NOTE  "+s);
async function imp(a:string){await network.provider.send("hardhat_impersonateAccount",[a]);await network.provider.send("hardhat_setBalance",[a,"0x21e19e0c9bab2400000"]);return await ethers.getSigner(a);}
const SIG:Record<string,string>={
 "0x677a62ce":"ErrorWindDownNotAllowed()","0x1a5594cf":"ErrorWindDownNotStarted()",
 "0x4f319ffe":"(weETH Chainlink TWAP 过期 — 分叉假象)","0x2b9eb9dc":"ErrorInvalidTwapPrice()",
 "0x5121c127":"(Market 层拒绝)","0xc01ac934":"(Treasury 层拒绝)"};
const errOf=(e:any)=>{const m=(e.shortMessage||e.message||"").toString();
  const mm=m.match(/0x[0-9a-f]{8}/i); const s=mm?mm[0].toLowerCase():"";
  if(s&&SIG[s])return `${s}  ${SIG[s]}`; if(s)return s;
  return m.replace(/^VM Exception[^:]*: /,"").slice(0,60);};

async function main(){
  await network.provider.request({method:"hardhat_reset",params:[{forking:{jsonRpcUrl:RPC}}]});
  await network.provider.send("evm_mine",[]);
  // 直接以 Timelock 身份升级 —— 等价于陌生人抢先 executeBatch 的结果状态，但不快进时间
  const tl=await imp(TLK); const pa=new ethers.Contract(PA,["function upgrade(address,address)"],tl);
  for(const [p,i] of [[RUSD,IMPL.rUSD],[TRE,IMPL.tre],[EZP,IMPL.pool],[XEZP,IMPL.pool]]) await (await pa.upgrade(p,i)).wait();
  const M=new ethers.Contract(MKT,["function mintPaused() view returns (bool)","function redeemPaused() view returns (bool)","function mintFToken(uint256,address,uint256) returns (uint256)","function mintXToken(uint256,address,uint256) returns (uint256)","function redeemFToken(uint256,address,uint256) returns (uint256,uint256)","function redeemXToken(uint256,address,uint256) returns (uint256)"],ethers.provider);
  console.log(`升级已生效，两个暂停均未执行：mintPaused=${await M.mintPaused()}  redeemPaused=${await M.redeemPaused()}\n`);

  const whale=await imp(WHALE), ru=await imp(RUSD_WHALE);
  const R=new ethers.Contract(RUSD,["function mint(address,uint256,address,uint256) returns (uint256)","function redeem(address,uint256,address,uint256) returns (uint256,uint256)","function wrap(address,uint256,address)","function earn(address,uint256,address)","function mintAndEarn(address,uint256,address,uint256)","function redeemFrom(address,uint256,address,uint256) returns (uint256,uint256)","function nav() view returns (uint256)","function isUnderCollateral() view returns (bool)","function totalSupply() view returns (uint256)"],ethers.provider);
  const T=new ethers.Contract(TRE,["function mintFToken(uint256,address) returns (uint256)","function mintXToken(uint256,address) returns (uint256)","function redeem(uint256,uint256,address) returns (uint256)","function settle()","function harvest()","function windDownStatus() view returns (uint8)"],ethers.provider);
  const PL=(a:string)=>new ethers.Contract(a,["function deposit(uint256,address)","function withdraw(uint256,address)","function liquidate(uint256,uint256) returns (uint256,uint256)","function windDown(uint256,uint256) returns (uint256,uint256)"],ethers.provider);

  console.log("===== ezETH 侧：未暂停状态下的全部用户入口 =====");
  const probes:[string,()=>Promise<any>][]=[
    ["Market.mintFToken",      ()=>(M.connect(whale) as any).mintFToken.staticCall(10n**18n,WHALE,0)],
    ["Market.mintXToken",      ()=>(M.connect(whale) as any).mintXToken.staticCall(10n**18n,WHALE,0)],
    ["Market.redeemFToken",    ()=>(M.connect(whale) as any).redeemFToken.staticCall(10n**18n,WHALE,0)],
    ["Market.redeemXToken",    ()=>(M.connect(whale) as any).redeemXToken.staticCall(10n**18n,WHALE,0)],
    ["Treasury.mintFToken",    ()=>(T.connect(whale) as any).mintFToken.staticCall(10n**18n,WHALE)],
    ["Treasury.mintXToken",    ()=>(T.connect(whale) as any).mintXToken.staticCall(10n**18n,WHALE)],
    ["Treasury.redeem",        ()=>(T.connect(whale) as any).redeem.staticCall(10n**18n,0,WHALE)],
    ["Treasury.settle",        ()=>(T.connect(whale) as any).settle.staticCall()],
    ["Treasury.harvest",       ()=>(T.connect(whale) as any).harvest.staticCall()],
    ["rUSD.mint(ezETH)",       ()=>(R.connect(ru) as any).mint.staticCall(EZ,10n**18n,RUSD_WHALE,0)],
    ["rUSD.redeem(ezETH)",     ()=>(R.connect(ru) as any).redeem.staticCall(EZ,10n**18n,RUSD_WHALE,0)],
    ["rUSD.wrap(ezETH)",       ()=>(R.connect(ru) as any).wrap.staticCall(EZ,10n**18n,RUSD_WHALE)],
    ["rUSD.earn(ezPool)",      ()=>(R.connect(ru) as any).earn.staticCall(EZP,10n**18n,RUSD_WHALE)],
    ["rUSD.mintAndEarn",       ()=>(R.connect(ru) as any).mintAndEarn.staticCall(EZP,10n**18n,RUSD_WHALE,0)],
    ["rUSD.redeemFrom(ezPool)",()=>(R.connect(ru) as any).redeemFrom.staticCall(EZP,10n**18n,RUSD_WHALE,0)],
    ["ezPool.deposit",         ()=>(PL(EZP).connect(whale) as any).deposit.staticCall(10n**18n,WHALE)],
    ["ezPool.withdraw",        ()=>(PL(EZP).connect(whale) as any).withdraw.staticCall(10n**18n,WHALE)],
    ["ezPool.liquidate",       ()=>(PL(EZP).connect(whale) as any).liquidate.staticCall(10n**18n,0)],
    ["ezPool.windDown 未授权",  ()=>(PL(EZP).connect(whale) as any).windDown.staticCall(10n**18n,0)],
    ["xezPool.deposit",        ()=>(PL(XEZP).connect(whale) as any).deposit.staticCall(10n**18n,WHALE)],
    ["xezPool.withdraw",       ()=>(PL(XEZP).connect(whale) as any).withdraw.staticCall(10n**18n,WHALE)],
  ];
  let open=0, byOracle=0;
  for(const [n,fn] of probes){
    try{ await fn(); console.log(`   *** 可调用 ***  ${n}`); open++; }
    catch(e:any){ const r=errOf(e); if(r.startsWith("0x4f319ffe")) byOracle++; console.log(`   已阻断        ${n.padEnd(26)} ${r}`); }
  }
  ck("ezETH 侧无任何可用的资金进出入口", open===0);
  ck("且没有一项是靠分叉里过期的预言机挡住的", byOracle===0, byOracle?`有 ${byOracle} 项`:"");

  console.log("\n===== weETH 侧与 rUSD 整体（预言机有效）=====");
  let ok1=false; try{ note(`rUSD.nav() = ${ethers.formatUnits(await R.nav(),18)}`); ok1=true; }catch(e:any){ note(`rUSD.nav() -> ${errOf(e)}`); }
  ck("rUSD.nav() 正常（rUSD 已解冻）", ok1);
  let ok2=false; try{ note(`rUSD.isUnderCollateral() = ${await R.isUnderCollateral()}`); ok2=true; }catch(e:any){}
  ck("rUSD.isUnderCollateral() 正常", ok2);
  for(const [n,fn] of [
    ["rUSD.redeem(weETH)", ()=>(R.connect(ru) as any).redeem.staticCall(WEETH,10n**18n,RUSD_WHALE,0)],
    ["rUSD.mint(weETH)",   ()=>(R.connect(ru) as any).mint.staticCall(WEETH,10n**16n,RUSD_WHALE,0)],
  ] as const){
    try{ await fn(); ck(`${n} 可用`, true); }catch(e:any){ ck(`${n} 可用`, false, errOf(e)); }
  }
  console.log(`\n==== ${P} passed, ${F} failed ====`);
}
main().catch(e=>{console.error(e);process.exit(1);});
