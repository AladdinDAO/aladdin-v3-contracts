/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
import { BigNumber, constants } from "ethers";
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
import { DEPLOYED_CONTRACTS } from "./utils";

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
      distributor: {
        [symbol: string]: string;
      };
    };
  };
} = {
  impls: {
    GovernanceToken: "0xE10CC35487b4770adf9aeFb1D9f8F3a2Eaae562A",
    Minter: "0xEbA9A8fdd2539d33e070c66Afc1127478bA78054",
    VotingEscrow: "0x3D8faCB2b65B8CEB682ADE00E016c672Ee6262c0",
    GaugeController: "0xdBB1AAeb04F3B5e2587E4bB849717E9ebD0c8acC",
    LiquidityGaugeV3: "0x4745E0F6Ffb2cFE40F9E0088F9F66a245C70395d",
    FeeDistributor: "",
  },
  protocols: {
    fx: {
      ProxyAdmin: DEPLOYED_CONTRACTS.Fx.ProxyAdmin,
      token: {
        name: "FX Token",
        symbol: "FX",
        initSupply: ethers.utils.parseEther("1020000"),
        initRate: ethers.utils.parseEther("98000").div(86400 * 365), // 10% first year
        rateReductionCoefficient: BigNumber.from("1111111111111111111"), // 1/0.9 * 1e18
        address: "0x4eECa6bFa3C96210260691639827eEF4D80FA8C6",
      },
      ve: "0x8d6D41b883eAD56b5a8854946dD6a446624CD5b6",
      controller: "0xe6AAF8fBB56488941f619A9ADB0EB4d89fA9d217",
      minter: "0x7185E3477Ad54A8186e623768833e8C2686591D3",
      distributor: {},
    },
    concentrator: {
      ProxyAdmin: DEPLOYED_CONTRACTS.Concentrator.ProxyAdmin,
      token: {
        name: "Concentrator Token",
        symbol: "CTR",
        initSupply: constants.Zero,
        initRate: constants.Zero,
        rateReductionCoefficient: constants.Zero,
        address: DEPLOYED_CONTRACTS.Concentrator.CTR,
      },
      ve: DEPLOYED_CONTRACTS.Concentrator.veCTR,
      controller: constants.AddressZero,
      minter: constants.AddressZero,
      distributor: {
        aCRV: DEPLOYED_CONTRACTS.Concentrator.FeeDistributor.aCRV,
        asdCRV: "",
        CVX: "",
        afrxETH: "",
        aFXS: "",
      },
    },
    clever: {
      ProxyAdmin: DEPLOYED_CONTRACTS.CLever.ProxyAdmin,
      token: {
        name: "CLever Token",
        symbol: "CLEV",
        initSupply: constants.Zero,
        initRate: constants.Zero,
        rateReductionCoefficient: constants.Zero,
        address: DEPLOYED_CONTRACTS.CLever.CLEV,
      },
      ve: DEPLOYED_CONTRACTS.CLever.veCLEV,
      controller: DEPLOYED_CONTRACTS.CLever.GaugeController,
      minter: DEPLOYED_CONTRACTS.CLever.CLEVMinter,
      distributor: {
        CVX: DEPLOYED_CONTRACTS.CLever.FeeDistributor.CVX,
        FRAX: DEPLOYED_CONTRACTS.CLever.FeeDistributor.FRAX,
      },
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

  for (const name of ["GovernanceToken", "Minter", "GaugeController", "VotingEscrow"]) {
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