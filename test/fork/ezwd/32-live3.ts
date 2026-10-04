// 对 Safe 队列 nonce 751 的真实 calldata 做端到端验证（15 步，含 wstETH->weETH swap）。
// 场景 A：当前时间执行；场景 B：跨过 2026-10-08 00:00 UTC 周四边界后执行。
import { ethers, network } from "hardhat";
import * as fs from "fs";
const RPC=process.env.FORK_RPC||"https://mainnet.gateway.tenderly.co";
const SAFE="0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF", MS="0x40A2aCCbd92BCA938b02010E17A5b8929b49130D";
const EZ="0xbf5495Efe5DB9ce00f80364C8B423567e58d2110", TRE="0x38965311507D4E54973F81475a149c09376e241e";
const FEZ="0x50B4DC15b34E31671c9cA40F9eb05D7eBd6b13f9", RUSD="0x65D72AA8DA931F047169112fcf34f52DbaAE7D18";
const WT="0x781BA968d5cc0b40EB592D5c8a9a3A4000063885", WEETH="0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee";
const WSTETH="0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", ZAP="0x1104b4DF568fa7Af90B1Bed1D78A2F71e748dc8a";
const EZP="0xf58c499417e36714e99803Cb135f507a95ae7169", XEZP="0xBa947cba270D30967369Bf1f73884Be2533d7bDB";
const FXN="0x365AccFCa291e7D3914637ABf1F7635dB165Bb09";
const EZ_V=["0x4A036ab673722468a8e1fCC0F74A2dD5914FD1c1","0x4c75A7349B20745DAf37E6C348b85E8a03F72F9A","0x0Fa286332b2d1bBB0c7637CD63BA742a050b5AAd","0x7DCe6D8752A0e2fCF3cE92e9CeAdf9857F920ACc","0xCbE9e9E80b5301956c12FbB40742b144f98d4e63","0x492550DDcc5349940A879cAf4d3CFFfaa1Ab0F64"];
const XEZ_V=["0xC68A2AE2b932C472Fd4Ad4367FF6e093E4E3Da8f","0x3b0c2E02b0F3a4f507bA8F39aB3Ea93BF4863a90","0x9af69159D25e213a35A2b6E7274023Da2D2bdaC6","0x1090988Cf5569cc811756220AC3160aA028988AA"];
const E=10n**18n; const f=(v:bigint)=>ethers.formatUnits(v,18);
let P=0,F=0; const ck=(l:string,c:boolean,d="")=>{if(c){P++;console.log("  PASS  "+l+(d?"  "+d:""));}else{F++;console.log("  FAIL  "+l+(d?"  "+d:""));}};
const note=(s:string)=>console.log("  NOTE  "+s);
async function imp(a:string){await network.provider.send("hardhat_impersonateAccount",[a]);await network.provider.send("hardhat_setBalance",[a,"0x21e19e0c9bab2400000"]);return await ethers.getSigner(a);}
const snap=async()=>await network.provider.send("evm_snapshot",[]);
const back=async(s:string)=>{await network.provider.send("evm_revert",[s]);};
const SAFE_ABI=["function nonce() view returns (uint256)","function getOwners() view returns (address[])","function getThreshold() view returns (uint256)","function getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256) view returns (bytes32)","function approveHash(bytes32)","function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) payable returns (bool)"];
const erc=(a:string)=>new ethers.Contract(a,["function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)","function allowance(address,address) view returns (uint256)"],ethers.provider);
const VAULT=["function owner() view returns (address)","function getReward(bool,address[])"];

