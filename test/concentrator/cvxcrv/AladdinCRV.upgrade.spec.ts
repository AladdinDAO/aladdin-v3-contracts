/* eslint-disable camelcase */
/* eslint-disable node/no-missing-import */
// import { AladdinCRV, AladdinCRVV2 } from "../../../typechain";
import { request_fork } from "../../utils";

const FORK_BLOCK_NUMBER = 16325440;
const DEPLOYER = "0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf";
const HOLDER1 = "0x88B6CaCe7C485db4a33f4dA78d10abCe5820467F";
const HOLDER2 = "0x488b99c4a94bb0027791e8e0eeb421187ec9a487";

describe("AladdinCRV.upgrade.spec", async () => {
  // let acrv: AladdinCRV;
  // let acrv2: AladdinCRVV2;

  beforeEach(async () => {
    request_fork(FORK_BLOCK_NUMBER, [DEPLOYER, HOLDER1, HOLDER2]);
  });
});
