// Timelock 的 EXECUTOR_ROLE 授予了 address(0)。验证：3 天后由任意陌生 EOA 抢先 executeBatch、
// 且不执行任何暂停时，ezETH 侧是否留下可被利用或可造成损失的入口。
import { ethers, network } from "hardhat";
import * as fs from "fs";
const RPC=process.env.FORK_RPC||"https://mainnet.gateway.tenderly.co";
const SAFE="0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF", TL="0x68863fb8855b04509a835082478D6E3D0bE4E61a";
const RUSD="0x65D72AA8DA931F047169112fcf34f52DbaAE7D18", TRE="0x38965311507D4E54973F81475a149c09376e241e";
const MKT="0x69518D1D70AD537C41401303BDf96032338E40dE", EZ="0xbf5495Efe5DB9ce00f80364C8B423567e58d2110";
const FEZ="0x50B4DC15b34E31671c9cA40F9eb05D7eBd6b13f9", XEZ="0x2e5A5AF7eE900D34BCFB70C47023bf1d6bE35CF5";
const EZP="0xf58c499417e36714e99803Cb135f507a95ae7169", XEZP="0xBa947cba270D30967369Bf1f73884Be2533d7bDB";
const WEETH="0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee";
const ATTACKER="0x00000000000000000000000000000000DeaDBeef";
const EZ_WHALE="0xC01Ac9349396935f60d39737EBe352572d1483A2";   // 持有 99.993% xezETH
let P=0,F=0; const ck=(l:string,c:boolean,d="")=>{if(c){P++;console.log("  PASS  "+l+(d?"  "+d:""));}else{F++;console.log("  FAIL  "+l+(d?"  "+d:""));}};
const note=(s:string)=>console.log("  NOTE  "+s);
async function imp(a:string){await network.provider.send("hardhat_impersonateAccount",[a]);await network.provider.send("hardhat_setBalance",[a,"0x21e19e0c9bab2400000"]);return await ethers.getSigner(a);}
const implOf=async(x:string)=>ethers.getAddress("0x"+(await network.provider.send("eth_getStorageAt",[x,"0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc","latest"])).slice(26));
const errOf=(e:any)=>{const m=(e.shortMessage||e.message||"").toString();
  const mm=m.match(/0x[0-9a-f]{8}/i); return (m.includes("panic code 0x12")?"DIV/0":"") || (mm?mm[0]:"") || m.replace(/^VM Exception[^:]*: /,"").slice(0,54);};