async function execSafe(data:string, op:number){
  const sr=new ethers.Contract(SAFE,SAFE_ABI,ethers.provider);
  const owners:string[]=[...(await sr.getOwners())]; const th=Number(await sr.getThreshold()); const n=await sr.nonce();
  const h=await sr.getTransactionHash(MS,0,data,op,0,0,0,ethers.ZeroAddress,ethers.ZeroAddress,n);
  const signers=owners.slice(0,th).map(o=>o.toLowerCase()).sort();
  for(const o of signers){const s=await imp(ethers.getAddress(o));await (await (new ethers.Contract(SAFE,SAFE_ABI,s) as any).approveHash(h)).wait();}
  let sigs="0x"; for(const o of signers) sigs+=ethers.zeroPadValue(o,32).slice(2)+"0".repeat(64)+"01";
  const ex=await imp(ethers.getAddress(signers[0]));
  return await (await (new ethers.Contract(SAFE,SAFE_ABI,ex) as any).execTransaction(MS,0,data,op,0,0,0,ethers.ZeroAddress,ethers.ZeroAddress,sigs)).wait();
}
function packSteps(steps:any[]){let s="0x";for(const t of steps){s+="00"+t.to.slice(2).toLowerCase()+ethers.toBeHex(BigInt(t.val),32).slice(2)+ethers.toBeHex((t.d.length-2)/2,32).slice(2)+t.d.slice(2);}
  return new ethers.Interface(["function multiSend(bytes)"]).encodeFunctionData("multiSend",[s]);}

async function claimAll(tag:string){
  let ok=0, got=0n, gotF=0n;
  for(const v of [...EZ_V,...XEZ_V]){
    const vc=new ethers.Contract(v,VAULT,ethers.provider);
    let owner:string; try{ owner=await vc.owner(); }catch(e){ continue; }
    const o=await imp(owner); const b0=await erc(EZ).balanceOf(owner), f0=await erc(FXN).balanceOf(owner);
    try{ await (await (vc.connect(o) as any).getReward(true,[EZ,FXN])).wait(); ok++;
         got+=(await erc(EZ).balanceOf(owner))-b0; gotF+=(await erc(FXN).balanceOf(owner))-f0; }catch(e){}
  }
  console.log(`  ${tag}: getReward 成功 ${ok}/10   owner 侧共收到 ${f(got)} ezETH + ${f(gotF)} FXN`);
  return ok;
}

