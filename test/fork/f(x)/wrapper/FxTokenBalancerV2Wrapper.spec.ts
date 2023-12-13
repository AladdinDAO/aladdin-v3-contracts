/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { MaxUint256 } from "ethers";
import { ethers } from "hardhat";

import { request_fork } from "@/test/utils";
import { FxTokenBalancerV2Wrapper, MockERC20, WETH9 } from "@/types/index";
import { TOKENS } from "@/utils/index";

const FOKR_HEIGHT = 17796350;

const BALANCER_POOL_FACTORY = "0x8E9aa87E45e92bad84D5F8DD1bff34Fb92637dE9";
const BALANCER_VAULT = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";

describe("FxTokenBalancerV2Wrapper.spec", async () => {
  let deployer: HardhatEthersSigner;

  let weth: WETH9;
  let src: MockERC20;
  let dst: MockERC20;
  let wrapper: FxTokenBalancerV2Wrapper;

  beforeEach(async () => {
    request_fork(FOKR_HEIGHT, [DEPLOYER]);
    deployer = await ethers.getSigner(DEPLOYER);

    weth = await ethers.getContractAt("WETH9", TOKENS.WETH.address, deployer);
    const balancer = await ethers.getContractAt("IBalancerVault", BALANCER_VAULT, deployer);
    const factory = await ethers.getContractAt("IBalancerWeightedPoolFactory", BALANCER_POOL_FACTORY, deployer);

    const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
    src = await MockERC20.deploy("FX", "FX", 18);

    const poolAddress = await factory.create.staticCall(
      "X",
      "Y",
      (await src.getAddress()).toLowerCase() < (await weth.getAddress()).toLowerCase()
        ? [await src.getAddress(), await weth.getAddress()]
        : [await weth.getAddress(), await src.getAddress()],
      (await src.getAddress()).toLowerCase() < (await weth.getAddress()).toLowerCase()
        ? [ethers.parseEther("0.80"), ethers.parseEther("0.20")]
        : [ethers.parseEther("0.20"), ethers.parseEther("0.80")],
      1e12,
      deployer.address
    );
    await factory.create(
      "X",
      "Y",
      (await src.getAddress()).toLowerCase() < (await weth.getAddress()).toLowerCase()
        ? [await src.getAddress(), await weth.getAddress()]
        : [await weth.getAddress(), await src.getAddress()],
      (await src.getAddress()).toLowerCase() < (await weth.getAddress()).toLowerCase()
        ? [ethers.parseEther("0.80"), ethers.parseEther("0.20")]
        : [ethers.parseEther("0.20"), ethers.parseEther("0.80")],
      1e12,
      deployer.address
    );
    dst = await ethers.getContractAt("MockERC20", poolAddress, deployer);
    const pool = await ethers.getContractAt("IBalancerPool", poolAddress, deployer);
    const poolId = await pool.getPoolId();

    await src.approve(balancer.getAddress(), MaxUint256);
    await weth.approve(balancer.getAddress(), MaxUint256);
    await src.mint(deployer.address, ethers.parseEther("80"));
    await weth.deposit({ value: ethers.parseEther("20") });
    await balancer.joinPool(poolId, deployer.address, deployer.address, {
      assets:
        (await src.getAddress()).toLowerCase() < (await weth.getAddress()).toLowerCase()
          ? [await src.getAddress(), await weth.getAddress()]
          : [await weth.getAddress(), await src.getAddress()],
      maxAmountsIn: [MaxUint256, MaxUint256],
      userData: ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint8", "uint256[]"],
        [
          0,
          (await src.getAddress()).toLowerCase() < (await weth.getAddress()).toLowerCase()
            ? [ethers.parseEther("80"), ethers.parseEther("20")]
            : [ethers.parseEther("20"), ethers.parseEther("80")],
        ]
      ),
      fromInternalBalance: false,
    });

    const FxTokenBalancerV2Wrapper = await ethers.getContractFactory("FxTokenBalancerV2Wrapper", deployer);
    wrapper = await FxTokenBalancerV2Wrapper.deploy(src.getAddress(), dst.getAddress());
  });

  it("should succeed when wrap", async () => {
    await src.mint(wrapper.getAddress(), ethers.parseEther("10"));
    const before = await dst.balanceOf(deployer.address);
    await wrapper.wrap(ethers.parseEther("10"));
    const after = await dst.balanceOf(deployer.address);
    expect(after).to.gt(before);
  });

  it("should succeed when unwrap", async () => {
    await dst.transfer(wrapper.getAddress(), ethers.parseEther("1"));
    const before = await src.balanceOf(deployer.address);
    await wrapper.unwrap(ethers.parseEther("1"));
    const after = await src.balanceOf(deployer.address);
    expect(after).to.gt(before);
  });
});