async function main(){
  const D=JSON.parse(fs.readFileSync("/tmp/decoded.json","utf8"));
  const data=fs.readFileSync("/tmp/calldata.txt","utf8").trim();
  await network.provider.request({method:"hardhat_reset",params:[{forking:{jsonRpcUrl:RPC}}]});
  await network.provider.send("evm_mine",[]);

  console.log("===== 1. Safe 排队（照常）=====");
  const SAFE_ABI=["function nonce() view returns (uint256)","function getOwners() view returns (address[])","function getThreshold() view returns (uint256)","function getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256) view returns (bytes32)","function approveHash(bytes32)","function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) payable returns (bool)"];
  const sr=new ethers.Contract(SAFE,SAFE_ABI,ethers.provider);
  const owners:string[]=[...(await sr.getOwners())]; const th=Number(await sr.getThreshold()); const n=await sr.nonce();
  const h=await sr.getTransactionHash(TL,0,data,0,0,0,0,ethers.ZeroAddress,ethers.ZeroAddress,n);
  const signers=owners.slice(0,th).map(o=>o.toLowerCase()).sort();
  for(const o of signers){const s=await imp(ethers.getAddress(o));await (await (new ethers.Contract(SAFE,SAFE_ABI,s) as any).approveHash(h)).wait();}
  let sigs="0x"; for(const o of signers) sigs+=ethers.zeroPadValue(o,32).slice(2)+"0".repeat(64)+"01";
  const ex=await imp(ethers.getAddress(signers[0]));
  await (await (new ethers.Contract(SAFE,SAFE_ABI,ex) as any).execTransaction(TL,0,data,0,0,0,0,ethers.ZeroAddress,ethers.ZeroAddress,sigs)).wait();
  ck("scheduleBatch 已排队", true);

  console.log("\n===== 2. 满 3 天后，由陌生 EOA 抢先 executeBatch（不做任何暂停）=====");
  await network.provider.send("evm_increaseTime",[259201]); await network.provider.send("evm_mine",[]);
  const atk=await imp(ATTACKER);
  const tlc=new ethers.Contract(TL,["function executeBatch(address[],uint256[],bytes[],bytes32,bytes32) payable","function isOperationDone(bytes32) view returns (bool)"],ethers.provider);
  const r=await (await (tlc.connect(atk) as any).executeBatch(D.targets,D.values,D.payloads,D.predecessor,D.salt)).wait();
  ck("陌生 EOA 成功执行了四个升级（EXECUTOR_ROLE 开放）", r.status===1, `gas ${r.gasUsed}`);
  ck("operation 已 done", await tlc.isOperationDone(D.opId));
  for(const [k,a,e] of [["rUSD",RUSD,"0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd"],["Treasury",TRE,"0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC"],["ezPool",EZP,"0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5"],["xezPool",XEZP,"0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5"]] as const)
    ck(`${k} 已升级`, (await implOf(a)).toLowerCase()===e.toLowerCase());

  const M=new ethers.Contract(MKT,["function mintPaused() view returns (bool)","function redeemPaused() view returns (bool)","function mintFToken(uint256,address,uint256) returns (uint256)","function mintXToken(uint256,address,uint256) returns (uint256)","function redeemFToken(uint256,address,uint256) returns (uint256,uint256)","function redeemXToken(uint256,address,uint256) returns (uint256)","function addBaseToken(uint256,address,uint256) returns (uint256)"],ethers.provider);
  console.log(`  NOTE  此刻 mintPaused=${await M.mintPaused()}  redeemPaused=${await M.redeemPaused()}  <= 未暂停`);

  console.log("\n===== 3. 未暂停状态下，逐个探测 ezETH 侧的用户入口 =====");
  const whale=await imp(EZ_WHALE);
  const ezc=new ethers.Contract(EZ,["function balanceOf(address) view returns (uint256)","function approve(address,uint256) returns (bool)"],ethers.provider);
  const fezc=new ethers.Contract(FEZ,["function balanceOf(address) view returns (uint256)","function approve(address,uint256) returns (bool)"],ethers.provider);
  const R=new ethers.Contract(RUSD,["function mint(address,uint256,address,uint256) returns (uint256)","function redeem(address,uint256,address,uint256) returns (uint256,uint256)","function wrap(address,uint256,address)","function earn(address,uint256,address)","function mintAndEarn(address,uint256,address,uint256)","function autoRedeem(uint256,address,uint256[]) returns (address[],uint256[],uint256[])","function redeemFrom(address,uint256,address,uint256) returns (uint256,uint256)"],ethers.provider);
  const PL=(a:string)=>new ethers.Contract(a,["function deposit(uint256,address)","function withdraw(uint256,address)","function liquidate(uint256,uint256) returns (uint256,uint256)"],ethers.provider);
  const T=new ethers.Contract(TRE,["function mintFToken(uint256,address) returns (uint256)","function mintXToken(uint256,address) returns (uint256)","function redeem(uint256,uint256,address) returns (uint256)","function settle()","function harvest()"],ethers.provider);

  const probes:[string,()=>Promise<any>][]=[
    ["Market.mintFToken(1 ezETH)",     async()=>(M.connect(whale) as any).mintFToken.staticCall(10n**18n,EZ_WHALE,0)],
    ["Market.mintXToken(1 ezETH)",     async()=>(M.connect(whale) as any).mintXToken.staticCall(10n**18n,EZ_WHALE,0)],
    ["Market.redeemFToken(1 fezETH)",  async()=>(M.connect(whale) as any).redeemFToken.staticCall(10n**18n,EZ_WHALE,0)],
    ["Market.redeemXToken(1 xezETH)",  async()=>(M.connect(whale) as any).redeemXToken.staticCall(10n**18n,EZ_WHALE,0)],
    ["Market.addBaseToken(1 ezETH)",   async()=>(M.connect(whale) as any).addBaseToken.staticCall(10n**18n,EZ_WHALE,0)],
    ["Treasury.mintFToken 直调",        async()=>(T.connect(whale) as any).mintFToken.staticCall(10n**18n,EZ_WHALE)],
    ["Treasury.mintXToken 直调",        async()=>(T.connect(whale) as any).mintXToken.staticCall(10n**18n,EZ_WHALE)],
    ["Treasury.redeem 直调",            async()=>(T.connect(whale) as any).redeem.staticCall(10n**18n,0,EZ_WHALE)],
    ["Treasury.settle()",              async()=>(T.connect(whale) as any).settle.staticCall()],
    ["Treasury.harvest()",             async()=>(T.connect(whale) as any).harvest.staticCall()],
    ["rUSD.mint(ezETH)",               async()=>(R.connect(whale) as any).mint.staticCall(EZ,10n**18n,EZ_WHALE,0)],
    ["rUSD.redeem(ezETH)",             async()=>(R.connect(whale) as any).redeem.staticCall(EZ,10n**18n,EZ_WHALE,0)],
    ["rUSD.wrap(ezETH)",               async()=>(R.connect(whale) as any).wrap.staticCall(EZ,10n**18n,EZ_WHALE)],
    ["rUSD.earn(ezPool)",              async()=>(R.connect(whale) as any).earn.staticCall(EZP,10n**18n,EZ_WHALE)],
    ["rUSD.mintAndEarn(ezPool)",       async()=>(R.connect(whale) as any).mintAndEarn.staticCall(EZP,10n**18n,EZ_WHALE,0)],
    ["rUSD.redeemFrom(ezPool)",        async()=>(R.connect(whale) as any).redeemFrom.staticCall(EZP,10n**18n,EZ_WHALE,0)],
    ["ezPool.deposit",                 async()=>(PL(EZP).connect(whale) as any).deposit.staticCall(10n**18n,EZ_WHALE)],
    ["ezPool.withdraw",                async()=>(PL(EZP).connect(whale) as any).withdraw.staticCall(10n**18n,EZ_WHALE)],
    ["ezPool.liquidate",               async()=>(PL(EZP).connect(whale) as any).liquidate.staticCall(10n**18n,0)],
    ["xezPool.deposit",                async()=>(PL(XEZP).connect(whale) as any).deposit.staticCall(10n**18n,EZ_WHALE)],
    ["xezPool.withdraw",               async()=>(PL(XEZP).connect(whale) as any).withdraw.staticCall(10n**18n,EZ_WHALE)],
  ];
  let anyOpen=false;
  for(const [name,fn] of probes){
    let ok=false, reason="";
    try{ await fn(); ok=true; }catch(e:any){ reason=errOf(e); }
    if(ok) anyOpen=true;
    console.log(`   ${ok?"*** 可调用 ***":"已阻断"}  ${name.padEnd(30)} ${ok?"":reason}`);
  }
  ck("未暂停状态下 ezETH 侧无任何可用的资金进出入口", !anyOpen);

  console.log("\n===== 4. weETH 侧是否受影响 =====");
  const rw=new ethers.Contract(RUSD,["function mint(address,uint256,address,uint256) returns (uint256)","function redeem(address,uint256,address,uint256) returns (uint256,uint256)","function isUnderCollateral() view returns (bool)","function nav() view returns (uint256)"],ethers.provider);
  let navOk=false; try{ await rw.nav(); navOk=true; }catch(e){}
  ck("rUSD.nav() 正常（rUSD 已解冻）", navOk);
  let weRedeem=false; try{ await (rw.connect(whale) as any).redeem.staticCall(WEETH,10n**18n,EZ_WHALE,0); weRedeem=true; }catch(e:any){ note(`rUSD.redeem(weETH) -> ${errOf(e)}`); }
  ck("weETH 侧 rUSD.redeem 仍可用", weRedeem);

  console.log("\n===== 5. 抢跑对多签二的影响 =====");
  const s2=await imp(SAFE);
  let re=false; try{ await (tlc.connect(s2) as any).executeBatch.staticCall(D.targets,D.values,D.payloads,D.predecessor,D.salt); re=true; }
  catch(e:any){ note(`多签二里的 executeBatch 会回滚: ${errOf(e)}`); }
  ck("重复 executeBatch 会回滚（=> 多签二整笔 MultiSend 连暂停一起回滚）", !re);
  console.log(`\n==== ${P} passed, ${F} failed ====`);
}
main().catch(e=>{console.error(e);process.exit(1);});
