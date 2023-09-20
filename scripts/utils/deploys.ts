import * as fs from "fs";
import * as path from "path";
import editJsonFile from "edit-json-file";

const CONFIG_FILE_DIR = path.join(__dirname, "../../", "deployments");

export const DEPLOYED_CONTRACTS = {
  CommunityMultisig: "0xc40549aa1D05C30af23a1C4a5af6bA11FCAFe23F",
  ManagementMultisig: "0x28c921adAC4c1072658eB01a28DA06b5F651eF62",
  AladdinZap: "0x1104b4DF568fa7Af90B1Bed1D78A2F71e748dc8a",
  TokenZapLogic: "0xEBdB538e339fB7523C52397087b8f2B06c1A718e",
  CurveGaugeFactory: "0x9098E25a09EfA247EeD07ced3b46546c5A6e58ad",
  AllInOneGateway: "0x6e513d492Ded19AD8211a57Cc6B4493C9E6C857B",
  Converter: {
    registry: "0xa617206663343b6353acF27566586eE9b53DFb2b",
    GeneralTokenConverter: "0xAF345c813CE17Cc5837BfD14a910D365223F3B95", // 0-9
  },
  Concentrator: {
    ProxyAdmin: "0x12b1326459d72F2Ab081116bf27ca46cD97762A0",
    Treasury: "0xA0FB1b11ccA5871fb0225B64308e249B97804E99",
    CTR: "0xb3Ad645dB386D7F6D753B2b9C3F4B853DA6890B8",
    veCTR: "0xe4C09928d834cd58D233CD77B5af3545484B4968",
    MultipleVestHelper: "0xD479C1e6702Db01B27255361908Fc7B083Ef3195",
    FeeDistributor: {
      aCRV: "0xA5D9358c60fC9Bd2b508eDa17c78C67A43A4458C",
    },
    CTRVest: "0x8341889905BdEF85b87cb7644A93F7a482F28742",
    SmartWalletWhitelist: "0x3557bD058D674DD0981a3FF10515432159F63318",
    PlatformFeeDistributor: "0xd2791781C367B2F512396105c8aB26479876e973",
    PlatformFeeSpliter: "0x32366846354DB5C08e92b4Ab0D2a510b2a2380C8",
    GaugeRewardDistributor: "0xF57b53df7326e2c6bCFA81b4A128A92E69Cb87B0",
    cvxCRV: {
      AladdinCRVConvexVault: "0xc8fF37F7d057dF1BB9Ad681b53Fa4726f268E0e8",
      ConcentratorIFOVault: "0x3Cf54F3A1969be9916DAD548f3C084331C4450b5",
      aCRV: "0x2b95A1Dcc3D405535f9ed33c219ab38E8d7e0884",
      CvxCrvStakingWrapperStrategy: "0x94cC627Db80253056B2130aAC39abB252A75F345",
    },
    cvxFXS: {
      AladdinFXSConvexVault: "0xD6E3BB7b1D6Fa75A71d48CFB10096d59ABbf99E1",
      aFXS: "0xDAF03D70Fe637b91bA6E521A32E1Fb39256d3EC9",
    },
    frxETH: {
      ConcentratorGeneralVault: "0x50B47c4A642231dbe0B411a0B2FBC1EBD129346D",
      afrxETH: "0xb15Ad6113264094Fd9BF2238729410A07EBE5ABa",
      AutoCompoundingConvexFraxStrategy: "0xc9cfD6205914AB1E209FfE70326d8dd15fc58187",
    },
    StakeDAO: {
      VeSDTDelegation: "0x6037Bb1BBa598bf88D816cAD90A28cC00fE3ff64",
      StakeDAOLockerProxy: "0x1c0D72a330F2768dAF718DEf8A19BAb019EEAd09",
      sdCRV: {
        asdCRV: "0x43E54C2E7b3e294De3A155785F52AB49d87B9922",
        StakeDAOCRVVault: "0x2b3e72f568F96d7209E20C8B8f4F2A363ee1E3F6",
        ConcentratorVaultForAsdCRV: "0x59866EC5650e9BA00c51f6D681762b48b0AdA3de",
      },
    },
    Gauge: {
      Balancer_CTR_aCRV: {
        poolId: "0x80a8ea2f9ebfc2db9a093bd46e01471267914e490002000000000000000002a2",
        token: "0x80A8eA2f9EBFC2Db9a093BD46E01471267914E49",
        gauge: "0x33e411ebE366D72d058F3eF22F1D0Cf8077fDaB0",
        gateway: "0xb44f8Ba6CD9FfeE97F8482D064E62Ba55edD4D72",
      },
      Curve_CTR_ETH: {
        token: "0x3f0e7916681452D23Cd36B1281457DA721F2E5dF",
        pool: "0xf2f12B364F614925aB8E2C8BFc606edB9282Ba09",
        gauge: "0x5BC3dD6E6b4E5DD811d558843DA6A1bfBB9c9dCa",
      },
    },
    ConcentratorGateway: "0xD069866AceD882582b88E327E9E79Da4c88292B1",
    CompounderGateway: "0x883Fd355deBF417F82Aa9a3E2936971487F7Df1F",
    burners: {
      PlatformFeeBurner: "0x695EB50A92AD2AEBB89C6dD1f3c7546A28411403",
      ConvexFraxCompounderBurner: "0x789E729713ddC80cf2db4e59ca064D3770f1A034",
      StakeDAOCompounderBurner: "0xf954200fD969443b8f853B4083B71cd073C05D5b",
    },
  },
  CLever: {
    ProxyAdmin: "0x1F57286F7a8083fb363d87Bc8b1DCcD685dc87EE",
    Treasury: "0xFC08757c505eA28709dF66E54870fB6dE09f0C5E",
    CLEV: "0x72953a5C32413614d24C29c84a66AE4B59581Bbf",
    veCLEV: "0x94be07d45d57c7973A535C1c517Bd79E602E051e",
    MultipleVestHelper: "0x572DeCa882f4C9ABCBDc6f020601A1b789D11983",
    FeeDistributor: {
      CVX: "0x261E3aEB4cd1ebfD0Fa532d6AcDd4B21EbdCd2De",
      FRAX: "0xb5e7F9cb9d3897808658F1991AD32912959b42E2",
    },
    GaugeController: "0xB992E8E1943f40f89301aB89A5C254F567aF5b63",
    CLEVMinter: "0x4aa2afd5616bEEC2321a9EfD7349400d4F18566A",
    CLEVIDO: "0x07867298d99B95772008583bd603cfA68B8C75E7",
    CLEVVest: "0x84C82d43f1Cc64730849f3E389fE3f6d776F7A4E",
    SmartWalletWhitelist: "0xFC7ea943F62aee5D40c0346DC45C464F74C35267",
    PlatformFeeDistributor: "0xD6eFa5B63531e9ae61e225b02CbACD59092a35bE",
    CLeverCVX: {
      clevCVX: "0xf05e58fCeA29ab4dA01A495140B349F8410Ba904",
      FurnaceForCVX: "0xCe4dCc5028588377E279255c0335Effe2d7aB72a",
      CLeverForCVX: "0x96C68D861aDa016Ed98c30C810879F9df7c64154",
    },
    CLeverCRV: {},
    CLeverUSD: {
      clevUSD: "0x3C20Ac688410bE8F391bE1fb00AFc5C212972F86",
      Furnace: "0x7f160EFC2436F1aF4E9E8a57d0a5beB8345761a9",
      CLever: {
        FRAXUSDC: "0xEB0ea9D24235aB37196111eeDd656D56Ce4F53b1",
        LUSDFRAXBP: "0xb2Fcee71b25B62baFE442c58AF58c42143673cC1",
        TUSDFRAXBP: "0xad4caC207A0BFEd10dF8A4FC6A28D377caC730E0",
        clevUSDFRAXBP: "0x2C37F1DcEd208530A05B061A183d8937F686157e",
      },
      Strategy: {
        FRAXUSDC_100: "0xAdC6A89d6Df7374629eA3cFd0737843709d29F66", // 100% aCRV are zapped to FRAX
        LUSDFRAXBP_100: "0xC65D58A33D9917Df3e1a4033eD73506D9b6aCE6c", // 100% aCRV are zapped to FRAX
        TUSDFRAXBP_100: "0xa7625Dd9F2D8a95a0D1Ac7E8671547197e9fcAf0", // 100% aCRV are zapped to FRAX
        clevUSDFRAXBP_100: "0x5432526e75d45369970b8616F54b25c831d1e2b2", // 100% aCRV are zapped to FRAX
      },
    },
    Gauge: {
      vefunder: {
        FundraisingGaugeV1Impl: "0xB9CD9979718e7E4C341D8D99dA3F1290c908FBdd",
        FundraisingGaugeFactoryV1: "0x3abf0BE21E5020007B6e2e201E292a7119bC2b0d",
        FundraisingGauge: "0x8A5eF9095795e9740Afc91C5Bd23B0e48d6bB7aE",
      },
      Curve_CLEV_ETH: {
        pool: "0x342D1C4Aa76EA6F5E5871b7f11A019a0eB713A4f",
        token: "0x6C280dB098dB673d30d5B34eC04B6387185D3620",
        gauge: "0x86e917ad6Cb44F9E6C8D9fA012acF0d0CfcF114f",
      },
      Curve_clevCVX_CVX: {
        pool: "0xF9078Fb962A7D13F55d40d49C8AA6472aBD1A5a6",
        token: "0xF9078Fb962A7D13F55d40d49C8AA6472aBD1A5a6",
        gauge: "0xF758BE28E93672d1a8482BE15EAf21aa5450F979",
      },
      Balancer_clevCVX_CVX: {
        poolId: "0x69671c808c8f1c1490a4c9e0145884dfb5631378000200000000000000000392",
        token: "0x69671c808c8f1c1490a4c9e0145884dfb5631378",
        gauge: "0x9b02548De409D7aAeE228BfA3ff2bCa70e7a2fe8",
      },
    },
  },
  Fx: {
    ProxyAdmin: "0x9B54B7703551D9d0ced177A78367560a8B2eDDA4",
    Treasury: "0x26B2ec4E02ebe2F54583af25b647b1D619e67BbF",
  },
};

export function selectDeployments(network: string, name: string): editJsonFile.JsonEditor {
  if (!fs.existsSync(path.join(CONFIG_FILE_DIR, network))) {
    fs.mkdirSync(path.join(CONFIG_FILE_DIR, network), { recursive: true });
  }

  const filename = path.join(CONFIG_FILE_DIR, network, `${name}.json`);

  if (!fs.existsSync(filename)) {
    fs.writeFileSync(filename, "{}");
  }

  const addressFile = editJsonFile(filename, {
    stringify_eol: true,
    autosave: true,
  });

  return addressFile;
}
