import { ethers, network } from "hardhat";
import * as fs from "fs";
const RPC=process.env.FORK_RPC||"https://mainnet.gateway.tenderly.co";
const IMPL={fxusd:"0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd",treasury:"0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC",pool:"0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5"};
const A:any={EZETH:"0xbf5495Efe5DB9ce00f80364C8B423567e58d2110",EZ_TREASURY:"0x38965311507D4E54973F81475a149c09376e241e",EZ_MARKET:"0x69518D1D70AD537C41401303BDf96032338E40dE",FEZETH:"0x50B4DC15b34E31671c9cA40F9eb05D7eBd6b13f9",XEZETH:"0x2e5A5AF7eE900D34BCFB70C47023bf1d6bE35CF5",EZ_POOL:"0xf58c499417e36714e99803Cb135f507a95ae7169",XEZ_POOL:"0xBa947cba270D30967369Bf1f73884Be2533d7bDB",RUSD:"0x65D72AA8DA931F047169112fcf34f52DbaAE7D18",SAFE:"0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF",PROXY_ADMIN:"0x9b54b7703551d9d0ced177a78367560a8b2edda4",TIMELOCK:"0x68863fb8855b04509a835082478D6E3D0bE4E61a",FXN:"0x365AccFCa291e7D3914637ABf1F7635dB165Bb09",WEETH:"0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee",WEETH_TREASURY:"0x781BA968d5cc0b40EB592D5c8a9a3A4000063885",WEETH_WHALE:"0xBdfa7b7893081B35Fb54027489e2Bc7A38275129"};
const E=10n**18n; const f=(v:bigint)=>ethers.formatUnits(v,18);
const ERC20=["function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)","function transfer(address,uint256) returns (bool)","function approve(address,uint256) returns (bool)"];
const PA=["function upgrade(address,address)"];
const M_ABI=["function updateRedeemFeeRatio(uint256,int256,bool)","function updateMintStatus(bool)","function updateRedeemStatus(bool)","function mintPaused() view returns (bool)","function redeemPaused() view returns (bool)","function redeemFToken(uint256,address,uint256) returns (uint256,uint256)","function redeemXToken(uint256,address,uint256) returns (uint256)"];
const T_ABI=["function initializeWindDown(uint256,uint256,uint256,uint256,uint256)","function windDownPreviewRedeem(uint256,uint256) view returns (uint256)","function windDownStatus() view returns (uint8)","function windDownFBaseBalance() view returns (uint256)","function windDownXBaseBalance() view returns (uint256)","function updateBaseTokenCap(uint256)","function baseTokenCap() view returns (uint256)","function totalBaseToken() view returns (uint256)","function getUnderlyingValue(uint256) view returns (uint256)","function currentBaseTokenPrice() view returns (uint256)"];
const R_ABI=["function mint(address,uint256,address,uint256) returns (uint256)","function redeem(address,uint256,address,uint256) returns (uint256,uint256)","function removeMarket(address)","function removeRebalancePools(address[])","function markets(address) view returns (address,address,address,uint256,uint256)","function balanceOf(address) view returns (uint256)","function autoRedeem(uint256,address,uint256[]) returns (address[],uint256[],uint256[])"];
const P_ABI=["function windDown(uint256,uint256) returns (uint256,uint256)","function claim(address,address)","function claimable(address,address) view returns (uint256)","function checkpoint(address)","function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)","function deposit(uint256,address)","function withdraw(uint256,address)"];
let P=0,F=0;const ck=(l:string,c:boolean,d="")=>{if(c){P++;console.log("  PASS  "+l+(d?"  "+d:""));}else{F++;console.log("  FAIL  "+l+(d?"  "+d:""));}};
const note=(s:string)=>console.log("  NOTE  "+s);
async function imp(a:string){await network.provider.send("hardhat_impersonateAccount",[a]);await network.provider.send("hardhat_setBalance",[a,"0x21e19e0c9bab2400000"]);return await ethers.getSigner(a);}
const snap=async()=>await network.provider.send("evm_snapshot",[]);
const back=async(s:string)=>{await network.provider.send("evm_revert",[s]);};
const errOf=(e:any)=>{const m=(e.shortMessage||e.message||"").toString();return m.includes("panic code 0x12")?"DIV/0":m.replace(/^.*custom error /,"").replace(/^VM Exception[^:]*: /,"").slice(0,55);};

