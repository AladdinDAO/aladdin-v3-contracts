/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, network } from "hardhat";

import { request_fork } from "@/test/utils";
import { IStakeDAOBoostDelegation, IVotingEscrow, MockERC20, VeSDTDelegation } from "@/types/index";
import { MaxUint256, Signature, Wallet, ZeroAddress, toBigInt } from "ethers";

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
  let deployer: HardhatEthersSigner;
  let booster1: HardhatEthersSigner;
  let booster2: HardhatEthersSigner;
  let booster3: HardhatEthersSigner;

  let delegation: VeSDTDelegation;
  let veSDT: IVotingEscrow;
  let veSDTBoost: IStakeDAOBoostDelegation;
  let sdt: MockERC20;
  let startTime: number;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, SDT_HOLDER, BOOSTER1, BOOSTER2, BOOSTER3]);
    deployer = await ethers.getSigner(DEPLOYER);
    await deployer.sendTransaction({ to: SDT_HOLDER, value: ethers.parseEther("10") });
    await deployer.sendTransaction({ to: BOOSTER1, value: ethers.parseEther("10") });
    await deployer.sendTransaction({ to: BOOSTER2, value: ethers.parseEther("10") });
    await deployer.sendTransaction({ to: BOOSTER3, value: ethers.parseEther("10") });

    const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
    startTime = Math.floor((timestamp + WEEK * 10) / WEEK) * WEEK;
    const VeSDTDelegation = await ethers.getContractFactory("VeSDTDelegation", deployer);
    delegation = await VeSDTDelegation.deploy(PROXY);
    await delegation.initialize(startTime);

    const holder = await ethers.getSigner(SDT_HOLDER);
    sdt = await ethers.getContractAt("MockERC20", SDT, holder);
    await sdt.transfer(BOOSTER1, ethers.parseEther("100000"));
    await sdt.transfer(BOOSTER2, ethers.parseEther("100000"));
    await sdt.transfer(BOOSTER3, ethers.parseEther("100000"));

    veSDT = await ethers.getContractAt("IVotingEscrow", VE_SDT, deployer);
    veSDTBoost = await ethers.getContractAt("IStakeDAOBoostDelegation", VESDT_BOOST, deployer);

    booster1 = await ethers.getSigner(BOOSTER1);
    booster2 = await ethers.getSigner(BOOSTER2);
    booster3 = await ethers.getSigner(BOOSTER3);
    await sdt.connect(booster1).approve(veSDT.getAddress(), MaxUint256);
    await sdt.connect(booster2).approve(veSDT.getAddress(), MaxUint256);
    await sdt.connect(booster3).approve(veSDT.getAddress(), MaxUint256);
    await veSDT.connect(booster1).create_lock(ethers.parseEther("100000"), timestamp + 86400 * 365 * 4);
    await veSDT.connect(booster2).create_lock(ethers.parseEther("100000"), timestamp + 86400 * 365 * 4);
    await veSDT.connect(booster3).create_lock(ethers.parseEther("100000"), timestamp + 86400 * 365 * 4);
  });

  context("boost", async () => {
    const power = ethers.parseEther("10000");
    const diff = power / 1000000n;

    it("should succeed when boost by multiple accounts", async () => {
      await veSDTBoost.connect(booster1).approve(delegation.getAddress(), MaxUint256);
      await veSDTBoost.connect(booster2).approve(delegation.getAddress(), MaxUint256);
      await veSDTBoost.connect(booster3).approve(delegation.getAddress(), MaxUint256);
      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      const endtime = Math.floor((timestamp + 86400 * 365) / WEEK) * WEEK;

      await expect(delegation.connect(booster1).boost(power, endtime, booster1.address))
        .to.emit(delegation, "Boost")
        .withArgs(booster1.address, booster1.address, power, endtime);
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
      expect(await veSDTBoost.balanceOf(PROXY)).to.closeTo(power, diff);
      expect(await delegation.totalSupply()).to.closeTo(power, diff);
      expect(await delegation.balanceOf(booster1.address)).to.closeTo(power, diff);

      await expect(delegation.connect(booster2).boost(power, endtime, booster2.address))
        .to.emit(delegation, "Boost")
        .withArgs(booster2.address, booster2.address, power, endtime);
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
      expect(await veSDTBoost.balanceOf(PROXY)).to.closeTo(power * 2n, diff);
      expect(await delegation.totalSupply()).to.closeTo(power * 2n, diff);
      expect(await delegation.balanceOf(booster1.address)).to.closeTo(power, diff);
      expect(await delegation.balanceOf(booster2.address)).to.closeTo(power, diff);

      await expect(delegation.connect(booster3).boost(power, endtime, booster3.address))
        .to.emit(delegation, "Boost")
        .withArgs(booster3.address, booster3.address, power, endtime);
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
      expect(await veSDTBoost.balanceOf(PROXY)).to.closeTo(power * 3n, diff);
      expect(await delegation.totalSupply()).to.closeTo(power * 3n, diff);
      expect(await delegation.balanceOf(booster1.address)).to.closeTo(power, diff);
      expect(await delegation.balanceOf(booster2.address)).to.closeTo(power, diff);
      expect(await delegation.balanceOf(booster3.address)).to.closeTo(power, diff);
    });

    it("should succeed when boost all by multiple accounts", async () => {
      await veSDTBoost.connect(booster1).approve(delegation.getAddress(), MaxUint256);
      await veSDTBoost.connect(booster2).approve(delegation.getAddress(), MaxUint256);
      await veSDTBoost.connect(booster3).approve(delegation.getAddress(), MaxUint256);
      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      const endtime = Math.floor((timestamp + 86400 * 365) / WEEK) * WEEK;

      const power = await veSDTBoost.delegable_balance(booster1.address);
      const diff = power / 1000000n;
      await expect(delegation.connect(booster1).boost(MaxUint256, endtime, booster1.address)).to.emit(
        delegation,
        "Boost"
      );
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
      expect(await veSDTBoost.balanceOf(PROXY)).to.closeTo(power, diff);
      expect(await delegation.totalSupply()).to.closeTo(power, diff);
      expect(await delegation.balanceOf(booster1.address)).to.closeTo(power, diff);

      await expect(delegation.connect(booster2).boost(MaxUint256, endtime, booster2.address)).to.emit(
        delegation,
        "Boost"
      );
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
      expect(await veSDTBoost.balanceOf(PROXY)).to.closeTo(power * 2n, diff);
      expect(await delegation.totalSupply()).to.closeTo(power * 2n, diff);
      expect(await delegation.balanceOf(booster1.address)).to.closeTo(power, diff);
      expect(await delegation.balanceOf(booster2.address)).to.closeTo(power, diff);

      await expect(delegation.connect(booster3).boost(MaxUint256, endtime, booster3.address)).to.emit(
        delegation,
        "Boost"
      );
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
      expect(await veSDTBoost.balanceOf(PROXY)).to.closeTo(power * 3n, diff);
      expect(await delegation.totalSupply()).to.closeTo(power * 3n, diff);
      expect(await delegation.balanceOf(booster1.address)).to.closeTo(power, diff);
      expect(await delegation.balanceOf(booster2.address)).to.closeTo(power, diff);
      expect(await delegation.balanceOf(booster3.address)).to.closeTo(power, diff);
    });

    it("should succeed when boost by multiple accounts and delegate to others", async () => {
      await veSDTBoost.connect(booster1).approve(delegation.getAddress(), MaxUint256);
      await veSDTBoost.connect(booster2).approve(delegation.getAddress(), MaxUint256);
      await veSDTBoost.connect(booster3).approve(delegation.getAddress(), MaxUint256);
      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      const endtime = Math.floor((timestamp + 86400 * 365) / WEEK) * WEEK;

      await expect(delegation.connect(booster1).boost(power, endtime, deployer.address))
        .to.emit(delegation, "Boost")
        .withArgs(booster1.address, deployer.address, power, endtime);
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
      expect(await veSDTBoost.balanceOf(PROXY)).to.closeTo(power, diff);
      expect(await delegation.totalSupply()).to.closeTo(power, diff);
      expect(await delegation.balanceOf(deployer.address)).to.closeTo(power, diff);

      await expect(delegation.connect(booster2).boost(power, endtime, deployer.address))
        .to.emit(delegation, "Boost")
        .withArgs(booster2.address, deployer.address, power, endtime);
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
      expect(await veSDTBoost.balanceOf(PROXY)).to.closeTo(power * 2n, diff);
      expect(await delegation.totalSupply()).to.closeTo(power * 2n, diff);
      expect(await delegation.balanceOf(deployer.address)).to.closeTo(power * 2n, diff);

      await expect(delegation.connect(booster3).boost(power, endtime, deployer.address))
        .to.emit(delegation, "Boost")
        .withArgs(booster3.address, deployer.address, power, endtime);
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
      expect(await veSDTBoost.balanceOf(PROXY)).to.closeTo(power * 3n, diff);
      expect(await delegation.totalSupply()).to.closeTo(power * 3n, diff);
      expect(await delegation.balanceOf(deployer.address)).to.closeTo(power * 3n, diff);
    });

    it("should maintain balance correctly", async () => {
      await veSDTBoost.connect(booster1).approve(delegation.getAddress(), MaxUint256);
      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      const endtime1 = Math.floor((timestamp + 86400 * 60) / WEEK) * WEEK; // 60 days
      const endtime2 = Math.floor((timestamp + 86400 * 90) / WEEK) * WEEK; // 90 days
      const endtime3 = Math.floor((timestamp + 86400 * 120) / WEEK) * WEEK; // 120 days

      await expect(delegation.connect(booster1).boost(power, endtime1, booster1.address))
        .to.emit(delegation, "Boost")
        .withArgs(booster1.address, booster1.address, power, endtime1);
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
      expect(await veSDTBoost.balanceOf(PROXY)).to.closeTo(power, diff);
      expect(await delegation.totalSupply()).to.closeTo(power, diff);
      expect(await delegation.balanceOf(booster1.address)).to.closeTo(power, diff);
      await expect(delegation.connect(booster1).boost(power, endtime2, booster1.address))
        .to.emit(delegation, "Boost")
        .withArgs(booster1.address, booster1.address, power, endtime2);
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
      expect(await veSDTBoost.balanceOf(PROXY)).to.closeTo(power * 2n, diff);
      expect(await delegation.totalSupply()).to.closeTo(power * 2n, diff);
      expect(await delegation.balanceOf(booster1.address)).to.closeTo(power * 2n, diff);

      await expect(delegation.connect(booster1).boost(power, endtime3, booster1.address))
        .to.emit(delegation, "Boost")
        .withArgs(booster1.address, booster1.address, power, endtime3);
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
      expect(await veSDTBoost.balanceOf(PROXY)).to.closeTo(power * 3n, diff);
      expect(await delegation.totalSupply()).to.closeTo(power * 3n, diff);
      expect(await delegation.balanceOf(booster1.address)).to.closeTo(power * 3n, diff);

      const initialPower = await delegation.totalSupply();
      // 1 week passed
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + WEEK]);
      await deployer.sendTransaction({ to: deployer.address });
      {
        let currentPower = initialPower - (power * toBigInt(WEEK)) / toBigInt(endtime1 - timestamp);
        currentPower = currentPower - (power * toBigInt(WEEK)) / toBigInt(endtime2 - timestamp);
        currentPower = currentPower - (power * toBigInt(WEEK)) / toBigInt(endtime3 - timestamp);
        expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
        expect(await veSDTBoost.balanceOf(PROXY)).to.closeTo(currentPower, currentPower / 1000000n);
        expect(await delegation.totalSupply()).to.closeTo(currentPower, currentPower / 1000000n);
        expect(await delegation.balanceOf(booster1.address)).to.closeTo(currentPower, currentPower / 1000000n);
      }

      // another 60 days passed
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + WEEK + 60 * 86400]);
      await deployer.sendTransaction({ to: deployer.address });
      {
        let currentPower = initialPower - power;
        currentPower = currentPower - (power * toBigInt(60 * 86400 + WEEK)) / toBigInt(endtime2 - timestamp);
        currentPower = currentPower - (power * toBigInt(60 * 86400 + WEEK)) / toBigInt(endtime3 - timestamp);
        expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
        expect(await veSDTBoost.balanceOf(PROXY)).to.closeTo(currentPower, currentPower / 100000n);
        expect(await delegation.totalSupply()).to.closeTo(currentPower, currentPower / 100000n);
        expect(await delegation.balanceOf(booster1.address)).to.closeTo(currentPower, currentPower / 100000n);
      }

      // another 30 days passed
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + WEEK + 90 * 86400]);
      await deployer.sendTransaction({ to: deployer.address });
      {
        let currentPower = initialPower - power;
        currentPower = currentPower - power;
        currentPower = currentPower - (power * toBigInt(90 * 86400 + WEEK)) / toBigInt(endtime3 - timestamp);
        expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
        expect(await veSDTBoost.balanceOf(PROXY)).to.closeTo(currentPower, currentPower / 100000n);
        expect(await delegation.totalSupply()).to.closeTo(currentPower, currentPower / 100000n);
        expect(await delegation.balanceOf(booster1.address)).to.closeTo(currentPower, currentPower / 100000n);
      }

      // another 30 days passed
      await network.provider.send("evm_setNextBlockTimestamp", [timestamp + WEEK + 120 * 86400]);
      await deployer.sendTransaction({ to: deployer.address });
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(0n);
      expect(await delegation.totalSupply()).to.eq(0n);
      expect(await delegation.balanceOf(booster1.address)).to.eq(0n);
    });
  });

  context("boostPermit", async () => {
    const signer = new Wallet(PRIVATE_KEY, ethers.provider);
    const power = ethers.parseEther("10000");
    const diff = power / 1000000n;

    beforeEach(async () => {
      await deployer.sendTransaction({ to: signer.address, value: ethers.parseEther("10") });
      const holder = await ethers.getSigner(SDT_HOLDER);
      sdt = await ethers.getContractAt("MockERC20", SDT, holder);
      await sdt.transfer(signer.address, ethers.parseEther("20000"));
      await sdt.connect(signer).approve(veSDT.getAddress(), MaxUint256);
      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      await veSDT.connect(signer).create_lock(ethers.parseEther("20000"), timestamp + 86400 * 365 * 4);
    });

    it("should succeed when boost by permit", async () => {
      const nonce = await veSDTBoost.nonces(signer.address);
      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      const deadline = timestamp + 60 * 300;
      const signature = Signature.from(
        await signer.signTypedData(
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
            spender: await delegation.getAddress(),
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
      expect(await veSDTBoost.balanceOf(PROXY)).to.closeTo(power, diff);
      expect(await delegation.totalSupply()).to.closeTo(power, diff);
      expect(await delegation.balanceOf(signer.address)).to.closeTo(power, diff);
    });

    it("should succeed when boost all by permit", async () => {
      const nonce = await veSDTBoost.nonces(signer.address);
      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      const deadline = timestamp + 60 * 300;
      const signature = Signature.from(
        await signer.signTypedData(
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
            spender: await delegation.getAddress(),
            value: MaxUint256,
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
          .boostPermit(MaxUint256, endtime, signer.address, deadline, signature.v, signature.r, signature.s)
      ).to.emit(delegation, "Boost");
      expect(await veSDTBoost.balanceOf(PROXY)).to.eq(await delegation.totalSupply());
      expect(await veSDTBoost.balanceOf(PROXY)).to.closeTo(power, diff);
      expect(await delegation.totalSupply()).to.closeTo(power, diff);
      expect(await delegation.balanceOf(signer.address)).to.closeTo(power, diff);
    });

    it("should succeed when boost by permit and delegate to others", async () => {
      const nonce = await veSDTBoost.nonces(signer.address);
      const timestamp = (await ethers.provider.getBlock("latest"))!.timestamp;
      const deadline = timestamp + 60 * 300;
      const signature = Signature.from(
        await signer.signTypedData(
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
            spender: await delegation.getAddress(),
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
      expect(await veSDTBoost.balanceOf(PROXY)).to.closeTo(power, diff);
      expect(await delegation.totalSupply()).to.closeTo(power, diff);
      expect(await delegation.balanceOf(deployer.address)).to.closeTo(power, diff);
    });
  });

  context("claim", async () => {
    it("should revert, when not reach start time", async () => {
      await network.provider.send("evm_setNextBlockTimestamp", [startTime - 10]);
      await expect(delegation.checkpointReward()).to.revertedWith("not start yet");
    });

    it("should revert, when claim from others to others", async () => {
      await expect(delegation.connect(deployer).claim(booster1.address, deployer.address)).to.revertedWith(
        "claim from others to others"
      );
    });

    it("should revert, when claim from zero", async () => {
      await expect(delegation.connect(booster1).claim(ZeroAddress, ZeroAddress)).to.revertedWith(
        "claim for zero address"
      );
    });

    it("should succeed when reward start to stream", async () => {
      const power = ethers.parseEther("10000");
      await veSDTBoost.connect(booster1).approve(delegation.getAddress(), MaxUint256);
      await veSDTBoost.connect(booster2).approve(delegation.getAddress(), MaxUint256);
      await veSDTBoost.connect(booster3).approve(delegation.getAddress(), MaxUint256);
      const endtime1 = Math.floor((startTime + 86400 * 63) / WEEK) * WEEK; // 63 days
      const endtime2 = Math.floor((startTime + 86400 * 91) / WEEK) * WEEK; // 91 days
      const endtime3 = Math.floor((startTime + 86400 * 126) / WEEK) * WEEK; // 126 days

      await network.provider.send("evm_setNextBlockTimestamp", [startTime - 3]); // set block time to start time - 3
      await expect(delegation.connect(booster1).boost(power, endtime1, booster1.address))
        .to.emit(delegation, "Boost")
        .withArgs(booster1.address, booster1.address, power, endtime1);
      await network.provider.send("evm_setNextBlockTimestamp", [startTime - 2]); // set block time to start time - 2
      await expect(delegation.connect(booster2).boost(power, endtime2, booster2.address))
        .to.emit(delegation, "Boost")
        .withArgs(booster2.address, booster2.address, power, endtime2);
      await network.provider.send("evm_setNextBlockTimestamp", [startTime - 1]); // set block time to start time - 1
      await expect(delegation.connect(booster3).boost(power, endtime3, booster3.address))
        .to.emit(delegation, "Boost")
        .withArgs(booster3.address, booster3.address, power, endtime3);

      const power1 = (power / toBigInt(86400 * 63 + 3)) * toBigInt(86400 * 63 + 3);
      const power2 = (power / toBigInt(86400 * 91 + 2)) * toBigInt(86400 * 91 + 2);
      const power3 = (power / toBigInt(86400 * 126 + 1)) * toBigInt(86400 * 126 + 1);
      await network.provider.send("evm_setNextBlockTimestamp", [startTime]); // set block time to start time
      await sdt.transfer(delegation.getAddress(), ethers.parseEther("100")); // transfer 100 SDT
      await network.provider.send("evm_setNextBlockTimestamp", [startTime + 1]); // set block time to start time + 1
      await expect(delegation.checkpointReward())
        .to.emit(delegation, "CheckpointReward")
        .withArgs(startTime + 1, ethers.parseEther("100"));
      expect((await delegation.lastSDTReward()).balance).to.eq(ethers.parseEther("100"));
      expect((await delegation.lastSDTReward()).timestamp).to.eq(startTime + 1);
      expect(await delegation.weeklyRewards(startTime)).to.eq(ethers.parseEther("100"));
      await delegation.checkpoint(booster1.address);
      let h1 = await delegation.historyBoosts(booster1.address, startTime);
      expect(h1).to.eq((power1 / toBigInt(86400 * 63 + 3)) * toBigInt(86400 * 63));
      await delegation.checkpoint(booster2.address);
      let h2 = await delegation.historyBoosts(booster2.address, startTime);
      expect(h2).to.eq((power2 / toBigInt(86400 * 91 + 2)) * toBigInt(86400 * 91));
      await delegation.checkpoint(booster3.address);
      let h3 = await delegation.historyBoosts(booster3.address, startTime);
      expect(h3).to.eq((power3 / toBigInt(86400 * 126 + 1)) * toBigInt(86400 * 126));
      await delegation.checkpoint(ZeroAddress);
      expect(await delegation.historyBoosts(ZeroAddress, startTime)).to.eq(h1 + h2 + h3);

      await network.provider.send("evm_setNextBlockTimestamp", [startTime + WEEK - 1]); // set block time to start time + WEEK - 1
      await sdt.transfer(delegation.getAddress(), ethers.parseEther("200")); // transfer 100 SDT
      await network.provider.send("evm_setNextBlockTimestamp", [startTime + WEEK + 1]); // set block time to start time + WEEK + 1
      await expect(delegation.checkpointReward())
        .to.emit(delegation, "CheckpointReward")
        .withArgs(startTime + WEEK + 1, ethers.parseEther("200"));
      expect((await delegation.lastSDTReward()).balance).to.eq(ethers.parseEther("300"));
      expect((await delegation.lastSDTReward()).timestamp).to.eq(startTime + WEEK + 1);
      expect(await delegation.weeklyRewards(startTime)).to.eq(
        ethers.parseEther("100") + (ethers.parseEther("200") * toBigInt(WEEK - 1)) / toBigInt(WEEK)
      );
      expect(await delegation.weeklyRewards(startTime + WEEK)).to.eq(ethers.parseEther("200") / toBigInt(WEEK));

      await delegation.checkpoint(booster1.address);
      h1 = await delegation.historyBoosts(booster1.address, startTime + WEEK);
      expect(h1).to.eq((power1 / toBigInt(86400 * 63 + 3)) * toBigInt(86400 * 63 - WEEK));
      await delegation.checkpoint(booster2.address);
      h2 = await delegation.historyBoosts(booster2.address, startTime + WEEK);
      expect(h2).to.eq((power2 / toBigInt(86400 * 91 + 2)) * toBigInt(86400 * 91 - WEEK));
      await delegation.checkpoint(booster3.address);
      h3 = await delegation.historyBoosts(booster3.address, startTime + WEEK);
      expect(h3).to.eq((power3 / toBigInt(86400 * 126 + 1)) * toBigInt(86400 * 126 - WEEK));
      await delegation.checkpoint(ZeroAddress);
      expect(await delegation.historyBoosts(ZeroAddress, startTime + WEEK)).to.eq(h1 + h2 + h3);

      let amount1 =
        ((await delegation.weeklyRewards(startTime)) * (await delegation.historyBoosts(booster1.address, startTime))) /
        (await delegation.historyBoosts(ZeroAddress, startTime));
      let beforeBalance = await sdt.balanceOf(booster1.address);
      await expect(delegation.connect(booster1).claim(booster1.address, booster1.address))
        .to.emit(delegation, "Claim")
        .withArgs(booster1.address, booster1.address, amount1);
      let afterBalance = await sdt.balanceOf(booster1.address);
      expect(afterBalance - beforeBalance).to.eq(amount1);
      let amount2 =
        ((await delegation.weeklyRewards(startTime)) * (await delegation.historyBoosts(booster2.address, startTime))) /
        (await delegation.historyBoosts(ZeroAddress, startTime));
      beforeBalance = await sdt.balanceOf(deployer.address);
      await expect(delegation.connect(booster2).claim(booster2.address, deployer.address))
        .to.emit(delegation, "Claim")
        .withArgs(booster2.address, deployer.address, amount2);
      afterBalance = await sdt.balanceOf(deployer.address);
      expect(afterBalance - beforeBalance).to.eq(amount2);
      let amount3 =
        ((await delegation.weeklyRewards(startTime)) * (await delegation.historyBoosts(booster3.address, startTime))) /
        (await delegation.historyBoosts(ZeroAddress, startTime));
      beforeBalance = await sdt.balanceOf(booster3.address);
      await expect(delegation.connect(booster3).claim(booster3.address, booster3.address))
        .to.emit(delegation, "Claim")
        .withArgs(booster3.address, booster3.address, amount3);
      afterBalance = await sdt.balanceOf(booster3.address);
      expect(afterBalance - beforeBalance).to.eq(amount3);

      await network.provider.send("evm_setNextBlockTimestamp", [startTime + WEEK * 2]); // set block time to start time + WEEK * 2
      await expect(delegation.checkpointReward())
        .to.emit(delegation, "CheckpointReward")
        .withArgs(startTime + WEEK * 2, 0n);

      amount1 =
        ((await delegation.weeklyRewards(startTime + WEEK)) *
          (await delegation.historyBoosts(booster1.address, startTime + WEEK))) /
        (await delegation.historyBoosts(ZeroAddress, startTime + WEEK));
      beforeBalance = await sdt.balanceOf(booster1.address);
      await expect(delegation.connect(booster1).claim(booster1.address, booster1.address))
        .to.emit(delegation, "Claim")
        .withArgs(booster1.address, booster1.address, amount1);
      afterBalance = await sdt.balanceOf(booster1.address);
      expect(afterBalance - beforeBalance).to.eq(amount1);
      amount2 =
        ((await delegation.weeklyRewards(startTime + WEEK)) *
          (await delegation.historyBoosts(booster2.address, startTime + WEEK))) /
        (await delegation.historyBoosts(ZeroAddress, startTime + WEEK));
      beforeBalance = await sdt.balanceOf(deployer.address);
      await expect(delegation.connect(booster2).claim(booster2.address, deployer.address))
        .to.emit(delegation, "Claim")
        .withArgs(booster2.address, deployer.address, amount2);
      afterBalance = await sdt.balanceOf(deployer.address);
      expect(afterBalance - beforeBalance).to.eq(amount2);
      amount3 =
        ((await delegation.weeklyRewards(startTime + WEEK)) *
          (await delegation.historyBoosts(booster3.address, startTime + WEEK))) /
        (await delegation.historyBoosts(ZeroAddress, startTime + WEEK));
      beforeBalance = await sdt.balanceOf(booster3.address);
      await expect(delegation.connect(booster3).claim(booster3.address, booster3.address))
        .to.emit(delegation, "Claim")
        .withArgs(booster3.address, booster3.address, amount3);
      afterBalance = await sdt.balanceOf(booster3.address);
      expect(afterBalance - beforeBalance).to.eq(amount3);
    });
  });
});
