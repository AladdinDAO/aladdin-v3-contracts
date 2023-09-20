/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, network } from "hardhat";
import {
  ConvexFraxCompounderBurner,
  PlatformFeeBurner,
  PlatformFeeSpliter,
  StakeDAOCompounderBurner,
} from "../../typechain";
import { request_fork } from "../utils";
import { ADDRESS, Action, DEPLOYED_CONTRACTS, PoolTypeV3, TOKENS, encodePoolHintV3 } from "../../scripts/utils";

const FORK_HEIGHT = 17968230;
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const KEEPER = "0x11E91BB6d1334585AA37D8F4fde3932C7960B938";

const revenues: {
  [symbol: string]: {
    amount: string;
    holder: string;
  };
} = {
  aCRV: {
    amount: "1000",
    holder: "0x7376b927836243f21b327164055891Eb4290f213",
  },
  CVX: {
    amount: "1000",
    holder: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
  },
  aFXS: {
    amount: "1000",
    holder: "0x4492f0D0497bfb4564A085e1e1eB3Bb8080DFf93",
  },
  afrxETH: {
    amount: "100",
    holder: "0x48c6074fFcB8fb67D75CCD06571B42542ED82555",
  },
  asdCRV: {
    amount: "10000",
    holder: "0x488b99c4A94BB0027791E8e0eEB421187EC9a487",
  },
};

