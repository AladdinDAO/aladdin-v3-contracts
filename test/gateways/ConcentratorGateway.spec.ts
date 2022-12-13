/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { ACRV_VAULTS, ADDRESS, DEPLOYED_CONTRACTS, AVAILABLE_VAULTS } from "../../scripts/utils";
import { AladdinConvexVault, ConcentratorGateway } from "../../typechain";
import { request_fork } from "../utils";

const FORK_PARAMS: {
  number: number;
  tokens: {
    [symbol: string]: {
      holder: string;
      amount: string;
    };
  };
} = {
  number: 14933540,
  tokens: {
    WETH: {
      holder: "0xc564ee9f21ed8a2d8e7e76c085740d5e4c5fafbe",
      amount: "10000",
    },
    USDC: {
      holder: "0xc564ee9f21ed8a2d8e7e76c085740d5e4c5fafbe",
      amount: "10000",
    },
    USDT: {
      holder: "0xc564ee9f21ed8a2d8e7e76c085740d5e4c5fafbe",
      amount: "10000",
    },
    DAI: {
      holder: "0xc564ee9f21ed8a2d8e7e76c085740d5e4c5fafbe",
      amount: "10000",
    },
    stETH: {
      holder: "0x2faf487a4414fe77e2327f0bf4ae2a264a776ad2",
      amount: "1000",
    },
    FRAX: {
      holder: "0xc564ee9f21ed8a2d8e7e76c085740d5e4c5fafbe",
      amount: "10000",
    },
    WBTC: {
      holder: "0xc564ee9f21ed8a2d8e7e76c085740d5e4c5fafbe",
      amount: "100",
    },
    renBTC: {
      holder: "0x593c427d8c7bf5c555ed41cd7cb7cce8c9f15bb5",
      amount: "100",
    },
    CRV: {
      holder: "0xc564ee9f21ed8a2d8e7e76c085740d5e4c5fafbe",
      amount: "10000",
    },
    cvxCRV: {
      holder: "0x94dfce828c3daaf6492f1b6f66f9a1825254d24b",
      amount: "10000",
    },
    CVX: {
      holder: "0xaba85673458b876c911ccff5e3711bcedb3b4f56",
      amount: "10000",
    },
    FXS: {
      holder: "0xc564ee9f21ed8a2d8e7e76c085740d5e4c5fafbe",
      amount: "1000",
    },
    cvxFXS: {
      holder: "0x6979e645b7cd48c7181ece3c931be9261394aa29",
      amount: "100",
    },
    UST_WORMHOLE: {
      holder: "0x324597ba077df37fd4761e0db96e8d6f85300b85",
      amount: "1000",
    },
    UST_TERRA: {
      holder: "0xde958db08c7bf2b1d06d45a29c29d53cdcfc8af0",
      amount: "1000",
    },
    rETH: {
      holder: "0xeadb3840596cabf312f2bc88a4bb0b93a4e1ff5f",
      amount: "100",
    },
    wstETH: {
      holder: "0x73d74af472d263af365588e5271036191a27883e",
      amount: "100",
    },
    TRICRV: {
      holder: "0x85eb61a62701be46479c913717e8d8fad42b398d",
      amount: "10000",
    },
    PUSD: {
      holder: "0x9dea480cafef5538f42720ffbd57ae55e53f3bfa",
      amount: "10000",
    },
  },
};

const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";

