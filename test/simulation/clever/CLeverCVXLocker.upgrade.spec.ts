/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";

import { mockETHBalance, request_fork } from "@/test/utils";
import { CLeverCVXLocker, MultiPathConverter } from "@/types/index";
import { loadParams } from "scripts/votium/config";
import { MULTI_PATH_CONVERTER_ROUTES, TOKENS, same, showMultiPathRoutes } from "@/utils/index";
import { MaxUint256, ZeroAddress } from "ethers";

const FORK_BLOCK_NUMBER = 19967124;
const DEPLOYER = "0x1000000000000000000000000000000000000001";
const KEEPER = "0x11E91BB6d1334585AA37D8F4fde3932C7960B938";
const ADMIN = "0xFC08757c505eA28709dF66E54870fB6dE09f0C5E";

interface IPaladinClaims {
  id: number;
  user: string;
  token: string;
  amount: string;
  index: number;
  period: number;
  questId: number;
  gauge: string;
  proofs: Array<string>;
  path: string;
  distributor: string;
  chainId: number;
}

describe("CLeverCVXLocker.spec", async () => {
  let deployer: HardhatEthersSigner;
  let keeper: HardhatEthersSigner;
  let admin: HardhatEthersSigner;

  let locker: CLeverCVXLocker;
  let converter: MultiPathConverter;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, KEEPER, ADMIN]);
    deployer = await ethers.getSigner(DEPLOYER);
    keeper = await ethers.getSigner(KEEPER);
    admin = await ethers.getSigner(ADMIN);

    await mockETHBalance(deployer.address, ethers.parseEther("100"));
    await mockETHBalance(keeper.address, ethers.parseEther("100"));
    await mockETHBalance(admin.address, ethers.parseEther("100"));

    const proxyAdmin = await ethers.getContractAt("ProxyAdmin", "0x1F57286F7a8083fb363d87Bc8b1DCcD685dc87EE", admin);
    locker = await ethers.getContractAt("CLeverCVXLocker", "0x96C68D861aDa016Ed98c30C810879F9df7c64154", admin);

    const MultiPathConverter = await ethers.getContractFactory("MultiPathConverter", deployer);
    converter = await MultiPathConverter.deploy("0x11C907b3aeDbD863e551c37f21DD3F36b28A6784");

    const CLeverCVXLocker = await ethers.getContractFactory("CLeverCVXLocker", deployer);
    const newImpl = await CLeverCVXLocker.deploy();

    await proxyAdmin.upgrade(locker.getAddress(), newImpl.getAddress());
  });

  it("should succeed to harvest votium round 71", async () => {
    const claimParams = loadParams(71);
    const routes: Array<CLeverCVXLocker.ConvertParamStruct> = [];
    const routeToCVX = MULTI_PATH_CONVERTER_ROUTES.WETH.CVX;
    const paramToCVX = {
      target: await converter.getAddress(),
      spender: await converter.getAddress(),
      data: converter.interface.encodeFunctionData("convert", [
        TOKENS.WETH.address,
        MaxUint256,
        routeToCVX.encoding,
        routeToCVX.routes,
      ]),
    };
    for (const item of claimParams) {
      const symbol: string = Object.entries(TOKENS).filter(
        ([, { address }]) => address.toLowerCase() === item.token.toLowerCase()
      )[0][0];

      const routeToETH = ["WETH", "CVX"].includes(symbol)
        ? { encoding: 0n, routes: [] }
        : MULTI_PATH_CONVERTER_ROUTES[symbol].WETH;
      const paramToETH =
        routeToETH.encoding === 0n
          ? { target: ZeroAddress, spender: ZeroAddress, data: "0x" }
          : {
              target: await converter.getAddress(),
              spender: await converter.getAddress(),
              data: converter.interface.encodeFunctionData("convert", [
                item.token,
                item.amount,
                routeToETH.encoding,
                routeToETH.routes,
              ]),
            };
      const estimate = BigInt(
        await ethers.provider.call({
          from: KEEPER,
          to: await locker.getAddress(),
          data: locker.interface.encodeFunctionData("harvestVotiumLikeBribes", [
            "0x378Ba9B73309bE80BF4C2c027aAD799766a7ED5A",
            [item],
            [paramToETH, paramToCVX],
            0n,
          ]),
        })
      );
      const tokenAmountStr = ethers.formatUnits(item.amount, TOKENS[symbol].decimals);
      const cvxAmountStr = ethers.formatEther(estimate.toString());
      console.log(`token[${symbol}]`, `address[${item.token}]`, `amount[${tokenAmountStr}]`, `CVX[${cvxAmountStr}]`);
      if (routeToETH.encoding > 0n) {
        showMultiPathRoutes(symbol, "WETH", 2);
      }
      routes.push(paramToETH);
    }
    routes.push(paramToCVX);
    const estimate = BigInt(
      await ethers.provider.call({
        from: KEEPER,
        to: await locker.getAddress(),
        data: locker.interface.encodeFunctionData("harvestVotiumLikeBribes", [
          "0x378Ba9B73309bE80BF4C2c027aAD799766a7ED5A",
          claimParams,
          routes,
          0n,
        ]),
      })
    );
    const gasEstimate = await ethers.provider.estimateGas({
      from: KEEPER,
      to: await locker.getAddress(),
      data: locker.interface.encodeFunctionData("harvestVotiumLikeBribes", [
        "0x378Ba9B73309bE80BF4C2c027aAD799766a7ED5A",
        claimParams,
        routes,
        0n,
      ]),
    });
    console.log("estimate harvested CVX:", ethers.formatEther(estimate.toString()));
    console.log("gas estimate:", gasEstimate.toString());
  });

  const harvestPaladinLikeBribes = async (claims: Array<IPaladinClaims>) => {
    claims.sort((a, b) => {
      const r = BigInt(a.token) - BigInt(b.token);
      if (r > 0n) return 1;
      if (r < 0n) return -1;
      return 0;
    });

    const routes: Array<CLeverCVXLocker.ConvertParamStruct> = [];
    const routeToCVX = MULTI_PATH_CONVERTER_ROUTES.WETH.CVX;
    const paramToCVX = {
      target: await converter.getAddress(),
      spender: await converter.getAddress(),
      data: converter.interface.encodeFunctionData("convert", [
        TOKENS.WETH.address,
        MaxUint256,
        routeToCVX.encoding,
        routeToCVX.routes,
      ]),
    };
    for (let i = 0; i < claims.length; ) {
      let j = i;
      let tokenSum = 0n;
      while (j < claims.length && same(claims[i].token, claims[j].token)) {
        tokenSum += BigInt(claims[j].amount);
        ++j;
      }
      const symbol: string = Object.entries(TOKENS).filter(([, { address }]) => same(address, claims[i].token))[0][0];
      const routeToETH = ["WETH", "CVX"].includes(symbol)
        ? { encoding: 0n, routes: [] }
        : MULTI_PATH_CONVERTER_ROUTES[symbol].WETH;
      const paramToETH =
        routeToETH.encoding === 0n
          ? { target: ZeroAddress, spender: ZeroAddress, data: "0x" }
          : {
              target: await converter.getAddress(),
              spender: await converter.getAddress(),
              data: converter.interface.encodeFunctionData("convert", [
                claims[i].token,
                tokenSum,
                routeToETH.encoding,
                routeToETH.routes,
              ]),
            };
      const estimate = BigInt(
        await ethers.provider.call({
          from: KEEPER,
          to: await locker.getAddress(),
          data: locker.interface.encodeFunctionData("harvestPaladinLikeBribes", [
            claims[i].distributor,
            claims.slice(i, j).map((x) => {
              return {
                questID: x.questId,
                period: x.period,
                index: x.index,
                amount: x.amount,
                merkleProof: x.proofs,
              };
            }),
            [paramToETH, paramToCVX],
            0n,
          ]),
        })
      );
      const tokenAmountStr = ethers.formatUnits(tokenSum, TOKENS[symbol].decimals);
      const cvxAmountStr = ethers.formatEther(estimate.toString());
      console.log(
        `token[${symbol}]`,
        `address[${claims[i].token}]`,
        `amount[${tokenAmountStr}]`,
        `CVX[${cvxAmountStr}]`
      );
      if (routeToETH.encoding > 0n) {
        showMultiPathRoutes(symbol, "WETH", 2);
      }
      routes.push(paramToETH);
      i = j;
    }
    routes.push(paramToCVX);
    const estimate = BigInt(
      await ethers.provider.call({
        from: KEEPER,
        to: await locker.getAddress(),
        data: locker.interface.encodeFunctionData("harvestPaladinLikeBribes", [
          claims[0].distributor,
          claims.map((x) => {
            return {
              questID: x.questId,
              period: x.period,
              index: x.index,
              amount: x.amount,
              merkleProof: x.proofs,
            };
          }),
          routes,
          0n,
        ]),
      })
    );
    const gasEstimate = await ethers.provider.estimateGas({
      from: KEEPER,
      to: await locker.getAddress(),
      data: locker.interface.encodeFunctionData("harvestPaladinLikeBribes", [
        claims[0].distributor,
        claims.map((x) => {
          return {
            questID: x.questId,
            period: x.period,
            index: x.index,
            amount: x.amount,
            merkleProof: x.proofs,
          };
        }),
        routes,
        0n,
      ]),
    });
    console.log("estimate harvested CVX:", ethers.formatEther(estimate.toString()));
    console.log("gas estimate:", gasEstimate.toString());
  };

  it("should succeed to harvest paladin/fxn", async () => {
    const claimsFXN = [
      {
        id: 13781,
        user: "0x96C68D861aDa016Ed98c30C810879F9df7c64154",
        token: "0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f",
        amount: "1430882498588391583839",
        index: 8,
        period: 1710374400,
        questId: 0,
        gauge: "0xf0A3ECed42Dbd8353569639c0eaa833857aA0A75",
        proofs: [
          "0xacfcf6031e0d0677faf5f454f3245202efcf704e17ea157801ee6edab358ed5a",
          "0xbd37c5d8726216aa9ea940643d66fac76cf2ce44ed220e89e196c8ceffd08746",
          "0x4406beb33b5948275d261120f348083b862b10222e7f62cc5e0240a4a2ce2dcf",
          "0xcf4d0eeb37e8ea4d317da3ba3b3f40ff6d064bcd1914fed6e4019857a97a75c8",
          "0x4a38dca9720532da172a4d756b89db0bbd8988029ccbf1e5342179bb67c7571b",
        ],
        path: "fxn",
        distributor: "0x1cfd55b818a34FFA135F0FFC2dc6A790dECD6079",
        chainId: 1,
      },
      {
        id: 13825,
        user: "0x96C68D861aDa016Ed98c30C810879F9df7c64154",
        token: "0x41D5D79431A913C4aE7d69a668ecdfE5fF9DFB68",
        amount: "16527798036143514741",
        index: 3,
        period: 1710374400,
        questId: 1,
        gauge: "0x61F32964C39Cca4353144A6DB2F8Efdb3216b35B",
        proofs: [
          "0xfb0054a6fcc7e20857399e1364123a70f473872b3ee5db7bc5a309aa445210b0",
          "0x68adb84e05275a2c9939d42e21c0445364da8bb8c7e1ae1baa0eef081f4a8c1b",
        ],
        path: "fxn",
        distributor: "0x1cfd55b818a34FFA135F0FFC2dc6A790dECD6079",
        chainId: 1,
      },
      {
        id: 13980,
        user: "0x96C68D861aDa016Ed98c30C810879F9df7c64154",
        token: "0x41D5D79431A913C4aE7d69a668ecdfE5fF9DFB68",
        amount: "16532890637029536892",
        index: 3,
        period: 1710979200,
        questId: 1,
        gauge: "0x61F32964C39Cca4353144A6DB2F8Efdb3216b35B",
        proofs: [
          "0xce300ce2d5c6f2d8c326e5a7017ed3d31ca3c8401ce83fc8c7bc146385428a06",
          "0x298c6c50feaeafc0e944063327712d6888d4e5f58fe7ccca655a7919c1585cf1",
          "0x24698fc7924f02b887562df35adb3c57de763ef4014a919adfb36a930671c2e9",
          "0xc05c3e129f70acb1004437a69020ff6d725c936567c33cc2e1f70ae29dab61d8",
          "0xea9e38fd71637b68c0f856f0c9384b9be23a826e6bce6d03cd80bb672c65aaac",
        ],
        path: "fxn",
        distributor: "0x1cfd55b818a34FFA135F0FFC2dc6A790dECD6079",
        chainId: 1,
      },
      {
        id: 14059,
        user: "0x96C68D861aDa016Ed98c30C810879F9df7c64154",
        token: "0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f",
        amount: "1439307985193035413476",
        index: 8,
        period: 1710979200,
        questId: 0,
        gauge: "0xf0A3ECed42Dbd8353569639c0eaa833857aA0A75",
        proofs: [
          "0xfbfedcf44d5eb11168f46027cbc4152f6a4dd77441a5edea54fe900f523c4c57",
          "0xcfa3835d43eb9c2e583ca29edadd1a263a0586a02c7460010cbf71891bbceb07",
        ],
        path: "fxn",
        distributor: "0x1cfd55b818a34FFA135F0FFC2dc6A790dECD6079",
        chainId: 1,
      },
    ];
    await harvestPaladinLikeBribes(claimsFXN);
  });

  it("should succeed to harvest paladin/crv", async () => {
    const claimsCRV = [
      {
        id: 14042,
        user: "0x96C68D861aDa016Ed98c30C810879F9df7c64154",
        token: "0x9c354503C38481a7A7a51629142963F98eCC12D0",
        amount: "63699658280642425872668",
        index: 11,
        period: 1710979200,
        questId: 102,
        gauge: "0xd03BE91b1932715709e18021734fcB91BB431715",
        proofs: [
          "0x92acd7cc403f89ddf0f919ab5947ada0b88501a0e011830ae544b668061e7352",
          "0xcd8346e44b6334acb04e2d1b68678d31e71125a767710038443ae962772d6003",
          "0xd2138477ea17ea01c667e0338e2f791ceef8f502d8330b38cfa044f5af15f915",
          "0x05d113329698cd6a1833c293d958ae7f84095dd63278e0c1ac784b7d0bbe736b",
        ],
        path: "crv",
        distributor: "0x999881aA210B637ffF7d22c8566319444B38695B",
        chainId: 1,
      },
    ];
    await harvestPaladinLikeBribes(claimsCRV);
  });
});
