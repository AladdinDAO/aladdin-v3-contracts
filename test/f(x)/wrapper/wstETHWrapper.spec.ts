/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { TOKENS } from "../../../scripts/utils";
import { WstETHWrapper } from "../../../typechain";
// eslint-disable-next-line camelcase
import { request_fork } from "../../utils";

const FOKR_HEIGHT = 17620650;

const stETH = TOKENS.stETH.address;
const stETH_HOLDER = "0x611F97d450042418E7338CBDd19202711563DF01";
const wstETH = TOKENS.wstETH.address;
const wstETH_HOLDER = "0x6cE0F913F035ec6195bC3cE885aec4C66E485BC4";
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";

describe("wstETHWrapper.spec", async () => {
  let deployer: SignerWithAddress;

  let wrapper: WstETHWrapper;

  beforeEach(async () => {
    request_fork(FOKR_HEIGHT, [DEPLOYER, stETH_HOLDER, wstETH_HOLDER]);
    deployer = await ethers.getSigner(DEPLOYER);

    await deployer.sendTransaction({ to: stETH_HOLDER, value: ethers.utils.parseEther("10") });
    await deployer.sendTransaction({ to: wstETH_HOLDER, value: ethers.utils.parseEther("10") });

    const wstETHWrapper = await ethers.getContractFactory("wstETHWrapper", deployer);
    wrapper = (await wstETHWrapper.deploy()) as WstETHWrapper;
    await wrapper.deployed();
  });

  it("should succeed when wrap", async () => {
    const signer = await ethers.getSigner(stETH_HOLDER);
    const srcToken = await ethers.getContractAt("IERC20", stETH, signer);
    const dstToken = await ethers.getContractAt("IERC20", wstETH, signer);

    await srcToken.transfer(wrapper.address, ethers.utils.parseEther("10"));
    const before = await dstToken.balanceOf(signer.address);
    await wrapper.connect(signer).wrap(ethers.utils.parseEther("10"));
    const after = await dstToken.balanceOf(signer.address);
    expect(after).to.gt(before);
  });

  it("should succeed when unwrap", async () => {
    const signer = await ethers.getSigner(wstETH_HOLDER);
    const srcToken = await ethers.getContractAt("IERC20", stETH, signer);
    const dstToken = await ethers.getContractAt("IERC20", wstETH, signer);

    await dstToken.transfer(wrapper.address, ethers.utils.parseEther("10"));
    const before = await srcToken.balanceOf(signer.address);
    await wrapper.connect(signer).unwrap(ethers.utils.parseEther("10"));
    const after = await srcToken.balanceOf(signer.address);
    expect(after).to.gt(before);
  });
});
