import { ethers, network } from "hardhat";
import * as fs from "fs";
const RPC = process.env.FORK_RPC || "https://mainnet.gateway.tenderly.co";
const A: any = { EZETH:"0xbf5495Efe5DB9ce00f80364C8B423567e58d2110", EZ_TREASURY:"0x38965311507D4E54973F81475a149c09376e241e", EZ_MARKET:"0x69518D1D70AD537C41401303BDf96032338E40dE", FEZETH:"0x50B4DC15b34E31671c9cA40F9eb05D7eBd6b13f9", XEZETH:"0x2e5A5AF7eE900D34BCFB70C47023bf1d6bE35CF5", EZ_POOL:"0xf58c499417e36714e99803Cb135f507a95ae7169", XEZ_POOL:"0xBa947cba270D30967369Bf1f73884Be2533d7bDB", RUSD:"0x65D72AA8DA931F047169112fcf34f52DbaAE7D18", SAFE:"0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF", PROXY_ADMIN:"0x9b54b7703551d9d0ced177a78367560a8b2edda4", TIMELOCK:"0x68863fb8855b04509a835082478D6E3D0bE4E61a", FXN:"0x365AccFCa291e7D3914637ABf1F7635dB165Bb09", XEZ_WHALE:"0xC01Ac9349396935f60d39737EBe352572d1483A2" };
const IMPL_SLOT="0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const E=10n**18n; const f=(v:bigint)=>ethers.formatUnits(v,18);
const ERC20=["function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)","function transfer(address,uint256) returns (bool)"];
const PA=["function upgrade(address,address)"];
const M_ABI=["function redeemFToken(uint256,address,uint256) returns (uint256,uint256)","function redeemXToken(uint256,address,uint256) returns (uint256)","function updateRedeemFeeRatio(uint256,int256,bool)"];
const T_ABI=["function windDownStatus() view returns (uint8)","function windDownBaseBalance() view returns (uint256)","function windDownFBaseBalance() view returns (uint256)","function windDownXBaseBalance() view returns (uint256)","function windDownBaseClaimed() view returns (uint256)","function windDownPreviewRedeem(uint256,uint256) view returns (uint256)","function initializeWindDown(uint256,uint256,uint256,uint256,uint256)","function finalizeWindDown()","function adminClaim()","function currentBaseTokenPrice() view returns (uint256)","function collateralRatio() view returns (uint256)"];
const P_ABI=["function windDown(uint256,uint256) returns (uint256,uint256)","function checkpoint(address)","function totalSupply() view returns (uint256)","function balanceOf(address) view returns (uint256)","function claimable(address,address) view returns (uint256)","function claim(address,address)","function fxn() view returns (address)","function ve() view returns (address)","function veHelper() view returns (address)","function minter() view returns (address)","function adminClaim()"];
const R_ABI=["function nav() view returns (uint256)","function isUnderCollateral() view returns (bool)","function markets(address) view returns (address,address,address,uint256,uint256)","function removeMarket(address)","function removeRebalancePools(address[])","function redeem(address,uint256,address,uint256) returns (uint256,uint256)","function balanceOf(address) view returns (uint256)"];
const CVX=["function owner() view returns (address)","function withdraw(uint256)","function getReward(bool,address[])"];
let P=0,Fl=0; const ck=(l:string,c:boolean,d="")=>{if(c){P++;console.log("  PASS  "+l+(d?"  "+d:""));}else{Fl++;console.log("  FAIL  "+l+(d?"  "+d:""));}};
async function imp(a:string){await network.provider.send("hardhat_impersonateAccount",[a]);await network.provider.send("hardhat_setBalance",[a,"0x21e19e0c9bab2400000"]);return await ethers.getSigner(a);}
const say=async(l:string,fn:()=>Promise<any>)=>{try{const r=await fn();console.log("  "+l+" -> OK",r===undefined?"":String(r));}catch(e:any){console.log("  "+l+" -> REVERT",(e.shortMessage||e.message||"").slice(0,110));}};

