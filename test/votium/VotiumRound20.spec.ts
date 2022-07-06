/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { ADDRESS, ZAP_ROUTES } from "../../scripts/utils";
import { Round20Rewards } from "../../scripts/votium/config";
import { AladdinZap, CLeverCVXLocker, IERC20 } from "../../typechain";
// eslint-disable-next-line camelcase
import { request_fork } from "../utils";

const FORK_BLOCK_NUMBER = 14960154;
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const PROXY_ADMIN = "0x12b1326459d72F2Ab081116bf27ca46cD97762A0";
const ZAP = "0x1104b4DF568fa7Af90B1Bed1D78A2F71e748dc8a";
const ZAP_OWNER = "0x28c921adAC4c1072658eB01a28DA06b5F651eF62";
const PROXY_OWNER = "0xc40549aa1D05C30af23a1C4a5af6bA11FCAFe23F";
const CVX_LOCKER = "0x96C68D861aDa016Ed98c30C810879F9df7c64154";
const KEEPER = "0x11E91BB6d1334585AA37D8F4fde3932C7960B938";

const CVX = ADDRESS.CVX;
const MTA = ADDRESS.MTA;
const MTA_HOLDER = "0x2faf487a4414fe77e2327f0bf4ae2a264a776ad2";
const UPDATE_ZAP_IMPL = false;

let firstCall = true;

describe("VotiumRound20.spec", async () => {
  let deployer: SignerWithAddress;
  let owner: SignerWithAddress;
  let zap: AladdinZap;
  let cvx: IERC20;
  let locker: CLeverCVXLocker;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, ZAP_OWNER, PROXY_OWNER, MTA_HOLDER, KEEPER]);
    deployer = await ethers.getSigner(DEPLOYER);
    owner = await ethers.getSigner(ZAP_OWNER);

    await deployer.sendTransaction({ to: owner.address, value: ethers.utils.parseEther("10") });

    cvx = await ethers.getContractAt("IERC20", CVX, deployer);

    zap = await ethers.getContractAt("AladdinZap", ZAP, owner);

    if (UPDATE_ZAP_IMPL) {
      const proxyOwner = await ethers.getSigner(PROXY_OWNER);
      await deployer.sendTransaction({ to: proxyOwner.address, value: ethers.utils.parseEther("10") });
      const proxyAdmin = await ethers.getContractAt("ProxyAdmin", PROXY_ADMIN, proxyOwner);

      const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
      const impl = await AladdinZap.deploy();
      await impl.deployed();

      await proxyAdmin.upgrade(zap.address, impl.address);
    }

    locker = await ethers.getContractAt("CLeverCVXLocker", CVX_LOCKER, owner);

    const rewards = ["MTA"];
    for (const from in rewards) {
      const routes = ZAP_ROUTES[from].CVX;
      if (routes !== undefined) {
        await zap.updateRoute(ADDRESS[from], CVX, routes);
        if (firstCall) {
          console.log(`${from} to CVX zap: from[${ADDRESS[from]}] to[${CVX}] routes[${routes.toString()}]`);
        }
      }
    }
    firstCall = false;
  });

  it("MTA => CVX", async () => {
    const amountIn = ethers.utils.parseUnits("10000", 18);
    const expectCVX = ethers.utils.parseUnits("100", 18);
    const signer = await ethers.getSigner(MTA_HOLDER);
    await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

    const usdn = await ethers.getContractAt("IERC20", MTA, signer);
    await usdn.approve(zap.address, amountIn);

    const beforeCVX = await cvx.balanceOf(signer.address);
    await zap.connect(signer).zapFrom(usdn.address, amountIn, CVX, 0);
    const afterCVX = await cvx.balanceOf(signer.address);

    expect(afterCVX.sub(beforeCVX)).gte(expectCVX);
  });

  it("should harvest", async () => {
    const keeper = await ethers.getSigner(KEEPER);
    await deployer.sendTransaction({ to: keeper.address, value: ethers.utils.parseEther("10") });
    const amount = await locker.connect(keeper).callStatic.harvestVotium(Round20Rewards, 0);
    await locker.connect(keeper).harvestVotium(Round20Rewards, 0);
    console.log("CVX:", ethers.utils.formatEther(amount));
  });
});
