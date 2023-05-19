/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import {
  GaugeController,
  GovernanceToken,
  GovernanceToken__factory,
  GaugeController__factory,
  Minter,
  Minter__factory,
  VotingEscrow,
  VotingEscrow__factory,
} from "../typechain";

const config: {
  impls: { [name: string]: string };
  protocols: {
    [protocol: string]: {
      ProxyAdmin: string;
      token: {
        name: string;
        symbol: string;
        initSupply: BigNumber;
        initRate: BigNumber;
        rateReductionCoefficient: BigNumber;
        address: string;
      };
      ve: string;
      controller: string;
      minter: string;
    };
  };
} = {
  impls: {
    GovernanceToken: "0x126255b191D424B1CB8ec47aEBE16d0345aE483E",
    Minter: "0x1cF484E6B8dBe0d40EdB9054338481F3763c476F",
    VotingEscrow: "0x3158c23ef1C8c6A672fcFd05E1845dD02B99A46B",
    GaugeController: "0x0E29A90D7797E92C4b76346dF06cb7c0bA0e2df6",
    LiquidityGaugeV3: "0x4745E0F6Ffb2cFE40F9E0088F9F66a245C70395d",
    FeeDistributor: "0x9F64b9d6aE4f4D933CC009D89929Ad8E89fde49d",
  },
  protocols: {
    fx: {
      ProxyAdmin: "0x588b85AA6074CcABE631D739eD42aa355012a534",
      token: {
        name: "f(x)",
        symbol: "FX",
        initSupply: ethers.utils.parseEther("1000000"),
        initRate: ethers.utils.parseEther("100000").div(86400 * 365), // 10% first year
        rateReductionCoefficient: BigNumber.from("1111111111111111111"), // 1/0.9 * 1e18
        address: "0x2CD2e2e84985392D818178baEa8222cbB62F30A5",
      },
      ve: "0x8d6D41b883eAD56b5a8854946dD6a446624CD5b6",
      controller: "0x517FF73C1E18941cb64954Af94109628f35AB5b3",
      minter: "0xf2b854CD6316D03Ba7f5F211841aAE86e81569F4",
    },
  },
};

const maxFeePerGas = 30e9;
const maxPriorityFeePerGas = 1.2e9;