describe("DistributePlatformRevenues.spec", async () => {
  let keeper: SignerWithAddress;
  let deployer: SignerWithAddress;

  let defaultBurner: PlatformFeeBurner;
  let convexFraxBurner: ConvexFraxCompounderBurner;
  let stakedaoBurner: StakeDAOCompounderBurner;
  let spliter: PlatformFeeSpliter;

  beforeEach(async () => {
    request_fork(FORK_HEIGHT, [KEEPER, DEPLOYER, ...Object.values(revenues).map((x) => x.holder)]);

    keeper = await ethers.getSigner(KEEPER);
    deployer = await ethers.getSigner(DEPLOYER);

    await deployer.sendTransaction({ to: keeper.address, value: ethers.utils.parseEther("10") });

    spliter = await ethers.getContractAt(
      "PlatformFeeSpliter",
      DEPLOYED_CONTRACTS.Concentrator.PlatformFeeSpliter,
      keeper
    );
    defaultBurner = await ethers.getContractAt(
      "PlatformFeeBurner",
      DEPLOYED_CONTRACTS.Concentrator.burners.PlatformFeeBurner,
      keeper
    );
    convexFraxBurner = await ethers.getContractAt(
      "ConvexFraxCompounderBurner",
      DEPLOYED_CONTRACTS.Concentrator.burners.ConvexFraxCompounderBurner,
      keeper
    );
    stakedaoBurner = await ethers.getContractAt(
      "StakeDAOCompounderBurner",
      DEPLOYED_CONTRACTS.Concentrator.burners.StakeDAOCompounderBurner,
      keeper
    );

    for (const [symbol, config] of Object.entries(revenues)) {
      const holder = await ethers.getSigner(config.holder);
      const token = await ethers.getContractAt("MockERC20", TOKENS[symbol].address, holder);
      const decimals = await token.decimals();

      await deployer.sendTransaction({ to: holder.address, value: ethers.utils.parseEther("10") });
      await token.transfer(spliter.address, ethers.utils.parseUnits(config.amount, decimals));
    }
  });

  it("should succeed to distribute aCRV", async () => {
    const token = await ethers.getContractAt("IERC20", TOKENS.aCRV.address, deployer);
    const lockerAmount = ethers.utils.parseUnits(revenues.aCRV.amount, 18).div(2);
    const treasuryAmount = ethers.utils.parseUnits(revenues.aCRV.amount, 18).div(2);

    const lockerBefore = await token.balanceOf(DEPLOYED_CONTRACTS.Concentrator.FeeDistributor.aCRV);
    const treasuryBefore = await token.balanceOf(DEPLOYED_CONTRACTS.Concentrator.Treasury);
    const tx = await spliter.connect(keeper).claim();
    const lockerAfter = await token.balanceOf(DEPLOYED_CONTRACTS.Concentrator.FeeDistributor.aCRV);
    const treasuryAfter = await token.balanceOf(DEPLOYED_CONTRACTS.Concentrator.Treasury);
    expect(lockerAfter.sub(lockerBefore)).to.eq(lockerAmount);
    expect(treasuryAfter.sub(treasuryBefore)).to.eq(treasuryAmount);
    const receipt = await tx.wait();
    console.log("PlatformFeeSpliter.claim, gas used:", receipt.gasUsed.toString());
    console.log("aCRV converted:", ethers.utils.formatEther(lockerAmount));
  });

  it("should succeed to distribute CVX", async () => {
    const token = await ethers.getContractAt("IERC20", TOKENS.CVX.address, deployer);
    const lockerAmount = ethers.utils.parseUnits(revenues.CVX.amount, 18).div(2);
    const treasuryAmount = ethers.utils.parseUnits(revenues.CVX.amount, 18).div(2);

    const burnerBefore = await token.balanceOf(defaultBurner.address);
    const treasuryBefore = await token.balanceOf(DEPLOYED_CONTRACTS.Concentrator.Treasury);
    let tx = await spliter.connect(keeper).claim();
    const burnerAfter = await token.balanceOf(defaultBurner.address);
    const treasuryAfter = await token.balanceOf(DEPLOYED_CONTRACTS.Concentrator.Treasury);
    expect(burnerAfter.sub(burnerBefore)).to.eq(lockerAmount);
    expect(treasuryAfter.sub(treasuryBefore)).to.eq(treasuryAmount);
    let receipt = await tx.wait();
    console.log("PlatformFeeSpliter.claim, gas used:", receipt.gasUsed.toString());

    // convert to aCRV by route: CVX => WETH => CRV => cvxCRV => aCRV
    const acrv = await ethers.getContractAt("IERC20", TOKENS.aCRV.address, deployer);
    const lockerBefore = await acrv.balanceOf(DEPLOYED_CONTRACTS.Concentrator.FeeDistributor.aCRV);
    const routes = [
      encodePoolHintV3(ADDRESS.CURVE_CVXETH_POOL, PoolTypeV3.CurveCryptoPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolTypeV3.CurveCryptoPool, 3, 1, 2, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_CRV/cvxCRV_POOL"], PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap),
      encodePoolHintV3(TOKENS.aCRV.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add),
    ];
    const amountOut = await defaultBurner.connect(keeper).callStatic.burn(TOKENS.CVX.address, routes, 0);
    tx = await defaultBurner.connect(keeper).burn(TOKENS.CVX.address, routes, amountOut);
    const lockerAfter = await acrv.balanceOf(DEPLOYED_CONTRACTS.Concentrator.FeeDistributor.aCRV);
    expect(lockerAfter.sub(lockerBefore)).to.eq(amountOut);
    receipt = await tx.wait();
    console.log("PlatformFeeBurner.burn, gas used:", receipt.gasUsed.toString());
    console.log("aCRV converted:", ethers.utils.formatEther(amountOut));
  });

  it("should succeed to distribute aFXS", async () => {
    const token = await ethers.getContractAt("IERC20", TOKENS.aFXS.address, deployer);
    const lockerAmount = ethers.utils.parseUnits(revenues.aFXS.amount, 18).div(2);
    const treasuryAmount = ethers.utils.parseUnits(revenues.aFXS.amount, 18).div(2);

    const burnerBefore = await token.balanceOf(defaultBurner.address);
    const treasuryBefore = await token.balanceOf(DEPLOYED_CONTRACTS.Concentrator.Treasury);
    let tx = await spliter.connect(keeper).claim();
    const burnerAfter = await token.balanceOf(defaultBurner.address);
    const treasuryAfter = await token.balanceOf(DEPLOYED_CONTRACTS.Concentrator.Treasury);
    expect(burnerAfter.sub(burnerBefore)).to.eq(lockerAmount);
    expect(treasuryAfter.sub(treasuryBefore)).to.eq(treasuryAmount);
    let receipt = await tx.wait();
    console.log("PlatformFeeSpliter.claim, gas used:", receipt.gasUsed.toString());

    // convert to aCRV by route: aFXS => cvxFXS => FXS => WETH => CRV => cvxCRV => aCRV
    const acrv = await ethers.getContractAt("IERC20", TOKENS.aCRV.address, deployer);
    const lockerBefore = await acrv.balanceOf(DEPLOYED_CONTRACTS.Concentrator.FeeDistributor.aCRV);
    const routes = [
      encodePoolHintV3(TOKENS.aFXS.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Remove),
      encodePoolHintV3(ADDRESS["CURVE_FXS/cvxFXS_POOL"], PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(ADDRESS.FXS_WETH_UNIV2, PoolTypeV3.UniswapV2, 2, 0, 1, Action.Swap, {
        fee_num: 997000,
      }),
      encodePoolHintV3(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolTypeV3.CurveCryptoPool, 3, 1, 2, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_CRV/cvxCRV_POOL"], PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap),
      encodePoolHintV3(TOKENS.aCRV.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add),
    ];
    const amountOut = await defaultBurner.connect(keeper).callStatic.burn(TOKENS.aFXS.address, routes, 0);
    tx = await defaultBurner.connect(keeper).burn(TOKENS.aFXS.address, routes, amountOut);
    const lockerAfter = await acrv.balanceOf(DEPLOYED_CONTRACTS.Concentrator.FeeDistributor.aCRV);
    expect(lockerAfter.sub(lockerBefore)).to.eq(amountOut);
    receipt = await tx.wait();
    console.log("PlatformFeeBurner.burn, gas used:", receipt.gasUsed.toString());
    console.log("aCRV converted:", ethers.utils.formatEther(amountOut));
  });

  it("should succeed to distribute afrxETH", async () => {
    const token = await ethers.getContractAt("IERC20", TOKENS.afrxETH.address, deployer);
    const lockerAmount = ethers.utils.parseUnits(revenues.afrxETH.amount, 18).div(2);
    const treasuryAmount = ethers.utils.parseUnits(revenues.afrxETH.amount, 18).div(2);

    let burnerBefore = await token.balanceOf(convexFraxBurner.address);
    const treasuryBefore = await token.balanceOf(DEPLOYED_CONTRACTS.Concentrator.Treasury);
    let tx = await spliter.connect(keeper).claim();
    let burnerAfter = await token.balanceOf(convexFraxBurner.address);
    const treasuryAfter = await token.balanceOf(DEPLOYED_CONTRACTS.Concentrator.Treasury);
    expect(burnerAfter.sub(burnerBefore)).to.eq(lockerAmount);
    expect(treasuryAfter.sub(treasuryBefore)).to.eq(treasuryAmount);
    let receipt = await tx.wait();
    console.log("PlatformFeeSpliter.claim, gas used:", receipt.gasUsed.toString());

    // trigger unlock
    tx = await convexFraxBurner
      .connect(keeper)
      .burn(TOKENS.afrxETH.address, DEPLOYED_CONTRACTS.Concentrator.frxETH.AutoCompoundingConvexFraxStrategy);
    receipt = await tx.wait();
    console.log("ConvexFraxCompounderBurner.burn, gas used:", receipt.gasUsed.toString());

    // 14 days passed
    const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
    await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 14]);
    await network.provider.send("evm_mine", []);

    const lpToken = await ethers.getContractAt("IERC20", ADDRESS.CURVE_frxETH_TOKEN, deployer);
    // claim
    burnerBefore = await lpToken.balanceOf(defaultBurner.address);
    tx = await convexFraxBurner
      .connect(keeper)
      .burn(TOKENS.afrxETH.address, DEPLOYED_CONTRACTS.Concentrator.frxETH.AutoCompoundingConvexFraxStrategy);
    burnerAfter = await lpToken.balanceOf(defaultBurner.address);
    expect(burnerAfter).to.gt(burnerBefore);
    receipt = await tx.wait();
    console.log("ConvexFraxCompounderBurner.burn, gas used:", receipt.gasUsed.toString());

    // convert to aCRV by route: Curve ETH/frxETH LP => WETH => CRV => cvxCRV => aCRV
    const acrv = await ethers.getContractAt("IERC20", TOKENS.aCRV.address, deployer);
    const lockerBefore = await acrv.balanceOf(DEPLOYED_CONTRACTS.Concentrator.FeeDistributor.aCRV);
    const routes = [
      encodePoolHintV3(ADDRESS.CURVE_frxETH_TOKEN, PoolTypeV3.CurvePlainPool, 2, 0, 0, Action.Remove),
      encodePoolHintV3(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolTypeV3.CurveCryptoPool, 3, 1, 2, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_CRV/cvxCRV_POOL"], PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap),
      encodePoolHintV3(TOKENS.aCRV.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add),
    ];
    const amountOut = await defaultBurner.connect(keeper).callStatic.burn(lpToken.address, routes, 0);
    tx = await defaultBurner.connect(keeper).burn(lpToken.address, routes, amountOut);
    const lockerAfter = await acrv.balanceOf(DEPLOYED_CONTRACTS.Concentrator.FeeDistributor.aCRV);
    expect(lockerAfter.sub(lockerBefore)).to.eq(amountOut);
    receipt = await tx.wait();
    console.log("PlatformFeeBurner.burn, gas used:", receipt.gasUsed.toString());
    console.log("aCRV converted:", ethers.utils.formatEther(amountOut));
  });

  it("should succeed to distribute asdCRV", async () => {
    const token = await ethers.getContractAt("IERC20", TOKENS.asdCRV.address, deployer);
    const lockerAmount = ethers.utils.parseUnits(revenues.asdCRV.amount, 18).div(2);
    const treasuryAmount = ethers.utils.parseUnits(revenues.asdCRV.amount, 18).div(2);

    let burnerBefore = await token.balanceOf(stakedaoBurner.address);
    const treasuryBefore = await token.balanceOf(DEPLOYED_CONTRACTS.Concentrator.Treasury);
    let tx = await spliter.connect(keeper).claim();
    let burnerAfter = await token.balanceOf(stakedaoBurner.address);
    const treasuryAfter = await token.balanceOf(DEPLOYED_CONTRACTS.Concentrator.Treasury);
    expect(burnerAfter.sub(burnerBefore)).to.eq(lockerAmount);
    expect(treasuryAfter.sub(treasuryBefore)).to.eq(treasuryAmount);
    let receipt = await tx.wait();
    console.log("PlatformFeeSpliter.claim, gas used:", receipt.gasUsed.toString());

    // trigger unlock
    tx = await stakedaoBurner.connect(keeper).burn(TOKENS.asdCRV.address);
    receipt = await tx.wait();
    console.log("StakeDAOCompounderBurner.burn, gas used:", receipt.gasUsed.toString());

    // 7 days passed
    const timestamp = (await ethers.provider.getBlock("latest")).timestamp;
    await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 86400 * 7]);
    await network.provider.send("evm_mine", []);

    const sdcrv = await ethers.getContractAt("IERC20", TOKENS.sdCRV.address, deployer);
    // claim
    burnerBefore = await sdcrv.balanceOf(defaultBurner.address);
    tx = await stakedaoBurner.connect(keeper).burn(TOKENS.asdCRV.address);
    burnerAfter = await sdcrv.balanceOf(defaultBurner.address);
    expect(burnerAfter).to.gt(burnerBefore);
    receipt = await tx.wait();
    console.log("StakeDAOCompounderBurner.burn, gas used:", receipt.gasUsed.toString());

    // convert to aCRV by route: sdCRV => CRV => cvxCRV => aCRV
    const acrv = await ethers.getContractAt("IERC20", TOKENS.aCRV.address, deployer);
    const lockerBefore = await acrv.balanceOf(DEPLOYED_CONTRACTS.Concentrator.FeeDistributor.aCRV);
    const routes = [
      encodePoolHintV3(ADDRESS["CURVE_CRV/sdCRV_V2_POOL"], PoolTypeV3.CurvePlainPool, 2, 1, 0, Action.Swap),
      encodePoolHintV3(ADDRESS["CURVE_CRV/cvxCRV_POOL"], PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap),
      encodePoolHintV3(TOKENS.aCRV.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add),
    ];
    const amountOut = await defaultBurner.connect(keeper).callStatic.burn(sdcrv.address, routes, 0);
    tx = await defaultBurner.connect(keeper).burn(sdcrv.address, routes, amountOut);
    const lockerAfter = await acrv.balanceOf(DEPLOYED_CONTRACTS.Concentrator.FeeDistributor.aCRV);
    expect(lockerAfter.sub(lockerBefore)).to.eq(amountOut);
    receipt = await tx.wait();
    console.log("PlatformFeeBurner.burn, gas used:", receipt.gasUsed.toString());
    console.log("aCRV converted:", ethers.utils.formatEther(amountOut));
  });
});
