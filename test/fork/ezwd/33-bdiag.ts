// 诊断：跨过 2026-10-08 边界后，精简批次里究竟哪一步失败、为什么。
import { ethers, network } from "hardhat";
import * as fs from "fs";
const RPC=process.env.FORK_RPC||"https://mainnet.gateway.tenderly.co";
const SAFE="0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF";
const EZ="0xbf5495Efe5DB9ce00f80364C8B423567e58d2110", FXN="0x365AccFCa291e7D3914637ABf1F7635dB165Bb09";
const EZ_V=["0x4A036ab673722468a8e1fCC0F74A2dD5914FD1c1","0x4c75A7349B20745DAf37E6C348b85E8a03F72F9A","0x0Fa286332b2d1bBB0c7637CD63BA742a050b5AAd","0x7DCe6D8752A0e2fCF3cE92e9CeAdf9857F920ACc","0xCbE9e9E80b5301956c12FbB40742b144f98d4e63","0x492550DDcc5349940A879cAf4d3CFFfaa1Ab0F64"];
const XEZ_V=["0xC68A2AE2b932C472Fd4Ad4367FF6e093E4E3Da8f","0x3b0c2E02b0F3a4f507bA8F39aB3Ea93BF4863a90","0x9af69159D25e213a35A2b6E7274023Da2D2bdaC6","0x1090988Cf5569cc811756220AC3160aA028988AA"];
const f=(v:bigint)=>ethers.formatUnits(v,18);
async function imp(a:string){await network.provider.send("hardhat_impersonateAccount",[a]);await network.provider.send("hardhat_setBalance",[a,"0x21e19e0c9bab2400000"]);return await ethers.getSigner(a);}
const erc=(a:string)=>new ethers.Contract(a,["function balanceOf(address) view returns (uint256)"],ethers.provider);
const VAULT=["function owner() view returns (address)","function getReward(bool,address[])"];
const errOf=(e:any)=>{const m=(e.shortMessage||e.message||"").toString();
  if(m.includes("panic code 0x12"))return "Panic(0x12) 除零";
  const mm=m.match(/0x[0-9a-f]{8}/i); return mm?mm[0]:m.replace(/^VM Exception[^:]*: /,"").slice(0,70);};

async function run(label:string, warpTo:number|null){
  console.log(`\n================ ${label} ================`);
  await network.provider.request({method:"hardhat_reset",params:[{forking:{jsonRpcUrl:RPC}}]});
  await network.provider.send("evm_mine",[]);
  if(warpTo){ await network.provider.send("evm_setNextBlockTimestamp",[warpTo]); await network.provider.send("evm_mine",[]); }
  const t=(await ethers.provider.getBlock("latest"))!.timestamp;
  console.log(`链时间 ${new Date(t*1000).toISOString()}`);
  const steps=JSON.parse(fs.readFileSync("/tmp/steps.json","utf8"));
  const safe=await imp(SAFE);
  // 逐步以 Safe 身份直接调用（不走 MultiSend），这样能看到每一步的真实回滚原因
  for(const i of [0,1,2,8,12,13]){   // 费率归零 x2 + initializeWindDown + updateRedeemStatus(false) + 两笔 windDown
    const s=steps[i];
    try{ const r=await (await safe.sendTransaction({to:s.to,data:s.d,value:0})).wait();
         console.log(`  step ${String(s.idx).padStart(2)}  OK      gas ${r!.gasUsed}`); }
    catch(e:any){ console.log(`  step ${String(s.idx).padStart(2)}  REVERT  ${errOf(e)}`); return null; }
  }
  let ok=0,got=0n;
  for(const v of [...EZ_V,...XEZ_V]){
    const vc=new ethers.Contract(v,VAULT,ethers.provider);
    let owner:string; try{ owner=await vc.owner(); }catch(e){ continue; }
    const o=await imp(owner); const b0=await erc(EZ).balanceOf(owner);
    try{ await (await (vc.connect(o) as any).getReward(true,[EZ,FXN])).wait(); ok++; got+=(await erc(EZ).balanceOf(owner))-b0; }
    catch(e:any){ console.log(`     vault ${v} getReward REVERT ${errOf(e)}`); }
  }
  console.log(`  => getReward 成功 ${ok}/10   共收到 ${f(got)} ezETH`);
  return ok;
}

async function main(){
  const DEADLINE=1791417600;  // 2026-10-08 00:00:00 UTC
  const a=await run("A. 当前时间（边界之前）", null);
  const b=await run("B. 边界之后 10 分钟", DEADLINE+600);
  const c=await run("C. 边界之前 1 小时（贴边）", DEADLINE-3600);
  console.log("\n================ 汇总 ================");
  console.log(`  A 边界之前        ${a}/10`);
  console.log(`  C 边界之前 1 小时  ${c}/10`);
  console.log(`  B 边界之后 10 分钟 ${b}/10`);
  console.log(`\n  判定：${a===10&&c===10&&(b!==null&&b<10)?"周四边界效应在真实链上状态下复现，截止时间成立":"需要进一步核查"}`);
}
main().catch(e=>{console.error(e);process.exit(1);});
