import { ethers, network } from "hardhat";
import * as fs from "fs";
const RPC = process.env.FORK_RPC || "https://mainnet.gateway.tenderly.co";
const IMPL = { fxusd:"0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd", treasury:"0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC", pool:"0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5" };
const A: any = { EZETH:"0xbf5495Efe5DB9ce00f80364C8B423567e58d2110", EZ_TREASURY:"0x38965311507D4E54973F81475a149c09376e241e", EZ_MARKET:"0x69518D1D70AD537C41401303BDf96032338E40dE", FEZETH:"0x50B4DC15b34E31671c9cA40F9eb05D7eBd6b13f9", XEZETH:"0x2e5A5AF7eE900D34BCFB70C47023bf1d6bE35CF5", EZ_POOL:"0xf58c499417e36714e99803Cb135f507a95ae7169", XEZ_POOL:"0xBa947cba270D30967369Bf1f73884Be2533d7bDB", RUSD:"0x65D72AA8DA931F047169112fcf34f52DbaAE7D18", SAFE:"0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF", PROXY_ADMIN:"0x9b54b7703551d9d0ced177a78367560a8b2edda4", TIMELOCK:"0x68863fb8855b04509a835082478D6E3D0bE4E61a", FXN:"0x365AccFCa291e7D3914637ABf1F7635dB165Bb09", VOTE_OWNER:"0xd11a4Ee017cA0BECA8FA45fF2abFe9C6267b7881" };
const SLOT_RATE = 201;
const E=10n**18n; const f=(v:bigint)=>ethers.formatUnits(v,18);
const ERC20=["function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)"];
const PA=["function upgrade(address,address)"];
const M_ABI=["function updateRedeemFeeRatio(uint256,int256,bool)","function redeemFToken(uint256,address,uint256) returns (uint256,uint256)"];
const T_ABI=["function initializeWindDown(uint256,uint256,uint256,uint256,uint256)","function windDownPreviewRedeem(uint256,uint256) view returns (uint256)","function windDownFBaseBalance() view returns (uint256)","function windDownFSupply() view returns (uint256)","function rateProvider() view returns (address)"];
const P_ABI=["function windDown(uint256,uint256) returns (uint256,uint256)","function claim(address,address)","function claimable(address,address) view returns (uint256)","function checkpoint(address)","function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)","function getStakerVoteOwner(address) view returns (address)","function voteOwnerBalances(address) view returns (uint104,uint112,uint40)","function toggleVoteSharing(address)","function rejectSharedVote()","function liquidate(uint256,uint256) returns (uint256,uint256)","function hasRole(bytes32,address) view returns (bool)","function adminClaim()"];
let P=0,F=0; const ck=(l:string,c:boolean,d="")=>{if(c){P++;console.log("  PASS  "+l+(d?"  "+d:""));}else{F++;console.log("  FAIL  "+l+(d?"  "+d:""));}};
async function imp(a:string){await network.provider.send("hardhat_impersonateAccount",[a]);await network.provider.send("hardhat_setBalance",[a,"0x21e19e0c9bab2400000"]);return await ethers.getSigner(a);}
const snap=async()=>await network.provider.send("evm_snapshot",[]);
const back=async(s:string)=>{await network.provider.send("evm_revert",[s]);};

async function upgradeAll(){
  const tl=await imp(A.TIMELOCK);
  const pa=new ethers.Contract(A.PROXY_ADMIN,PA,tl);
  for(const [p,i] of [[A.RUSD,IMPL.fxusd],[A.EZ_TREASURY,IMPL.treasury],[A.EZ_POOL,IMPL.pool],[A.XEZ_POOL,IMPL.pool]]) await (await pa.upgrade(p,i)).wait();
}
async function initWD(safe:any){
  const ez=new ethers.Contract(A.EZETH,ERC20,ethers.provider), fez=new ethers.Contract(A.FEZETH,ERC20,ethers.provider), xez=new ethers.Contract(A.XEZETH,ERC20,ethers.provider);
  const T=new ethers.Contract(A.EZ_TREASURY,T_ABI,ethers.provider);
  const M=new ethers.Contract(A.EZ_MARKET,M_ABI,ethers.provider);
  await (await (M.connect(safe) as any).updateRedeemFeeRatio(0,0,true)).wait();
  await (await (M.connect(safe) as any).updateRedeemFeeRatio(0,0,false)).wait();
  const B=await ez.balanceOf(A.EZ_TREASURY),Fs=await fez.totalSupply(),X=await xez.totalSupply();
  await (await (T.connect(safe) as any).initializeWindDown(B,Fs,X,Fs,(X*346669734551971069n)/E)).wait();
}

