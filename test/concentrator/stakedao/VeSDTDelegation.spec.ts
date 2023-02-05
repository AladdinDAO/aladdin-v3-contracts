/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants, Wallet } from "ethers";
import { splitSignature } from "ethers/lib/utils";
import { ethers } from "hardhat";
import * as hre from "hardhat";
import { IStakeDAOBoostDelegation, MockERC20, VeSDTDelegation } from "../../../typechain";
import { IStakeDAOVeSDT } from "../../../typechain/contracts/concentrator/stakedao/interfaces/IStakeDAOVeSDT";
import { request_fork } from "../../utils";

const FORK_BLOCK_NUMBER = 16071270;
const WEEK = 86400 * 7;

const SDT = "0x73968b9a57c6E53d41345FD57a6E6ae27d6CDB2F";
const SDT_HOLDER = "0x957ffde35b2d84f01d9bcaeb7528a2bcc268b9c1";
const BOOSTER1 = "0x1000000000000000000000000000000000000000";
const BOOSTER2 = "0x2000000000000000000000000000000000000000";
const BOOSTER3 = "0x3000000000000000000000000000000000000000";
const PROXY = "0x4000000000000000000000000000000000000000";

const VE_SDT = "0x0C30476f66034E11782938DF8e4384970B6c9e8a";
const VESDT_BOOST = "0x47B3262C96BB55A8D2E4F8E3Fed29D2eAB6dB6e9";

const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";

// a random generated private key
const PRIVATE_KEY = "0xf4bdca9d65c2824f4081437efd552e10b1891dc23bea39c9626ac5233d59c490";