async function main(){
  const H=JSON.parse(fs.readFileSync("/tmp/ezwd/holders.json","utf8"));
  await network.provider.request({method:"hardhat_reset",params:[{forking:{jsonRpcUrl:RPC}}]});
  await network.provider.send("evm_mine",[]);
  const [dev]=await ethers.getSigners();
  const ez=new ethers.Contract(A.EZETH,ERC20,ethers.provider), fez=new ethers.Contract(A.FEZETH,ERC20,ethers.provider), xez=new ethers.Contract(A.XEZETH,ERC20,ethers.provider), fxn=new ethers.Contract(A.FXN,ERC20,ethers.provider);
  const T=new ethers.Contract(A.EZ_TREASURY,T_ABI,ethers.provider), M=new ethers.Contract(A.EZ_MARKET,M_ABI,ethers.provider), R=new ethers.Contract(A.RUSD,R_ABI,ethers.provider);
  const EZP=new ethers.Contract(A.EZ_POOL,P_ABI,ethers.provider), XEZP=new ethers.Contract(A.XEZ_POOL,P_ABI,ethers.provider);
  const safe=await imp(A.SAFE), tl=await imp(A.TIMELOCK);
  const fxusdImpl={getAddress:async()=>"0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd"} as any;
  const treImpl={getAddress:async()=>"0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC"} as any;
  const poolImpl={getAddress:async()=>"0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5"} as any;
  const pa=new ethers.Contract(A.PROXY_ADMIN,PA,tl);
  for(const [px,im] of [[A.RUSD,await fxusdImpl.getAddress()],[A.EZ_TREASURY,await treImpl.getAddress()],[A.EZ_POOL,await poolImpl.getAddress()],[A.XEZ_POOL,await poolImpl.getAddress()]]) await (await pa.upgrade(px,im)).wait();

  console.log("=== A. view surface still broken by the dead oracle, and when it recovers");
  await say("ezTreasury.currentBaseTokenPrice()",async()=>f(await T.currentBaseTokenPrice()));
  await say("ezTreasury.collateralRatio()",async()=>f(await T.collateralRatio()));
  await say("fezETH.nav()",async()=>f(await (new ethers.Contract(A.FEZETH,["function nav() view returns (uint256)"],ethers.provider) as any).nav()));
  await say("rUSD.nav()  [before removeMarket]",async()=>f(await R.nav()));
  const B=await ez.balanceOf(A.EZ_TREASURY),F=await fez.totalSupply(),X=await xez.totalSupply();
  await (await (T.connect(safe) as any).initializeWindDown(B,F,X,(F*E)/E,(X*346669734551971069n)/E)).wait();
  await (await (M.connect(safe) as any).updateRedeemFeeRatio(0,0,true)).wait();
  await (await (M.connect(safe) as any).updateRedeemFeeRatio(0,0,false)).wait();
  await say("rUSD.nav()  [after init, before removeMarket]",async()=>f(await R.nav()));
  // clear ezETH managed the same way the runbook does, then remove
  const ezManaged=(await R.markets(A.EZETH))[4];
  const whale=await imp("0x6dc7a100d09DDbF344FC4Dd0398f79500D0c2716");
  // just impersonate rUSD itself is not possible; use the Safe path minimally: give Safe rUSD by transfers
  let need=ezManaged;
  for(const [h] of (H.rusd as any[])){ if(need<=0n) break; if(h.toLowerCase()===A.SAFE.toLowerCase()) continue; const b:bigint=await R.balanceOf(h); if(b===0n) continue; const hs=await imp(h); const amt=b<need?b:need; try{await (await (new ethers.Contract(A.RUSD,ERC20,hs) as any).transfer(A.SAFE,amt)).wait(); need-=amt;}catch(e){} }
  await (await (R.connect(safe) as any).redeem(A.EZETH,ezManaged,A.SAFE,0)).wait();
  await (await (R.connect(safe) as any).removeMarket(A.EZETH)).wait();
  await (await (R.connect(safe) as any).removeRebalancePools([A.EZ_POOL,A.XEZ_POOL])).wait();
  await say("rUSD.nav()  [after removeMarket]",async()=>f(await R.nav()));

  console.log("\n=== B. pool pro-rata, isolated (checkpoint flushed first)");
  for(const [name,Pl] of [["ezPool",EZP],["xezPool",XEZP]] as const){
    const addr=name==="ezPool"?A.EZ_POOL:A.XEZ_POOL;
    const key=name==="ezPool"?"ezpool":"xezpool";
    await (await (Pl.connect(dev) as any).checkpoint(ethers.ZeroAddress)).wait();  // flush streamed rewards
    await network.provider.send("evm_mine",[]);
    const bal=await fez.balanceOf(addr);
    const before:any={}; for(const [s] of H[key]) before[s]={sh:await (Pl as any).balanceOf(s), ez:await (Pl as any).claimable(s,A.EZETH)};
    const expected=await T.windDownPreviewRedeem(bal,0);
    const ezPoolBefore=await ez.balanceOf(addr);
    await (await (Pl.connect(safe) as any).windDown(bal,expected)).wait();
    let sum=0n;
    for(const [s] of H[key]){
      const gain=(await (Pl as any).claimable(s,A.EZETH))-before[s].ez; sum+=gain;
      const shp=Number(before[s].sh*100000000n/bal)/1000000, gnp=expected===0n?0:Number(gain*100000000n/expected)/1000000;
      ck(`${name} ${s.slice(0,10)} pro-rata`, Math.abs(shp-gnp)<0.00002, `${shp.toFixed(6)}% vs ${gnp.toFixed(6)}%  ${f(gain)}`);
    }
    ck(`${name} sum(gain) == baseOut (floor dust only)`, sum<=expected && expected-sum<=10000n, `dust ${(expected-sum).toString()} wei`);
    const held=await ez.balanceOf(addr);
    let owed=0n; for(const [s] of H[key]) owed+=await (Pl as any).claimable(s,A.EZETH);
    ck(`${name} solvent: sum(claimable) <= ezETH held`, owed<=held, `${f(owed)} <= ${f(held)}`);
    ck(`${name} ezETH credited == baseOut`, held-ezPoolBefore===expected, f(expected));
  }

  console.log("\n=== C. Convex vault consequences");
  for(const [name,Pl,key] of [["ezPool",EZP,"ezpool"],["xezPool",XEZP,"xezpool"]] as const){
    const st=(H as any)[key][0][0];
    const v=new ethers.Contract(st,CVX,ethers.provider);
    const own=await v.owner(); const os=await imp(own);
    await say(`${name} Convex vault.withdraw(1) after windDown`,async()=>{await (v.connect(os) as any)["withdraw(uint256)"].staticCall(1);return "no revert";});
    const c=await (Pl as any).claimable(st,A.EZETH);
    const ob=await ez.balanceOf(own);
    await (await (Pl.connect(dev) as any).claim(st,ethers.ZeroAddress)).wait();
    await (await (v.connect(os) as any)["getReward(bool,address[])"](false,[A.EZETH])).wait();
    ck(`${name} Convex vault owner received the ezETH`,(await ez.balanceOf(own))-ob===c,f(c));
  }

  console.log("\n=== D. finalize: leftover vs outstanding claims");
  const hs=await imp(A.XEZ_WHALE);
  const wb=await xez.balanceOf(A.XEZ_WHALE);
  await (await (M.connect(hs) as any).redeemXToken(wb,A.XEZ_WHALE,0)).wait();
  const xLeft=await xez.totalSupply(), fLeft=await fez.totalSupply();
  const owed=(await T.windDownPreviewRedeem(0,xLeft===0n?1n:xLeft))*(xLeft===0n?0n:1n)+(fLeft===0n?0n:await T.windDownPreviewRedeem(fLeft,0));
  const treLeft=await ez.balanceOf(A.EZ_TREASURY);
  console.log("  unredeemed fezETH",f(fLeft)," xezETH",f(xLeft));
  console.log("  ezETH still owed to them",f(owed)," | treasury holds",f(treLeft));
  ck("treasury remainder == what unredeemed holders are still owed (+floor dust)", treLeft>=owed && treLeft-owed<=10n**6n, f(treLeft-owed)+" excess");
  const safeBefore=await ez.balanceOf(A.SAFE);
  await (await (T.connect(safe) as any).finalizeWindDown()).wait();
  await (await (T.connect(safe) as any).adminClaim()).wait();
  ck("adminClaim took exactly that remainder",(await ez.balanceOf(A.SAFE))-safeBefore===treLeft,f(treLeft));
  console.log("\nPASS "+P+"  FAIL "+Fl);
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
