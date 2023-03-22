/* eslint-disable node/no-missing-import */
import { BigNumberish } from "ethers";
import { TOKENS } from "../utils";

interface IClaimParam {
  token: string;
  index: number;
  amount: BigNumberish;
  merkleProof: string[];
}

const SDT = TOKENS.SDT.address;
const sdCRV = TOKENS.sdCRV.address;

const Round20230307Rewards: IClaimParam[] = [
  {
    token: SDT,
    index: 379,
    amount: "0x039992648a23c8a00000",
    merkleProof: [
      "0xbe9660cd0b4ecf237fe77db8e2681ebe49ea9f73ec04f69fa226f360a2171977",
      "0xa379151b2209861f31279efb230d0773b8d4dda54566a15849ddc39dfff12720",
      "0x1f7b49834064693e5c4896efd7712e6ce4f05a782eb4d0527e94f290e6c175cb",
      "0x44ad7e9242fcb7ba615bfa02425842f58046745085213adb1dd14085799496dc",
      "0x1ee2630a45380e13c29c80173c71663120f14ff7dcfe89f07ac51d338dc90547",
      "0xf2c5ba0a4fd4d02d51bdbaf1ca320463c005a3048a346a305837e4ed09aab2dd",
      "0x1bb9efedb1ab3db6b40d03af4766756b5039ff5369a6e99b8f1dbda13eec00eb",
      "0xf050cc9b12323c3ff89311245b09d0eb826a7bef65e997d9dbe6c03123a5d78f",
    ],
  },
  {
    token: sdCRV,
    index: 338,
    amount: "0x01479dcb48f3fc736000",
    merkleProof: [
      "0x157d128746210aec27f28797be999718389a8b3bdcfcbe9d28da2a77638700f6",
      "0xaed197954a68d934ca849596ff7c58576a05ba40ea969a0d8f881fb2fbc85188",
      "0xd815e205d407c9998f17a9b8aedcb0bb69349495dd8259b0b95880c05ab21262",
      "0x83d8eb4fbea2e7df9c35c04411e0d57b9b924fa29c155ca84eee0a5834cea81c",
      "0x3e64a4a0e97e451f961cb776587b9886e14b27c615d1e0544812f1b1f6a30f1b",
      "0x8f51bc72f447775083bdb42a1287303723e360f201111e8f190ff312a5a1ddee",
      "0x13f0863797745faacda3200ab858a6723b67c2394fa483d0a85469d655915020",
      "0xfdad4d87a89faf7052a734d976c29017e8869a6d6e67c2e5f1cc0ca9ccfeca81",
      "0xf587853eeac4234c7a78c7ca94982a04e600f8b89a72d0d0dea7c372988b9c3c",
    ],
  },
];

const Round20230321Rewards: IClaimParam[] = [
  {
    token: SDT,
    index: 367,
    amount: "0x08c53271ee6c0a042000",
    merkleProof: [
      "0x5be93d98453a855001b567522a30be867437cd3c1f65b8bf80324eb9c4495d51",
      "0xf44f5764682602aa3f22f8d0f8f61f33ae2d6382f55b7f98b86665a5a544f665",
      "0x87f5735508ea6d8c746a7d048af56a6b751b060f6286d2b4a9f7f016aff86001",
      "0x78388078ea5037ba1bfaf473a4f4d55017eefdd0792bb21683862694bb064854",
      "0xc73997f424e83e9fc03ce12dfd398d33c69ea542b1296c3bf38ca73d85288822",
      "0x02df70830a1b655de112d87d3da50b3fba6f56289411498479999f19b4acb79a",
      "0x74c89bef0638fa069f1ee2e6d6f69ac7ffdbe1a1a6274c4c3ef6fb334d245d5d",
      "0x33e90dbdaeda6c736e8039d50fd654af24b6b196642a5cd42f3d037f103b443b",
      "0x14cba687c2cc2f234f95db222a8b9c3f19ef81c10a89583d73a7341f6f2f4f1c",
      "0xcb407e32ca7df221b71bc358a1bbda3182cb8bcdde0ab56a42e188bdf80004c9",
    ],
  },
];

export const RoundClaimParams: { [round: string]: IClaimParam[] } = {
  "20230307": Round20230307Rewards,
  "20230321": Round20230321Rewards,
};