describe("VeSDTDelegation.spec", async () => {
  let deployer: SignerWithAddress;
  let booster1: SignerWithAddress;
  let booster2: SignerWithAddress;
  let booster3: SignerWithAddress;
  let delegation: VeSDTDelegation;
  let veSDT: IStakeDAOVeSDT;
  let veSDTBoost: IStakeDAOBoostDelegation;
  let sdt: MockERC20;
  let startTime: number;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, SDT_HOLDER, BOOSTER1, BOOSTER2, BOOSTER3]);
    deployer = await ethers.getSigner(DEPLOYER);
    await deployer.sendTransaction({ to: SDT_HOLDER, value: ethers.utils.parseEther("10") });
    await deployer.sendTransaction({ to: BOOSTER1, value: ethers.utils.parseEther("10") });
    await deployer.sendTransaction({ to: BOOSTER2, value: ethers.utils.parseEther("10") });
    await deployer.sendTransaction({ to: BOOSTER3, value: ethers.utils.parseEther("10") });

    const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
    startTime = Math.floor((timestamp + WEEK * 10) / WEEK) * WEEK;
    const VeSDTDelegation = await ethers.getContractFactory("VeSDTDelegation", deployer);
    delegation = await VeSDTDelegation.deploy(PROXY);
    await delegation.deployed();
    await delegation.initialize(startTime);

    const holder = await ethers.getSigner(SDT_HOLDER);
    sdt = await ethers.getContractAt("MockERC20", SDT, holder);
    await sdt.transfer(BOOSTER1, ethers.utils.parseEther("100000"));
    await sdt.transfer(BOOSTER2, ethers.utils.parseEther("100000"));
    await sdt.transfer(BOOSTER3, ethers.utils.parseEther("100000"));

    veSDT = await ethers.getContractAt("IStakeDAOVeSDT", VE_SDT, deployer);
    veSDTBoost = await ethers.getContractAt("IStakeDAOBoostDelegation", VESDT_BOOST, deployer);

    booster1 = await ethers.getSigner(BOOSTER1);
    booster2 = await ethers.getSigner(BOOSTER2);
    booster3 = await ethers.getSigner(BOOSTER3);
    await sdt.connect(booster1).approve(veSDT.address, constants.MaxUint256);
    await sdt.connect(booster2).approve(veSDT.address, constants.MaxUint256);
    await sdt.connect(booster3).approve(veSDT.address, constants.MaxUint256);
    await veSDT.connect(booster1).create_lock(ethers.utils.parseEther("100000"), timestamp + 86400 * 365 * 4);
    await veSDT.connect(booster2).create_lock(ethers.utils.parseEther("100000"), timestamp + 86400 * 365 * 4);
    await veSDT.connect(booster3).create_lock(ethers.utils.parseEther("100000"), timestamp + 86400 * 365 * 4);
  });

  context("boost", async () => {
    const power = ethers.utils.parseEther("10000");
    const diff = power.div(1000000);

    it("should succeed when boost by multiple accounts", async () => {
      await veSDTBoost.connect(booster1).approve(delegation.address, constants.MaxUint256);
      await veSDTBoost.connect(booster2).approve(delegation.address, constants.MaxUint256);
      await veSDTBoost.connect(booster3).approve(delegation.address, constants.MaxUint256);
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      const endtime = Math.floor((timestamp + 86400 * 365) / WEEK) * WEEK;

      await expect(delegation.connect(booster1).boost(power, endtime, booster1.address))
        .to.emit(delegation, "Boost")
        .withArgs(booster1.address, booster1.address, power, endtime);
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
      expect(await veSDTBoost.balanceOf(PROXY)).to.closeToBn(power, diff);
      expect(await delegation.totalSupply()).to.closeToBn(power, diff);
      expect(await delegation.balanceOf(booster1.address)).to.closeToBn(power, diff);

      await expect(delegation.connect(booster2).boost(power, endtime, booster2.address))
        .to.emit(delegation, "Boost")
        .withArgs(booster2.address, booster2.address, power, endtime);
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
      expect(await veSDTBoost.balanceOf(PROXY)).to.closeToBn(power.mul(2), diff);
      expect(await delegation.totalSupply()).to.closeToBn(power.mul(2), diff);
      expect(await delegation.balanceOf(booster1.address)).to.closeToBn(power, diff);
      expect(await delegation.balanceOf(booster2.address)).to.closeToBn(power, diff);

      await expect(delegation.connect(booster3).boost(power, endtime, booster3.address))
        .to.emit(delegation, "Boost")
        .withArgs(booster3.address, booster3.address, power, endtime);
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
      expect(await veSDTBoost.balanceOf(PROXY)).to.closeToBn(power.mul(3), diff);
      expect(await delegation.totalSupply()).to.closeToBn(power.mul(3), diff);
      expect(await delegation.balanceOf(booster1.address)).to.closeToBn(power, diff);
      expect(await delegation.balanceOf(booster2.address)).to.closeToBn(power, diff);
      expect(await delegation.balanceOf(booster3.address)).to.closeToBn(power, diff);
    });

    it("should succeed when boost all by multiple accounts", async () => {
      await veSDTBoost.connect(booster1).approve(delegation.address, constants.MaxUint256);
      await veSDTBoost.connect(booster2).approve(delegation.address, constants.MaxUint256);
      await veSDTBoost.connect(booster3).approve(delegation.address, constants.MaxUint256);
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      const endtime = Math.floor((timestamp + 86400 * 365) / WEEK) * WEEK;

      const power = await veSDTBoost.delegable_balance(booster1.address);
      const diff = power.div(1000000);
      await expect(delegation.connect(booster1).boost(constants.MaxUint256, endtime, booster1.address)).to.emit(
        delegation,
        "Boost"
      );
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
      expect(await veSDTBoost.balanceOf(PROXY)).to.closeToBn(power, diff);
      expect(await delegation.totalSupply()).to.closeToBn(power, diff);
      expect(await delegation.balanceOf(booster1.address)).to.closeToBn(power, diff);

      await expect(delegation.connect(booster2).boost(constants.MaxUint256, endtime, booster2.address)).to.emit(
        delegation,
        "Boost"
      );
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
      expect(await veSDTBoost.balanceOf(PROXY)).to.closeToBn(power.mul(2), diff);
      expect(await delegation.totalSupply()).to.closeToBn(power.mul(2), diff);
      expect(await delegation.balanceOf(booster1.address)).to.closeToBn(power, diff);
      expect(await delegation.balanceOf(booster2.address)).to.closeToBn(power, diff);

      await expect(delegation.connect(booster3).boost(constants.MaxUint256, endtime, booster3.address)).to.emit(
        delegation,
        "Boost"
      );
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
      expect(await veSDTBoost.balanceOf(PROXY)).to.closeToBn(power.mul(3), diff);
      expect(await delegation.totalSupply()).to.closeToBn(power.mul(3), diff);
      expect(await delegation.balanceOf(booster1.address)).to.closeToBn(power, diff);
      expect(await delegation.balanceOf(booster2.address)).to.closeToBn(power, diff);
      expect(await delegation.balanceOf(booster3.address)).to.closeToBn(power, diff);
    });

    it("should succeed when boost by multiple accounts and delegate to others", async () => {
      await veSDTBoost.connect(booster1).approve(delegation.address, constants.MaxUint256);
      await veSDTBoost.connect(booster2).approve(delegation.address, constants.MaxUint256);
      await veSDTBoost.connect(booster3).approve(delegation.address, constants.MaxUint256);
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      const endtime = Math.floor((timestamp + 86400 * 365) / WEEK) * WEEK;

      await expect(delegation.connect(booster1).boost(power, endtime, deployer.address))
        .to.emit(delegation, "Boost")
        .withArgs(booster1.address, deployer.address, power, endtime);
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
      expect(await veSDTBoost.balanceOf(PROXY)).to.closeToBn(power, diff);
      expect(await delegation.totalSupply()).to.closeToBn(power, diff);
      expect(await delegation.balanceOf(deployer.address)).to.closeToBn(power, diff);

      await expect(delegation.connect(booster2).boost(power, endtime, deployer.address))
        .to.emit(delegation, "Boost")
        .withArgs(booster2.address, deployer.address, power, endtime);
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
      expect(await veSDTBoost.balanceOf(PROXY)).to.closeToBn(power.mul(2), diff);
      expect(await delegation.totalSupply()).to.closeToBn(power.mul(2), diff);
      expect(await delegation.balanceOf(deployer.address)).to.closeToBn(power.mul(2), diff);

      await expect(delegation.connect(booster3).boost(power, endtime, deployer.address))
        .to.emit(delegation, "Boost")
        .withArgs(booster3.address, deployer.address, power, endtime);
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
      expect(await veSDTBoost.balanceOf(PROXY)).to.closeToBn(power.mul(3), diff);
      expect(await delegation.totalSupply()).to.closeToBn(power.mul(3), diff);
      expect(await delegation.balanceOf(deployer.address)).to.closeToBn(power.mul(3), diff);
    });

    it("should maintain balance correctly", async () => {
      await veSDTBoost.connect(booster1).approve(delegation.address, constants.MaxUint256);
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      const endtime1 = Math.floor((timestamp + 86400 * 60) / WEEK) * WEEK; // 60 days
      const endtime2 = Math.floor((timestamp + 86400 * 90) / WEEK) * WEEK; // 90 days
      const endtime3 = Math.floor((timestamp + 86400 * 120) / WEEK) * WEEK; // 120 days

      await expect(delegation.connect(booster1).boost(power, endtime1, booster1.address))
        .to.emit(delegation, "Boost")
        .withArgs(booster1.address, booster1.address, power, endtime1);
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
      expect(await veSDTBoost.balanceOf(PROXY)).to.closeToBn(power, diff);
      expect(await delegation.totalSupply()).to.closeToBn(power, diff);
      expect(await delegation.balanceOf(booster1.address)).to.closeToBn(power, diff);
      await expect(delegation.connect(booster1).boost(power, endtime2, booster1.address))
        .to.emit(delegation, "Boost")
        .withArgs(booster1.address, booster1.address, power, endtime2);
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
      expect(await veSDTBoost.balanceOf(PROXY)).to.closeToBn(power.mul(2), diff);
      expect(await delegation.totalSupply()).to.closeToBn(power.mul(2), diff);
      expect(await delegation.balanceOf(booster1.address)).to.closeToBn(power.mul(2), diff);

      await expect(delegation.connect(booster1).boost(power, endtime3, booster1.address))
        .to.emit(delegation, "Boost")
        .withArgs(booster1.address, booster1.address, power, endtime3);
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
      expect(await veSDTBoost.balanceOf(PROXY)).to.closeToBn(power.mul(3), diff);
      expect(await delegation.totalSupply()).to.closeToBn(power.mul(3), diff);
      expect(await delegation.balanceOf(booster1.address)).to.closeToBn(power.mul(3), diff);

      const initialPower = await delegation.totalSupply();
      // 1 week passed
      await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp + WEEK]);
      await deployer.sendTransaction({ to: deployer.address });
      {
        let currentPower = initialPower.sub(power.mul(WEEK).div(endtime1 - timestamp));
        currentPower = currentPower.sub(power.mul(WEEK).div(endtime2 - timestamp));
        currentPower = currentPower.sub(power.mul(WEEK).div(endtime3 - timestamp));
        expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
        expect(await veSDTBoost.balanceOf(PROXY)).to.closeToBn(currentPower, currentPower.div(1e6));
        expect(await delegation.totalSupply()).to.closeToBn(currentPower, currentPower.div(1e6));
        expect(await delegation.balanceOf(booster1.address)).to.closeToBn(currentPower, currentPower.div(1e6));
      }

      // another 60 days passed
      await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp + WEEK + 60 * 86400]);
      await deployer.sendTransaction({ to: deployer.address });
      {
        let currentPower = initialPower.sub(power);
        currentPower = currentPower.sub(power.mul(60 * 86400 + WEEK).div(endtime2 - timestamp));
        currentPower = currentPower.sub(power.mul(60 * 86400 + WEEK).div(endtime3 - timestamp));
        expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
        expect(await veSDTBoost.balanceOf(PROXY)).to.closeToBn(currentPower, currentPower.div(1e5));
        expect(await delegation.totalSupply()).to.closeToBn(currentPower, currentPower.div(1e5));
        expect(await delegation.balanceOf(booster1.address)).to.closeToBn(currentPower, currentPower.div(1e5));
      }

      // another 30 days passed
      await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp + WEEK + 90 * 86400]);
      await deployer.sendTransaction({ to: deployer.address });
      {
        let currentPower = initialPower.sub(power);
        currentPower = currentPower.sub(power);
        currentPower = currentPower.sub(power.mul(90 * 86400 + WEEK).div(endtime3 - timestamp));
        expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
        expect(await veSDTBoost.balanceOf(PROXY)).to.closeToBn(currentPower, currentPower.div(1e5));
        expect(await delegation.totalSupply()).to.closeToBn(currentPower, currentPower.div(1e5));
        expect(await delegation.balanceOf(booster1.address)).to.closeToBn(currentPower, currentPower.div(1e5));
      }

      // another 30 days passed
      await hre.network.provider.send("evm_setNextBlockTimestamp", [timestamp + WEEK + 120 * 86400]);
      await deployer.sendTransaction({ to: deployer.address });
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(constants.Zero);
      expect(await delegation.totalSupply()).to.eq(constants.Zero);
      expect(await delegation.balanceOf(booster1.address)).to.eq(constants.Zero);
    });
  });

  context("boostPermit", async () => {
    const signer = new Wallet(PRIVATE_KEY, ethers.provider);
    const power = ethers.utils.parseEther("10000");
    const diff = power.div(1000000);

    beforeEach(async () => {
      await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });
      const holder = await ethers.getSigner(SDT_HOLDER);
      sdt = await ethers.getContractAt("MockERC20", SDT, holder);
      await sdt.transfer(signer.address, ethers.utils.parseEther("20000"));
      await sdt.connect(signer).approve(veSDT.address, constants.MaxUint256);
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      await veSDT.connect(signer).create_lock(ethers.utils.parseEther("20000"), timestamp + 86400 * 365 * 4);
    });

    it("should succeed when boost by permit", async () => {
      const nonce = await veSDTBoost.nonces(signer.address);
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      const deadline = timestamp + 60 * 300;
      const signature = splitSignature(
        await signer._signTypedData(
          {
            name: "Vote-Escrowed Boost",
            version: "v2.0.0",
            chainId: 1,
            verifyingContract: "0x47b3262c96bb55a8d2e4f8e3fed29d2eab6db6e9",
            salt: "0xf15d30f8f5e8e17d67b9e5c645019e48d8b46d429696f303e1075f2f2d35de38",
          },
          {
            Permit: [
              { name: "owner", type: "address" },
              { name: "spender", type: "address" },
              { name: "value", type: "uint256" },
              { name: "nonce", type: "uint256" },
              { name: "deadline", type: "uint256" },
            ],
          },
          {
            owner: signer.address,
            spender: delegation.address,
            value: power,
            nonce: nonce,
            deadline: deadline,
          }
        )
      );

      const endtime = Math.floor((timestamp + 86400 * 365) / WEEK) * WEEK;
      await expect(
        delegation
          .connect(signer)
          .boostPermit(power, endtime, signer.address, deadline, signature.v, signature.r, signature.s)
      )
        .to.emit(delegation, "Boost")
        .withArgs(signer.address, signer.address, power, endtime);
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
      expect(await veSDTBoost.balanceOf(PROXY)).to.closeToBn(power, diff);
      expect(await delegation.totalSupply()).to.closeToBn(power, diff);
      expect(await delegation.balanceOf(signer.address)).to.closeToBn(power, diff);
    });

    it("should succeed when boost all by permit", async () => {
      const nonce = await veSDTBoost.nonces(signer.address);
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      const deadline = timestamp + 60 * 300;
      const signature = splitSignature(
        await signer._signTypedData(
          {
            name: "Vote-Escrowed Boost",
            version: "v2.0.0",
            chainId: 1,
            verifyingContract: "0x47b3262c96bb55a8d2e4f8e3fed29d2eab6db6e9",
            salt: "0xf15d30f8f5e8e17d67b9e5c645019e48d8b46d429696f303e1075f2f2d35de38",
          },
          {
            Permit: [
              { name: "owner", type: "address" },
              { name: "spender", type: "address" },
              { name: "value", type: "uint256" },
              { name: "nonce", type: "uint256" },
              { name: "deadline", type: "uint256" },
            ],
          },
          {
            owner: signer.address,
            spender: delegation.address,
            value: constants.MaxUint256,
            nonce: nonce,
            deadline: deadline,
          }
        )
      );

      const endtime = Math.floor((timestamp + 86400 * 365) / WEEK) * WEEK;
      const power = await veSDTBoost.delegable_balance(signer.address);
      await expect(
        delegation
          .connect(signer)
          .boostPermit(constants.MaxUint256, endtime, signer.address, deadline, signature.v, signature.r, signature.s)
      ).to.emit(delegation, "Boost");
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
      expect(await veSDTBoost.balanceOf(PROXY)).to.closeToBn(power, diff);
      expect(await delegation.totalSupply()).to.closeToBn(power, diff);
      expect(await delegation.balanceOf(signer.address)).to.closeToBn(power, diff);
    });

    it("should succeed when boost by permit and delegate to others", async () => {
      const nonce = await veSDTBoost.nonces(signer.address);
      const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
      const deadline = timestamp + 60 * 300;
      const signature = splitSignature(
        await signer._signTypedData(
          {
            name: "Vote-Escrowed Boost",
            version: "v2.0.0",
            chainId: 1,
            verifyingContract: "0x47b3262c96bb55a8d2e4f8e3fed29d2eab6db6e9",
            salt: "0xf15d30f8f5e8e17d67b9e5c645019e48d8b46d429696f303e1075f2f2d35de38",
          },
          {
            Permit: [
              { name: "owner", type: "address" },
              { name: "spender", type: "address" },
              { name: "value", type: "uint256" },
              { name: "nonce", type: "uint256" },
              { name: "deadline", type: "uint256" },
            ],
          },
          {
            owner: signer.address,
            spender: delegation.address,
            value: power,
            nonce: nonce,
            deadline: deadline,
          }
        )
      );

      const endtime = Math.floor((timestamp + 86400 * 365) / WEEK) * WEEK;
      await expect(
        delegation
          .connect(signer)
          .boostPermit(power, endtime, deployer.address, deadline, signature.v, signature.r, signature.s)
      )
        .to.emit(delegation, "Boost")
        .withArgs(signer.address, deployer.address, power, endtime);
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
      expect(await veSDTBoost.balanceOf(PROXY)).to.closeToBn(power, diff);
      expect(await delegation.totalSupply()).to.closeToBn(power, diff);
      expect(await delegation.balanceOf(deployer.address)).to.closeToBn(power, diff);
    });
  });

  context("claim", async () => {
    it("should revert, when not reach start time", async () => {
      await hre.network.provider.send("evm_setNextBlockTimestamp", [startTime - 10]);
      await expect(delegation.checkpointReward()).to.revertedWith("not start yet");
    });

    it("should revert, when claim from others to others", async () => {
      await expect(delegation.connect(deployer).claim(booster1.address, deployer.address)).to.revertedWith(
        "claim from others to others"
      );
    });

    it("should revert, when claim from zero", async () => {
      await expect(delegation.connect(booster1).claim(constants.AddressZero, constants.AddressZero)).to.revertedWith(
        "claim for zero address"
      );
    });

    it("should succeed when reward start to stream", async () => {
      const power = ethers.utils.parseEther("10000");
      await veSDTBoost.connect(booster1).approve(delegation.address, constants.MaxUint256);
      await veSDTBoost.connect(booster2).approve(delegation.address, constants.MaxUint256);
      await veSDTBoost.connect(booster3).approve(delegation.address, constants.MaxUint256);
      const endtime1 = Math.floor((startTime + 86400 * 63) / WEEK) * WEEK; // 63 days
      const endtime2 = Math.floor((startTime + 86400 * 91) / WEEK) * WEEK; // 91 days
      const endtime3 = Math.floor((startTime + 86400 * 126) / WEEK) * WEEK; // 126 days

      await hre.network.provider.send("evm_setNextBlockTimestamp", [startTime - 3]); // set block time to start time - 3
      await expect(delegation.connect(booster1).boost(power, endtime1, booster1.address))
        .to.emit(delegation, "Boost")
        .withArgs(booster1.address, booster1.address, power, endtime1);
      await hre.network.provider.send("evm_setNextBlockTimestamp", [startTime - 2]); // set block time to start time - 2
      await expect(delegation.connect(booster2).boost(power, endtime2, booster2.address))
        .to.emit(delegation, "Boost")
        .withArgs(booster2.address, booster2.address, power, endtime2);
      await hre.network.provider.send("evm_setNextBlockTimestamp", [startTime - 1]); // set block time to start time - 1
      await expect(delegation.connect(booster3).boost(power, endtime3, booster3.address))
        .to.emit(delegation, "Boost")
        .withArgs(booster3.address, booster3.address, power, endtime3);

      const power1 = power.div(86400 * 63 + 3).mul(86400 * 63 + 3);
      const power2 = power.div(86400 * 91 + 2).mul(86400 * 91 + 2);
      const power3 = power.div(86400 * 126 + 1).mul(86400 * 126 + 1);
      await hre.network.provider.send("evm_setNextBlockTimestamp", [startTime]); // set block time to start time
      await sdt.transfer(delegation.address, ethers.utils.parseEther("100")); // transfer 100 SDT
      await hre.network.provider.send("evm_setNextBlockTimestamp", [startTime + 1]); // set block time to start time + 1
      await expect(delegation.checkpointReward())
        .to.emit(delegation, "CheckpointReward")
        .withArgs(startTime + 1, ethers.utils.parseEther("100"));
      expect((await delegation.lastSDTReward()).balance).to.eq(ethers.utils.parseEther("100"));
      expect((await delegation.lastSDTReward()).timestamp).to.eq(startTime + 1);
      expect(await delegation.weeklyRewards(startTime)).to.eq(ethers.utils.parseEther("100"));
      await delegation.checkpoint(booster1.address);
      let h1 = await delegation.historyBoosts(booster1.address, startTime);
      expect(h1).to.eq(power1.div(86400 * 63 + 3).mul(86400 * 63));
      await delegation.checkpoint(booster2.address);
      let h2 = await delegation.historyBoosts(booster2.address, startTime);
      expect(h2).to.eq(power2.div(86400 * 91 + 2).mul(86400 * 91));
      await delegation.checkpoint(booster3.address);
      let h3 = await delegation.historyBoosts(booster3.address, startTime);
      expect(h3).to.eq(power3.div(86400 * 126 + 1).mul(86400 * 126));
      await delegation.checkpoint(constants.AddressZero);
      expect(await delegation.historyBoosts(constants.AddressZero, startTime)).to.eq(h1.add(h2).add(h3));

      await hre.network.provider.send("evm_setNextBlockTimestamp", [startTime + WEEK - 1]); // set block time to start time + WEEK - 1
      await sdt.transfer(delegation.address, ethers.utils.parseEther("200")); // transfer 100 SDT
      await hre.network.provider.send("evm_setNextBlockTimestamp", [startTime + WEEK + 1]); // set block time to start time + WEEK + 1
      await expect(delegation.checkpointReward())
        .to.emit(delegation, "CheckpointReward")
        .withArgs(startTime + WEEK + 1, ethers.utils.parseEther("200"));
      expect((await delegation.lastSDTReward()).balance).to.eq(ethers.utils.parseEther("300"));
      expect((await delegation.lastSDTReward()).timestamp).to.eq(startTime + WEEK + 1);
      expect(await delegation.weeklyRewards(startTime)).to.eq(
        ethers.utils.parseEther("100").add(
          ethers.utils
            .parseEther("200")
            .mul(WEEK - 1)
            .div(WEEK)
        )
      );
      expect(await delegation.weeklyRewards(startTime + WEEK)).to.eq(ethers.utils.parseEther("200").div(WEEK));

      await delegation.checkpoint(booster1.address);
      h1 = await delegation.historyBoosts(booster1.address, startTime + WEEK);
      expect(h1).to.eq(power1.div(86400 * 63 + 3).mul(86400 * 63 - WEEK));
      await delegation.checkpoint(booster2.address);
      h2 = await delegation.historyBoosts(booster2.address, startTime + WEEK);
      expect(h2).to.eq(power2.div(86400 * 91 + 2).mul(86400 * 91 - WEEK));
      await delegation.checkpoint(booster3.address);
      h3 = await delegation.historyBoosts(booster3.address, startTime + WEEK);
      expect(h3).to.eq(power3.div(86400 * 126 + 1).mul(86400 * 126 - WEEK));
      await delegation.checkpoint(constants.AddressZero);
      expect(await delegation.historyBoosts(constants.AddressZero, startTime + WEEK)).to.eq(h1.add(h2).add(h3));

      let amount1 = (await delegation.weeklyRewards(startTime))
        .mul(await delegation.historyBoosts(booster1.address, startTime))
        .div(await delegation.historyBoosts(constants.AddressZero, startTime));
      let beforeBalance = await sdt.balanceOf(booster1.address);
      await expect(delegation.connect(booster1).claim(booster1.address, booster1.address))
        .to.emit(delegation, "Claim")
        .withArgs(booster1.address, booster1.address, amount1);
      let afterBalance = await sdt.balanceOf(booster1.address);
      expect(afterBalance.sub(beforeBalance)).to.eq(amount1);
      let amount2 = (await delegation.weeklyRewards(startTime))
        .mul(await delegation.historyBoosts(booster2.address, startTime))
        .div(await delegation.historyBoosts(constants.AddressZero, startTime));
      beforeBalance = await sdt.balanceOf(deployer.address);
      await expect(delegation.connect(booster2).claim(booster2.address, deployer.address))
        .to.emit(delegation, "Claim")
        .withArgs(booster2.address, deployer.address, amount2);
      afterBalance = await sdt.balanceOf(deployer.address);
      expect(afterBalance.sub(beforeBalance)).to.eq(amount2);
      let amount3 = (await delegation.weeklyRewards(startTime))
        .mul(await delegation.historyBoosts(booster3.address, startTime))
        .div(await delegation.historyBoosts(constants.AddressZero, startTime));
      beforeBalance = await sdt.balanceOf(booster3.address);
      await expect(delegation.connect(booster3).claim(booster3.address, booster3.address))
        .to.emit(delegation, "Claim")
        .withArgs(booster3.address, booster3.address, amount3);
      afterBalance = await sdt.balanceOf(booster3.address);
      expect(afterBalance.sub(beforeBalance)).to.eq(amount3);

      await hre.network.provider.send("evm_setNextBlockTimestamp", [startTime + WEEK * 2]); // set block time to start time + WEEK * 2
      await expect(delegation.checkpointReward())
        .to.emit(delegation, "CheckpointReward")
        .withArgs(startTime + WEEK * 2, constants.Zero);

      amount1 = (await delegation.weeklyRewards(startTime + WEEK))
        .mul(await delegation.historyBoosts(booster1.address, startTime + WEEK))
        .div(await delegation.historyBoosts(constants.AddressZero, startTime + WEEK));
      beforeBalance = await sdt.balanceOf(booster1.address);
      await expect(delegation.connect(booster1).claim(booster1.address, booster1.address))
        .to.emit(delegation, "Claim")
        .withArgs(booster1.address, booster1.address, amount1);
      afterBalance = await sdt.balanceOf(booster1.address);
      expect(afterBalance.sub(beforeBalance)).to.eq(amount1);
      amount2 = (await delegation.weeklyRewards(startTime + WEEK))
        .mul(await delegation.historyBoosts(booster2.address, startTime + WEEK))
        .div(await delegation.historyBoosts(constants.AddressZero, startTime + WEEK));
      beforeBalance = await sdt.balanceOf(deployer.address);
      await expect(delegation.connect(booster2).claim(booster2.address, deployer.address))
        .to.emit(delegation, "Claim")
        .withArgs(booster2.address, deployer.address, amount2);
      afterBalance = await sdt.balanceOf(deployer.address);
      expect(afterBalance.sub(beforeBalance)).to.eq(amount2);
      amount3 = (await delegation.weeklyRewards(startTime + WEEK))
        .mul(await delegation.historyBoosts(booster3.address, startTime + WEEK))
        .div(await delegation.historyBoosts(constants.AddressZero, startTime + WEEK));
      beforeBalance = await sdt.balanceOf(booster3.address);
      await expect(delegation.connect(booster3).claim(booster3.address, booster3.address))
        .to.emit(delegation, "Claim")
        .withArgs(booster3.address, booster3.address, amount3);
      afterBalance = await sdt.balanceOf(booster3.address);
      expect(afterBalance.sub(beforeBalance)).to.eq(amount3);
    });
  });
});
