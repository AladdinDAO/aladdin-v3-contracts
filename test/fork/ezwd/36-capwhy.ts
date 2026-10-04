// 为什么 newCap 取 192.738471897658202870 会让第 8 步失败：单次分叉，快照回滚复用。
import { ethers, network } from "hardhat";
import * as fs from "fs";
const RPC=process.env.FORK_RPC||"https://mainnet.gateway.tenderly.co";
const SAFE="0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF", WT="0x781BA968d5cc0b40EB592D5c8a9a3A4000063885";
const WEETH="0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee", RUSD="0x65D72AA8DA931F047169112fcf34f52DbaAE7D18";
const f=(v:bigint)=>ethers.formatUnits(v,18);
async function imp(a:string){await network.provider.send("hardhat_impersonateAccount",[a]);await network.provider.send("hardhat_setBalance",[a,"0x21e19e0c9bab2400000"]);return await ethers.getSigner(a);}
const SEL:Record<string,string>={"0x2cbf45d6":"ErrorExceedTotalCap()"};
const errOf=(e:any)=>{const m=(e.shortMessage||e.message||"").toString();const mm=m.match(/0x[0-9a-f]{8}/i);
  const s=mm?mm[0].toLowerCase():""; return (s&&SEL[s])?`${s} ${SEL[s]}`:(s||m.replace(/^VM Exception[^:]*: /,"").slice(0,70));};
async function main(){
  await network.provider.request({method:"hardhat_reset",params:[{forking:{jsonRpcUrl:RPC}}]});
  await network.provider.send("evm_mine",[]);
  const base=JSON.parse(fs.readFileSync("/tmp/steps.json","utf8"));
  const wtc=new ethers.Contract(WT,["function totalBaseToken() view returns (uint256)","function baseTokenCap() view returns (uint256)"],ethers.provider);
  const we=new ethers.Contract(WEETH,["function balanceOf(address) view returns (uint256)"],ethers.provider);
  const weIn=1185892866913078502n;
  console.log(`批次前 weETH Treasury totalBaseToken ${f(await wtc.totalBaseToken())}`);
  console.log(`第 8 步 mint 的输入量                ${f(weIn)}`);
  console.log(`天真相加                            ${f((await wtc.totalBaseToken())+weIn)}\n`);

  for(const [tag,cap] of [["原版 1927.384718976582028700",1927384718976582028700n],
                          ["去零 192.738471897658202870",192738471897658202870n]] as const){
    const snap=await network.provider.send("evm_snapshot",[]);
    const steps=JSON.parse(JSON.stringify(base));
    steps[5].d=steps[5].d.slice(0,10)+ethers.AbiCoder.defaultAbiCoder().encode(["uint256"],[cap]).slice(2);
    const safe=await imp(SAFE);
    console.log(`--- ${tag} ---`);
    let failed=0;
    for(const s of steps){
      if(s.idx===8){
        const tb=await wtc.totalBaseToken(), c=await wtc.baseTokenCap();
        console.log(`   进入第 8 步时：totalBaseToken ${f(tb)}   baseTokenCap ${f(c)}`);
        console.log(`                  需要 cap >= ${f(tb+weIn)}   ${c>=tb+weIn?"满足":"*** 不满足，差 "+f(tb+weIn-c)+" ***"}`);
      }
      try{ await (await safe.sendTransaction({to:s.to,data:s.d,value:0})).wait(); }
      catch(e:any){ console.log(`   step ${s.idx} 失败  ${errOf(e)}`); failed=s.idx; break; }
    }
    if(!failed) console.log(`   15 步全部通过   最终 baseTokenCap ${f(await wtc.baseTokenCap())}`);
    await network.provider.send("evm_revert",[snap]);
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