async function main() {
  const overrides = {
    maxFeePerGas: maxFeePerGas,
    maxPriorityFeePerGas: maxPriorityFeePerGas,
  };

  const [deployer] = await ethers.getSigners();
  if (deployer.address !== "0x07dA2d30E26802ED65a52859a50872cfA615bD0A") {
    console.log("invalid deployer");
    return;
  }

  for (const name of [
    "GovernanceToken",
    "Minter",
    "VotingEscrow",
    "GaugeController",
    "LiquidityGaugeV3",
    "FeeDistributor",
  ]) {
    if (config.impls[name] === "") {
      const Contract = await ethers.getContractFactory(name, deployer);
      const impl = await Contract.deploy(overrides);
      console.log(`Deploying ${name} Impl hash:`, impl.deployTransaction.hash);
      await impl.deployed();
      const receipt = await impl.deployTransaction.wait();
      console.log(`✅ Deploy ${name} Impl at:`, impl.address, "gas used:", receipt.gasUsed.toString());
      config.impls[name] = impl.address;
    } else {
      console.log(`Found ${name} Impl at:`, config.impls[name]);
    }
  }

  const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy", deployer);

  // f(x) protocol
  const fx = config.protocols.fx;

  let token: GovernanceToken;
  if (fx.token.address !== "") {
    token = await ethers.getContractAt("GovernanceToken", fx.token.address, deployer);
    console.log(`Found ${fx.token.symbol} at:`, token.address);
  } else {
    const data = GovernanceToken__factory.createInterface().encodeFunctionData("initialize", [
      fx.token.initSupply,
      fx.token.initRate,
      fx.token.rateReductionCoefficient,
      deployer.address,
      fx.token.name,
      fx.token.symbol,
    ]);

    const proxy = await TransparentUpgradeableProxy.deploy(
      config.impls.GovernanceToken,
      fx.ProxyAdmin,
      data,
      overrides
    );
    console.log(`Deploying ${fx.token.symbol}, hash:`, proxy.deployTransaction.hash);
    const receipt = await proxy.deployTransaction.wait();
    console.log(`✅ Deploy ${fx.token.symbol}, at:`, proxy.address, "gas used:", receipt.gasUsed.toString());

    token = await ethers.getContractAt("GovernanceToken", proxy.address, deployer);
    fx.token.address = token.address;
  }

  let ve: VotingEscrow;
  if (fx.ve !== "") {
    ve = await ethers.getContractAt("VotingEscrow", fx.ve, deployer);
    console.log(`Found VotingEscrow of ${fx.token.symbol} at:`, ve.address);
  } else {
    const data = VotingEscrow__factory.createInterface().encodeFunctionData("initialize", [
      deployer.address,
      token.address,
      "Voting Escrow " + fx.token.name,
      "ve" + fx.token.symbol,
      "1.0.0",
    ]);

    const proxy = await TransparentUpgradeableProxy.deploy(config.impls.VotingEscrow, fx.ProxyAdmin, data, overrides);
    console.log(`Deploying VotingEscrow of ${fx.token.symbol}, hash:`, proxy.deployTransaction.hash);
    const receipt = await proxy.deployTransaction.wait();
    console.log(
      `✅ Deploy VotingEscrow of ${fx.token.symbol}, at:`,
      proxy.address,
      "gas used:",
      receipt.gasUsed.toString()
    );

    ve = await ethers.getContractAt("VotingEscrow", proxy.address, deployer);
    fx.ve = ve.address;
  }

  let controller: GaugeController;
  if (fx.controller !== "") {
    controller = await ethers.getContractAt("GaugeController", fx.controller, deployer);
    console.log(`Found GaugeController of ${fx.token.symbol} at:`, controller.address);
  } else {
    const data = GaugeController__factory.createInterface().encodeFunctionData("initialize", [
      deployer.address,
      token.address,
      ve.address,
    ]);

    const proxy = await TransparentUpgradeableProxy.deploy(
      config.impls.GaugeController,
      fx.ProxyAdmin,
      data,
      overrides
    );
    console.log(`Deploying GaugeController of ${fx.token.symbol}, hash:`, proxy.deployTransaction.hash);
    const receipt = await proxy.deployTransaction.wait();
    console.log(
      `✅ Deploy GaugeController of ${fx.token.symbol}, at:`,
      proxy.address,
      "gas used:",
      receipt.gasUsed.toString()
    );

    controller = await ethers.getContractAt("GaugeController", proxy.address, deployer);
    fx.controller = controller.address;
  }

  let minter: Minter;
  if (fx.minter !== "") {
    minter = await ethers.getContractAt("Minter", fx.minter, deployer);
    console.log(`Found Minter of ${fx.token.symbol} at:`, minter.address);
  } else {
    const data = Minter__factory.createInterface().encodeFunctionData("initialize", [
      token.address,
      controller.address,
    ]);

    const proxy = await TransparentUpgradeableProxy.deploy(config.impls.Minter, fx.ProxyAdmin, data, overrides);
    console.log(`Deploying Minter of ${fx.token.symbol}, hash:`, proxy.deployTransaction.hash);
    const receipt = await proxy.deployTransaction.wait();
    console.log(`✅ Deploy Minter of ${fx.token.symbol}, at:`, proxy.address, "gas used:", receipt.gasUsed.toString());

    minter = await ethers.getContractAt("Minter", proxy.address, deployer);
    fx.minter = minter.address;
  }

  if ((await token.minter({ gasLimit: 1e6 })) !== minter.address) {
    const tx = await token.set_minter(minter.address);
    console.log("Set minter, hash:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Done gas used:", receipt.gasUsed.toString());
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
