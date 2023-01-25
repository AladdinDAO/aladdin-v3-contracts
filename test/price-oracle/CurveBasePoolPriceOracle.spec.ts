/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { TOKENS } from "../../scripts/utils";
import { ChainlinkPriceOracle, CurveBasePoolPriceOracle } from "../../typechain";
import { request_fork } from "../utils";

const FORK_HEIGHT = 16485890;
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const OTHER = "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8";

describe("CurveBasePoolPriceOracle.spec", async () => {
  let deployer: SignerWithAddress;
  let other: SignerWithAddress;
  let baseOracle: ChainlinkPriceOracle;
  let oracle: CurveBasePoolPriceOracle;

  beforeEach(async () => {
    request_fork(FORK_HEIGHT, [DEPLOYER, OTHER]);
    deployer = await ethers.getSigner(DEPLOYER);
    other = await ethers.getSigner(OTHER);

    const ChainlinkPriceOracle = await ethers.getContractFactory("ChainlinkPriceOracle", deployer);
    baseOracle = await ChainlinkPriceOracle.deploy();
    await baseOracle.deployed();

    const CurveBasePoolPriceOracle = await ethers.getContractFactory("CurveBasePoolPriceOracle", deployer);
    oracle = await CurveBasePoolPriceOracle.deploy(baseOracle.address);
    await oracle.deployed();

    await baseOracle.setFeeds([TOKENS.USDC.address], ["0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6"]);
    await baseOracle.setFeeds([TOKENS.USDT.address], ["0x3E7d1eAB13ad0104d2750B8863b489D65364e32D"]);
    await baseOracle.setFeeds([TOKENS.DAI.address], ["0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9"]);
    await baseOracle.setFeeds([TOKENS.FRAX.address], ["0xB9E1E3A9feFf48998E45Fa90847ed4D467E8BcfD"]);
  });

  context("auth", async () => {
    it("should revert, when non-owner call", async () => {
      await expect(oracle.connect(other).setPools([], [])).to.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert, when length mismatch", async () => {
      await expect(oracle.setPools([], [constants.AddressZero])).to.revertedWith("length mismatch");
      await expect(oracle.setPools([constants.AddressZero], [])).to.revertedWith("length mismatch");
    });

    it("should succeed", async () => {
      expect(await oracle.pools(TOKENS.TRICRV.address)).to.eq(constants.AddressZero);
      expect(await oracle.pools(TOKENS.crvFRAX.address)).to.eq(constants.AddressZero);
      await expect(oracle.underlyings(TOKENS.TRICRV.address, 0)).to.reverted;
      await expect(oracle.underlyings(TOKENS.crvFRAX.address, 0)).to.reverted;
      await oracle.setPools(
        [TOKENS.TRICRV.address, TOKENS.crvFRAX.address],
        ["0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7", "0xDcEF968d416a41Cdac0ED8702fAC8128A64241A2"]
      );
      expect(await oracle.pools(TOKENS.TRICRV.address)).to.eq("0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7");
      expect(await oracle.pools(TOKENS.crvFRAX.address)).to.eq("0xDcEF968d416a41Cdac0ED8702fAC8128A64241A2");
      await expect(oracle.underlyings(TOKENS.TRICRV.address, 3)).to.reverted;
      expect(await oracle.underlyings(TOKENS.TRICRV.address, 0)).to.eq(TOKENS.DAI.address);
      expect(await oracle.underlyings(TOKENS.TRICRV.address, 1)).to.eq(TOKENS.USDC.address);
      expect(await oracle.underlyings(TOKENS.TRICRV.address, 2)).to.eq(TOKENS.USDT.address);
      await expect(oracle.underlyings(TOKENS.crvFRAX.address, 2)).to.reverted;
      expect(await oracle.underlyings(TOKENS.crvFRAX.address, 0)).to.eq(TOKENS.FRAX.address);
      expect(await oracle.underlyings(TOKENS.crvFRAX.address, 1)).to.eq(TOKENS.USDC.address);
    });
  });

  context("price", async () => {
    beforeEach(async () => {
      await oracle.setPools(
        [TOKENS.TRICRV.address, TOKENS.crvFRAX.address],
        ["0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7", "0xDcEF968d416a41Cdac0ED8702fAC8128A64241A2"]
      );
    });

    it("should succeed", async () => {
      console.log("3CRV", ethers.utils.formatEther(await oracle.price(TOKENS.TRICRV.address)));
      console.log("crvFRAX", ethers.utils.formatEther(await oracle.price(TOKENS.crvFRAX.address)));
    });
  });
});