describe("ConcentratorGateway.spec", async () => {
  let deployer: SignerWithAddress;
  let owner: SignerWithAddress;
  let vault: AladdinConvexVault;
  let gateway: ConcentratorGateway;

  ACRV_VAULTS.forEach(({ name }, pid) => {
    if (pid >= 12 || name === "ust-wormhole") return;
    const { token: prefix, deposit: add } = AVAILABLE_VAULTS[name];
    const lpAddress = ADDRESS[`${prefix}_TOKEN`];

    context(`gateway test for pool[${name}]`, async () => {
      beforeEach(async () => {
        const holders = Object.keys(add).map((token) => FORK_PARAMS.tokens[token].holder);
        holders.push(DEPLOYER);
        holders.push(DEPLOYED_CONTRACTS.CommunityMultisig);

        await request_fork(FORK_PARAMS.number, holders);
        deployer = await ethers.getSigner(DEPLOYER);
        owner = await ethers.getSigner(DEPLOYED_CONTRACTS.CommunityMultisig);
        await deployer.sendTransaction({ to: owner.address, value: ethers.utils.parseEther("10") });

        const proxyAdmin = await ethers.getContractAt("ProxyAdmin", DEPLOYED_CONTRACTS.ProxyAdmin, owner);

        const AladdinConvexVault = await ethers.getContractFactory("AladdinConvexVault", deployer);
        const impl = await AladdinConvexVault.deploy();
        await impl.deployed();

        vault = await ethers.getContractAt("AladdinConvexVault", DEPLOYED_CONTRACTS.AladdinConvexVault);

        await proxyAdmin.upgrade(vault.address, impl.address);

        const TokenZapLogic = await ethers.getContractFactory("TokenZapLogic", deployer);
        const logic = await TokenZapLogic.deploy();
        await logic.deployed();

        const ConcentratorGateway = await ethers.getContractFactory("ConcentratorGateway", deployer);
        gateway = await ConcentratorGateway.deploy(logic.address);
        await gateway.deployed();
      });

      Object.entries(add).forEach(([symbol, routes]) => {
        const address = ADDRESS[symbol];
        // console.log(symbol, address, FORK_PARAMS.tokens[symbol]);
        const { holder, amount } = FORK_PARAMS.tokens[symbol];

        it(`should succeed, when zap from [${symbol}]`, async () => {
          const signer = await ethers.getSigner(holder);
          await deployer.sendTransaction({ to: signer.address, value: ethers.utils.parseEther("10") });
          const token = await ethers.getContractAt("ERC20", address, signer);
          const decimals = await token.decimals();
          const amountIn = ethers.utils.parseUnits(amount, decimals);

          await token.approve(gateway.address, amountIn);
          const sharesOut = await gateway
            .connect(signer)
            .callStatic.deposit(vault.address, pid, token.address, lpAddress, amountIn, routes, 0);
          const shareBefore = await vault.getUserShare(pid, signer.address);
          const tx = await gateway
            .connect(signer)
            .deposit(vault.address, pid, token.address, lpAddress, amountIn, routes, 0);
          const receipt = await tx.wait();
          const shareAfter = await vault.getUserShare(pid, signer.address);
          expect(shareAfter.sub(shareBefore)).to.eq(sharesOut);
          console.log(
            "amountIn:",
            amount,
            "sharesOut:",
            ethers.utils.formatEther(sharesOut),
            "gas:",
            receipt.gasUsed.toString()
          );
        });

        if (symbol === "WETH") {
          it("should succeed, when zap from [ETH]", async () => {
            const amountIn = ethers.utils.parseUnits(amount, 18);
            const sharesOut = await gateway.callStatic.deposit(
              vault.address,
              pid,
              constants.AddressZero,
              lpAddress,
              amountIn,
              routes,
              0,
              { value: amountIn }
            );
            const shareBefore = await vault.getUserShare(pid, deployer.address);
            const tx = await gateway.deposit(
              vault.address,
              pid,
              constants.AddressZero,
              lpAddress,
              amountIn,
              routes,
              0,
              {
                value: amountIn,
              }
            );
            const receipt = await tx.wait();
            const shareAfter = await vault.getUserShare(pid, deployer.address);
            expect(shareAfter.sub(shareBefore)).to.eq(sharesOut);
            console.log(
              "amountIn:",
              amount,
              "sharesOut:",
              ethers.utils.formatEther(sharesOut),
              "gas:",
              receipt.gasUsed.toString()
            );
          });
        }
      });
    });
  });
});
