// 按前端 RedeemX 的实际调用方式，验证 xezETH 持有人的赎回路径。
import { ethers, network } from "hardhat";
const RPC=process.env.FORK_RPC||"https://mainnet.gateway.tenderly.co";
const MKT="0x69518D1D70AD537C41401303BDf96032338E40dE", TRE="0x38965311507D4E54973F81475a149c09376e241e";
const XEZ="0x2e5A5AF7eE900D34BCFB70C47023bf1d6bE35CF5", EZ="0xbf5495Efe5DB9ce00f80364C8B423567e58d2110";
const WHALE="0xC01Ac9349396935f60d39737EBe352572d1483A2";
const ROUTER_CANDIDATES=["0xA9362C6a84cA10B81c4F4C87D2f4A4C2C6e3eF82"];
const E=10n**18n; const f=(v:bigint)=>ethers.formatUnits(v,18);
let P=0,F=0; const ck=(l:string,c:boolean,d="")=>{if(c){P++;console.log("  PASS  "+l+(d?"  "+d:""));}else{F++;console.log("  FAIL  "+l+(d?"  "+d:""));}};
const note=(s:string)=>console.log("  NOTE  "+s);
async function imp(a:string){await network.provider.send("hardhat_impersonateAccount",[a]);await network.provider.send("hardhat_setBalance",[a,"0x21e19e0c9bab2400000"]);return await ethers.getSigner(a);}
const errOf=(e:any)=>{const m=(e.shortMessage||e.message||"").toString();const mm=m.match(/0x[0-9a-f]{8}/i);
  return mm?mm[0]:m.replace(/^VM Exception[^:]*: /,"").slice(0,70);};
const erc=(a:string)=>new ethers.Contract(a,["function balanceOf(address) view returns (uint256)","function allowance(address,address) view returns (uint256)","function totalSupply() view returns (uint256)"],ethers.provider);

async function main(){
  await network.provider.request({method:"hardhat_reset",params:[{forking:{jsonRpcUrl:RPC}}]});
  await network.provider.send("evm_mine",[]);
  const T=new ethers.Contract(TRE,["function windDownPreviewRedeem(uint256,uint256) view returns (uint256)"],ethers.provider);
  const M=new ethers.Contract(MKT,["function redeemXToken(uint256,address,uint256) returns (uint256)"],ethers.provider);
  const w=await imp(WHALE);
  const bal=await erc(XEZ).balanceOf(WHALE);
  console.log(`持有人 ${WHALE}\n  xezETH 余额 ${f(bal)}`);
  console.log(`  对 Market 的 xezETH 授权 ${f(await erc(XEZ).allowance(WHALE,MKT))}   <= 前端声称不需要授权\n`);
  ck("该地址对 Market 的授权确实为 0", (await erc(XEZ).allowance(WHALE,MKT))===0n);

  console.log("\n===== 1. 零授权下按前端方式赎回 1 xezETH =====");
  {
    const amt=E;
    const preview=await T.windDownPreviewRedeem(0,amt);
    note(`windDownPreviewRedeem(0, 1e18) = ${preview}  = ${f(preview)} ezETH`);
    const before=await erc(EZ).balanceOf(WHALE);
    // 前端：redeemXToken(fromAmount, account, _minBaseoutETH)，minOut 直接取 preview
    const r=await (await (M.connect(w) as any).redeemXToken(amt, WHALE, preview)).wait();
    const got=(await erc(EZ).balanceOf(WHALE))-before;
    ck("无需 approve 即可赎回", r.status===1, `gas ${r.gasUsed}`);
    ck("实际到账 == preview（所以 minOut 取 preview 不会回滚）", got===preview, `到账 ${f(got)}`);
  }

  console.log("\n===== 2. minOut 取 preview 是否留有余量 =====");
  {
    const amt=100n*E;
    const preview=await T.windDownPreviewRedeem(0,amt);
    let ok1=false; try{ await (M.connect(w) as any).redeemXToken.staticCall(amt,WHALE,preview); ok1=true; }catch(e:any){ note(`minOut = preview -> ${errOf(e)}`); }
    ck("minOut 恰好等于 preview 时可以通过", ok1);
    let ok2=false; try{ await (M.connect(w) as any).redeemXToken.staticCall(amt,WHALE,preview+1n); ok2=true; }catch(e:any){ note(`minOut = preview+1 -> ${errOf(e)}`); }
    ck("minOut 比 preview 多 1 wei 则回滚（说明 preview 就是精确上界）", !ok2);
  }

  console.log("\n===== 3. 过小金额：前端的 amountTooSmall 守卫是否与合约一致 =====");
  for(const amt of [1n, 5642n, 5643n]){
    const preview=await T.windDownPreviewRedeem(0,amt);
    let rev="成功"; try{ await (M.connect(w) as any).redeemXToken.staticCall(amt,WHALE,preview); }catch(e:any){ rev=errOf(e); }
    const feBlocks = preview===0n;
    console.log(`   in ${amt.toString().padStart(6)} wei   preview ${preview}   链上 ${rev}   前端会拦截 ${feBlocks}`);
    ck(`  in=${amt}: 前端拦截与链上行为一致`, feBlocks === (rev!=="成功"));
  }

  console.log("\n===== 4. 全额赎回 =====");
  {
    const cur=await erc(XEZ).balanceOf(WHALE);
    const preview=await T.windDownPreviewRedeem(0,cur);
    const before=await erc(EZ).balanceOf(WHALE);
    const r=await (await (M.connect(w) as any).redeemXToken(cur, WHALE, preview)).wait();
    const got=(await erc(EZ).balanceOf(WHALE))-before;
    ck("全额赎回成功", r.status===1, `gas ${r.gasUsed}`);
    ck("到账 == preview", got===preview, `${f(got)} ezETH`);
    note(`赎回后 xezETH 余额 ${f(await erc(XEZ).balanceOf(WHALE))}`);
    note(`xezETH 剩余总供应 ${f(await erc(XEZ).totalSupply())}`);
    note(`Treasury 剩余 ezETH ${f(await erc(EZ).balanceOf(TRE))}`);
  }
  console.log(`\n==== ${P} passed, ${F} failed ====`);
}
main().catch(e=>{console.error(e);process.exit(1);});
