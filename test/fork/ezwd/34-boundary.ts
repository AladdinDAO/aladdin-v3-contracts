// 精简对照：用链上已有的真实 checkpoint 状态，验证 2026-10-08 00:00 UTC 这个截止时间是真的。
// 判定方式用 getBoostRatio 的静态调用 —— 除零正发生在该函数内，无需发真实领取交易。
import { ethers, network } from "hardhat";
import * as fs from "fs";
const RPC=process.env.FORK_RPC||"https://mainnet.gateway.tenderly.co";
const SAFE="0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF";
const EZP="0xf58c499417e36714e99803Cb135f507a95ae7169", XEZP="0xBa947cba270D30967369Bf1f73884Be2533d7bDB";
const EZ_V=["0x4A036ab673722468a8e1fCC0F74A2dD5914FD1c1","0x4c75A7349B20745DAf37E6C348b85E8a03F72F9A","0x0Fa286332b2d1bBB0c7637CD63BA742a050b5AAd","0x7DCe6D8752A0e2fCF3cE92e9CeAdf9857F920ACc","0xCbE9e9E80b5301956c12FbB40742b144f98d4e63","0x492550DDcc5349940A879cAf4d3CFFfaa1Ab0F64"];
const XEZ_V=["0xC68A2AE2b932C472Fd4Ad4367FF6e093E4E3Da8f","0x3b0c2E02b0F3a4f507bA8F39aB3Ea93BF4863a90","0x9af69159D25e213a35A2b6E7274023Da2D2bdaC6","0x1090988Cf5569cc811756220AC3160aA028988AA"];
let P=0,F=0; const ck=(l:string,c:boolean,d="")=>{if(c){P++;console.log("  PASS  "+l+(d?"  "+d:""));}else{F++;console.log("  FAIL  "+l+(d?"  "+d:""));}};
async function imp(a:string){await network.provider.send("hardhat_impersonateAccount",[a]);await network.provider.send("hardhat_setBalance",[a,"0x21e19e0c9bab2400000"]);return await ethers.getSigner(a);}
const iface=new ethers.Interface(["function getBoostRatio(address) view returns (uint256)","function checkpoint(address)"]);
// 返回 "ok" / "DIV0" / 其他错误串，必须区分，不能一律当失败
async function boostState(pool:string, acct:string){
  try{ await network.provider.send("eth_call",[{to:pool,data:iface.encodeFunctionData("getBoostRatio",[acct])},"latest"]); return "ok"; }
  catch(e:any){ const d=e?.data?.data||e?.data||e?.error?.data||""; const s=typeof d==="string"?d:"";
    if(s.startsWith("0x4e487b71")){ const c=BigInt("0x"+s.slice(10)); return c===0x12n?"DIV0":`Panic(0x${c.toString(16)})`; }
    return s?s.slice(0,10):"unknown"; }
}
async function scenario(tag:string, setTs:number|null){
  const steps=JSON.parse(fs.readFileSync("/tmp/steps.json","utf8"));
  if(setTs){ await network.provider.send("evm_setNextBlockTimestamp",[setTs]); await network.provider.send("evm_mine",[]); }
  const t=(await ethers.provider.getBlock("latest"))!.timestamp;
  const safe=await imp(SAFE);
  // 费率归零 x2 + initializeWindDown + updateRedeemStatus(false) + 两笔 windDown
  for(const i of [0,1,2,8,12,13]){
    const s=steps[i];
    await (await safe.sendTransaction({to:s.to,data:s.d,value:0})).wait();
  }
  // 关键：除零只在"清零后第一个账户被 checkpoint"之后才出现 —— 是那一笔把 voteOwnerBalances 归零的。
  // checkpoint 无权限，由任意 EOA 代发即可。
  const dev=(await ethers.getSigners())[0];
  for(const [pool,vs] of [[EZP,EZ_V],[XEZP,XEZ_V]] as const)
    await (await dev.sendTransaction({to:pool,data:iface.encodeFunctionData("checkpoint",[vs[0]])})).wait();
  let ok=0; const bad:string[]=[];
  for(const [pool,vs] of [[EZP,EZ_V],[XEZP,XEZ_V]] as const)
    for(const v of vs){ const st=await boostState(pool,v); if(st==="ok") ok++; else bad.push(`${v.slice(0,10)} ${st}`); }
  console.log(`  ${tag}   链时间 ${new Date(t*1000).toISOString()}   getBoostRatio 正常 ${ok}/10` + (bad.length?`   异常: ${bad.join(", ")}`:""));
  return ok;
}
async function main(){
  const DEADLINE=1791417600;   // 2026-10-08 00:00:00 UTC
  await network.provider.request({method:"hardhat_reset",params:[{forking:{jsonRpcUrl:RPC}}]});
  await network.provider.send("evm_mine",[]);
  const now=(await ethers.provider.getBlock("latest"))!.timestamp;
  console.log(`分叉时间 ${new Date(now*1000).toISOString()}`);
  console.log(`截止边界 ${new Date(DEADLINE*1000).toISOString()}   距今 ${((DEADLINE-now)/3600).toFixed(1)} 小时\n`);
  let s=await network.provider.send("evm_snapshot",[]);
  const a=await scenario("A 当前时间（边界前 86h）  ", null);
  await network.provider.send("evm_revert",[s]);
  s=await network.provider.send("evm_snapshot",[]);
  const c=await scenario("C 边界前 1 小时          ", DEADLINE-3600);
  await network.provider.send("evm_revert",[s]);
  s=await network.provider.send("evm_snapshot",[]);
  const b=await scenario("B 边界后 10 分钟         ", DEADLINE+600);
  await network.provider.send("evm_revert",[s]);
  console.log("");
  ck("边界之前：10 户全部正常", a===10 && c===10, `A=${a} C=${c}`);
  ck("边界之后：出现除零，可领取户数显著下降", b<10, `B=${b}`);
  console.log(`\n==== ${P} passed, ${F} failed ====`);
  console.log(b<10&&a===10&&c===10 ? "\n=> 截止时间 2026-10-08 00:00:00 UTC 在真实链上状态下成立。" : "\n=> 结果异常，需进一步核查。");
}
main().catch(e=>{console.error(e);process.exit(1);});
