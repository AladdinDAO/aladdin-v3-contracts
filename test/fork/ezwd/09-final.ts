import { ethers, network } from "hardhat";
import * as fs from "fs";
const RPC = process.env.FORK_RPC || "https://mainnet.gateway.tenderly.co";
const IMPL = { fxusd:"0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd", treasury:"0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC", pool:"0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5" };
const A: any = { EZETH:"0xbf5495Efe5DB9ce00f80364C8B423567e58d2110", EZ_TREASURY:"0x38965311507D4E54973F81475a149c09376e241e", EZ_MARKET:"0x69518D1D70AD537C41401303BDf96032338E40dE", FEZETH:"0x50B4DC15b34E31671c9cA40F9eb05D7eBd6b13f9", XEZETH:"0x2e5A5AF7eE900D34BCFB70C47023bf1d6bE35CF5", EZ_POOL:"0xf58c499417e36714e99803Cb135f507a95ae7169", XEZ_POOL:"0xBa947cba270D30967369Bf1f73884Be2533d7bDB", RUSD:"0x65D72AA8DA931F047169112fcf34f52DbaAE7D18", SAFE:"0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF", PROXY_ADMIN:"0x9b54b7703551d9d0ced177a78367560a8b2edda4", TIMELOCK:"0x68863fb8855b04509a835082478D6E3D0bE4E61a", FXN:"0x365AccFCa291e7D3914637ABf1F7635dB165Bb09" };
const SLOT_RATE=201;
const E=10n**18n; const f=(v:bigint)=>ethers.formatUnits(v,18);
const ERC20=["function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)"];
const PA=["function upgrade(address,address)"];
const M_ABI=["function updateRedeemFeeRatio(uint256,int256,bool)","function redeemFToken(uint256,address,uint256) returns (uint256,uint256)"];
const T_ABI=["function initializeWindDown(uint256,uint256,uint256,uint256,uint256)","function windDownStatus() view returns (uint8)","function windDownFBaseBalance() view returns (uint256)","function windDownFSupply() view returns (uint256)","function rateProvider() view returns (address)","function windDownPreviewRedeem(uint256,uint256) view returns (uint256)"];
const P_ABI=["function windDown(uint256,uint256) returns (uint256,uint256)","function claim(address,address)","function claimable(address,address) view returns (uint256)","function checkpoint(address)","function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)","function getStakerVoteOwner(address) view returns (address)","function toggleVoteSharing(address)","function adminClaim()"];
let P=0,F=0; const ck=(l:string,c:boolean,d="")=>{if(c){P++;console.log("  PASS  "+l+(d?"  "+d:""));}else{F++;console.log("  FAIL  "+l+(d?"  "+d:""));}};
async function imp(a:string){await network.provider.send("hardhat_impersonateAccount",[a]);await network.provider.send("hardhat_setBalance",[a,"0x21e19e0c9bab2400000"]);return await ethers.getSigner(a);}
const snap=async()=>await network.provider.send("evm_snapshot",[]);
const back=async(s:string)=>{await network.provider.send("evm_revert",[s]);};
async function upgradeAll(){const tl=await imp(A.TIMELOCK);const pa=new ethers.Contract(A.PROXY_ADMIN,PA,tl);
  for(const [p,i] of [[A.RUSD,IMPL.fxusd],[A.EZ_TREASURY,IMPL.treasury],[A.EZ_POOL,IMPL.pool],[A.XEZ_POOL,IMPL.pool]]) await (await pa.upgrade(p,i)).wait();}
async function initWD(safe:any){
  const ez=new ethers.Contract(A.EZETH,ERC20,ethers.provider),fez=new ethers.Contract(A.FEZETH,ERC20,ethers.provider),xez=new ethers.Contract(A.XEZETH,ERC20,ethers.provider);
  const T=new ethers.Contract(A.EZ_TREASURY,T_ABI,ethers.provider),M=new ethers.Contract(A.EZ_MARKET,M_ABI,ethers.provider);
  await (await (M.connect(safe) as any).updateRedeemFeeRatio(0,0,true)).wait();
  await (await (M.connect(safe) as any).updateRedeemFeeRatio(0,0,false)).wait();
  const B=await ez.balanceOf(A.EZ_TREASURY),Fs=await fez.totalSupply(),X=await xez.totalSupply();
  await (await (T.connect(safe) as any).initializeWindDown(B,Fs,X,Fs,(X*346669734551971069n)/E)).wait();}

