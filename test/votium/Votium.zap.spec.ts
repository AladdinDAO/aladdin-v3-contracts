/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { ADDRESS, TOKENS, ZAP_ROUTES } from "../../scripts/utils";
import { AladdinZap, IERC20 } from "../../typechain";
// eslint-disable-next-line camelcase
import { request_fork } from "../utils";

const PROXY_ADMIN = "0x12b1326459d72F2Ab081116bf27ca46cD97762A0";
const ZAP = "0x1104b4DF568fa7Af90B1Bed1D78A2F71e748dc8a";
const ZAP_OWNER = "0x28c921adAC4c1072658eB01a28DA06b5F651eF62";
const PROXY_OWNER = "0xc40549aa1D05C30af23a1C4a5af6bA11FCAFe23F";
const CVX = ADDRESS.CVX;

interface IZapForkConfig {
  height: number;
  deployer: string;
  holder: string;
  amount: string;
  update_impl: boolean;
}

const zap_fork_config: { [symbol: string]: IZapForkConfig } = {
  FXS: {
    height: 14699276,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    holder: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
    amount: "1000",
    update_impl: false,
  },
  UST_WORMHOLE: {
    height: 14699276,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    holder: "0x2FAF487A4414Fe77e2327F0bf4AE2a264a776AD2",
    amount: "10000",
    update_impl: false,
  },
  ALCX: {
    height: 14699276,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    holder: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
    amount: "300",
    update_impl: false,
  },
  SPELL: {
    height: 14699276,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    holder: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
    amount: "6000000",
    update_impl: false,
  },
  LYRA: {
    height: 14699276,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    holder: "0xDB5Ac83c137321Da29a59a7592232bC4ed461730",
    amount: "60000",
    update_impl: false,
  },
  SNX: {
    height: 14699276,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    holder: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
    amount: "6000",
    update_impl: false,
  },
  GRO: {
    height: 14699276,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    holder: "0x5f8cD5141B44d01c61DBd642C7f111497482523E",
    amount: "6000",
    update_impl: false,
  },
  FLX: {
    height: 14699276,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    holder: "0xCa86D57519dbFE34A25EEf0923b259ab07986B71",
    amount: "250",
    update_impl: false,
  },
  ANGLE: {
    height: 14699276,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    holder: "0x2Fc443960971e53FD6223806F0114D5fAa8C7C4e",
    amount: "100000",
    update_impl: false,
  },
  STG: {
    height: 14790822,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    holder: "0x2faf487a4414fe77e2327f0bf4ae2a264a776ad2",
    amount: "10000",
    update_impl: false,
  },
  TRIBE: {
    height: 14790822,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    holder: "0xf977814e90da44bfa03b6295a0616a897441acec",
    amount: "10000",
    update_impl: false,
  },
  USDN: {
    height: 14877548,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    holder: "0x23518dC490A8e0Fa36d63FE1802dABF54c616C2A",
    amount: "10000",
    update_impl: false,
  },
  JPEG: {
    height: 14877548,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    holder: "0x6206E425BC584AC757E28BCc5555a44Ace4bCfa0",
    amount: "10000000",
    update_impl: false,
  },
  EURS: {
    height: 14877548,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    holder: "0x9362D27fD1827232754eeD59158264BA8a780CBF",
    amount: "15000",
    update_impl: false,
  },
  MTA: {
    height: 14960154,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    holder: "0x2faf487a4414fe77e2327f0bf4ae2a264a776ad2",
    amount: "10000",
    update_impl: false,
  },
  GNO: {
    height: 15038380,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    holder: "0xa4a6a282a7fc7f939e01d62d884355d79f5046c1",
    amount: "1000",
    update_impl: false,
  },
  TUSD: {
    height: 15216460,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    holder: "0xf977814e90da44bfa03b6295a0616a897441acec",
    amount: "10000",
    update_impl: false,
  },
  APEFI: {
    height: 15306980,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    holder: "0xb7b51a80cf280526ad05ba4c578fef7af9adf52c",
    amount: "10000",
    update_impl: false,
  },
  USDD: {
    height: 15306980,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    holder: "0x3ddfa8ec3052539b6c9549f12cea2c295cff5296",
    amount: "10000",
    update_impl: false,
  },
  CRV: {
    height: 15672725,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    holder: "0x5a52e96bacdabb82fd05763e25335261b270efcb",
    amount: "10000",
    update_impl: false,
  },
  OGN: {
    height: 15672725,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    holder: "0x28c6c06298d514db089934071355e5743bf21d60",
    amount: "10000",
    update_impl: false,
  },
  FRAX: {
    height: 15969330,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    holder: "0xC83a1BB26dC153c009d5BAAd9855Fe90cF5A1529",
    amount: "10000",
    update_impl: false,
  },
  BADGER: {
    height: 15969330,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    holder: "0x36cc7b13029b5dee4034745fb4f24034f3f2ffc6",
    amount: "10000",
    update_impl: false,
  },
  CLEV: {
    height: 16474260,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    holder: "0x681ada67950d96dcc9f2951d32353663ed6e59c9",
    amount: "1000",
    update_impl: false,
  },
  INV: {
    height: 16474260,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    holder: "0x1a9e40de2e1851bb1e92d78e760d6110e6e0adc6",
    amount: "100",
    update_impl: false,
  },
  LDO: {
    height: 16546260,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    holder: "0x77b35ea0573868f849c4bee6a1f5dc21d17fa842",
    amount: "10000",
    update_impl: false,
  },
  MULTI: {
    height: 16557630,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    holder: "0x6b67dba58f792eeac6f22142d4b2937d0e5397f8",
    amount: "10000",
    update_impl: false,
  },
  CNC: {
    height: 16770540,
    deployer: "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf",
    holder: "0x991a26269Cc54B42DD108b982Afc550bB517871E",
    amount: "1000",
    update_impl: false,
  },
};

