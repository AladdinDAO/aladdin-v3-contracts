import { ethers, network } from "hardhat";
const RPC=process.env.FORK_RPC||"https://mainnet.gateway.tenderly.co";
const RUSD="0x65D72AA8DA931F047169112fcf34f52DbaAE7D18", TRE="0x38965311507D4E54973F81475a149c09376e241e";
const PA="0x9B54B7703551D9d0ced177A78367560a8B2eDDA4", TLK="0x68863fb8855b04509a835082478D6E3D0bE4E61a";
const EZ_POOL="0xf58c499417e36714e99803Cb135f507a95ae7169", XEZ_POOL="0xBa947cba270D30967369Bf1f73884Be2533d7bDB";
const WEETH="0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee", EZETH="0xbf5495Efe5DB9ce00f80364C8B423567e58d2110";
const IMPL={rUSD:"0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd",tre:"0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC",pool:"0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5"};
async function imp(a:string){await network.provider.send("hardhat_impersonateAccount",[a]);await network.provider.send("hardhat_setBalance",[a,"0x21e19e0c9bab2400000"]);return await ethers.getSigner(a);}
async function raw(to:string,data:string){try{await network.provider.send("eth_call",[{to,data},"latest"]);return{ok:true,d:"0x"};}catch(e:any){const d=e?.data?.data||e?.data||"";return{ok:false,d:typeof d==="string"?d:JSON.stringify(d)};}}
const dec=(d:string)=>{if(!d||d==="0x")return"(空)";
  if(d.startsWith("0x08c379a0")){try{return "Error("+ethers.AbiCoder.defaultAbiCoder().decode(["string"],"0x"+d.slice(10))[0]+")";}catch{return d.slice(0,20);}}
  if(d.startsWith("0x4e487b71"))return "Panic(0x"+BigInt("0x"+d.slice(10)).toString(16)+")";
  return d.slice(0,10)+(d.length>10?"…":"");};

async function main(){
  await network.provider.request({method:"hardhat_reset",params:[{forking:{jsonRpcUrl:RPC}}]});
  await network.provider.send("evm_mine",[]);
  console.log("fork chainId:", (await ethers.provider.getNetwork()).chainId, "  (主网为 1；不一致会改变 Safe 1.3.0 的 domainSeparator)");

  const R=new ethers.Interface(["function isUnderCollateral() view returns (bool)","function nav() view returns (uint256)","function getMarkets() view returns (address[])","function markets(address) view returns (address,address,address,uint256,uint256)"]);
  const T=new ethers.Interface(["function isUnderCollateral() view returns (bool)","function collateralRatio() view returns (uint256)","function currentBaseTokenPrice() view returns (uint256)"]);

  const probe=async(tag:string)=>{
    console.log(`\n--- ${tag} ---`);
    for(const [n,to,d] of [
      ["rUSD.isUnderCollateral()", RUSD, R.encodeFunctionData("isUnderCollateral")],
      ["rUSD.nav()",               RUSD, R.encodeFunctionData("nav")],
      ["ezTreasury.isUnderCollateral()", TRE, T.encodeFunctionData("isUnderCollateral")],
      ["ezTreasury.collateralRatio()",   TRE, T.encodeFunctionData("collateralRatio")],
      ["ezTreasury.currentBaseTokenPrice()", TRE, T.encodeFunctionData("currentBaseTokenPrice")],
    ] as const){ const r=await raw(to,d); console.log(`  ${n.padEnd(38)} ${r.ok?"OK":"REVERT "+dec(r.d)}`); }
    const mk=await raw(RUSD,R.encodeFunctionData("getMarkets"));
    if(mk.ok){ const ms=new ethers.Contract(RUSD,R,ethers.provider); console.log(`  rUSD 支持的市场: ${(await ms.getMarkets()).join(", ")}`); }
  };

  await probe("升级前（主网当前状态）");

  const tl=await imp(TLK); const pa=new ethers.Contract(PA,["function upgrade(address,address)"],tl);
  for(const [p,i] of [[RUSD,IMPL.rUSD],[TRE,IMPL.tre],[EZ_POOL,IMPL.pool],[XEZ_POOL,IMPL.pool]]) await (await pa.upgrade(p,i)).wait();
  await probe("四个代理升级之后、initializeWindDown 之前");

  // 逐个市场定位
  console.log("\n--- 定位 rUSD.isUnderCollateral() 的回滚来源 ---");
  const rc=new ethers.Contract(RUSD,R,ethers.provider);
  for(const bt of [EZETH,WEETH]){
    const m=await rc.markets(bt);
    const tre=m[2];
    const r=await raw(tre,T.encodeFunctionData("isUnderCollateral"));
    console.log(`  baseToken ${bt}  treasury ${tre}  isUnderCollateral ${r.ok?"OK":"REVERT "+dec(r.d)}`);
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