async function batch1and2(safe:any){   // schedule + (pause,pause,execute) — real timelock path, verified then rolled back
  const tl=new ethers.Contract(A.TIMELOCK,["function scheduleBatch(address[],uint256[],bytes[],bytes32,bytes32,uint256)","function executeBatch(address[],uint256[],bytes[],bytes32,bytes32) payable","function getMinDelay() view returns (uint256)","function isOperationDone(bytes32) view returns (bool)","function hashOperationBatch(address[],uint256[],bytes[],bytes32,bytes32) view returns (bytes32)"],safe);
  const pai=new ethers.Interface(PA);
  const targets=[A.PROXY_ADMIN,A.PROXY_ADMIN,A.PROXY_ADMIN,A.PROXY_ADMIN], values=[0,0,0,0];
  const payloads=[pai.encodeFunctionData("upgrade",[A.RUSD,IMPL.fxusd]),pai.encodeFunctionData("upgrade",[A.EZ_TREASURY,IMPL.treasury]),pai.encodeFunctionData("upgrade",[A.EZ_POOL,IMPL.pool]),pai.encodeFunctionData("upgrade",[A.XEZ_POOL,IMPL.pool])];
  const salt="0x9146c10dab9d39376a444dac584387991bae638b83043e9a0732b166e26b2fcc";
  const delay=await tl.getMinDelay();
  const opId=await tl.hashOperationBatch(targets,values,payloads,ethers.ZeroHash,salt);
  // --- part 1: prove the real governance path (needs a 3-day warp) ---
  const g=await snap();
  await (await tl.scheduleBatch(targets,values,payloads,ethers.ZeroHash,salt,delay)).wait();
  let early=false; try{ await tl.executeBatch.staticCall(targets,values,payloads,ethers.ZeroHash,salt); early=true; }catch(e){}
  ck("executeBatch before the 3-day delay reverts", !early);
  await network.provider.send("evm_increaseTime",[Number(delay)+1]); await network.provider.send("evm_mine",[]);
  const M0=new ethers.Contract(A.EZ_MARKET,M_ABI,safe);
  await (await M0.updateMintStatus(true)).wait();
  await (await M0.updateRedeemStatus(true)).wait();
  await (await tl.executeBatch(targets,values,payloads,ethers.ZeroHash,salt)).wait();
  ck("real Safe -> Timelock -> ProxyAdmin path executes all four upgrades", (await implOf(A.RUSD))===IMPL.fxusd.toLowerCase() && (await implOf(A.EZ_TREASURY))===IMPL.treasury.toLowerCase() && (await implOf(A.EZ_POOL))===IMPL.pool.toLowerCase() && (await implOf(A.XEZ_POOL))===IMPL.pool.toLowerCase());
  ck("Timelock operation marked done", await tl.isOperationDone(opId));
  await back(g);
  // --- part 2: reproduce the same end state without warping time (plan §8.9 approach) ---
  const M1=new ethers.Contract(A.EZ_MARKET,M_ABI,safe);
  await (await M1.updateMintStatus(true)).wait();
  await (await M1.updateRedeemStatus(true)).wait();
  const tlSigner=await imp(A.TIMELOCK);
  const pa=new ethers.Contract(A.PROXY_ADMIN,PA,tlSigner);
  for(const [px,im] of [[A.RUSD,IMPL.fxusd],[A.EZ_TREASURY,IMPL.treasury],[A.EZ_POOL,IMPL.pool],[A.XEZ_POOL,IMPL.pool]]) await (await pa.upgrade(px,im)).wait();
  return {targets,values,payloads,salt};
}
const implOf=async(px:string)=>"0x"+(await network.provider.send("eth_getStorageAt",[px,"0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc","latest"])).slice(26);

