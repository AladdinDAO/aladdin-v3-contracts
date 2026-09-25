import { ethers } from "/Users/caomeiyan/Desktop/code/Aladdin/aladdin-v3-contracts/node_modules/ethers/lib.commonjs/index.js";
const p=new ethers.JsonRpcProvider("https://mainnet.gateway.tenderly.co");
const POOLS={ezPool:"0xf58c499417e36714e99803Cb135f507a95ae7169",xezPool:"0xBa947cba270D30967369Bf1f73884Be2533d7bDB"};
const FXN="0x365AccFCa291e7D3914637ABf1F7635dB165Bb09", EZETH="0xbf5495Efe5DB9ce00f80364C8B423567e58d2110";
const f=v=>ethers.formatEther(v);
const P_ABI=["function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)","function getStakerVoteOwner(address) view returns (address)","function claimable(address,address) view returns (uint256)","function rewardReceiver(address) view returns (address)","function boostCheckpoint(address) view returns (uint64,uint64)","function getActiveRewardTokens() view returns (address[])","function asset() view returns (address)"];
const CVX=["function owner() view returns (address)","function pid() view returns (uint256)","function poolRegistry() view returns (address)","function rewards() view returns (address)"];
const head=await p.getBlockNumber();
const TOPICS={Deposit:ethers.id("Deposit(address,address,uint256)"),Withdraw:ethers.id("Withdraw(address,address,uint256)")};

async function allEverDepositors(pool){
  const set=new Set(); let from=18000000;
  while(from<=head){ const to=Math.min(from+400000,head);
    for(const t of [TOPICS.Deposit,TOPICS.Withdraw]){
      try{ const lg=await p.getLogs({address:pool,topics:[t],fromBlock:from,toBlock:to});
        for(const l of lg){ for(const idx of [1,2]) if(l.topics[idx]) set.add(ethers.getAddress("0x"+l.topics[idx].slice(26))); } }catch(e){}
    }
    from=to+1; }
  set.delete(ethers.ZeroAddress);
  return [...set];
}

console.log("block",head,new Date((await p.getBlock(head)).timestamp*1000).toISOString());
const summary={};
for(const [name,pool] of Object.entries(POOLS)){
  const C=new ethers.Contract(pool,P_ABI,p);
  const cands=await allEverDepositors(pool);
  const rows=[];
  let sum=0n;
  for(const a of cands){
    const b=await C.balanceOf(a);
    if(b===0n) continue;
    sum+=b;
    const vo=await C.getStakerVoteOwner(a);
    let cEz=0n,cFxn=0n; try{cEz=await C.claimable(a,EZETH);}catch(e){} try{cFxn=await C.claimable(a,FXN);}catch(e){}
    const rr=await C.rewardReceiver(a);
    const code=await p.getCode(a);
    let owner="-",pid="-",isProxy=code.length===92;
    if(code!=="0x"){ const v=new ethers.Contract(a,CVX,p); try{owner=await v.owner();}catch(e){} try{pid=String(await v.pid());}catch(e){} }
    let ownerType="-"; if(owner!=="-") ownerType=(await p.getCode(owner))==="0x"?"EOA":"contract";
    rows.push({a,b,vo,cEz,cFxn,rr,kind:code==="0x"?"EOA":(isProxy?"Convex vault":"contract"),owner,ownerType,pid});
  }
  rows.sort((x,y)=>y.b>x.b?1:-1);
  const ts=await C.totalSupply();
  console.log(`\n=== ${name} ${pool}`);
  console.log(`  历史上出现过的地址 ${cands.length} 个；当前有余额 ${rows.length} 个`);
  console.log(`  余额之和 ${f(sum)}  totalSupply ${f(ts)}  ${sum===ts?"完全吻合（无遗漏）":"不吻合！"}`);
  console.log(`  ${"地址".padEnd(44)}${"份额".padEnd(26)}${"类型".padEnd(14)}${"vote owner".padEnd(12)}${"背后 owner".padEnd(44)}owner类型  pid  rewardReceiver`);
  for(const r of rows){
    console.log(`  ${r.a}  ${f(r.b).padEnd(24)}${r.kind.padEnd(14)}${(r.vo===ethers.ZeroAddress?"(无)":r.vo.slice(0,10)).padEnd(12)}${r.owner.padEnd(44)}${r.ownerType.padEnd(10)}${String(r.pid).padEnd(5)}${r.rr===ethers.ZeroAddress?"(默认)":r.rr}`);
  }
  summary[name]=rows;
}
console.log("\n=== 背后 owner 去重 ===");
const owners=new Map();
for(const [name,rows] of Object.entries(summary)) for(const r of rows){ if(r.owner==="-")continue; const k=r.owner.toLowerCase(); if(!owners.has(k)) owners.set(k,[]); owners.get(k).push(name+":"+r.a.slice(0,10)); }
console.log("  独立 owner 数量:",owners.size);
for(const [o,v] of owners) console.log("   ",o,"->",v.join(", "));
console.log("\n=== vote owner 0xd11a4Ee0 的身份 ===");
const vo=new ethers.Contract("0xd11a4Ee017cA0BECA8FA45fF2abFe9C6267b7881",["function owner() view returns (address)","function operator() view returns (address)"],p);
const o1=await vo.owner(), o2=await vo.operator();
console.log("  owner   ",o1,(await p.getCode(o1))==="0x"?"EOA":"contract");
console.log("  operator",o2,(await p.getCode(o2))==="0x"?"EOA":"contract");
const s=new ethers.Contract(o1,["function getOwners() view returns (address[])","function getThreshold() view returns (uint256)"],p);
try{console.log("  owner 是 Safe，threshold",String(await s.getThreshold()),"owners",(await s.getOwners()).length,"个");}catch(e){console.log("  owner 不是 Safe");}
