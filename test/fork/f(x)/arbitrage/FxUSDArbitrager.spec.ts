/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { AbiCoder, MaxUint256, ZeroAddress } from "ethers";
import { ethers } from "hardhat";

import { mockETHBalance, request_fork } from "@/test/utils";
import { ADDRESS, Action, PoolTypeV3, TOKENS, encodePoolHintV3 } from "@/utils/index";
import { FxUSDArbitrager, IWETH } from "@/types/index";
import { expect } from "chai";

const FOKR_HEIGHT = 19626640;
const MANAGER = "0x28c921adAC4c1072658eB01a28DA06b5F651eF62";
const ADMIN = "0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF";

const ROUTESA: { [name: string]: Array<bigint> } = {
  wstETH: [
    encodePoolHintV3(TOKENS.stETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
    encodePoolHintV3(TOKENS.wstETH.address, PoolTypeV3.Lido, 2, 0, 0, Action.Add),
  ],
  sfrxETH: [
    encodePoolHintV3(ADDRESS["CURVE_CRVUSD_WETH/frxETH_15_POOL"], PoolTypeV3.CurvePlainPool, 2, 0, 1, Action.Swap),
    encodePoolHintV3(TOKENS.sfrxETH.address, PoolTypeV3.ERC4626, 2, 0, 0, Action.Add),
  ],
};

const ROUTESB: { [name: string]: Array<bigint> } = {
  "GHO/fxUSD": [
    encodePoolHintV3(ADDRESS["CURVE_STABLE_NG_GHO/fxUSD_111_POOL"], PoolTypeV3.CurveStableSwapNG, 2, 1, 0, Action.Swap),
    encodePoolHintV3(ADDRESS["BalancerV2_GHO/USDC/USDT"], PoolTypeV3.BalancerV2, 4, 0, 2, Action.Swap),
    encodePoolHintV3(ADDRESS.USDC_WETH_UNIV3, PoolTypeV3.UniswapV3, 2, 0, 1, Action.Swap, { fee_num: 500 }),
  ],
  "PYUSD/fxUSD": [
    encodePoolHintV3(
      ADDRESS["CURVE_STABLE_NG_PYUSD/fxUSD_107_POOL"],
      PoolTypeV3.CurveStableSwapNG,
      2,
      1,
      0,
      Action.Swap
    ),
    encodePoolHintV3(ADDRESS["CURVE_STABLE_NG_PYUSD/USDC_43_POOL"], PoolTypeV3.CurveStableSwapNG, 2, 0, 1, Action.Swap),
    encodePoolHintV3(ADDRESS.USDC_WETH_UNIV3, PoolTypeV3.UniswapV3, 2, 0, 1, Action.Swap, { fee_num: 500 }),
  ],
  "crvUSD/fxUSD": [
    encodePoolHintV3(
      ADDRESS["CURVE_STABLE_NG_crvUSD/fxUSD_106_POOL"],
      PoolTypeV3.CurveStableSwapNG,
      2,
      1,
      0,
      Action.Swap
    ),
    encodePoolHintV3(ADDRESS["CURVE_crvUSD/ETH/CRV_POOL"], PoolTypeV3.CurveCryptoPool, 3, 0, 1, Action.Swap),
  ],
};

describe("FxUSDArbitrager.spec", async () => {
  let deployer: HardhatEthersSigner;
  let admin: HardhatEthersSigner;

  let arbitrager: FxUSDArbitrager;
  let weth: IWETH;

  beforeEach(async () => {
    request_fork(FOKR_HEIGHT, [ZeroAddress, MANAGER, ADMIN]);
    deployer = await ethers.getSigner(ZeroAddress);
    admin = await ethers.getSigner(ADMIN);
    const manager = await ethers.getSigner(MANAGER);
    await mockETHBalance(manager.address, ethers.parseEther("100"));
    await mockETHBalance(admin.address, ethers.parseEther("100"));

    const FxUSDArbitrager = await ethers.getContractFactory("FxUSDArbitrager", deployer);
    arbitrager = await FxUSDArbitrager.deploy(deployer.address);

    const converterRegistry = await ethers.getContractAt(
      "ConverterRegistry",
      "0x997B6F43c1c1e8630d03B8E3C11B60E98A1beA90",
      manager
    );

    const ETHLSDConverter = await ethers.getContractFactory("ETHLSDConverter", deployer);
    const ethLSDConverter = await ETHLSDConverter.deploy(await converterRegistry.getAddress());
    const CurveNGConverter = await ethers.getContractFactory("CurveNGConverter", deployer);
    const curveNGConverter = await CurveNGConverter.deploy(await converterRegistry.getAddress());
    await converterRegistry.connect(manager).register(11, await ethLSDConverter.getAddress());
    await converterRegistry.register(12, await curveNGConverter.getAddress());
    await converterRegistry.register(13, await curveNGConverter.getAddress());

    weth = await ethers.getContractAt("IWETH", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", deployer);
    await weth.deposit({ value: ethers.parseEther("10") });
  });

  const amountIn = ethers.parseEther("1");
  for (const baseToken of Object.keys(ROUTESA)) {
    for (const [poolName, routesB] of Object.entries(ROUTESB)) {
      if (!["GHO/fxUSD"].includes(poolName)) {
        it(`should succeed, balancer run with baseToken[${baseToken}] pool[${poolName}]`, async () => {
          const fxUSD = await ethers.getContractAt("FxUSD", TOKENS.fxUSD.address, admin);
          const market = await fxUSD.markets(TOKENS[baseToken].address);
          const treasury = await ethers.getContractAt("TreasuryV2", market.treasury, admin);
          const price = await treasury.currentBaseTokenPrice();
          // mock price to make sure we have at least 10% profit
          const MockTwapOracle = await ethers.getContractFactory("MockTwapOracle", deployer);
          const oracle = await MockTwapOracle.deploy();
          await oracle.setPrice((price * 11n) / 10n);
          await oracle.setIsValid(true);
          await treasury.updatePriceOracle(oracle.getAddress());
          const profit = await arbitrager.balancerRun.staticCall(
            amountIn,
            0n,
            AbiCoder.defaultAbiCoder().encode(
              ["address", "address", "uint256[]", "uint256[]"],
              [TOKENS[baseToken].address, TOKENS.fxUSD.address, ROUTESA[baseToken], routesB]
            )
          );
          console.log(`profit with ${ethers.formatEther(amountIn)} ETH:, ${ethers.formatEther(profit)}`);
          const token = await ethers.getContractAt("MockERC20", await weth.getAddress(), deployer);
          const before = await token.balanceOf(deployer.address);
          const tx = await arbitrager.balancerRun(
            amountIn,
            0n,
            AbiCoder.defaultAbiCoder().encode(
              ["address", "address", "uint256[]", "uint256[]"],
              [TOKENS[baseToken].address, TOKENS.fxUSD.address, ROUTESA[baseToken], routesB]
            )
          );
          const receipt = await tx.wait();
          const after = await token.balanceOf(deployer.address);
          expect(after - before).to.closeTo(profit, profit / 10000n);
          console.log(
            `profit with ${ethers.formatEther(amountIn)} ETH: ${ethers.formatEther(profit)}, GasUsed[${
              receipt?.gasUsed
            }]`
          );
        });
      }

      it(`should succeed, simple run with baseToken[${baseToken}] pool[${poolName}]`, async () => {
        const fxUSD = await ethers.getContractAt("FxUSD", TOKENS.fxUSD.address, admin);
        const market = await fxUSD.markets(TOKENS[baseToken].address);
        const treasury = await ethers.getContractAt("TreasuryV2", market.treasury, admin);
        const price = await treasury.currentBaseTokenPrice();
        // mock price to make sure we have at least 10% profit
        const MockTwapOracle = await ethers.getContractFactory("MockTwapOracle", deployer);
        const oracle = await MockTwapOracle.deploy();
        await oracle.setPrice((price * 11n) / 10n);
        await oracle.setIsValid(true);
        await treasury.updatePriceOracle(oracle.getAddress());
        const token = await ethers.getContractAt("MockERC20", await weth.getAddress(), deployer);
        await token.approve(arbitrager.getAddress(), MaxUint256);
        const profit = await arbitrager.simpleRun.staticCall(
          amountIn,
          0n,
          TOKENS[baseToken].address,
          TOKENS.fxUSD.address,
          ROUTESA[baseToken],
          routesB
        );
        const before = await token.balanceOf(deployer.address);
        const tx = await arbitrager.simpleRun(
          amountIn,
          0n,
          TOKENS[baseToken].address,
          TOKENS.fxUSD.address,
          ROUTESA[baseToken],
          routesB
        );
        const receipt = await tx.wait();
        const after = await token.balanceOf(deployer.address);
        expect(after - before).to.closeTo(profit, profit / 10000n);
        console.log(
          `profit with ${ethers.formatEther(amountIn)} ETH: ${ethers.formatEther(profit)}, GasUsed[${receipt?.gasUsed}]`
        );
      });
    }
  }
});
