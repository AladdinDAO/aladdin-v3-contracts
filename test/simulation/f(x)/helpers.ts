import { expect } from "chai";
import { ZeroAddress, toBigInt } from "ethers";
import { ethers } from "hardhat";

import { mockETHBalance } from "@/test/utils";
import {
  FractionalTokenV2,
  FxUSDFacet,
  GeneralTokenConverter,
  LeveragedTokenV2,
  MarketV2,
  MultiPathConverter,
} from "@/types/index";
import { TOKENS } from "@/utils/index";

export async function simulateMintFTokenV2(
  gateway: FxUSDFacet,
  converter: MultiPathConverter,
  market: MarketV2,
  fToken: FractionalTokenV2,
  holder: string,
  symbol: string,
  amountIn: bigint,
  routes: bigint[]
) {
  const signer = await ethers.getSigner(holder);
  await mockETHBalance(signer.address, ethers.parseEther("1000"));
  if (symbol !== "ETH") {
    const token = await ethers.getContractAt("MockERC20", TOKENS[symbol].address, signer);
    await token.approve(gateway.getAddress(), amountIn);
  }

  const params = {
    src: symbol === "ETH" ? ZeroAddress : TOKENS[symbol].address,
    amount: amountIn,
    target: await converter.getAddress(),
    data: converter.interface.encodeFunctionData("convert", [
      symbol === "ETH" ? ZeroAddress : TOKENS[symbol].address,
      amountIn,
      1048575n + (toBigInt(routes.length) << 20n),
      routes,
    ]),
    minOut: 0,
  };

  const minted = await gateway
    .connect(signer)
    .fxMintFTokenV2.staticCall(params, market.getAddress(), 0n, { value: symbol === "ETH" ? amountIn : 0n });
  console.log(`mint ${await fToken.symbol()} from ${symbol}:`, ethers.formatEther(minted));
  const before = await fToken.balanceOf(signer.address);
  await gateway.connect(signer).fxMintFTokenV2(params, market.getAddress(), (minted * 9999n) / 10000n, {
    value: symbol === "ETH" ? amountIn : 0n,
  });
  const after = await fToken.balanceOf(signer.address);
  expect(after - before).to.closeTo(minted, minted / 10000n);
}

export async function simulateMintXTokenV2(
  gateway: FxUSDFacet,
  converter: MultiPathConverter,
  market: MarketV2,
  xToken: LeveragedTokenV2,
  holder: string,
  symbol: string,
  amountIn: bigint,
  routes: bigint[]
) {
  const signer = await ethers.getSigner(holder);
  await mockETHBalance(signer.address, ethers.parseEther("1000"));
  if (symbol !== "ETH") {
    const token = await ethers.getContractAt("MockERC20", TOKENS[symbol].address, signer);
    await token.approve(gateway.getAddress(), amountIn);
  }

  const params = {
    src: symbol === "ETH" ? ZeroAddress : TOKENS[symbol].address,
    amount: amountIn,
    target: await converter.getAddress(),
    data: converter.interface.encodeFunctionData("convert", [
      symbol === "ETH" ? ZeroAddress : TOKENS[symbol].address,
      amountIn,
      1048575n + (toBigInt(routes.length) << 20n),
      routes,
    ]),
    minOut: 0,
  };

  const [minted] = await gateway
    .connect(signer)
    .fxMintXTokenV2.staticCall(params, market.getAddress(), 0n, { value: symbol === "ETH" ? amountIn : 0n });
  console.log(`mint ${await xToken.symbol()} from ${symbol}:`, ethers.formatEther(minted));
  const before = await xToken.balanceOf(signer.address);
  await gateway.connect(signer).fxMintXTokenV2(params, market.getAddress(), (minted * 9999n) / 10000n, {
    value: symbol === "ETH" ? amountIn : 0n,
  });
  const after = await xToken.balanceOf(signer.address);
  expect(after - before).to.closeTo(minted, minted / 10000n);
}

