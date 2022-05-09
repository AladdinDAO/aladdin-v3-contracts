/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { CLeverToken, IERC20, TokenSale, Vesting } from "../typechain";
import { Action, encodePoolHintV2, PoolType, request_fork } from "./utils";
import { ethers, network } from "hardhat";
import { expect } from "chai";
import { constants } from "ethers";
import { ADDRESS } from "../scripts/config";

const FORK_BLOCK_NUMBER = 14648084;
const FORK_TIMESTAMP = 1650812105;

const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const WETH_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const USDC_HOLDER = "0xE78388b4CE79068e89Bf8aA7f218eF6b9AB0e9d0";
const CVX = "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B";

describe("TokenSale.spec", async () => {
  let deployer: SignerWithAddress;
  let signerWETH: SignerWithAddress;
  let signerUSDC: SignerWithAddress;
  let token: CLeverToken;
  let weth: IERC20;
  let usdc: IERC20;
  let sale: TokenSale;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, WETH_HOLDER, USDC_HOLDER]);
    deployer = await ethers.getSigner(DEPLOYER);
    signerWETH = await ethers.getSigner(WETH_HOLDER);
    signerUSDC = await ethers.getSigner(USDC_HOLDER);

    await deployer.sendTransaction({ to: signerWETH.address, value: ethers.utils.parseEther("10") });
    await deployer.sendTransaction({ to: signerUSDC.address, value: ethers.utils.parseEther("10") });

    const CLeverToken = await ethers.getContractFactory("CLeverToken", deployer);
    token = (await CLeverToken.deploy("CLever", "CLEV")) as CLeverToken;
    await token.deployed();

    weth = await ethers.getContractAt("IERC20", WETH, signerWETH);
    usdc = await ethers.getContractAt("IERC20", USDC, signerUSDC);

    await token.updateMinters([deployer.address], true);
    await token.updateCeiling(deployer.address, ethers.utils.parseEther("10000000"));

    const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
    const zap = await AladdinZap.deploy();
    await zap.deployed();
    await zap.initialize();

    await zap.updateRoute(USDC, WETH, [
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 0, 1, Action.Swap),
    ]);
    await zap.updateRoute(WETH, USDC, [
      encodePoolHintV2(ADDRESS.USDC_WETH_UNIV3, PoolType.UniswapV3, 2, 1, 0, Action.Swap),
    ]);

    const TokenSale = await ethers.getContractFactory("TokenSale", deployer);
    sale = await TokenSale.deploy(WETH, token.address, WETH, zap.address, ethers.utils.parseEther("1000000"));
    await sale.updateSaleTime(FORK_TIMESTAMP + 86400, FORK_TIMESTAMP + 86400 * 2, 432000);
    await sale.updatePrice(
      ethers.utils.parseEther("0.001"),
      ethers.utils.parseUnits("0.05", 9),
      ethers.utils.parseEther("100000")
    );
    await sale.updateSupportedTokens([WETH, USDC, constants.AddressZero], true);
  });

  context("sale", async () => {
    it("should calculate price correctly", async () => {
      await weth.approve(sale.address, constants.MaxUint256);
      // public sale start
      await network.provider.send("evm_setNextBlockTimestamp", [FORK_TIMESTAMP + 86400 * 2]);
      // buy 10000 CLEV
      await sale.connect(signerWETH).buy(WETH, ethers.utils.parseEther("10"), 0);
      expect(await sale.getPrice()).to.eq(ethers.utils.parseEther("0.001"));
      // buy another 90000 CLEV
      await sale.connect(signerWETH).buy(WETH, ethers.utils.parseEther("90"), 0);
      expect(await sale.getPrice()).to.eq(ethers.utils.parseEther("0.00105"));
      // buy another 100000 CLEV
      await sale.connect(signerWETH).buy(WETH, ethers.utils.parseEther("105"), 0);
      expect(await sale.getPrice()).to.eq(ethers.utils.parseEther("0.0011"));
    });

    it("should revert, when input amount is zero", async () => {
      await expect(sale.buy(constants.AddressZero, 0, 0)).to.revertedWith("TokenSale: zero input amount");
    });

    it("should revert, when token not supported", async () => {
      await expect(sale.buy(CVX, 1, 0)).to.revertedWith("TokenSale: token not support");
    });

    it("should revert, when sale not start", async () => {
      await expect(sale.buy(WETH, 1, 0)).to.revertedWith("TokenSale: sale not start");
    });

    it("should revert, when sale ended", async () => {
      await network.provider.send("evm_setNextBlockTimestamp", [FORK_TIMESTAMP + 86400 * 2 + 432000 + 1]);
      await expect(sale.buy(WETH, 1, 0)).to.revertedWith("TokenSale: sale ended");
    });

    it("should revert, when sold out", async () => {
      await weth.approve(sale.address, constants.MaxUint256);
      // public sale start
      await network.provider.send("evm_setNextBlockTimestamp", [FORK_TIMESTAMP + 86400 * 2]);
      await sale.connect(signerWETH).buy(WETH, ethers.utils.parseEther("1000"), 0);

      await expect(sale.connect(signerWETH).buy(WETH, 1, 0)).to.revertedWith("TokenSale: sold out");
    });

    it("should revert, when pass invalid msg.value", async () => {
      // public sale start
      await network.provider.send("evm_setNextBlockTimestamp", [FORK_TIMESTAMP + 86400 * 2]);
      await expect(sale.buy(constants.AddressZero, ethers.utils.parseEther("1000"), 0)).to.revertedWith(
        "TokenSale: msg.value mismatch"
      );
      await expect(
        sale.buy(constants.AddressZero, ethers.utils.parseEther("1000"), 0, { value: ethers.utils.parseEther("1") })
      ).to.revertedWith("TokenSale: msg.value mismatch");
      await weth.approve(sale.address, constants.MaxUint256);
      await expect(
        sale.connect(signerWETH).buy(WETH, ethers.utils.parseEther("1000"), 0, { value: ethers.utils.parseEther("1") })
      ).to.revertedWith("TokenSale: nonzero msg.value");
    });

    context("whitelist sale", async () => {
      let alice: SignerWithAddress;

      beforeEach(async () => {
        [alice] = await ethers.getSigners();

        // whitelist sale start
        await network.provider.send("evm_setNextBlockTimestamp", [FORK_TIMESTAMP + 86400]);

        await sale.updateWhitelistCap(
          [deployer.address, signerWETH.address, signerUSDC.address],
          [ethers.utils.parseEther("10000"), ethers.utils.parseEther("10000"), ethers.utils.parseEther("10000")]
        );
      });

      it("should revert, when output is not enough", async () => {
        await expect(
          sale.buy(constants.AddressZero, ethers.utils.parseEther("2"), ethers.utils.parseEther("2000").add(1), {
            value: ethers.utils.parseEther("2"),
          })
        ).to.revertedWith("TokenSale: insufficient output");
      });

      it("should revert, when user has no cap", async () => {
        await expect(
          sale
            .connect(alice)
            .buy(constants.AddressZero, ethers.utils.parseEther("1"), 0, { value: ethers.utils.parseEther("1") })
        ).to.revertedWith("TokenSale: no cap to buy");
      });

      it("should succeed, when buy with ETH", async () => {
        expect(await sale.shares(deployer.address)).to.eq(ethers.utils.parseEther("0"));
        await sale.buy(constants.AddressZero, ethers.utils.parseEther("2"), ethers.utils.parseEther("2000"), {
          value: ethers.utils.parseEther("2"),
        });
        expect(await sale.shares(deployer.address)).to.eq(ethers.utils.parseEther("2000"));
      });

      it("should succeed, when buy with WETH", async () => {
        expect(await sale.shares(deployer.address)).to.eq(ethers.utils.parseEther("0"));
        await weth.approve(sale.address, constants.MaxUint256);
        await sale.connect(signerWETH).buy(WETH, ethers.utils.parseEther("2"), ethers.utils.parseEther("2000"));
        expect(await sale.shares(signerWETH.address)).to.eq(ethers.utils.parseEther("2000"));
      });

      it("should succeed, when buy with USDC", async () => {
        expect(await sale.shares(deployer.address)).to.eq(ethers.utils.parseEther("0"));
        await usdc.approve(sale.address, constants.MaxUint256);
        const output = await sale
          .connect(signerUSDC)
          .callStatic.buy(USDC, ethers.utils.parseUnits("6000", 6), ethers.utils.parseEther("0"));
        expect(output).to.eq(ethers.utils.parseEther("2031.252853742857962000"));
        await sale
          .connect(signerUSDC)
          .buy(USDC, ethers.utils.parseUnits("6000", 6), ethers.utils.parseEther("2031.252853742857962000"));
        expect(await sale.shares(signerWETH.address)).to.eq(ethers.utils.parseEther("2031.252853742857962000"));
      });

      it("should succeed to refund, when buy with ETH", async () => {
        expect(await sale.shares(deployer.address)).to.eq(ethers.utils.parseEther("0"));
        const balanceBefore = await deployer.getBalance();
        const tx = await sale.buy(
          constants.AddressZero,
          ethers.utils.parseEther("11"),
          ethers.utils.parseEther("10000"),
          {
            value: ethers.utils.parseEther("11"),
          }
        );
        const receipt = await tx.wait();
        const balanceAfter = await deployer.getBalance();
        expect(await sale.shares(deployer.address)).to.eq(ethers.utils.parseEther("10000"));
        // refund 1 ETH
        expect(balanceBefore.sub(balanceAfter).sub(receipt.gasUsed.mul(receipt.effectiveGasPrice))).to.eq(
          ethers.utils.parseEther("10")
        );
      });

      it("should succeed to refund, when buy with WETH", async () => {
        expect(await sale.shares(deployer.address)).to.eq(ethers.utils.parseEther("0"));
        await weth.approve(sale.address, constants.MaxUint256);
        const balanceBefore = await weth.balanceOf(signerWETH.address);
        await sale.connect(signerWETH).buy(WETH, ethers.utils.parseEther("11"), ethers.utils.parseEther("10000"));
        const balanceAfter = await weth.balanceOf(signerWETH.address);
        expect(await sale.shares(signerWETH.address)).to.eq(ethers.utils.parseEther("10000"));
        expect(balanceBefore.sub(balanceAfter)).to.eq(ethers.utils.parseEther("10"));
      });

      it("should succeed to refund, when buy with USDC", async () => {
        expect(await sale.shares(deployer.address)).to.eq(ethers.utils.parseEther("0"));
        await usdc.approve(sale.address, constants.MaxUint256);
        const output = await sale
          .connect(signerUSDC)
          .callStatic.buy(USDC, ethers.utils.parseUnits("33000", 6), ethers.utils.parseEther("0"));
        expect(output).to.eq(ethers.utils.parseEther("10000"));
        const balanceBefore = await usdc.balanceOf(signerUSDC.address);
        await sale.connect(signerUSDC).buy(USDC, ethers.utils.parseUnits("33000", 6), ethers.utils.parseEther("10000"));
        const balanceAfter = await usdc.balanceOf(signerUSDC.address);
        expect(await sale.shares(signerWETH.address)).to.eq(ethers.utils.parseEther("10000"));
        expect(balanceBefore.sub(balanceAfter)).to.eq(ethers.utils.parseUnits("29542.586553", 6)); // about 10 ETH
      });
    });

    context("public sale", async () => {
      beforeEach(async () => {
        // public sale start
        await network.provider.send("evm_setNextBlockTimestamp", [FORK_TIMESTAMP + 86400 * 2]);
      });

      it("should revert, when output is not enough", async () => {
        await expect(
          sale.buy(constants.AddressZero, ethers.utils.parseEther("2"), ethers.utils.parseEther("2000").add(1), {
            value: ethers.utils.parseEther("2"),
          })
        ).to.revertedWith("TokenSale: insufficient output");
      });

      it("should succeed, when buy with ETH", async () => {
        expect(await sale.shares(deployer.address)).to.eq(ethers.utils.parseEther("0"));
        await sale.buy(constants.AddressZero, ethers.utils.parseEther("2"), ethers.utils.parseEther("2000"), {
          value: ethers.utils.parseEther("2"),
        });
        expect(await sale.shares(deployer.address)).to.eq(ethers.utils.parseEther("2000"));
      });

      it("should succeed, when buy with WETH", async () => {
        expect(await sale.shares(deployer.address)).to.eq(ethers.utils.parseEther("0"));
        await weth.approve(sale.address, constants.MaxUint256);
        await sale.connect(signerWETH).buy(WETH, ethers.utils.parseEther("2"), ethers.utils.parseEther("2000"));
        expect(await sale.shares(signerWETH.address)).to.eq(ethers.utils.parseEther("2000"));
      });

      it("should succeed, when buy with USDC", async () => {
        expect(await sale.shares(deployer.address)).to.eq(ethers.utils.parseEther("0"));
        await usdc.approve(sale.address, constants.MaxUint256);
        const output = await sale
          .connect(signerUSDC)
          .callStatic.buy(USDC, ethers.utils.parseUnits("6000", 6), ethers.utils.parseEther("0"));
        expect(output).to.eq(ethers.utils.parseEther("2031.252853742857962000"));
        await sale
          .connect(signerUSDC)
          .buy(USDC, ethers.utils.parseUnits("6000", 6), ethers.utils.parseEther("2031.252853742857962000"));
        expect(await sale.shares(signerWETH.address)).to.eq(ethers.utils.parseEther("2031.252853742857962000"));
      });
    });
  });

  context("claim/vest", async () => {
    let alice: SignerWithAddress;
    let vest: Vesting;

    beforeEach(async () => {
      [alice] = await ethers.getSigners();

      const Vesting = await ethers.getContractFactory("Vesting", deployer);
      vest = await Vesting.deploy(token.address);
      await vest.deployed();
      await vest.transferOwnership(sale.address);

      await sale.updateVesting(vest.address, ethers.utils.parseUnits("0.5", 9), 86400 * 1000);
      await sale.updateSupportedTokens([constants.AddressZero], true);

      await token.mint(sale.address, ethers.utils.parseEther("10000"));

      // public sale start
      await network.provider.send("evm_setNextBlockTimestamp", [FORK_TIMESTAMP + 86400 * 2]);
      await sale.buy(constants.AddressZero, ethers.utils.parseEther("10"), 0, { value: ethers.utils.parseEther("10") });
      expect(await sale.shares(deployer.address)).to.eq(ethers.utils.parseEther("10000"));
      await weth.approve(sale.address, constants.MaxUint256);
      await sale.connect(signerWETH).buy(WETH, ethers.utils.parseEther("20"), 0);
    });

    it("should succeed, when owner withdraw fund", async () => {
      const wethBefore = await weth.balanceOf(alice.address);
      await sale.withdrawFund([constants.AddressZero, WETH], alice.address);
      const wethAfter = await weth.balanceOf(alice.address);

      expect(wethAfter.sub(wethBefore)).to.eq(ethers.utils.parseEther("30"));
    });

    it("should revert, when claim before safe ends", async () => {
      await expect(sale.claim()).to.revertedWith("TokenSale: sale not end");
    });

    it("should revert, when claim after claim", async () => {
      // public sale start
      await network.provider.send("evm_setNextBlockTimestamp", [FORK_TIMESTAMP + 86400 * 2 + 432000 + 1]);
      await sale.claim();
      await expect(sale.claim()).to.revertedWith("TokenSale: already claimed");
    });

    it("should revert, when nothing to claim", async () => {
      const [alice] = await ethers.getSigners();
      // public sale start
      await network.provider.send("evm_setNextBlockTimestamp", [FORK_TIMESTAMP + 86400 * 2 + 432000 + 1]);
      await expect(sale.connect(alice).claim()).to.revertedWith("TokenSale: no share to claim");
    });

    it("should succeed, when claim half, vest half", async () => {
      // public sale start
      await network.provider.send("evm_setNextBlockTimestamp", [FORK_TIMESTAMP + 86400 * 2 + 432000 + 1]);
      await sale.claim();
      expect(await sale.claimed(deployer.address)).to.eq(true);
      expect(await token.balanceOf(deployer.address)).to.eq(ethers.utils.parseEther("5000"));
      expect((await vest.vesting(deployer.address)).vestedAmount).to.eq(ethers.utils.parseEther("5000"));
      expect((await vest.vesting(deployer.address)).startTime).to.eq(FORK_TIMESTAMP + 86400 * 2 + 432000 + 1);
      expect((await vest.vesting(deployer.address)).endTime).to.eq(
        FORK_TIMESTAMP + 86400 * 2 + 432000 + 1 + 86400 * 1000
      );
    });
  });
});
