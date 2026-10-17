import { expect } from "chai";
import { AbiCoder, BytesLike, Signer, ZeroAddress, getBytes, toBigInt } from "ethers";
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

import { LibGatewayRouter } from "@/types/contracts/gateways/facets/FxMarketV1Facet";

export async function getConvertInParams(
  signer: Signer,
  gateway: string,
  params: {
    src: string;
    amount: bigint;
    target: string;
    data: BytesLike;
    minOut: bigint;
  }
): Promise<LibGatewayRouter.ConvertInParamsStruct> {
  const now = (await ethers.provider.getBlock("latest"))!.timestamp;
  const deadline = toBigInt(now) + 60n * 30n;
  const signature = await signer.signTypedData(
    {
      name: "Gateway Router",
      version: "1.0.0",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: gateway,
    },
    {
      ConvertIn: [
        { name: "src", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "target", type: "address" },
        { name: "data", type: "bytes" },
        { name: "minOut", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    {
      src: params.src,
      amount: params.amount,
      target: params.target,
      data: getBytes(params.data),
      minOut: params.minOut,
      deadline,
    }
  );
  return {
    ...params,
    deadline,
    signature,
  };
}

export async function getConvertOutParams(
  signer: Signer,
  gateway: string,
  params: {
    converter: string;
    routes: Array<bigint>;
    minOut: bigint;
  }
): Promise<LibGatewayRouter.ConvertOutParamsStruct> {
  const now = (await ethers.provider.getBlock("latest"))!.timestamp;
  const deadline = toBigInt(now) + 60n * 30n;
  const signature = await signer.signTypedData(
    {
      name: "Gateway Router",
      version: "1.0.0",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: gateway,
    },
    {
      ConvertOut: [
        { name: "converter", type: "address" },
        { name: "routes", type: "bytes" },
        { name: "minOut", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    {
      converter: params.converter,
      routes: AbiCoder.defaultAbiCoder().encode(["uint256[]"], [params.routes]),
      minOut: params.minOut,
      deadline,
    }
  );
  return {
    ...params,
    deadline,
    signature,
  };
}

export async function simulateMintFTokenV2(
  paramsSigner: Signer,
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
    minOut: 0n,
  };
  const convertInParams = await getConvertInParams(paramsSigner, await gateway.getAddress(), params);
  const minted = await gateway
    .connect(signer)
    .fxMintFTokenV2.staticCall(convertInParams, market.getAddress(), 0n, { value: symbol === "ETH" ? amountIn : 0n });
  console.log(`mint ${await fToken.symbol()} from ${symbol}:`, ethers.formatEther(minted));
  const before = await fToken.balanceOf(signer.address);
  await gateway.connect(signer).fxMintFTokenV2(convertInParams, market.getAddress(), (minted * 9999n) / 10000n, {
    value: symbol === "ETH" ? amountIn : 0n,
  });
  const after = await fToken.balanceOf(signer.address);
  expect(after - before).to.closeTo(minted, minted / 10000n);
}

export async function simulateMintXTokenV2(
  paramsSigner: Signer,
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
    minOut: 0n,
  };
  const convertInParams = await getConvertInParams(paramsSigner, await gateway.getAddress(), params);

  const [minted] = await gateway
    .connect(signer)
    .fxMintXTokenV2.staticCall(convertInParams, market.getAddress(), 0n, { value: symbol === "ETH" ? amountIn : 0n });
  console.log(`mint ${await xToken.symbol()} from ${symbol}:`, ethers.formatEther(minted));
  const before = await xToken.balanceOf(signer.address);
  await gateway.connect(signer).fxMintXTokenV2(convertInParams, market.getAddress(), (minted * 9999n) / 10000n, {
    value: symbol === "ETH" ? amountIn : 0n,
  });
  const after = await xToken.balanceOf(signer.address);
  expect(after - before).to.closeTo(minted, minted / 10000n);
}

export async function simulateRedeemFTokenV2(
  paramsSigner: Signer,
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
  let convertOutParams = await getConvertOutParams(paramsSigner, await gateway.getAddress(), params);

  const [base, dst] = await gateway
    .connect(signer)
    .fxRedeemFTokenV2.staticCall(convertOutParams, market.getAddress(), amountIn, 0n);
  const fTokenSymbol = await fToken.symbol();
  const baseSymbol = await baseToken.symbol();
  console.log(`redeem ${fTokenSymbol} as ${baseSymbol}:`, ethers.formatUnits(base, await baseToken.decimals()));
  console.log(
    `redeem ${fTokenSymbol} as ${symbol}:`,
    ethers.formatUnits(dst, symbol === "ETH" ? 18 : await token.decimals())
  );
  params.minOut = (dst * 9999n) / 10000n;
  convertOutParams = await getConvertOutParams(paramsSigner, await gateway.getAddress(), params);
  const before =
    symbol === "ETH" ? await ethers.provider.getBalance(signer.address) : await token.balanceOf(signer.address);
  const tx = await gateway
    .connect(signer)
    .fxRedeemFTokenV2(convertOutParams, market.getAddress(), amountIn, (base * 9999n) / 10000n);
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
  paramsSigner: Signer,
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
  let convertOutParams = await getConvertOutParams(paramsSigner, await gateway.getAddress(), params);

  const [base, dst] = await gateway
    .connect(signer)
    .fxRedeemXTokenV2.staticCall(convertOutParams, market.getAddress(), amountIn, 0n);
  const fTokenSymbol = await xToken.symbol();
  const baseSymbol = await baseToken.symbol();
  console.log(`redeem ${fTokenSymbol} as ${baseSymbol}:`, ethers.formatUnits(base, await baseToken.decimals()));
  console.log(
    `redeem ${fTokenSymbol} as ${symbol}:`,
    ethers.formatUnits(dst, symbol === "ETH" ? 18 : await token.decimals())
  );
  params.minOut = (dst * 9999n) / 10000n;
  convertOutParams = await getConvertOutParams(paramsSigner, await gateway.getAddress(), params);
  const before =
    symbol === "ETH" ? await ethers.provider.getBalance(signer.address) : await token.balanceOf(signer.address);
  const tx = await gateway
    .connect(signer)
    .fxRedeemXTokenV2(convertOutParams, market.getAddress(), amountIn, (base * 9999n) / 10000n);
  const receipt = await tx.wait();
  const after =
    symbol === "ETH" ? await ethers.provider.getBalance(signer.address) : await token.balanceOf(signer.address);
  if (symbol === "ETH") {
    expect(after - before + receipt!.gasPrice * receipt!.gasUsed).to.closeTo(dst, dst / 10000n);
  } else {
    expect(after - before).to.closeTo(dst, dst / 10000n);
  }
}