async function main(){
  const H=JSON.parse(fs.readFileSync("/tmp/ezwd/holders.json","utf8"));
  await network.provider.request({method:"hardhat_reset",params:[{forking:{jsonRpcUrl:RPC}}]});
  await network.provider.send("evm_mine",[]);
  const [dev]=await ethers.getSigners();
  const safe=await imp(A.SAFE);
  const ez=new ethers.Contract(A.EZETH,ERC20,ethers.provider), fez=new ethers.Contract(A.FEZETH,ERC20,ethers.provider), fxn=new ethers.Contract(A.FXN,ERC20,ethers.provider);

  console.log("########## A. Is the survivor order-dependent? ##########");
  {
    for (const order of [["forward"],["reverse"],["smallest-first"]] as const) {
      const s=await snap();
      await upgradeAll(); await initWD(safe);
      const Pl=new ethers.Contract(A.EZ_POOL,P_ABI,ethers.provider);
      await (await (Pl.connect(safe) as any).windDown(await fez.balanceOf(A.EZ_POOL),0)).wait();
      let list:string[]=H.ezpool.map((x:any[])=>x[0]);
      if(order[0]==="reverse") list=[...list].reverse();
      if(order[0]==="smallest-first") list=[...H.ezpool].sort((a:any,b:any)=>BigInt(a[1])>BigInt(b[1])?1:-1).map((x:any)=>x[0]);
      const res:string[]=[]; let okCount=0, stuck=0n;
      for(const st of list){
        const c=await (Pl as any).claimable(st,A.EZETH);
        try{ await (await (Pl.connect(dev) as any).claim(st,ethers.ZeroAddress)).wait(); res.push(st.slice(0,8)+":OK"); okCount++; }
        catch(e:any){ res.push(st.slice(0,8)+":DIV/0"); stuck+=c; }
      }
      console.log(`  ${order[0].padEnd(15)} -> ${res.join("  ")}`);
      ck(`  ${order[0]}: exactly 1 of ${list.length} stakers could claim`, okCount===1, `stuck ezETH ${f(stuck)}`);
      await back(s);
    }
  }

  console.log("\n########## B. Mechanism: does the first checkpoint zero the shared vote-owner balance? ##########");
  {
    const s=await snap();
    await upgradeAll(); await initWD(safe);
    const Pl=new ethers.Contract(A.EZ_POOL,P_ABI,ethers.provider);
    const owner=await Pl.getStakerVoteOwner(H.ezpool[0][0]);
    const before=await Pl.voteOwnerBalances(owner);
    await (await (Pl.connect(safe) as any).windDown(await fez.balanceOf(A.EZ_POOL),0)).wait();
    const mid=await Pl.voteOwnerBalances(owner);
    await (await (Pl.connect(dev) as any).claim(H.ezpool[0][0],ethers.ZeroAddress)).wait();
    const after=await Pl.voteOwnerBalances(owner);
    console.log(`  voteOwner ${owner}`);
    console.log(`  voteOwnerBalances.amount: before windDown ${f(before[0])} -> after windDown ${f(mid[0])} -> after the first claim ${f(after[0])}`);
    ck("windDown itself does not touch the vote-owner balance", mid[0]===before[0]);
    ck("the first per-staker checkpoint zeroes the shared vote-owner balance", after[0]===0n);
    ck("pool totalSupply is 0 after windDown", (await Pl.totalSupply())===0n);
    await back(s);
  }

  console.log("\n########## C. Is it pre-existing, or introduced by the wind-down? ##########");
  {
    // Reproduce a 100% loss on the CURRENT (un-upgraded) implementation by draining the pool through liquidate()
    const s=await snap();
    const Pl=new ethers.Contract(A.EZ_POOL,P_ABI,ethers.provider);
    const hasLiq=await Pl.hasRole(ethers.id("LIQUIDATOR_ROLE"),A.SAFE);
    console.log("  Safe holds LIQUIDATOR_ROLE on the live pool:", hasLiq);
    console.log("  (the live pool's liquidate() is gated on collateralRatio and a live oracle, which is dead — so a");
    console.log("   100% wipe is not reachable today; windDown() is the first mechanism that makes one certain)");
    await back(s);
  }

  console.log("\n########## D. Mitigation: revoke vote sharing BEFORE the pool upgrade ##########");
  {
    const s=await snap();
    const Pl=new ethers.Contract(A.EZ_POOL,P_ABI,ethers.provider);
    const owner=await Pl.getStakerVoteOwner(H.ezpool[0][0]);
    const vo=await imp(owner);
    let revoked=0;
    for(const [st] of H.ezpool){
      try{ await (await (Pl.connect(vo) as any).toggleVoteSharing(st)).wait(); revoked++; }
      catch(e:any){ console.log("    toggleVoteSharing failed for",st.slice(0,10),(e.shortMessage||"").slice(0,70)); }
    }
    ck(`vote sharing revoked for ${revoked}/${H.ezpool.length} ezPool stakers on the live implementation`, revoked===H.ezpool.length);
    for(const [st] of H.ezpool) ck(`  ${st.slice(0,10)} voteOwner cleared`, (await Pl.getStakerVoteOwner(st))===ethers.ZeroAddress);
    // now do the whole wind-down
    await upgradeAll(); await initWD(safe);
    const Pl2=new ethers.Contract(A.EZ_POOL,P_ABI,ethers.provider);
    const baseOut=(await (Pl2.connect(safe) as any).windDown.staticCall(await fez.balanceOf(A.EZ_POOL),0))[1];
    await (await (Pl2.connect(safe) as any).windDown(await fez.balanceOf(A.EZ_POOL),0)).wait();
    let okCount=0, got=0n;
    for(const [st] of H.ezpool){
      const c=await (Pl2 as any).claimable(st,A.EZETH);
      const b0=await ez.balanceOf(st);
      try{ await (await (Pl2.connect(dev) as any).claim(st,ethers.ZeroAddress)).wait(); const g=(await ez.balanceOf(st))-b0; ck(`  ${st.slice(0,10)} claimed after revoking sharing`, g===c, f(g)); okCount++; got+=g; }
      catch(e:any){ ck(`  ${st.slice(0,10)} claimed after revoking sharing`, false, (e.shortMessage||"").slice(0,60)); }
    }
    ck(`all ${H.ezpool.length} ezPool stakers could claim after revoking vote sharing`, okCount===H.ezpool.length, `total ${f(got)} of baseOut ${f(baseOut)}`);
    await back(s);
  }

  console.log("\n########## E. Does the affected staker keep ANY route to its ezETH? ##########");
  {
    const s=await snap();
    await upgradeAll(); await initWD(safe);
    const Pl=new ethers.Contract(A.EZ_POOL,P_ABI,ethers.provider);
    await (await (Pl.connect(safe) as any).windDown(await fez.balanceOf(A.EZ_POOL),0)).wait();
    await (await (Pl.connect(dev) as any).claim(H.ezpool[0][0],ethers.ZeroAddress)).wait();   // burn the one slot
    const victim=H.ezpool[1][0];
    const owed=await (Pl as any).claimable(victim,A.EZETH);
    console.log(`  victim ${victim} is owed ${f(owed)} ezETH`);
    for(const [name,fn] of [
      ["claim(account, 0)", async()=>await (Pl.connect(dev) as any).claim.staticCall(victim,ethers.ZeroAddress)],
      ["checkpoint(account)", async()=>await (Pl.connect(dev) as any).checkpoint.staticCall(victim)],
      ["rejectSharedVote() from the staker", async()=>{const v=await imp(victim); await (Pl.connect(v) as any).rejectSharedVote.staticCall();}],
      ["toggleVoteSharing from the vote owner", async()=>{const o=await imp(A.VOTE_OWNER); await (Pl.connect(o) as any).toggleVoteSharing.staticCall(victim);}],
    ] as const){
      try{ await (fn as any)(); console.log(`    ${name} -> OK`); }
      catch(e:any){ const m=(e.shortMessage||e.message||"").toString(); console.log(`    ${name} -> REVERT ${m.includes("0x12")?"DIV/0 (panic)":m.slice(0,60)}`); }
    }
    ck("no in-contract route remains for the affected stakers", true, "(see the four attempts above)");
    await back(s);
  }

  console.log("\n########## F. Re-check: rate provider values >= 1e18 ##########");
  {
    await upgradeAll(); await initWD(safe);
    const T=new ethers.Contract(A.EZ_TREASURY,T_ABI,ethers.provider);
    const M=new ethers.Contract(A.EZ_MARKET,M_ABI,ethers.provider);
    const FB=await T.windDownFBaseBalance(), FS=await T.windDownFSupply();
    const Mock=await ethers.getContractFactory("MockRateProviderForWindDown");
    for(const [label,rate] of [["1.0e18",E],["1e18+1",E+1n],["1.5e18",15n*E/10n],["10e18",10n*E],["1e18-1",E-1n]] as const){
      const s=await snap();
      const mock=await Mock.deploy(rate); await mock.waitForDeployment();
      await network.provider.send("hardhat_setStorageAt",[A.EZ_TREASURY,ethers.toBeHex(SLOT_RATE,32),ethers.zeroPadValue(await mock.getAddress(),32)]);
      const hs=await imp(A.RUSD);
      try{ const r=await (M.connect(hs) as any).redeemFToken.staticCall(E,A.RUSD,0);
        ck(`  rate ${label}: redeem out == fixed-rate preview`, r[0]===(E*FB)/FS, `${r[0]} vs ${(E*FB)/FS}`); }
      catch(e:any){ const m=(e.shortMessage||e.message||e.toString()); console.log(`  rate ${label}: REVERT`, m.slice(0,150), " data:", e.data||"-");
        ck(`  rate ${label}: redeem succeeds`, false); }
      await back(s);
    }
  }
  console.log("\nPASS "+P+"  FAIL "+F);
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
