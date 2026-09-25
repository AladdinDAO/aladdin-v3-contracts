import { ethers, network } from "hardhat";
const RPC = process.env.FORK_RPC || "https://mainnet.gateway.tenderly.co";
const D: any = { FxUSD:"0x13d8dc5B2B45E6fF2182fBD874CEB5E27B822fBd", WrappedTokenTreasuryV2WindDown:"0xC2f4eb02F1EE9b19f44B5bfdC3225917279396bC", FxUSDShareableRebalancePoolWindDown:"0xff0aEa082D2F59F73416cF868cAef4BE898f5BB5" };
const ARGS: any = { FxUSD: [], WrappedTokenTreasuryV2WindDown: ["0xbf5495Efe5DB9ce00f80364C8B423567e58d2110","0x50B4DC15b34E31671c9cA40F9eb05D7eBd6b13f9","0x2e5A5AF7eE900D34BCFB70C47023bf1d6bE35CF5"], FxUSDShareableRebalancePoolWindDown: ["0x365AccFCa291e7D3914637ABf1F7635dB165Bb09","0xEC6B8A3F3605B083F7044C0F31f2cac0caf1d469","0xd766f2b87DE4b08c2239580366e49710180aba02","0xC8b194925D55d5dE9555AD1db74c149329F71DeF"] };
async function main() {
  await network.provider.request({ method: "hardhat_reset", params: [{ forking: { jsonRpcUrl: RPC } }] });
  await network.provider.send("evm_mine", []);
  console.log("comparing mainnet deployed bytecode against a local build of commit 2c0b9e5\n");
  let ok = true;
  for (const [name, addr] of Object.entries(D)) {
    const onchain = await ethers.provider.getCode(addr as string);
    const Fac = await ethers.getContractFactory(name);
    const local = await (Fac as any).deploy(...ARGS[name]);
    await local.waitForDeployment();
    const localCode = await ethers.provider.getCode(await local.getAddress());
    const same = onchain === localCode;
    // also compare with the metadata hash stripped (last 53 bytes = CBOR metadata)
    const strip = (c: string) => { const L = parseInt(c.slice(-4), 16); return c.slice(0, c.length - (L + 2) * 2); };
    const sameNoMeta = strip(onchain) === strip(localCode);
    ok = ok && same;
    console.log(name);
    console.log("  address                ", addr);
    console.log("  on-chain size / keccak ", (onchain.length - 2) / 2, ethers.keccak256(onchain));
    console.log("  local    size / keccak ", (localCode.length - 2) / 2, ethers.keccak256(localCode));
    console.log("  IDENTICAL              ", same, same ? "" : "   (identical ignoring metadata: " + sameNoMeta + ")");
    if (!same) {
      // find first differing byte
      let i = 2; while (i < onchain.length && i < localCode.length && onchain[i] === localCode[i]) i++;
      console.log("  first difference at byte", Math.floor((i - 2) / 2), "of", (onchain.length - 2) / 2);
    }
    console.log();
  }
  console.log(ok ? "ALL THREE MATCH THE AUDITED COMMIT" : "MISMATCH — see above");
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