async function main(){
  const data=fs.readFileSync("/tmp/b3.txt","utf8").trim();
  const tx=JSON.parse(fs.readFileSync("/tmp/b3tx.json","utf8"));
  const steps=JSON.parse(fs.readFileSync("/tmp/steps.json","utf8"));
  await network.provider.request({method:"hardhat_reset",params:[{forking:{jsonRpcUrl:RPC}}]});
  await network.provider.send("evm_mine",[]);
  const now=(await ethers.provider.getBlock("latest"))!.timestamp;
  console.log(`分叉区块时间 ${new Date(now*1000).toISOString()}`);
  const DEADLINE=1791417600;   // 2026-10-08 00:00:00 UTC
  console.log(`周四边界 ${DEADLINE}  ${new Date(DEADLINE*1000).toISOString()}   距今 ${((DEADLINE-now)/3600).toFixed(1)} 小时\n`);

  console.log("===== 场景 A：按当前时间执行完整 15 步 =====");
  let s=await snap();
  const preW=await erc(WSTETH).balanceOf(SAFE), preE=await erc(WEETH).balanceOf(SAFE), preEz=await erc(EZ).balanceOf(SAFE), preR=await erc(RUSD).balanceOf(SAFE);
  const r=await execSafe(data,1);
  ck("15 步 MultiSend 真实 6/9 执行成功", r.status===1, `gas ${r.gasUsed}  calldata ${(data.length-2)/2} bytes`);

  const T=new ethers.Contract(TRE,["function windDownStatus() view returns (uint8)","function windDownBaseBalance() view returns (uint256)","function windDownFBaseBalance() view returns (uint256)","function windDownXBaseBalance() view returns (uint256)"],ethers.provider);
  ck("Treasury windDownStatus == 1 (WindDown)", Number(await T.windDownStatus())===1);
  ck("windDownFBaseBalance == 2.672124275409890780", (await T.windDownFBaseBalance())===2672124275409890780n, f(await T.windDownFBaseBalance()));
  ck("windDownXBaseBalance == 17.308726673410528211", (await T.windDownXBaseBalance())===17308726673410528211n, f(await T.windDownXBaseBalance()));
  const R=new ethers.Contract(RUSD,["function getMarkets() view returns (address[])","function getRebalancePools() view returns (address[])","function markets(address) view returns (address,address,address,uint256,uint256)","function totalSupply() view returns (uint256)"],ethers.provider);
  ck("ezETH 市场已移除", !(await R.getMarkets()).map((x:string)=>x.toLowerCase()).includes(EZ.toLowerCase()));
  const pools=(await R.getRebalancePools()).map((x:string)=>x.toLowerCase());
  ck("两个 ezETH Pool 已从 rUSD 移除", !pools.includes(EZP.toLowerCase()) && !pools.includes(XEZP.toLowerCase()));
  ck("两池 fezETH 余额归零", (await erc(FEZ).balanceOf(EZP))===0n && (await erc(FEZ).balanceOf(XEZP))===0n);
  const wtc=new ethers.Contract(WT,["function baseTokenCap() view returns (uint256)","function totalBaseToken() view returns (uint256)"],ethers.provider);
  ck("weETH baseTokenCap 已改回 0", (await wtc.baseTokenCap())===0n);
  ck("rUSD totalSupply == weETH managed（唯一剩余市场）", (await R.totalSupply())===((await R.markets(WEETH))[4] as bigint));

  console.log("\n  --- swap 结果与 Safe 余额变化 ---");
  const dW=(await erc(WSTETH).balanceOf(SAFE))-preW, dE=(await erc(WEETH).balanceOf(SAFE))-preE, dEz=(await erc(EZ).balanceOf(SAFE))-preEz, dR=(await erc(RUSD).balanceOf(SAFE))-preR;
  note(`wstETH ${f(preW)} -> ${f(await erc(WSTETH).balanceOf(SAFE))}   变化 ${f(dW)}`);
  note(`weETH  ${f(preE)} -> ${f(await erc(WEETH).balanceOf(SAFE))}   变化 ${f(dE)}`);
  note(`ezETH  ${f(preEz)} -> ${f(await erc(EZ).balanceOf(SAFE))}   变化 ${f(dEz)}`);
  note(`rUSD   ${f(preR)} -> ${f(await erc(RUSD).balanceOf(SAFE))}   变化 ${f(dR)}`);
  ck("wstETH 恰好花掉 1.3", dW===-1300000000000000000n, f(-dW));
  ck("swap 产出的 weETH 足够完成 mint 且有剩余", (await erc(WEETH).balanceOf(SAFE))>0n);
  ck("Safe 对 Zap 的 wstETH 授权已用尽", (await erc(WSTETH).allowance(SAFE,ZAP))===0n, f(await erc(WSTETH).allowance(SAFE,ZAP)));
  ck("Safe 对 rUSD 的 weETH 授权已用尽", (await erc(WEETH).allowance(SAFE,RUSD))===0n, f(await erc(WEETH).allowance(SAFE,RUSD)));

  console.log("\n  --- 10 个 Convex 金库真实领取 ---");
  const okA=await claimAll("场景 A");
  ck("10/10 金库 owner 可通过 getReward() 领取", okA===10);
  await back(s);

  console.log("\n===== 场景 B：跨过 2026-10-08 00:00 UTC 之后执行（对照）=====");
  s=await snap();
  await network.provider.send("evm_setNextBlockTimestamp",[DEADLINE+600]); await network.provider.send("evm_mine",[]);
  note(`已把链时间推到 ${new Date((DEADLINE+600)*1000).toISOString()}（边界之后 10 分钟）`);
  // 精简批次：剔除依赖 weETH 预言机的 rUSD 迁移步骤（历史分叉上会因 TWAP 过期而失败，属分叉假象）
  const reduced=[steps[0],steps[1],steps[2],steps[12],steps[13]];
  note("使用精简批次：费率归零 x2 + initializeWindDown + 两笔 windDown");
  const r2=await execSafe(packSteps(reduced),1);
  ck("精简批次执行成功", r2.status===1);
  const okB=await claimAll("场景 B");
  ck("对照：跨过边界后领取数应远小于 10", okB<10, `实际 ${okB}/10`);
  await back(s);

  console.log(`\n==== ${P} passed, ${F} failed ====`);
}
main().catch(e=>{console.error(e);process.exit(1);});
