// 把第 6 步的 newCap 换成"看起来合理"的 192.738471897658202870，与原版 1927.384718976582028700
// 逐项对比最终状态，判定这个值到底影响不影响什么。
import { ethers, network } from "hardhat";
import * as fs from "fs";
const RPC=process.env.FORK_RPC||"https://mainnet.gateway.tenderly.co";
const SAFE="0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF", MS="0x40A2aCCbd92BCA938b02010E17A5b8929b49130D";
const EZ="0xbf5495Efe5DB9ce00f80364C8B423567e58d2110", TRE="0x38965311507D4E54973F81475a149c09376e241e";
const FEZ="0x50B4DC15b34E31671c9cA40F9eb05D7eBd6b13f9", RUSD="0x65D72AA8DA931F047169112fcf34f52DbaAE7D18";
const WT="0x781BA968d5cc0b40EB592D5c8a9a3A4000063885", WEETH="0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee";
const WSTETH="0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", FEETH="0x9216272158F563488FfC36AFB877acA2F265C560";
const EZP="0xf58c499417e36714e99803Cb135f507a95ae7169", XEZP="0xBa947cba270D30967369Bf1f73884Be2533d7bDB";
const WMKT="0x267C6A96Db7422faA60Aa7198FfEeeC4169CD65f";
const f=(v:bigint)=>ethers.formatUnits(v,18);
async function imp(a:string){await network.provider.send("hardhat_impersonateAccount",[a]);await network.provider.send("hardhat_setBalance",[a,"0x21e19e0c9bab2400000"]);return await ethers.getSigner(a);}
const erc=(a:string)=>new ethers.Contract(a,["function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)","function allowance(address,address) view returns (uint256)"],ethers.provider);
const SAFE_ABI=["function nonce() view returns (uint256)","function getOwners() view returns (address[])","function getThreshold() view returns (uint256)","function getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256) view returns (bytes32)","function approveHash(bytes32)","function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) payable returns (bool)"];
function pack(steps:any[]){let s="0x";for(const t of steps){s+="00"+t.to.slice(2).toLowerCase()+ethers.toBeHex(BigInt(t.val),32).slice(2)+ethers.toBeHex((t.d.length-2)/2,32).slice(2)+t.d.slice(2);}
  return new ethers.Interface(["function multiSend(bytes)"]).encodeFunctionData("multiSend",[s]);}
