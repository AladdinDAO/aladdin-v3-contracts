/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { toBigInt } from "ethers";
import { ethers } from "hardhat";

import { request_fork } from "@/test/utils";
import { IMultiMerkleStash, SdCRVBribeBurner, StakeDAOCRVVault } from "@/types/index";
import { ADDRESS, Action, DEPLOYED_CONTRACTS, PoolType, TOKENS, encodePoolHintV2 } from "@/utils/index";

const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const VAULT = "0x2b3e72f568F96d7209E20C8B8f4F2A363ee1E3F6";
const PROXY = "0x1c0D72a330F2768dAF718DEf8A19BAb019EEAd09";
const DELEGATOR = "0x6037Bb1BBa598bf88D816cAD90A28cC00fE3ff64";

const claimParam: IMultiMerkleStash.ClaimParamStruct = {
  token: TOKENS.sdCRV.address,
  index: 338,
  amount: "0x01479dcb48f3fc736000",
  merkleProof: [
    "0x157d128746210aec27f28797be999718389a8b3bdcfcbe9d28da2a77638700f6",
    "0xaed197954a68d934ca849596ff7c58576a05ba40ea969a0d8f881fb2fbc85188",
    "0xd815e205d407c9998f17a9b8aedcb0bb69349495dd8259b0b95880c05ab21262",
    "0x83d8eb4fbea2e7df9c35c04411e0d57b9b924fa29c155ca84eee0a5834cea81c",
    "0x3e64a4a0e97e451f961cb776587b9886e14b27c615d1e0544812f1b1f6a30f1b",
    "0x8f51bc72f447775083bdb42a1287303723e360f201111e8f190ff312a5a1ddee",
    "0x13f0863797745faacda3200ab858a6723b67c2394fa483d0a85469d655915020",
    "0xfdad4d87a89faf7052a734d976c29017e8869a6d6e67c2e5f1cc0ca9ccfeca81",
    "0xf587853eeac4234c7a78c7ca94982a04e600f8b89a72d0d0dea7c372988b9c3c",
  ],
};

describe("SdCRVBribeBurner.spec", async () => {
  let deployer: HardhatEthersSigner;
  let vault: StakeDAOCRVVault;
  let burner: SdCRVBribeBurner;

  beforeEach(async () => {
    await request_fork(16789529, [DEPLOYED_CONTRACTS.Concentrator.Treasury, DEPLOYER]);
    deployer = await ethers.getSigner(DEPLOYER);
    const owner = await ethers.getSigner(DEPLOYED_CONTRACTS.Concentrator.Treasury);

    await deployer.sendTransaction({ to: owner.address, value: ethers.parseEther("10") });

    const proxyAdmin = await ethers.getContractAt("ProxyAdmin", DEPLOYED_CONTRACTS.Concentrator.ProxyAdmin, owner);
    vault = await ethers.getContractAt("StakeDAOCRVVault", VAULT, deployer);

    const StakeDAOCRVVault = await ethers.getContractFactory("StakeDAOCRVVault", deployer);
    const impl = await StakeDAOCRVVault.deploy(PROXY, DELEGATOR);

    await proxyAdmin.upgrade(VAULT, impl.getAddress());

    const SdCRVBribeBurner = await ethers.getContractFactory("SdCRVBribeBurner", deployer);
    burner = await SdCRVBribeBurner.deploy("0x858D62CE483B8ab538d1f9254C3Fd3Efe1c5346F");

    await burner.updateWhitelist(deployer.address, true);
    await vault.connect(owner).updateBribeBurner(burner.getAddress());
  });

  it("should succeed", async () => {
    const amount = toBigInt(claimParam.amount);
    const sdcrv = await ethers.getContractAt("ERC20", TOKENS.sdCRV.address, deployer);
    const sdt = await ethers.getContractAt("ERC20", TOKENS.SDT.address, deployer);
    await expect(vault.harvestBribes([claimParam]))
      .to.emit(vault, "HarvestBribe")
      .withArgs(TOKENS.sdCRV.address, amount, 0n, amount / 10n);

    expect(await sdcrv.balanceOf(burner.getAddress())).to.eq(amount);

    const beforeSDT = await sdt.balanceOf(DELEGATOR);
    const beforeSdCRV = await sdcrv.balanceOf(VAULT);
    await burner.burn(
      sdcrv.getAddress(),
      [
        encodePoolHintV2(ADDRESS["CURVE_CRV/sdCRV_POOL"], PoolType.CurveFactoryPlainPool, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS.CURVE_CRVETH_POOL, PoolType.CurveCryptoPool, 2, 1, 0, Action.Swap),
        encodePoolHintV2(ADDRESS["CURVE_ETH/SDT_POOL"], PoolType.CurveCryptoPool, 2, 0, 1, Action.Swap),
      ],
      1,
      [encodePoolHintV2(ADDRESS["CURVE_CRV/sdCRV_POOL"], PoolType.CurveFactoryPlainPool, 2, 1, 0, Action.Swap)],
      1
    );
    const afterSDT = await sdt.balanceOf(DELEGATOR);
    const afterSdCRV = await sdcrv.balanceOf(VAULT);

    expect(beforeSDT).to.lt(afterSDT);
    expect(beforeSdCRV).to.lt(afterSdCRV);
  });
});
