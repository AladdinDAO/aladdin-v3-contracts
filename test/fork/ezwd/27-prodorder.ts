// 生产顺序全流程：EOA checkpoint 在【整个多签三之前】（即 initializeWindDown 之前），
// 再由 Safe 以真实 6/9 执行完整 13 步 MultiSend。此顺序此前未被任何一方验证过。
import { ethers, network } from "hardhat";
const RPC = process.env.FORK_RPC || "https://mainnet.gateway.tenderly.co";
const A: any = {
  EZETH:"0xbf5495Efe5DB9ce00f80364C8B423567e58d2110", EZ_TREASURY:"0x38965311507D4E54973F81475a149c09376e241e",
  EZ_MARKET:"0x69518D1D70AD537C41401303BDf96032338E40dE", FEZETH:"0x50B4DC15b34E31671c9cA40F9eb05D7eBd6b13f9",
  XEZETH:"0x2e5A5AF7eE900D34BCFB70C47023bf1d6bE35CF5", EZ_POOL:"0xf58c499417e36714e99803Cb135f507a95ae7169",
  XEZ_POOL:"0xBa947cba270D30967369Bf1f73884Be2533d7bDB", RUSD:"0x65D72AA8DA931F047169112fcf34f52DbaAE7D18",
  SAFE:"0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF", PROXY_ADMIN:"0x9B54B7703551D9d0ced177A78367560a8B2eDDA4",
  TIMELOCK:"0x68863fb8855b04509a835082478D6E3D0bE4E61a", MULTISEND:"0x40A2aCCbd92BCA938b02010E17A5b8929b49130D",
  WEETH:"0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee", WEETH_TREASURY:"0x781BA968d5cc0b40EB592D5c8a9a3A4000063885",
  WEETH_WHALE:"0xBdfa7b7893081B35Fb54027489e2Bc7A38275129", FXN:"0x365AccFCa291e7D3914637ABf1F7635dB165Bb09",
};
const IMPL={fxusd:"0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd",treasury:"0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC",pool:"0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5"};
const EZ_V=["0x4A036ab673722468a8e1fCC0F74A2dD5914FD1c1","0x4c75A7349B20745DAf37E6C348b85E8a03F72F9A","0x0Fa286332b2d1bBB0c7637CD63BA742a050b5AAd","0x7DCe6D8752A0e2fCF3cE92e9CeAdf9857F920ACc","0xCbE9e9E80b5301956c12FbB40742b144f98d4e63","0x492550DDcc5349940A879cAf4d3CFFfaa1Ab0F64"];
const XEZ_V=["0xC68A2AE2b932C472Fd4Ad4367FF6e093E4E3Da8f","0x3b0c2E02b0F3a4f507bA8F39aB3Ea93BF4863a90","0x9af69159D25e213a35A2b6E7274023Da2D2bdaC6","0x1090988Cf5569cc811756220AC3160aA028988AA"];
const E=10n**18n, WEEK=604800; const f=(v:bigint)=>ethers.formatUnits(v,18);
let P=0,F=0; const ck=(l:string,c:boolean,d="")=>{if(c){P++;console.log("  PASS  "+l+(d?"  "+d:""));}else{F++;console.log("  FAIL  "+l+(d?"  "+d:""));}};
const note=(s:string)=>console.log("  NOTE  "+s);
async function imp(a:string){await network.provider.send("hardhat_impersonateAccount",[a]);await network.provider.send("hardhat_setBalance",[a,"0x21e19e0c9bab2400000"]);return await ethers.getSigner(a);}
const snap=async()=>await network.provider.send("evm_snapshot",[]);
const back=async(s:string)=>{await network.provider.send("evm_revert",[s]);};
const ERC20=["function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)","function transfer(address,uint256) returns (bool)"];
const SAFE_ABI=["function nonce() view returns (uint256)","function getOwners() view returns (address[])","function getThreshold() view returns (uint256)","function getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256) view returns (bytes32)","function approveHash(bytes32)","function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) payable returns (bool)"];
const RUSD_ABI=["function totalSupply() view returns (uint256)","function balanceOf(address) view returns (uint256)","function markets(address) view returns (address,address,address,uint256,uint256)","function getMarkets() view returns (address[])","function getRebalancePools() view returns (address[])"];
const T_ABI=["function windDownStatus() view returns (uint8)","function windDownPreviewRedeem(uint256,uint256) view returns (uint256)","function totalBaseToken() view returns (uint256)","function baseTokenCap() view returns (uint256)","function currentBaseTokenPrice() view returns (uint256)","function rateProvider() view returns (address)"];
const P_ABI=["function checkpoint(address)","function claimable(address,address) view returns (uint256)","function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)"];
const VAULT=["function owner() view returns (address)","function getReward(bool,address[])"];
const PA=["function upgrade(address,address)"];