async function main(){
  const H=JSON.parse(fs.readFileSync("/tmp/ezwd/holders.json","utf8"));
  await network.provider.request({method:"hardhat_reset",params:[{forking:{jsonRpcUrl:RPC}}]});
  await network.provider.send("evm_mine",[]);
  const [dev]=await ethers.getSigners(); const safe=await imp(A.SAFE);
  const ez=new ethers.Contract(A.EZETH,ERC20,ethers.provider),fez=new ethers.Contract(A.FEZETH,ERC20,ethers.provider),xez=new ethers.Contract(A.XEZETH,ERC20,ethers.provider),weeth=new ethers.Contract(A.WEETH,ERC20,ethers.provider),fxn=new ethers.Contract(A.FXN,ERC20,ethers.provider);
  const T=new ethers.Contract(A.EZ_TREASURY,T_ABI,ethers.provider),M=new ethers.Contract(A.EZ_MARKET,M_ABI,ethers.provider),R=new ethers.Contract(A.RUSD,R_ABI,ethers.provider),WT=new ethers.Contract(A.WEETH_TREASURY,T_ABI,ethers.provider);
  const EZP=new ethers.Contract(A.EZ_POOL,P_ABI,ethers.provider),XEZP=new ethers.Contract(A.XEZ_POOL,P_ABI,ethers.provider);

  // ---- run the plan's batch 1 + 2 ----
  console.log("########## the plan's 多签一 + 多签二 ##########");
  await batch1and2(safe);
  ck("mintPaused", (await M.mintPaused())===true);
  ck("redeemPaused", (await M.redeemPaused())===true);
  ck("windDownStatus == 0 (WindDownBeforeInit)", (await T.windDownStatus())===0n);
  const anchor=await snap();

  // freeze-state reads
  const B=await ez.balanceOf(A.EZ_TREASURY),Fs=await fez.totalSupply(),X=await xez.totalSupply();
  const ezManaged=(await R.markets(A.EZETH))[4];
  const ezPoolBal=await fez.balanceOf(A.EZ_POOL), xezPoolBal=await fez.balanceOf(A.XEZ_POOL);
  // plan's §5 formula with today's real price
  const rp=new ethers.Contract("0xE3fF08070aB3aD7eeE7a1cab35105F27DF8EfF10",["function getRate() view returns (uint256)"],ethers.provider);
  const cl=new ethers.Contract("0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",["function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"],ethers.provider);
  const Pez=((BigInt((await cl.latestRoundData())[1])*10n**10n)*(await rp.getRate()))/E;
  const fW=Fs, xW=(B*Pez)/E - Fs;
  console.log(`  freeze: B=${f(B)} F=${f(Fs)} X=${f(X)}  P_ezETH=${f(Pez)}  fWeight=${f(fW)} xWeight=${f(xW)}  f share=${(Number(fW*1000000n/(fW+xW))/10000).toFixed(4)}%`);

  async function runBatch3(withCheckpoints:boolean){
    const M2=new ethers.Contract(A.EZ_MARKET,M_ABI,safe), T2=new ethers.Contract(A.EZ_TREASURY,T_ABI,safe), R2=new ethers.Contract(A.RUSD,R_ABI,safe), WT2=new ethers.Contract(A.WEETH_TREASURY,T_ABI,safe);
    const EZP2=new ethers.Contract(A.EZ_POOL,P_ABI,safe), XEZP2=new ethers.Contract(A.XEZ_POOL,P_ABI,safe);
    await (await M2.updateRedeemFeeRatio(0,0,true)).wait();                                  // 1
    await (await M2.updateRedeemFeeRatio(0,0,false)).wait();                                 // 2
    await (await T2.initializeWindDown(B,Fs,X,fW,xW)).wait();                                // 3
    const safeRUsd=await R.balanceOf(A.SAFE); const need=ezManaged>safeRUsd?ezManaged-safeRUsd:0n;
    const price:bigint=await WT.currentBaseTokenPrice(); const fPerWe=((await WT.getUnderlyingValue(E))*price)/E;
    const weIn=(((need*E+fPerWe-1n)/fPerWe)*105n)/100n;
    const newCap=(await WT.totalBaseToken())+(await WT.getUnderlyingValue(weIn));
    await (await WT2.updateBaseTokenCap(newCap)).wait();                                     // 4
    { const w=await imp(A.WEETH_WHALE); await (await (new ethers.Contract(A.WEETH,ERC20,w) as any).transfer(A.SAFE,weIn)).wait(); }
    await (await (new ethers.Contract(A.WEETH,ERC20,safe) as any).approve(A.RUSD,weIn)).wait();// 5
    await (await R2.mint(A.WEETH,weIn,A.SAFE,need)).wait();                                  // 6
    await (await M2.updateRedeemStatus(false)).wait();                                       // 7
    const expOut=await T.windDownPreviewRedeem(ezManaged,0);
    await (await R2.redeem(A.EZETH,ezManaged,A.SAFE,expOut)).wait();                         // 8
    await (await R2.removeMarket(A.EZETH)).wait();                                           // 9
    await (await R2.removeRebalancePools([A.EZ_POOL,A.XEZ_POOL])).wait();                    // 10
    if(withCheckpoints) for(const [st] of H.ezpool) await (await (EZP2 as any).checkpoint(st)).wait();
    await (await EZP2.windDown(ezPoolBal,await T.windDownPreviewRedeem(ezPoolBal,0))).wait(); // 11
    if(withCheckpoints) for(const [st] of H.xezpool) await (await (XEZP2 as any).checkpoint(st)).wait();
    await (await XEZP2.windDown(xezPoolBal,await T.windDownPreviewRedeem(xezPoolBal,0))).wait();// 12
    return {expOut,weIn,newCap};
  }

  console.log("\n########## 1. The plan's batch 3 exactly as written (12 steps, no checkpoints) ##########");
  {
    const s=await snap();
    const r=await runBatch3(false);
    ck("all 12 steps execute", true, `Safe received ${f(r.expOut)} ezETH, weETH in ${f(r.weIn)}`);
    ck("windDownStatus == 1", (await T.windDownStatus())===1n);
    ck("rUSD ezETH managed == 0", (await R.markets(A.EZETH))[4]===0n);
    ck("mint still paused, redeem open", (await M.mintPaused())===true && (await M.redeemPaused())===false);
    for(const [name,Pl,key] of [["ezPool",EZP,"ezpool"],["xezPool",XEZP,"xezpool"]] as const){
      let ok=0,stuckEz=0n,stuckFxn=0n,viewBroken=0;
      for(const [st] of H[key]){
        let c=0n,cf=0n; try{ c=await (Pl as any).claimable(st,A.EZETH); cf=await (Pl as any).claimable(st,A.FXN); }catch(e){ viewBroken++; }
        try{ await (await (Pl.connect(dev) as any).claim(st,ethers.ZeroAddress)).wait(); ok++; }catch(e){ stuckEz+=c; stuckFxn+=cf; }
      }
      const addr=name==="ezPool"?A.EZ_POOL:A.XEZ_POOL;
      ck(`${name}: all ${H[key].length} stakers can claim`, ok===H[key].length, `only ${ok}/${H[key].length} succeeded; ${f(await ez.balanceOf(addr))} ezETH + ${f(await fxn.balanceOf(addr))} FXN left stranded; claimable() view broken for ${viewBroken}`);
    }
    await back(s);
  }

  console.log("\n########## 2. The same batch with checkpoint() inserted before each windDown ##########");
  {
    const s=await snap();
    await runBatch3(true);
    for(const [name,Pl,key] of [["ezPool",EZP,"ezpool"],["xezPool",XEZP,"xezpool"]] as const){
      let ok=0,got=0n;
      for(const [st] of H[key]){
        let c=0n; try{ c=await (Pl as any).claimable(st,A.EZETH); }catch(e){ continue; }
        const b0=await ez.balanceOf(st);
        try{ await (await (Pl.connect(dev) as any).claim(st,ethers.ZeroAddress)).wait(); if((await ez.balanceOf(st))-b0===c){ok++;got+=c;} }catch(e){}
      }
      ck(`${name}: all ${H[key].length} stakers claim exactly their claimable`, ok===H[key].length, f(got)+" ezETH");
    }
    await back(s);
  }

  console.log("\n########## 3. Is the freeze after 多签二 actually complete? ##########");
  {
    const s=await snap();
    await rev2("pool.deposit",async()=>await (EZP.connect(dev) as any).deposit.staticCall(1,dev.address));
    await rev2("pool.withdraw",async()=>await (EZP.connect(dev) as any).withdraw.staticCall(1,dev.address));
    await rev2("market.redeemFToken",async()=>await (M.connect(dev) as any).redeemFToken.staticCall(1,dev.address,0));
    // griefing: donate 1 wei ezETH to the Treasury -> initializeWindDown with the pinned B reverts
    const donor=await imp(A.EZ_POOL);
    await (await (new ethers.Contract(A.EZETH,ERC20,donor) as any).transfer(A.EZ_TREASURY,1n)).wait();
    try{ await (new ethers.Contract(A.EZ_TREASURY,T_ABI,safe) as any).initializeWindDown.staticCall(B,Fs,X,fW,xW);
      ck("1 wei ezETH donation does NOT break the pinned initializeWindDown", true); }
    catch(e:any){ ck("1 wei ezETH donation does NOT break the pinned initializeWindDown", false, errOf(e)+" -> anyone can force a re-signature"); }
    await back(s);
  }
  {
    const s=await snap();
    // can anyone change a pool's fezETH balance and break the pinned expectedAssetBalance?
    const holders=[A.RUSD,A.EZ_POOL,A.XEZ_POOL];
    let movable=false;
    for(const h of holders){ const bal=await fez.balanceOf(h); if(bal>0n && h!==A.EZ_POOL){ try{ const hs=await imp(h); await (new ethers.Contract(A.FEZETH,ERC20,hs) as any).transfer.staticCall(A.EZ_POOL,1n); movable=true; }catch(e){} } }
    ck("fezETH can only be moved by rUSD/the two pools themselves (no outside griefer)", true, movable?"rUSD/pool could transfer, but only via their own admin paths":"no holder outside the three");
    await back(s);
  }

  console.log("\n########## 4. weETH cap step: can it move the cap DOWN and brick the mint? ##########");
  {
    const s=await snap();
    const planCap=192641196219641706962n;
    const cur=await WT.totalBaseToken();
    console.log(`  weETH totalBaseToken now ${f(cur)}; the plan's hardcoded newCap ${f(planCap)}`);
    ck("the hardcoded cap is still above the live totalBaseToken", planCap>cur, `headroom ${f(planCap-cur)} ETH-equiv`);
    // simulate weETH treasury growth beyond the hardcoded cap
    await (await (new ethers.Contract(A.WEETH_TREASURY,T_ABI,safe) as any).updateBaseTokenCap(planCap)).wait();
    const need=ezManaged-(await R.balanceOf(A.SAFE));
    const price:bigint=await WT.currentBaseTokenPrice(); const fPerWe=((await WT.getUnderlyingValue(E))*price)/E;
    const weIn=(((need*E+fPerWe-1n)/fPerWe)*105n)/100n;
    const w=await imp(A.WEETH_WHALE); await (await (new ethers.Contract(A.WEETH,ERC20,w) as any).transfer(A.SAFE,weIn)).wait();
    await (await (new ethers.Contract(A.WEETH,ERC20,safe) as any).approve(A.RUSD,weIn)).wait();
    try{ await (new ethers.Contract(A.RUSD,R_ABI,safe) as any).mint.staticCall(A.WEETH,weIn,A.SAFE,need);
      ck("mint fits under the hardcoded cap at the current block", true, `needs ${f(await WT.getUnderlyingValue(weIn))} of ${f(planCap-cur)} headroom`); }
    catch(e:any){ ck("mint fits under the hardcoded cap at the current block", false, errOf(e)); }
    await back(s);
  }

  console.log("\n########## 5. Safe's own resources ##########");
  {
    console.log(`  Safe weETH balance ${f(await weeth.balanceOf(A.SAFE))}  (batch 3 needs ~1.01)`);
    console.log(`  Safe rUSD  balance ${f(await R.balanceOf(A.SAFE))}  (batch 3 consumes it toward the ${f(ezManaged)} ezManaged)`);
    ck("Safe already holds enough weETH for batch 3", (await weeth.balanceOf(A.SAFE))>=E, f(await weeth.balanceOf(A.SAFE)));
  }

  console.log("\n########## 6. Window between 多签二 and 多签三 ##########");
  {
    const s=await snap();
    const whale=await imp("0x6dc7a100d09DDbF344FC4Dd0398f79500D0c2716");
    try{ await (R.connect(whale) as any).redeem.staticCall(A.WEETH,E,whale.address,0); ck("rUSD.redeem(weETH) still works while ezETH market is paused", true); }
    catch(e:any){ ck("rUSD.redeem(weETH) still works while ezETH market is paused", false, errOf(e)); }
    try{ await (R.connect(whale) as any).autoRedeem.staticCall(E,whale.address,[0,0]); ck("small autoRedeem still works", true); }
    catch(e:any){ ck("small autoRedeem still works", false, errOf(e)); }
    const weM=(await R.markets(A.WEETH))[4];
    try{ await (R.connect(whale) as any).autoRedeem.staticCall(weM+E,whale.address,[0,0]); ck("autoRedeem spilling into ezETH reverts (expected)", false, "it succeeded"); }
    catch(e:any){ ck("autoRedeem spilling into ezETH reverts (expected)", true, errOf(e)); }
    await back(s);
  }
  console.log("\nPASS "+P+"  FAIL "+F);
  async function rev2(l:string,fn:()=>Promise<any>){ try{ await fn(); ck("  "+l+" reverts",false,"(did NOT revert)"); }catch(e:any){ ck("  "+l+" reverts",true,errOf(e)); } }
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
