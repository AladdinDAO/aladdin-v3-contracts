/* eslint-disable camelcase */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { MaxUint256 } from "ethers";
import { ethers } from "hardhat";

import { CLeverCVXLocker, MultiPathConverter } from "@/types/index";
import { MULTI_PATH_CONVERTER_ROUTES, TOKENS } from "@/utils/index";
import { mockETHBalance, request_fork } from "@/test/utils";

const KEEPER = "0x11E91BB6d1334585AA37D8F4fde3932C7960B938";
const CLEVER_LOCKER_IMPL = "0x8E58F45E69732F3C602075F010ab35902Ce62771";
const CLEVER_LOCKER = "0x96C68D861aDa016Ed98c30C810879F9df7c64154";
const MULTI_PATH_CONVERTER = "0x0c439DB9b9f11E7F2D4624dE6d0f8FfC23DCd1f8";
const ADMIN = "0xFC08757c505eA28709dF66E54870fB6dE09f0C5E";
const FORK_HEIGHT = 21462280;

describe("CLeverCVXLockerUpgrade.spec", async () => {
  let keeper: HardhatEthersSigner;
  let admin: HardhatEthersSigner;

  let clever: CLeverCVXLocker;
  let converter: MultiPathConverter;

  beforeEach(async () => {
    await request_fork(FORK_HEIGHT, [ADMIN, KEEPER]);
    keeper = await ethers.getSigner(KEEPER);
    admin = await ethers.getSigner(ADMIN);

    const proxyAdmin = await ethers.getContractAt("ProxyAdmin", "0x1F57286F7a8083fb363d87Bc8b1DCcD685dc87EE", admin);
    clever = await ethers.getContractAt("CLeverCVXLocker", CLEVER_LOCKER, keeper);
    converter = await ethers.getContractAt("MultiPathConverter", MULTI_PATH_CONVERTER, keeper);

    await proxyAdmin.upgrade(clever.getAddress(), CLEVER_LOCKER_IMPL);
    await mockETHBalance(keeper.address, ethers.parseEther("100"));
  });

  it("should succeed", async () => {
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
    const routeToWETH = MULTI_PATH_CONVERTER_ROUTES.ZUN.WETH;
    const paramToWETH = {
      target: await converter.getAddress(),
      spender: await converter.getAddress(),
      data: converter.interface.encodeFunctionData("convert", [
        "0x6b5204B0Be36771253Cc38e88012E02B752f0f36",
        10132459038476324858310n,
        routeToWETH.encoding,
        routeToWETH.routes,
      ]),
    };
    const output = await clever.harvestUniversalRewardsDistributorBribes.staticCall(
      "0x000000006feeE0b7a0564Cd5CeB283e10347C4Db",
      [
        {
          reward: "0x6b5204B0Be36771253Cc38e88012E02B752f0f36",
          claimable: 10132459038476324858310n,
          proof: [
            "0x19794a93ebe41e2208f1bbb9de4030750ea9a0b0c191da40f3da233338e78286",
            "0xe33ab1d1f6ea8ffdb9135918d0812980c7f3016d2fc36b7b44dc117ea9bc532a",
          ],
        },
      ],
      [paramToWETH, paramToCVX],
      0n
    );
    console.log("ZUN => CVX:", ethers.formatEther(output));
    await clever.harvestUniversalRewardsDistributorBribes(
      "0x000000006feeE0b7a0564Cd5CeB283e10347C4Db",
      [
        {
          reward: "0x6b5204B0Be36771253Cc38e88012E02B752f0f36",
          claimable: 10132459038476324858310n,
          proof: [
            "0x19794a93ebe41e2208f1bbb9de4030750ea9a0b0c191da40f3da233338e78286",
            "0xe33ab1d1f6ea8ffdb9135918d0812980c7f3016d2fc36b7b44dc117ea9bc532a",
          ],
        },
      ],
      [paramToWETH, paramToCVX],
      0n
    );
  });
});