export async function simulateRedeemFTokenV2(
  gateway: FxUSDFacet,
  converter: GeneralTokenConverter,
  market: MarketV2,
  fToken: FractionalTokenV2,
  holder: string,
  symbol: string,
  amountIn: bigint,
  routes: bigint[]
) {
  const signer = await ethers.getSigner(holder);
  const baseToken = await ethers.getContractAt("MockERC20", await market.baseToken(), signer);
  const token = await ethers.getContractAt("MockERC20", TOKENS[symbol].address, signer);
  await fToken.connect(signer).approve(gateway.getAddress(), amountIn);

  const params = {
    converter: await converter.getAddress(),
    minOut: 0n,
    routes,
  };

  const [base, dst] = await gateway
    .connect(signer)
    .fxRedeemFTokenV2.staticCall(params, market.getAddress(), amountIn, 0n);
  const fTokenSymbol = await fToken.symbol();
  const baseSymbol = await baseToken.symbol();
  console.log(`redeem ${fTokenSymbol} as ${baseSymbol}:`, ethers.formatUnits(base, await baseToken.decimals()));
  console.log(
    `redeem ${fTokenSymbol} as ${symbol}:`,
    ethers.formatUnits(dst, symbol === "ETH" ? 18 : await token.decimals())
  );
  params.minOut = (dst * 9999n) / 10000n;
  const before =
    symbol === "ETH" ? await ethers.provider.getBalance(signer.address) : await token.balanceOf(signer.address);
  const tx = await gateway
    .connect(signer)
    .fxRedeemFTokenV2(params, market.getAddress(), amountIn, (base * 9999n) / 10000n);
  const receipt = await tx.wait();
  const after =
    symbol === "ETH" ? await ethers.provider.getBalance(signer.address) : await token.balanceOf(signer.address);
  if (symbol === "ETH") {
    expect(after - before + receipt!.gasPrice * receipt!.gasUsed).to.closeTo(dst, dst / 10000n);
  } else {
    expect(after - before).to.closeTo(dst, dst / 10000n);
  }
}

export async function simulateRedeemXTokenV2(
  gateway: FxUSDFacet,
  converter: GeneralTokenConverter,
  market: MarketV2,
  xToken: LeveragedTokenV2,
  holder: string,
  symbol: string,
  amountIn: bigint,
  routes: bigint[]
) {
  const signer = await ethers.getSigner(holder);
  const baseToken = await ethers.getContractAt("MockERC20", await market.baseToken(), signer);
  const token = await ethers.getContractAt("MockERC20", TOKENS[symbol].address, signer);
  await xToken.connect(signer).approve(gateway.getAddress(), amountIn);

  const params = {
    converter: await converter.getAddress(),
    minOut: 0n,
    routes,
  };

  const [base, dst] = await gateway
    .connect(signer)
    .fxRedeemXTokenV2.staticCall(params, market.getAddress(), amountIn, 0n);
  const fTokenSymbol = await xToken.symbol();
  const baseSymbol = await baseToken.symbol();
  console.log(`redeem ${fTokenSymbol} as ${baseSymbol}:`, ethers.formatUnits(base, await baseToken.decimals()));
  console.log(
    `redeem ${fTokenSymbol} as ${symbol}:`,
    ethers.formatUnits(dst, symbol === "ETH" ? 18 : await token.decimals())
  );
  params.minOut = (dst * 9999n) / 10000n;
  const before =
    symbol === "ETH" ? await ethers.provider.getBalance(signer.address) : await token.balanceOf(signer.address);
  const tx = await gateway
    .connect(signer)
    .fxRedeemXTokenV2(params, market.getAddress(), amountIn, (base * 9999n) / 10000n);
  const receipt = await tx.wait();
  const after =
    symbol === "ETH" ? await ethers.provider.getBalance(signer.address) : await token.balanceOf(signer.address);
  if (symbol === "ETH") {
    expect(after - before + receipt!.gasPrice * receipt!.gasUsed).to.closeTo(dst, dst / 10000n);
  } else {
    expect(after - before).to.closeTo(dst, dst / 10000n);
  }
}