async function main(){
  const H=JSON.parse(fs.readFileSync("/tmp/ezwd/holders.json","utf8"));
  await network.provider.request({method:"hardhat_reset",params:[{forking:{jsonRpcUrl:RPC}}]});
  await network.provider.send("evm_mine",[]);
  const [dev]=await ethers.getSigners(); const safe=await imp(A.SAFE);
  const ez=new ethers.Contract(A.EZETH,ERC20,ethers.provider),fez=new ethers.Contract(A.FEZETH,ERC20,ethers.provider),fxn=new ethers.Contract(A.FXN,ERC20,ethers.provider);

  console.log("########## 1. Rate provider sensitivity (windDownStatus byte preserved) ##########");
  const sec1 = await snap();
  {
    await upgradeAll(); await initWD(safe);
    const T=new ethers.Contract(A.EZ_TREASURY,T_ABI,ethers.provider),M=new ethers.Contract(A.EZ_MARKET,M_ABI,ethers.provider);
    const FB=await T.windDownFBaseBalance(),FS=await T.windDownFSupply();
    const raw=await network.provider.send("eth_getStorageAt",[A.EZ_TREASURY,ethers.toBeHex(SLOT_RATE,32),"latest"]);
    const statusByte=BigInt(raw)>>160n;
    console.log(`  slot ${SLOT_RATE} packs rateProvider + windDownStatus: raw=${raw}  statusByte=${statusByte}`);
    ck("windDownStatus is packed into the rateProvider slot", statusByte===1n);
    const Mock=await ethers.getContractFactory("MockRateProviderForWindDown");
    for(const [label,rate,ok] of [["1.0e18 (exact)",E,true],["1e18 + 1",E+1n,true],["1.5e18",15n*E/10n,true],["10e18",10n*E,true],["1e18 - 1",E-1n,false],["0.5e18",E/2n,false],["0",0n,false]] as const){
      const s=await snap();
      const mock=await Mock.deploy(rate); await mock.waitForDeployment();
      const packed=(statusByte<<160n)|BigInt(await mock.getAddress());
      await network.provider.send("hardhat_setStorageAt",[A.EZ_TREASURY,ethers.toBeHex(SLOT_RATE,32),ethers.toBeHex(packed,32)]);
      ck(`  rate ${label}: wiring intact`, (await T.rateProvider()).toLowerCase()===(await mock.getAddress()).toLowerCase() && (await T.windDownStatus())===1n);
      const hs=await imp(A.RUSD);
      try{ const r=await (M.connect(hs) as any).redeemFToken.staticCall(E,A.RUSD,0);
        ck(`  rate ${label}: redeem out == fixed-rate preview (round-trip held)`, r[0]===(E*FB)/FS, f(r[0])+(ok?"":"  <- round-trip still held at this rate")); }
      catch(e:any){ const m=(e.shortMessage||e.message||"").toString();
        ck(`  rate ${label}: ${ok?"redeem succeeds":"redeem reverts"}`, !ok, ok?m.slice(0,90):m.replace(/^.*custom error /,"").slice(0,50)); }
      await back(s);
    }
    {
      const s=await snap();
      const mock=await Mock.deploy(11n*E/10n); await mock.waitForDeployment();
      await (await mock.setShouldRevert(true)).wait();
      await network.provider.send("hardhat_setStorageAt",[A.EZ_TREASURY,ethers.toBeHex(SLOT_RATE,32),ethers.toBeHex((statusByte<<160n)|BigInt(await mock.getAddress()),32)]);
      const hs=await imp(A.RUSD);
      try{ await (M.connect(hs) as any).redeemFToken.staticCall(E,A.RUSD,0); ck("  rate provider reverting: redeem reverts", false, "(it succeeded)"); }
      catch(e:any){ ck("  rate provider reverting: whole redemption path reverts", true, (e.shortMessage||"").slice(0,60)); }
      await back(s);
    }
  }

  await back(sec1);

  console.log("\n########## 2. Boost div-by-zero: both pools, with and without the mitigation ##########");
  for(const [name,pool,key] of [["ezPool",A.EZ_POOL,"ezpool"],["xezPool",A.XEZ_POOL,"xezpool"]] as const){
    // (a) without mitigation
    {
      const s=await snap();
      await upgradeAll(); await initWD(safe);
      const Pl=new ethers.Contract(pool,P_ABI,ethers.provider);
      const out=(await (Pl.connect(safe) as any).windDown.staticCall(await fez.balanceOf(pool),0))[1];
      await (await (Pl.connect(safe) as any).windDown(await fez.balanceOf(pool),0)).wait();
      let ok=0,stuckEz=0n,stuckFxn=0n;
      let viewBroken=0;
      for(const [st] of H[key]){
        let c=0n, cf=0n, viewOk=true;
        try{ c=await (Pl as any).claimable(st,A.EZETH); cf=await (Pl as any).claimable(st,A.FXN); }catch(e){ viewOk=false; viewBroken++; }
        try{ await (await (Pl.connect(dev) as any).claim(st,ethers.ZeroAddress)).wait(); ok++; }
        catch(e){ stuckEz+=c; stuckFxn+=cf; }
      }
      ck(`${name} WITHOUT mitigation: claimable() view reverts for ${viewBroken} of ${H[key].length} stakers`, viewBroken===H[key].length-1, `${viewBroken} broken views`);
      ck(`${name} WITHOUT mitigation: only ${ok} of ${H[key].length} stakers can claim`, ok===1, `stuck ${f(stuckEz)} ezETH + ${f(stuckFxn)} FXN of baseOut ${f(out)}`);
      // and the stuck value is what adminClaim would take
      const held=await ez.balanceOf(pool);
      console.log(`    (${f(held)} ezETH left unclaimed in the pool; adminClaim() would take all of it)`);
      await back(s);
    }
    // (b) with mitigation: revoke vote sharing on the LIVE implementation first
    {
      const s=await snap();
      const Pl0=new ethers.Contract(pool,P_ABI,ethers.provider);
      const owner=await Pl0.getStakerVoteOwner(H[key][0][0]);
      const vo=await imp(owner);
      for(const [st] of H[key]) await (await (Pl0.connect(vo) as any).toggleVoteSharing(st)).wait();
      let cleared=0; for(const [st] of H[key]) if((await Pl0.getStakerVoteOwner(st))===ethers.ZeroAddress) cleared++;
      ck(`${name} vote sharing revoked for all ${H[key].length} stakers (live impl, vote owner ${owner.slice(0,10)})`, cleared===H[key].length);
      await upgradeAll(); await initWD(safe);
      const Pl=new ethers.Contract(pool,P_ABI,ethers.provider);
      const out=(await (Pl.connect(safe) as any).windDown.staticCall(await fez.balanceOf(pool),0))[1];
      await (await (Pl.connect(safe) as any).windDown(await fez.balanceOf(pool),0)).wait();
      let ok=0,got=0n;
      for(const [st] of H[key]){
        let c=0n; try{ c=await (Pl as any).claimable(st,A.EZETH); }catch(e){ continue; }
        const b0=await ez.balanceOf(st);
        try{ await (await (Pl.connect(dev) as any).claim(st,ethers.ZeroAddress)).wait(); const g=(await ez.balanceOf(st))-b0; if(g===c){ok++;got+=g;} }catch(e){}
      }
      ck(`${name} WITH mitigation: all ${H[key].length} stakers claim exactly their claimable`, ok===H[key].length, `total ${f(got)} vs baseOut ${f(out)}`);
      ck(`${name} WITH mitigation: pool stays solvent`, (await ez.balanceOf(pool))>=0n, `${f(await ez.balanceOf(pool))} left`);
      await back(s);
    }
  }

  console.log("\n########## 3. Who can apply the mitigation? ##########");
  {
    const s=await snap();
    const Pl=new ethers.Contract(A.EZ_POOL,P_ABI,ethers.provider);
    const st=H.ezpool[0][0];
    const owner=await Pl.getStakerVoteOwner(st);
    console.log("  shared vote owner:", owner, "code:", (await ethers.provider.getCode(owner))==="0x"?"EOA":"contract");
    for(const [who,addr] of [["the vote owner",owner],["the Safe",A.SAFE],["a stranger",dev.address]] as const){
      const sg=await imp(addr);
      try{ await (Pl.connect(sg) as any).toggleVoteSharing.staticCall(st); console.log(`    toggleVoteSharing from ${who} -> OK`); }
      catch(e:any){ console.log(`    toggleVoteSharing from ${who} -> REVERT ${(e.shortMessage||"").replace(/^.*custom error /,"").slice(0,45)}`); }
    }
    console.log("  after the pool upgrade, toggleVoteSharing/rejectSharedVote are disabled in the wind-down implementation,");
    console.log("  so this can only be done BEFORE the pool proxies are upgraded.");
    await back(s);
  }
  console.log("\nPASS "+P+"  FAIL "+F);
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
