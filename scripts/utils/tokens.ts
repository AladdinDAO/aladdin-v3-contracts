import { DEPLOYED_CONTRACTS } from "./deploys";

export const TOKENS: { [symbol: string]: { address: string; decimals: number } } = {
  "3CRV": { decimals: 18, address: "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490" },
  AAVE: { decimals: 18, address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9" },
  ALCX: { decimals: 18, address: "0xdBdb4d16EdA451D0503b854CF79D55697F90c8DF" },
  ALD: { decimals: 18, address: "0xb26c4b3ca601136daf98593feaeff9e0ca702a8d" },
  ANGLE: { decimals: 18, address: "0x31429d1856aD1377A8A0079410B297e1a9e214c2" },
  APEFI: { decimals: 18, address: "0x4332f8a38f14bd3d8d1553af27d7c7ac6c27278d" },
  BADGER: { decimals: 18, address: "0x3472a5a71965499acd81997a54bba8d852c6e53d" },
  BAL: { decimals: 18, address: "0xba100000625a3754423978a60c9317c58a424e3D" },
  BTRFLY: { decimals: 18, address: "0xc55126051B22eBb829D00368f4B12Bde432de5Da" },
  BUSD: { decimals: 18, address: "0x4Fabb145d64652a948d72533023f6E7A623C7C53" },
  CLEV: { decimals: 18, address: DEPLOYED_CONTRACTS.CLever.CLEV },
  CNC: { decimals: 18, address: "0x9ae380f0272e2162340a5bb646c354271c0f5cfc" },
  CRV: { decimals: 18, address: "0xD533a949740bb3306d119CC777fa900bA034cd52" },
  CTR: { decimals: 18, address: DEPLOYED_CONTRACTS.Concentrator.CTR },
  CVX: { decimals: 18, address: "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B" },
  DAI: { decimals: 18, address: "0x6B175474E89094C44Da98b954EedeAC495271d0F" },
  DCHF: { decimals: 6, address: "0x045da4bFe02B320f4403674B3b7d121737727A36" },
  DOLA: { decimals: 18, address: "0x865377367054516e17014CcdED1e7d814EDC9ce4" },
  ETH: { decimals: 18, address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" },
  "ETH+": { decimals: 18, address: "0xE72B141DF173b999AE7c1aDcbF60Cc9833Ce56a8" },
  ETHx: { decimals: 18, address: "0xA35b1B31Ce002FBF2058D22F30f95D405200A15b" },
  EUROC: { decimals: 6, address: "0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c" },
  EURS: { decimals: 2, address: "0xdB25f211AB05b1c97D595516F45794528a807ad8" },
  EURT: { decimals: 6, address: "0xC581b735A1688071A1746c968e0798D642EDE491" },
  FEI: { decimals: 18, address: "0x956F47F50A910163D8BF957Cf5846D573E7f87CA" },
  FIDU: { decimals: 18, address: "0x6a445E9F40e0b97c92d0b8a3366cEF1d67F700BF" },
  FLX: { decimals: 18, address: "0x6243d8CEA23066d098a15582d81a598b4e8391F4" },
  FPI: { decimals: 18, address: "0x5Ca135cB8527d76e932f34B5145575F9d8cbE08E" },
  FPIS: { decimals: 18, address: "0xc2544a32872a91f4a553b404c6950e89de901fdb" },
  FRAX: { decimals: 18, address: "0x853d955aCEf822Db058eb8505911ED77F175b99e" },
  FXN: { decimals: 18, address: "0x365AccFCa291e7D3914637ABf1F7635dB165Bb09" },
  FXS: { decimals: 18, address: "0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0" },
  GEAR: { decimals: 18, address: "0xBa3335588D9403515223F109EdC4eB7269a9Ab5D" },
  GEIST: { decimals: 18, address: "0x2EBfF165CB363002C5f9cBcfd6803957BA0B7208" },
  GHO: { decimals: 18, address: "0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f" },
  GNO: { decimals: 18, address: "0x6810e776880C02933D47DB1b9fc05908e5386b96" },
  GRAI: { decimals: 18, address: "0x15f74458aE0bFdAA1a96CA1aa779D715Cc1Eefe4" },
  GRO: { decimals: 18, address: "0x3Ec8798B81485A254928B70CDA1cf0A2BB0B74D7" },
  INV: { decimals: 18, address: "0x41D5D79431A913C4aE7d69a668ecdfE5fF9DFB68" },
  JPEG: { decimals: 18, address: "0xE80C0cd204D654CEbe8dd64A4857cAb6Be8345a3" },
  LDO: { decimals: 18, address: "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32" },
  LQTY: { decimals: 18, address: "0x6DEA81C8171D0bA574754EF6F8b412F2Ed88c54D" },
  LUSD: { decimals: 18, address: "0x5f98805A4E8be255a32880FDeC7F6728C6568bA0" },
  "LUSD3CRV-f": { decimals: 18, address: "0xed279fdd11ca84beef15af5d39bb4d4bee23f0ca" },
  LYRA: { decimals: 18, address: "0x01BA67AAC7f75f647D94220Cc98FB30FCc5105Bf" },
  KP3R: { decimals: 18, address: "0x1cEB5cB57C4D4E2b2433641b95Dd330A33185A44" },
  MATIC: { decimals: 18, address: "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0" },
  MET: { decimals: 18, address: "0x2ebd53d035150f328bd754d6dc66b99b0edb89aa" },
  MIM: { decimals: 18, address: "0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3" },
  MTA: { decimals: 18, address: "0xa3BeD4E1c75D00fa6f4E5E6922DB7261B5E9AcD2" },
  MULTI: { decimals: 18, address: "0x65Ef703f5594D2573eb71Aaf55BC0CB548492df4" },
  OGN: { decimals: 18, address: "0x8207c1FfC5B6804F6024322CcF34F29c3541Ae26" },
  OGV: { decimals: 18, address: "0x9c354503C38481a7A7a51629142963F98eCC12D0" },
  PRISMA: { decimals: 18, address: "0xdA47862a83dac0c112BA89c6abC2159b95afd71C" },
  PUSD: { decimals: 18, address: "0x466a756E9A7401B5e2444a3fCB3c2C12FBEa0a54" },
  PYUSD: { decimals: 6, address: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8" },
  RSR: { decimals: 18, address: "0x320623b8E4fF03373931769A31Fc52A4E78B5d70" },
  SDT: { decimals: 18, address: "0x73968b9a57c6E53d41345FD57a6E6ae27d6CDB2F" },
  SILO: { decimals: 18, address: "0x6f80310CA7F2C654691D1383149Fa1A57d8AB1f8" },
  SNX: { decimals: 18, address: "0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F" },
  SPELL: { decimals: 18, address: "0x090185f2135308BaD17527004364eBcC2D37e5F6" },
  STG: { decimals: 18, address: "0xaf5191b0de278c7286d6c7cc6ab6bb8a73ba2cd6" },
  T: { decimals: 18, address: "0xCdF7028ceAB81fA0C6971208e83fa7872994beE5" },
  TRIBE: { decimals: 18, address: "0xc7283b66eb1eb5fb86327f08e1b5816b0720212b" },
  TRICRV: { decimals: 18, address: "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490" },
  TUSD: { decimals: 18, address: "0x0000000000085d4780B73119b644AE5ecd22b376" },
  TXJP: { decimals: 8, address: "0x961dd84059505d59f82ce4fb87d3c09bec65301d" },
  USDC: { decimals: 6, address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
  USDD: { decimals: 18, address: "0x0C10bF8FcB7Bf5412187A595ab97a3609160b5c6" },
  USDM: { decimals: 18, address: "0x59d9356e565ab3a36dd77763fc0d87feaf85508c" },
  USDN: { decimals: 18, address: "0x674C6Ad92Fd080e4004b2312b45f796a192D27a0" },
  USDT: { decimals: 6, address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" },
  USDP: { decimals: 18, address: "0x8e870d67f660d95d5be530380d0ec0bd388289e1" },
  USDV: { decimals: 6, address: "0x0E573Ce2736Dd9637A0b21058352e1667925C7a8" },
  UST_WORMHOLE: { decimals: 6, address: "0xa693B19d2931d498c5B318dF961919BB4aee87a5" },
  UST_TERRA: { decimals: 18, address: "0xa47c8bf37f92aBed4A126BDA807A7b7498661acD" },
  UZD: { decimals: 18, address: "0xb40b6608b2743e691c9b54ddbdee7bf03cd79f1c" },
  WBTC: { decimals: 8, address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" },
  WETH: { decimals: 18, address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" },
  ZETA: { decimals: 18, address: "0xf091867EC603A6628eD83D274E835539D82e9cc8" },
  YFI: { decimals: 18, address: "0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e" },
  aCRV: { decimals: 18, address: DEPLOYED_CONTRACTS.Concentrator.cvxCRV.aCRV },
  aCVX: { decimals: 18, address: "0xb0903Ab70a7467eE5756074b31ac88aEBb8fB777" },
  aFXS: { decimals: 18, address: DEPLOYED_CONTRACTS.Concentrator.cvxFXS.aFXS },
  afrxETH: { decimals: 18, address: DEPLOYED_CONTRACTS.Concentrator.frxETH.afrxETH },
  agEUR: { decimals: 18, address: "0x1a7e4e63778B4f12a199C062f3eFdD288afCBce8" },
  alETH: { decimals: 18, address: "0x0100546F2cD4C9D97f798fFC9755E47865FF7Ee6" },
  alUSD: { decimals: 18, address: "0xBC6DA0FE9aD5f3b0d58160288917AA56653660E9" },
  apxETH: { decimals: 18, address: "0x9Ba021B0a9b958B5E75cE9f6dff97C7eE52cb3E6" },
  asdCRV: { decimals: 18, address: DEPLOYED_CONTRACTS.Concentrator.StakeDAO.sdCRV.asdCRV },
  auraBAL: { decimals: 18, address: "0x616e8bfa43f920657b3497dbf40d6b1a02d4608d" },
  bLUSD: { decimals: 18, address: "0xb9d7dddca9a4ac480991865efef82e01273f79c3" },
  cbETH: { decimals: 18, address: "0xBe9895146f7AF43049ca1c1AE358B0541Ea49704" },
  clevCVX: { decimals: 18, address: DEPLOYED_CONTRACTS.CLever.CLeverCVX.clevCVX },
  clevUSD: { decimals: 18, address: DEPLOYED_CONTRACTS.CLever.CLeverUSD.clevUSD },
  crvFRAX: { decimals: 18, address: "0x3175Df0976dFA876431C2E9eE6Bc45b65d3473CC" },
  crvUSD: { decimals: 18, address: "0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E" },
  crvWSBTC: { decimals: 18, address: "0x051d7e5609917Bd9b73f04BAc0DED8Dd46a74301" },
  cvxCRV: { decimals: 18, address: "0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7" },
  cvxFPIS: { decimals: 18, address: "0xa2847348b58ced0ca58d23c7e9106a49f1427df6" },
  cvxFXN: { decimals: 18, address: "0x183395DbD0B5e93323a7286D1973150697FFFCB3" },
  cvxFXS: { decimals: 18, address: "0xFEEf77d3f69374f66429C91d732A244f074bdf74" },
  cvxPrisma: { decimals: 18, address: "0x34635280737b5bfe6c7dc2fc3065d60d66e78185" },
  "cvxcrv-f": { decimals: 18, address: "0x9D0464996170c6B9e75eED71c68B99dDEDf279e8" },
  cyDAI: { decimals: 8, address: "0x8e595470Ed749b85C6F7669de83EAe304C2ec68F" },
  cyUSDC: { decimals: 8, address: "0x76Eb2FE28b36B3ee97F3Adae0C69606eeDB2A37c" },
  cyUSDT: { decimals: 8, address: "0x48759F220ED983dB51fA7A8C0D2AAb8f3ce4166a" },
  eCFX: { decimals: 18, address: "0xa1f82e14bc09a1b42710df1a8a999b62f294e592" },
  eETH: { decimals: 18, address: "0x35fA164735182de50811E8e2E824cFb9B6118ac2" },
  eUSD: { decimals: 18, address: "0xA0d69E286B938e21CBf7E51D71F6A4c8918f482F" },
  ezETH: { decimals: 18, address: "0xbf5495Efe5DB9ce00f80364C8B423567e58d2110" },
  fETH: { decimals: 18, address: "0x53805a76e1f5ebbfe7115f16f9c87c2f7e633726" },
  frxETH: { decimals: 18, address: "0x5e8422345238f34275888049021821e8e08caa1f" },
  fxUSD: { decimals: 18, address: "0x085780639cc2cacd35e474e71f4d000e2405d8f6" },
  hyUSD: { decimals: 18, address: "0xacdf0dba4b9839b96221a8487e9ca660a48212be" },
  mkUSD: { decimals: 18, address: "0x4591DBfF62656E7859Afe5e45f6f47D3669fBB28" },
  multiBTC: { decimals: 8, address: "0x66eFF5221ca926636224650Fd3B9c497FF828F7D" },
  pETH: { decimals: 18, address: "0x836A808d4828586A69364065A1e064609F5078c7" },
  pufETH: { decimals: 18, address: "0xD9A442856C234a39a81a089C06451EBAa4306a72" },
  pxETH: { decimals: 18, address: "0x04C154b66CB340F3Ae24111CC767e0184Ed00Cc6" },
  rETH: { decimals: 18, address: "0xae78736Cd615f374D3085123A210448E74Fc6393" },
  rUSD: { decimals: 18, address: "0x65d72aa8da931f047169112fcf34f52dbaae7d18" },
  renBTC: { decimals: 8, address: "0xEB4C2781e4ebA804CE9a9803C67d0893436bB27D" },
  rgUSD: { decimals: 18, address: "0x78da5799cf427fee11e9996982f4150ece7a99a7" },
  rsETH: { decimals: 18, address: "0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7" },
  rswETH: { decimals: 18, address: "0xfae103dc9cf190ed75350761e95403b7b8afa6c0" },
  sBTC: { decimals: 18, address: "0xfE18be6b3Bd88A2D2A7f928d00292E7a9963CfC6" },
  sDAI: { decimals: 18, address: "0x83f20f44975d03b1b09e64809b757c47f942beea" },
  sETH: { decimals: 18, address: "0x5e74C9036fb86BD7eCdcb084a0673EFc32eA31cb" },
  sFRAX: { decimals: 18, address: "0xa663b02cf0a4b149d2ad41910cb81e23e1c41c32" },
  sUSD: { decimals: 18, address: "0x57Ab1ec28D129707052df4dF418D58a2D46d5f51" },
  sUSDe: { decimals: 18, address: "0x9d39a5de30e57443bff2a8307a4256c8797a3497" },
  sdCRV: { decimals: 18, address: "0xD1b5651E55D4CeeD36251c61c50C889B36F6abB5" },
  sdFXN: { decimals: 18, address: "0xe19d1c837B8A1C83A56cD9165b2c0256D39653aD" },
  sdFXS: { decimals: 18, address: "0x402f878bdd1f5c66fdaf0fababcf74741b68ac36" },
  sdveCRV: { decimals: 18, address: "0x478bBC744811eE8310B461514BDc29D03739084D" },
  sfrxETH: { decimals: 18, address: "0xac3e018457b222d93114458476f3e3416abbe38f" },
  stETH: { decimals: 18, address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84" },
  tBTC: { decimals: 18, address: "0x18084fba666a33d37592fa2633fd49a74dd93a88" },
  wBETH: { decimals: 18, address: "0xa2e3356610840701bdf5611a53974510ae27e2e1" },
  weETH: { decimals: 18, address: "0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee" },
  wstETH: { decimals: 18, address: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0" },
  xETH: { decimals: 18, address: "0xe063f04f280c60aeca68b38341c2eecbec703ae2" },
};

/* eslint-disable prettier/prettier */
// prettier-ignore
// eslint-disable-next-line no-lone-blocks
{
// Curve Base LP
TOKENS["CURVE_BASE_DAI/USDC/USDT"] = { decimals: 18, address: "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490" };
TOKENS["CURVE_BASE_ETH/stETH"] = { decimals: 18, address: "0x06325440D014e39736583c165C2963BA99fAf14E" };
TOKENS["CURVE_BASE_ETH/frxETH"] = { decimals: 18, address: "0xf43211935C781D5ca1a41d2041F397B8A7366C7A" };
// Curve Plain Factory LP, including
// 1. old factory: 0xB9fC157394Af804a3578134A6585C0dc9cc990d4
// 2. crvUSD factory: 0x4F8846Ae9380B90d2E71D5e3D042dff3E7ebb40d
// 3. stable-ng factory: 0x6A8cbed756804B16E05E741eDaBd5cB544AE21bf
TOKENS["CURVE_PLAIN_WETH/stETH_117"] = { decimals: 18, address: "0x828b154032950C8ff7CF8085D841723Db2696056" };
TOKENS["CURVE_PLAIN_ETH/stETH_303"] = { decimals: 18, address: "0x21E27a5E5513D6e65C4f830167390997aA84843a" };
TOKENS["CURVE_PLAIN_FXN/cvxFXN_358"] = { decimals: 18, address: "0x1062FD8eD633c1f080754c19317cb3912810B5e5" };
TOKENS["CURVE_PLAIN_FXN/sdFXN_359"] = { decimals: 18, address: "0x28Ca243dc0aC075dD012fCf9375C25D18A844d96" };
TOKENS["CURVE_CRVUSD_WETH/frxETH_15"] = { decimals: 18, address: "0x9c3B46C0Ceb5B9e304FCd6D88Fc50f7DD24B31Bc" };
TOKENS["CURVE_CRVUSD_mkUSD/crvUSD_17"] = { decimals: 18, address: "0x3de254a0f838a844f727fee81040e0fa7884b935" };
TOKENS["CURVE_STABLE_NG_mkUSD/USDC_17"] = { decimals: 18, address: "0xf980b4a4194694913af231de69ab4593f5e0fcdc" };
TOKENS["CURVE_STABLE_NG_weETH/WETH_22"] = { decimals: 18, address: "0x13947303F63b363876868D070F14dc865C36463b" };
TOKENS["CURVE_STABLE_NG_USDM/3CRV_26"] = { decimals: 18, address: "0xc83b79c07ece44b8b99ffa0e235c00add9124f9e" };
TOKENS["CURVE_STABLE_NG_pxETH/stETH_30"] = { decimals: 18, address: "0x6951bdc4734b9f7f3e1b74afebc670c736a0edb6" };
TOKENS["CURVE_STABLE_NG_FRAX/sDAI_32"] = { decimals: 18, address: "0xce6431d21e3fb1036ce9973a3312368ed96f5ce7" };
TOKENS["CURVE_STABLE_NG_FRAX/PYUSD_34"] = { decimals: 18, address: "0xa5588f7cdf560811710a2d82d3c9c99769db1dcb" };
TOKENS["CURVE_STABLE_NG_USDV/3CRV_38"] = { decimals: 18, address: "0x00e6fd108c4640d21b40d02f18dd6fe7c7f725ca" };
TOKENS["CURVE_STABLE_NG_eUSD/mkUSD_60"] = { decimals: 18, address: "0xc37c0e88551ed383c1abedc6628a5579071bf56f" };
TOKENS["CURVE_STABLE_NG_sUSDe/sDAI/sFRAX_61"] = { decimals: 18, address: "0xc559f6716d8b1471fc2dc10aafeb0faa219fe9df" };
TOKENS["CURVE_STABLE_NG_eUSD/crvUSD_65"] = { decimals: 18, address: "0x91285c4fc766fff6f3acafeec7a0423275257fae" };
TOKENS["CURVE_STABLE_NG_ezETH/WETH_79"] = { decimals: 18, address: "0x85de3add465a219ee25e04d22c39ab027cf5c12e" };
TOKENS["CURVE_STABLE_NG_weETH/rswETH_80"] = { decimals: 18, address: "0x278cfb6f06b1efc09d34fc7127d6060c61d629db" };
TOKENS["CURVE_STABLE_NG_crvUSD/fxUSD_106"] = { decimals: 18, address: "0x8ffc7b89412efd0d17edea2018f6634ea4c2fcb2" };
TOKENS["CURVE_STABLE_NG_PYUSD/fxUSD_107"] = { decimals: 18, address: "0xd6982da59F1D26476E259559508f4135135cf9b8" };
TOKENS["CURVE_STABLE_NG_DOLA/fxUSD_108"] = { decimals: 18, address: "0x189B4e49B5cAf33565095097b4B960F14032C7D0" };
TOKENS["CURVE_STABLE_NG_GRAI/fxUSD_109"] = { decimals: 18, address: "0x69Cf42F15F9325986154b61A013da6E8feC82CCF" };
TOKENS["CURVE_STABLE_NG_FRAX/fxUSD_110"] = { decimals: 18, address: "0x1EE81c56e42EC34039D993d12410d437DdeA341E" };
TOKENS["CURVE_STABLE_NG_GHO/fxUSD_111"] = { decimals: 18, address: "0x74345504Eaea3D9408fC69Ae7EB2d14095643c5b" };
TOKENS["CURVE_STABLE_NG_eUSD/fxUSD_114"] = { decimals: 18, address: "0x16b54e3ac8e3ba088333985035b869847e36e770" };
TOKENS["CURVE_STABLE_NG_mkUSD/fxUSD_115"] = { decimals: 18, address: "0xca554e2e2948a211d4650fe0f4e271f01f9cb5f1" };
TOKENS["CURVE_STABLE_NG_ULTRA/fxUSD_116"] = { decimals: 18, address: "0xf33ab11e5c4e55dacb13644f0c0a9d1e199a796f" };
TOKENS["CURVE_STABLE_NG_rgUSD/fxUSD_127"] = { decimals: 18, address: "0x6fc7ea6ca8cd2759803eb78159c931a8ff5e0557" };
TOKENS["CURVE_STABLE_NG_fxUSD/rUSD_138"] = { decimals: 18, address: "0x2116bfad62b383043230501f6a124c6ea60ccfa5" };
TOKENS["CURVE_STABLE_NG_alUSD/fxUSD_139"] = { decimals: 18, address: "0x27cb9629ae3ee05cb266b99ca4124ec999303c9d" };
TOKENS["CURVE_STABLE_NG_MIM/fxUSD_141"] = { decimals: 18, address: "0xd7bf9bb6bd088317effd116e2b70ea3a054cbceb" };
// Curve Crypto LP (including factory pools)
TOKENS["CURVE_CRYPTO_crvUSD/fETH_299"] = { decimals: 18, address: "0x19033d99A7b7010157b81e5eE5A8E63A583fB735" };
TOKENS["CURVE_CRYPTO_fETH/FRAXBP_301"] = { decimals: 18, address: "0x3d28f9192E34e51414e69FBEE5b11B35590FB9Fb" };
TOKENS["CURVE_CRYPTO_ETH/xETH_302"] = { decimals: 18, address: "0x16eAd9a10b1A77007E6E329B076aD1Fe97a6F7C0" };
TOKENS["CURVE_CRYPTO_ETH/FXN_311"] = { decimals: 18, address: "0xE06A65e09Ae18096B99770A809BA175FA05960e2" };
// Curve TriCrypto LP (including factory pools)
TOKENS["CURVE_TRICRYPTO_USDT/WBTC/ETH"] = { decimals: 18, address: "0xc4AD29ba4B3c580e6D59105FFf484999997675Ff" };
TOKENS["CURVE_TRICRYPTO_USDC/WBTC/WETH_0"] = { decimals: 18, address: "0x7F86Bf177Dd4F3494b841a37e810A34dD56c829B" };
TOKENS["CURVE_TRICRYPTO_USDT/WBTC/WETH_1"] = { decimals: 18, address: "0xf5f5B97624542D72A9E06f04804Bf81baA15e2B4" };
TOKENS["CURVE_TRICRYPTO_crvUSD/tBTC/wstETH_2"] = { decimals: 18, address: "0x2889302a794dA87fBF1D6Db415C1492194663D13" };
TOKENS["CURVE_TRICRYPTO_USDC/WETH/INV_3"] = { decimals: 18, address: "0x5426178799ee0a0181A89b4f57eFddfAb49941Ec" };
TOKENS["CURVE_TRICRYPTO_crvUSD/WETH/CRV_4"] = { decimals: 18, address: "0x4eBdF703948ddCEA3B11f675B4D1Fba9d2414A14" };
TOKENS["CURVE_TRICRYPTO_crvUSD/frxETH/Silo_11"] = { decimals: 18, address: "0x86bF09aCB47AB31686bE413d614E9ded3666a1d3" };
TOKENS["CURVE_TRICRYPTO_wstETH/rETH/sfrxETH_14"] = { decimals: 18, address: "0x2570f1bD5D2735314FC102eb12Fc1aFe9e6E7193" };
TOKENS["CURVE_TRICRYPTO_crvUSD/frxETH/SDT_16"] = { decimals: 18, address: "0x954313005C56b555bdC41B84D6c63B69049d7847" };
TOKENS["CURVE_TRICRYPTO_DOLA/DBR/INV_18"] = { decimals: 18, address: "0xC7DE47b9Ca2Fc753D6a2F167D8b3e19c6D18b19a" };
TOKENS["CURVE_TRICRYPTO_ETH+/eUSD/RSR_21"] = { decimals: 18, address: "0xDB6925eA42897ca786a045B252D95aA7370f44b4" };
}
/* eslint-enable prettier/prettier */
