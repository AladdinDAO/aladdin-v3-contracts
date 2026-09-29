// 对 Safe 队列中 nonce 742 那笔 scheduleBatch 的真实 calldata 做端到端验证。
// calldata 取自 Safe Transaction Service，未经任何改写。
import { ethers, network } from "hardhat";
import * as fs from "fs";
const RPC = process.env.FORK_RPC || "https://mainnet.gateway.tenderly.co";
const SAFE="0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF", TL="0x68863fb8855b04509a835082478D6E3D0bE4E61a";
const PROXIES={rUSD:"0x65D72AA8DA931F047169112fcf34f52DbaAE7D18",treasury:"0x38965311507D4E54973F81475a149c09376e241e",ezPool:"0xf58c499417e36714e99803Cb135f507a95ae7169",xezPool:"0xBa947cba270D30967369Bf1f73884Be2533d7bDB"};
const NEW={rUSD:"0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd",treasury:"0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC",ezPool:"0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5",xezPool:"0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5"};
const SLOTS={rUSD:260,treasury:60,ezPool:160,xezPool:160};
let P=0,F=0; const ck=(l:string,c:boolean,d="")=>{if(c){P++;console.log("  PASS  "+l+(d?"  "+d:""));}else{F++;console.log("  FAIL  "+l+(d?"  "+d:""));}};
const note=(s:string)=>console.log("  NOTE  "+s);
async function imp(a:string){await network.provider.send("hardhat_impersonateAccount",[a]);await network.provider.send("hardhat_setBalance",[a,"0x21e19e0c9bab2400000"]);return await ethers.getSigner(a);}
const implOf=async(x:string)=>ethers.getAddress("0x"+(await network.provider.send("eth_getStorageAt",[x,"0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc","latest"])).slice(26));
const SAFE_ABI=["function nonce() view returns (uint256)","function getOwners() view returns (address[])","function getThreshold() view returns (uint256)","function getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256) view returns (bytes32)","function approveHash(bytes32)","function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) payable returns (bool)"];

async function readSlots(addr:string,n:number){const out:string[]=[];for(let i=0;i<n;i++)out.push(await network.provider.send("eth_getStorageAt",[addr,ethers.toBeHex(i,32),"latest"]));return out;}