async function execSafe(data:string){
  const sr=new ethers.Contract(SAFE,SAFE_ABI,ethers.provider);
  const owners:string[]=[...(await sr.getOwners())]; const th=Number(await sr.getThreshold()); const n=await sr.nonce();
  const h=await sr.getTransactionHash(MS,0,data,1,0,0,0,ethers.ZeroAddress,ethers.ZeroAddress,n);
  const signers=owners.slice(0,th).map(o=>o.toLowerCase()).sort();
  for(const o of signers){const s=await imp(ethers.getAddress(o));await (await (new ethers.Contract(SAFE,SAFE_ABI,s) as any).approveHash(h)).wait();}
  let sigs="0x"; for(const o of signers) sigs+=ethers.zeroPadValue(o,32).slice(2)+"0".repeat(64)+"01";
  const ex=await imp(ethers.getAddress(signers[0]));
  return await (await (new ethers.Contract(SAFE,SAFE_ABI,ex) as any).execTransaction(MS,0,data,1,0,0,0,ethers.ZeroAddress,ethers.ZeroAddress,sigs)).wait();
}
async function snapshotState(){
  const wtc=new ethers.Contract(WT,["function baseTokenCap() view returns (uint256)","function totalBaseToken() view returns (uint256)"],ethers.provider);
  const T=new ethers.Contract(TRE,["function windDownStatus() view returns (uint8)","function windDownBaseBalance() view returns (uint256)","function windDownFBaseBalance() view returns (uint256)","function windDownXBaseBalance() view returns (uint256)"],ethers.provider);
  const R=new ethers.Contract(RUSD,["function totalSupply() view returns (uint256)","function markets(address) view returns (address,address,address,uint256,uint256)","function getMarkets() view returns (address[])","function getRebalancePools() view returns (address[])"],ethers.provider);
  return {
    weCap:(await wtc.baseTokenCap()).toString(), weTotalBase:(await wtc.totalBaseToken()).toString(),
    wdStatus:Number(await T.windDownStatus()).toString(), wdBase:(await T.windDownBaseBalance()).toString(),
    wdF:(await T.windDownFBaseBalance()).toString(), wdX:(await T.windDownXBaseBalance()).toString(),
    rusdSupply:(await R.totalSupply()).toString(), weManaged:((await R.markets(WEETH))[4] as bigint).toString(),
    markets:(await R.getMarkets()).join(","), pools:(await R.getRebalancePools()).join(","),
    feethSupply:(await erc(FEETH).totalSupply()).toString(), feethInRusd:(await erc(FEETH).balanceOf(RUSD)).toString(),
    safeWst:(await erc(WSTETH).balanceOf(SAFE)).toString(), safeWe:(await erc(WEETH).balanceOf(SAFE)).toString(),
    safeRusd:(await erc(RUSD).balanceOf(SAFE)).toString(), safeEz:(await erc(EZ).balanceOf(SAFE)).toString(),
    ezpFez:(await erc(FEZ).balanceOf(EZP)).toString(), xezpFez:(await erc(FEZ).balanceOf(XEZP)).toString(),
    ezpEz:(await erc(EZ).balanceOf(EZP)).toString(), xezpEz:(await erc(EZ).balanceOf(XEZP)).toString(),
    treEz:(await erc(EZ).balanceOf(TRE)).toString(), weTreasBal:(await erc(WEETH).balanceOf(WT)).toString(),
    allowZap:(await erc(WSTETH).allowance(SAFE,"0x1104b4DF568fa7Af90B1Bed1D78A2F71e748dc8a")).toString(),
    allowRusd:(await erc(WEETH).allowance(SAFE,RUSD)).toString(),
  };
}
async function run(tag:string, capValue:bigint|null){
  await network.provider.request({method:"hardhat_reset",params:[{forking:{jsonRpcUrl:RPC}}]});
  await network.provider.send("evm_mine",[]);
  const steps=JSON.parse(fs.readFileSync("/tmp/steps.json","utf8"));
  if(capValue!==null){
    const s6=steps[5];
    s6.d=s6.d.slice(0,10)+ethers.AbiCoder.defaultAbiCoder().encode(["uint256"],[capValue]).slice(2);
  }
  const r=await execSafe(pack(steps));
  const st=await snapshotState();
  console.log(`  ${tag}  执行成功  gas ${r.gasUsed}`);
  return {gas:r.gasUsed, st};
}
async function main(){
  const ORIG=1927384718976582028700n, ALT=192738471897658202870n;
  const wtc=new ethers.Contract(WT,["function totalBaseToken() view returns (uint256)"],ethers.provider);
  await network.provider.request({method:"hardhat_reset",params:[{forking:{jsonRpcUrl:RPC}}]});
  await network.provider.send("evm_mine",[]);
  const tb=await wtc.totalBaseToken(); const weIn=1185892866913078502n;
  console.log(`weETH totalBaseToken  ${f(tb)}`);
  console.log(`本批次所需最小 cap     ${f(tb+weIn)}`);
  console.log(`原版 newCap           ${f(ORIG)}    余量 ${f(ORIG-tb-weIn)} weETH`);
  console.log(`"合理值" newCap        ${f(ALT)}    余量 ${f(ALT-tb-weIn)} weETH\n`);

  const a=await run("原版 1927.384718976582028700 ", null);
  const b=await run('改成 192.738471897658202870  ', ALT);

  console.log("\n===== 两次执行的最终状态逐项对比 =====");
  let diff=0;
  for(const k of Object.keys(a.st)){
    const va=(a.st as any)[k], vb=(b.st as any)[k];
    if(va!==vb){ diff++; console.log(`  *** 不同 ***  ${k}`); console.log(`       原版 ${va}`); console.log(`       改后 ${vb}`); }
  }
  console.log(diff===0 ? `  ${Object.keys(a.st).length} 项状态全部相同，零差异` : `  共 ${diff} 项不同`);
  console.log(`\n  gas  原版 ${a.gas}   改后 ${b.gas}   差 ${a.gas-b.gas}`);
  console.log(`\n  结论：${diff===0 ? "newCap 取这两个值，执行结果完全一致，该参数不影响任何最终状态。" : "存在差异，需逐项核查。"}`);
}
main().catch(e=>{console.error(e);process.exit(1);});