const SYMBOLS = (process.env.SYMBOLS || "").split(",");

describe("Votium.zap.spec", async () => {
  let deployer: SignerWithAddress;
  let owner: SignerWithAddress;
  let zap: AladdinZap;
  let cvx: IERC20;

  const run = async (symbol: string, config: IZapForkConfig) => {
    const decimal = TOKENS[symbol].decimals;
    const address = TOKENS[symbol].address;

    context(`zap from ${symbol} to CVX, fork at: ${config.height}`, async () => {
      beforeEach(async () => {
        request_fork(config.height, [config.deployer, ZAP_OWNER, PROXY_OWNER, config.holder]);
        deployer = await ethers.getSigner(config.deployer);
        owner = await ethers.getSigner(ZAP_OWNER);

        await deployer.sendTransaction({ to: owner.address, value: ethers.utils.parseEther("10") });

        cvx = await ethers.getContractAt("IERC20", CVX, deployer);

        zap = await ethers.getContractAt("AladdinZap", ZAP, owner);

        if (config.update_impl) {
          const proxyOwner = await ethers.getSigner(PROXY_OWNER);
          await deployer.sendTransaction({ to: proxyOwner.address, value: ethers.utils.parseEther("10") });
          const proxyAdmin = await ethers.getContractAt("ProxyAdmin", PROXY_ADMIN, proxyOwner);

          const AladdinZap = await ethers.getContractFactory("AladdinZap", deployer);
          const impl = await AladdinZap.deploy();
          await impl.deployed();

          await proxyAdmin.upgrade(zap.address, impl.address);
        }

        const routes = ZAP_ROUTES[symbol].CVX;
        if (routes !== undefined) {
          await zap.updateRoute(ADDRESS[symbol], CVX, routes);
          console.log(
            `${symbol} to CVX zap:`,
            `from[${ADDRESS[symbol]}]`,
            `to[${CVX}]`,
            `routes[${routes.map((r) => `"${r.toHexString()}"`)}]`
          );
        }
      });

      it("should succeed", async () => {
        const amountIn = ethers.utils.parseUnits(config.amount, decimal);
        const expectCVX = ethers.utils.parseUnits("1", 18);
        const signer = await ethers.getSigner(config.holder);
        await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });

        const token = await ethers.getContractAt("IERC20", address, signer);
        await token.approve(zap.address, amountIn);

        const beforeCVX = await cvx.balanceOf(signer.address);
        await zap.connect(signer).zapFrom(token.address, amountIn, CVX, 0);
        const afterCVX = await cvx.balanceOf(signer.address);

        expect(afterCVX.sub(beforeCVX)).gte(expectCVX);
      });
    });
  };

  for (const [symbol, config] of Object.entries(zap_fork_config)) {
    if (SYMBOLS.includes(symbol)) {
      run(symbol, config);
    }
  }
});