async function main(){
  const data=fs.readFileSync("/tmp/calldata.txt","utf8").trim();
  const D=JSON.parse(fs.readFileSync("/tmp/decoded.json","utf8"));
  const QHASH=JSON.parse(fs.readFileSync("/tmp/tx.json","utf8")).safeTxHash;
  await network.provider.request({method:"hardhat_reset",params:[{forking:{jsonRpcUrl:RPC}}]});
  await network.provider.send("evm_mine",[]);

  console.log("===== 0. 升级前存储快照 =====");
  const pre:any={}; for(const [k,a] of Object.entries(PROXIES)) pre[k]=await readSlots(a,(SLOTS as any)[k]);
  console.log(`  已读取 ${Object.values(SLOTS).reduce((a,b)=>a+b,0)} 个槽`);

  console.log("\n===== 1. 用队列原始 calldata 走真实 6/9 =====");
  const sr=new ethers.Contract(SAFE,SAFE_ABI,ethers.provider);
  const owners:string[]=[...(await sr.getOwners())]; const th=Number(await sr.getThreshold()); const nonce=await sr.nonce();
  ck("分叉上的 Safe nonce 与队列交易 nonce 一致", Number(nonce)===742, `${nonce}`);
  const h=await sr.getTransactionHash(TL,0,data,0,0,0,0,ethers.ZeroAddress,ethers.ZeroAddress,nonce);
  ck("链上 getTransactionHash 与队列 safeTxHash 一致", h.toLowerCase()===QHASH.toLowerCase(), h);
  const signers=owners.slice(0,th).map(o=>o.toLowerCase()).sort();
  for(const o of signers){const s=await imp(ethers.getAddress(o));await (await (new ethers.Contract(SAFE,SAFE_ABI,s) as any).approveHash(h)).wait();}
  let sigs="0x"; for(const o of signers) sigs+=ethers.zeroPadValue(o,32).slice(2)+"0".repeat(64)+"01";
  const ex=await imp(ethers.getAddress(signers[0]));
  const r=await (await (new ethers.Contract(SAFE,SAFE_ABI,ex) as any).execTransaction(TL,0,data,0,0,0,0,ethers.ZeroAddress,ethers.ZeroAddress,sigs)).wait();
  ck("scheduleBatch 执行成功", r.status===1, `gas ${r.gasUsed}`);

  const tl=new ethers.Contract(TL,["function isOperationPending(bytes32) view returns (bool)","function isOperationReady(bytes32) view returns (bool)","function isOperationDone(bytes32) view returns (bool)","function getTimestamp(bytes32) view returns (uint256)","function executeBatch(address[],uint256[],bytes[],bytes32,bytes32) payable"],ethers.provider);
  const sched=(await ethers.provider.getBlock(r.blockNumber))!.timestamp;
  ck("operation 进入 pending", await tl.isOperationPending(D.opId));
  const ts=await tl.getTimestamp(D.opId);
  ck("生效时间 == 上链时间 + 259200", Number(ts)===sched+259200, `${ts}  ${new Date(Number(ts)*1000).toISOString()}`);

  console.log("\n===== 2. 延时未到不可执行 =====");
  const exec=async()=>{const s=await imp(SAFE);await (await (tl.connect(s) as any).executeBatch(D.targets,D.values,D.payloads,D.predecessor,D.salt)).wait();};
  try{ await exec(); ck("延时未到 executeBatch 应回滚", false, "竟然成功了"); }
  catch(e:any){ ck("延时未到 executeBatch 回滚", true, (e.shortMessage||e.message||"").replace(/^.*reverted with reason string /,"").slice(0,60)); }
  await network.provider.send("evm_increaseTime",[259200-3600]); await network.provider.send("evm_mine",[]);
  try{ await exec(); ck("差 1 小时仍应回滚", false, "竟然成功了"); }
  catch(e:any){ ck("差 1 小时仍回滚", true); }

  console.log("\n===== 3. 满 3 天后执行 =====");
  await network.provider.send("evm_increaseTime",[3601]); await network.provider.send("evm_mine",[]);
  ck("operation 变为 ready", await tl.isOperationReady(D.opId));
  await exec();
  ck("executeBatch 成功且 operation 标记为 done", await tl.isOperationDone(D.opId));
  for(const [k,a] of Object.entries(PROXIES)){
    const got=await implOf(a);
    ck(`${k} implementation 已切到目标实现`, got.toLowerCase()===(NEW as any)[k].toLowerCase(), got);
  }

  console.log("\n===== 4. 存储布局回归 =====");
  let diff=0;
  for(const [k,a] of Object.entries(PROXIES)){
    const post=await readSlots(a,(SLOTS as any)[k]);
    let d=0; for(let i=0;i<post.length;i++) if(post[i]!==pre[k][i]){d++;diff++;console.log(`     ${k} slot ${i}  ${pre[k][i]} -> ${post[i]}`);}
    ck(`${k} ${(SLOTS as any)[k]} 槽零差异`, d===0);
  }
  ck(`四个代理共 ${Object.values(SLOTS).reduce((a,b)=>a+b,0)} 槽全部零差异`, diff===0);

  console.log("\n===== 5. 升级后的冻结状态 =====");
  const T=new ethers.Contract(PROXIES.treasury,["function windDownStatus() view returns (uint8)","function maxRedeemableFToken(uint256) view returns (uint256,uint256)","function maxRedeemableXToken(uint256) view returns (uint256,uint256)","function isUnderCollateral() view returns (bool)"],ethers.provider);
  ck("Treasury windDownStatus == 0 (WindDownBeforeInit)", Number(await T.windDownStatus())===0);
  const mf=await T.maxRedeemableFToken(0), mx=await T.maxRedeemableXToken(0);
  ck("maxRedeemableFToken/XToken 均返回 (0,0)", mf[0]===0n&&mf[1]===0n&&mx[0]===0n&&mx[1]===0n);
  ck("Treasury isUnderCollateral() 返回 false", (await T.isUnderCollateral())===false);
  const R=new ethers.Contract(PROXIES.rUSD,["function isUnderCollateral() view returns (bool)","function getMarkets() view returns (address[])"],ethers.provider);
  let rusdOk=false; try{ await R.isUnderCollateral(); rusdOk=true; }catch(e){}
  ck("rUSD isUnderCollateral() 不再因 ezETH 腿回滚(rUSD 已恢复)", rusdOk);
  const PL=["function deposit(uint256,address)","function withdraw(uint256,address)","function windDown(uint256,uint256)"];
  for(const [n,a] of [["ezPool",PROXIES.ezPool],["xezPool",PROXIES.xezPool]] as const){
    const c=new ethers.Contract(a,PL,ethers.provider); const u=await imp("0x4A036ab673722468a8e1fCC0F74A2dD5914FD1c1");
    for(const fn of ["deposit","withdraw"]){
      let rev=false; try{ await (c.connect(u) as any)[fn].staticCall(1n,await u.getAddress()); }catch(e){ rev=true; }
      ck(`${n}.${fn} 已被禁用`, rev);
    }
  }
  console.log(`\n==== ${P} passed, ${F} failed ====`);
}
main().catch(e=>{console.error(e);process.exit(1);});