function encodeTx(t:any){const m=t.contractMethod;const types=m.inputs.map((i:any)=>i.type);
  const args=m.inputs.map((i:any)=>{const v=t.contractInputsValues[i.name];if(i.type.endsWith("[]"))return JSON.parse(v);if(i.type==="bool")return v==="true";return v;});
  return ethers.id(`${m.name}(${types.join(",")})`).slice(0,10)+ethers.AbiCoder.defaultAbiCoder().encode(types,args).slice(2);}
function multiSend(txs:any[]){let packed="0x";
  for(const t of txs){const d=encodeTx(t);packed+="00"+t.to.slice(2).toLowerCase()+ethers.toBeHex(BigInt(t.value||"0"),32).slice(2)+ethers.toBeHex((d.length-2)/2,32).slice(2)+d.slice(2);}
  return new ethers.Interface(["function multiSend(bytes)"]).encodeFunctionData("multiSend",[packed]);}
async function execViaSafe(label:string,txs:any[]){
  const sr=new ethers.Contract(A.SAFE,SAFE_ABI,ethers.provider);
  const owners:string[]=[...(await sr.getOwners())]; const th=Number(await sr.getThreshold()); const nonce=await sr.nonce();
  const to=A.MULTISEND, data=multiSend(txs), op=1;
  const h=await sr.getTransactionHash(to,0,data,op,0,0,0,ethers.ZeroAddress,ethers.ZeroAddress,nonce);
  const signers=owners.slice(0,th).map(o=>o.toLowerCase()).sort();
  for(const o of signers){const s=await imp(ethers.getAddress(o));await (await (new ethers.Contract(A.SAFE,SAFE_ABI,s) as any).approveHash(h)).wait();}
  let sigs="0x"; for(const o of signers) sigs+=ethers.zeroPadValue(o,32).slice(2)+"0".repeat(64)+"01";
  const ex=await imp(ethers.getAddress(signers[0]));
  const r=await (await (new ethers.Contract(A.SAFE,SAFE_ABI,ex) as any).execTransaction(to,0,data,op,0,0,0,ethers.ZeroAddress,ethers.ZeroAddress,sigs)).wait();
  ck(`${label}: 真实 ${th}/${owners.length} execTransaction 成功`,r.status===1,`nonce ${nonce}  ${txs.length} 步  gas ${r.gasUsed}`);
  return r;}
async function upgradeAll(){const tl=await imp(A.TIMELOCK);const pa=new ethers.Contract(A.PROXY_ADMIN,PA,tl);
  for(const [p,i] of [[A.RUSD,IMPL.fxusd],[A.EZ_TREASURY,IMPL.treasury],[A.EZ_POOL,IMPL.pool],[A.XEZ_POOL,IMPL.pool]]) await (await pa.upgrade(p,i)).wait();}

async function buildBatch(){
  const ez=new ethers.Contract(A.EZETH,ERC20,ethers.provider), fez=new ethers.Contract(A.FEZETH,ERC20,ethers.provider), xez=new ethers.Contract(A.XEZETH,ERC20,ethers.provider);
  const weeth=new ethers.Contract(A.WEETH,ERC20,ethers.provider);
  const R=new ethers.Contract(A.RUSD,RUSD_ABI,ethers.provider);
  const T=new ethers.Contract(A.EZ_TREASURY,T_ABI,ethers.provider), WT=new ethers.Contract(A.WEETH_TREASURY,T_ABI,ethers.provider);
  const B=await ez.balanceOf(A.EZ_TREASURY), Fs=await fez.totalSupply(), X=await xez.totalSupply();
  // 权重：P_f = 1 USD，x 拿剩余；P 由 weETH Treasury 之外的口径无法读，这里用固定演示价
  const P_EZ=2882970958271856349826n;
  const Px=((B*P_EZ/E)-(Fs))*E/X;
  const fW=Fs, xW=X*Px/E;
  const ezManaged=(await R.markets(A.EZETH))[4] as bigint;
  const safeRUsd=await R.balanceOf(A.SAFE);
  const need=ezManaged>safeRUsd?ezManaged-safeRUsd:0n;
  // 快进到周边界会让历史分叉上的 weETH 预言机过期(分叉假象)，对照组用不到这个价格，读不到就退回占位值
  let wePrice=0n; try{ wePrice=await WT.currentBaseTokenPrice(); }catch(e){ wePrice=2800n*E; }
  const weIn=need*E/wePrice*105n/100n;
  const weTotal=await WT.totalBaseToken();
  const newCap=weTotal+weIn+E;                                   // 留 1 weETH 余量
  const t=(to:string,name:string,inputs:any[],vals:any)=>({to,value:"0",contractMethod:{name,payable:false,inputs},contractInputsValues:vals});
  const u=(n:string)=>({name:n,type:"uint256"}), ad=(n:string)=>({name:n,type:"address"}), bo=(n:string)=>({name:n,type:"bool"});
  return {B,Fs,X,fW,xW,ezManaged,need,weIn,newCap,wePrice,
    build:async()=>{
      // windDownPreviewRedeem 在 initializeWindDown 之前以 ErrorWindDownNotStarted (0x1a5594cf) 回滚，
      // 而 initializeWindDown 就在同一批次的第 3 步，因此这三个 minOut 必须离线按定点公式复算：
      //   fBase = B * fWeight / (fWeight + xWeight)
      //   out   = floor(fTokenIn * fBase / F)          两个 Pool 存的都是 fezETH，同用 f 侧比例
      const fBase=B*fW/(fW+xW);
      const ezBal=await fez.balanceOf(A.EZ_POOL), xezBal=await fez.balanceOf(A.XEZ_POOL);
      const previewEz=ezManaged*fBase/Fs, ezMin=ezBal*fBase/Fs, xezMin=xezBal*fBase/Fs;
      return [
        t(A.EZ_MARKET,"updateRedeemFeeRatio",[u("_defaultFeeRatio"),{name:"_extraFeeRatio",type:"int256"},bo("_isFToken")],{_defaultFeeRatio:"0",_extraFeeRatio:"0",_isFToken:"true"}),
        t(A.EZ_MARKET,"updateRedeemFeeRatio",[u("_defaultFeeRatio"),{name:"_extraFeeRatio",type:"int256"},bo("_isFToken")],{_defaultFeeRatio:"0",_extraFeeRatio:"0",_isFToken:"false"}),
        t(A.EZ_TREASURY,"initializeWindDown",[u("_expectedBaseBalance"),u("_expectedFSupply"),u("_expectedXSupply"),u("_fWeight"),u("_xWeight")],
          {_expectedBaseBalance:B.toString(),_expectedFSupply:Fs.toString(),_expectedXSupply:X.toString(),_fWeight:fW.toString(),_xWeight:xW.toString()}),
        t(A.WEETH_TREASURY,"updateBaseTokenCap",[u("_baseTokenCap")],{_baseTokenCap:newCap.toString()}),
        t(A.WEETH,"approve",[ad("spender"),u("amount")],{spender:A.RUSD,amount:weIn.toString()}),
        t(A.RUSD,"mint",[ad("_baseToken"),u("_amountIn"),ad("_receiver"),u("_minOut")],{_baseToken:A.WEETH,_amountIn:weIn.toString(),_receiver:A.SAFE,_minOut:need.toString()}),
        t(A.EZ_MARKET,"updateRedeemStatus",[bo("_newStatus")],{_newStatus:"false"}),
        t(A.RUSD,"redeem",[ad("_baseToken"),u("_amountIn"),ad("_receiver"),u("_minOut")],{_baseToken:A.EZETH,_amountIn:ezManaged.toString(),_receiver:A.SAFE,_minOut:previewEz.toString()}),
        t(A.RUSD,"removeMarket",[ad("_baseToken")],{_baseToken:A.EZETH}),
        t(A.RUSD,"removeRebalancePools",[{name:"_pools",type:"address[]"}],{_pools:JSON.stringify([A.EZ_POOL,A.XEZ_POOL])}),
        t(A.EZ_POOL,"windDown",[u("_expectedAssetBalance"),u("_minBaseOut")],{_expectedAssetBalance:ezBal.toString(),_minBaseOut:ezMin.toString()}),
        t(A.XEZ_POOL,"windDown",[u("_expectedAssetBalance"),u("_minBaseOut")],{_expectedAssetBalance:xezBal.toString(),_minBaseOut:xezMin.toString()}),
        t(A.WEETH_TREASURY,"updateBaseTokenCap",[u("_baseTokenCap")],{_baseTokenCap:"0"}),
      ];}};
}

async function run(label:string, crossBoundary:boolean){
  console.log(`\n================ ${label} ================`);
  await upgradeAll();
  const fez=new ethers.Contract(A.FEZETH,ERC20,ethers.provider), ez=new ethers.Contract(A.EZETH,ERC20,ethers.provider);
  const weeth=new ethers.Contract(A.WEETH,ERC20,ethers.provider);
  const R=new ethers.Contract(A.RUSD,RUSD_ABI,ethers.provider);
  const WT=new ethers.Contract(A.WEETH_TREASURY,T_ABI,ethers.provider);
  const [dev]=await ethers.getSigners();

  // ===== 生产顺序第一步：EOA checkpoint，在 initializeWindDown 之前 =====
  const preStatus=await (new ethers.Contract(A.EZ_TREASURY,T_ABI,ethers.provider) as any).windDownStatus();
  ck("checkpoint 之前 Treasury 处于 WindDownBeforeInit", Number(preStatus)===0);
  let tCp=0, cpGas=0n;
  for(const [pool,vs] of [[A.EZ_POOL,EZ_V],[A.XEZ_POOL,XEZ_V]] as const){
    const Pl=new ethers.Contract(pool,P_ABI,ethers.provider);
    for(const v of vs){ const r=await (await (Pl.connect(dev) as any).checkpoint(v)).wait(); cpGas+=r.gasUsed; tCp=(await ethers.provider.getBlock(r.blockNumber))!.timestamp; }
  }
  ck("初始化之前 10 笔 EOA checkpoint 全部成功", true, `合计 gas ${cpGas}`);

  // 名单完整性校验
  for(const [name,pool,vs] of [["ezPool",A.EZ_POOL,EZ_V],["xezPool",A.XEZ_POOL,XEZ_V]] as const){
    const Pl=new ethers.Contract(pool,P_ABI,ethers.provider);
    let sum=0n; for(const v of vs) sum+=await (Pl as any).balanceOf(v);
    const ts=await (Pl as any).totalSupply();
    ck(`${name} 名单完整性 sum(balanceOf) == totalSupply`, sum===ts, f(sum));
  }

  if(crossBoundary){ const now=(await ethers.provider.getBlock("latest"))!.timestamp;
    const bnd=Math.ceil(now/WEEK)*WEEK; await network.provider.send("evm_setNextBlockTimestamp",[bnd+600]); await network.provider.send("evm_mine",[]); }

  // ===== 生产顺序第二步：Safe 执行批次 =====
  // 跨界对照组用精简批次(费率归零 + 初始化 + 两笔 windDown)：快进到周边界会让历史分叉上的
  // weETH Chainlink TWAP 过期，这是分叉假象而非主网行为，rUSD 迁移那几步与 boost 无关，剔除不影响结论。
  const b=await buildBatch();
  const have=await weeth.balanceOf(A.SAFE);
  if(!crossBoundary && have<b.weIn){ const w=await imp(A.WEETH_WHALE); await (await (weeth.connect(w) as any).transfer(A.SAFE,b.weIn-have)).wait(); }
  const preCap=await WT.baseTokenCap();
  let txs=await b.build();
  if(crossBoundary){ txs=[txs[0],txs[1],txs[2],txs[10],txs[11]]; note("对照组使用精简批次：费率归零 x2 + initializeWindDown + 两笔 windDown"); }
  else ck("批次为 13 步，末步为 weETH updateBaseTokenCap(0)", txs.length===13 && txs[12].contractInputsValues._baseTokenCap==="0");
  const r=await execViaSafe("多签三",txs);
  const tWd=(await ethers.provider.getBlock(r.blockNumber))!.timestamp;
  const ceilCp=Math.ceil(tCp/WEEK)*WEEK;
  note(`T_cp ${tCp}  ceil ${ceilCp}  T_wd ${tWd}   ${ceilCp>=tWd?"未跨界":"跨界"}`);

  // ===== 批次后状态 =====
  ck("Treasury 进入 WindDown", Number(await (new ethers.Contract(A.EZ_TREASURY,T_ABI,ethers.provider) as any).windDownStatus())===1);
  ck("两个 Pool 的 fezETH 余额归零", (await fez.balanceOf(A.EZ_POOL))===0n && (await fez.balanceOf(A.XEZ_POOL))===0n);
  if(!crossBoundary){
    ck("rUSD 对 ezETH 的 managed 归零并已移除市场", !(await R.getMarkets()).map((x:string)=>x.toLowerCase()).includes(A.EZETH.toLowerCase()));
    ck("weETH baseTokenCap 已改回原值", (await WT.baseTokenCap())===preCap, `${f(preCap)}`);
    ck("rUSD totalSupply == weETH managed(唯一剩余市场)", (await R.totalSupply())===((await R.markets(A.WEETH))[4] as bigint));
  }

  // ===== 10 个金库 owner 走真实 getReward =====
  let ok=0, got=0n;
  for(const [pool,vs] of [[A.EZ_POOL,EZ_V],[A.XEZ_POOL,XEZ_V]] as const)
    for(const v of vs){
      const vc=new ethers.Contract(v,VAULT,ethers.provider);
      let owner:string; try{ owner=await vc.owner(); }catch(e){ continue; }
      const o=await imp(owner); const before=await ez.balanceOf(owner);
      try{ await (await (vc.connect(o) as any).getReward(true,[A.EZETH,A.FXN])).wait(); ok++; got+=(await ez.balanceOf(owner))-before; }catch(e){}
    }
  if(crossBoundary) ck(`对照：跨界后 getReward() 成功数 ${ok}/10 应远小于 10`, ok<10, `owner 侧合计收到 ${f(got)} ezETH`);
  else ck(`10 个 Personal Vault owner getReward() 成功数 ${ok}/10`, ok===10, `owner 侧合计收到 ${f(got)} ezETH`);
  return ok;
}

async function main(){
  await network.provider.request({method:"hardhat_reset",params:[{forking:{jsonRpcUrl:RPC}}]});
  await network.provider.send("evm_mine",[]);
  let s=await snap(); await run("A. 生产顺序，不跨周边界",false); await back(s);
  s=await snap(); await run("B. 生产顺序，但跨过周边界（对照）",true); await back(s);
  console.log(`\n==== ${P} passed, ${F} failed ====`);
}
main().catch(e=>{console.error(e);process.exit(1);});
