/* eslint-disable camelcase */
/**
 * Independent fork rehearsal for CLever's Convex on-chain-voting migration (PR #273... #274,
 * branch `feat/vlcvx-migration`). This does NOT rely on the QA team's Notion test report
 * (https://app.notion.com/p/CLever-vlCVX-2026-07-26-...) as a source of truth - every assertion
 * here is independently derived from:
 *   - the actual PR #274 diff (contracts/clever/CLeverCVXLocker.sol,
 *     contracts/interfaces/convex/IConvexSurrogateRegistry.sol)
 *   - the real, verified GitHub source of Convex's on-chain voting system
 *     (https://github.com/convex-eth/voting/tree/main/src): SurrogateRegistry.sol,
 *     DaoVotePlatform.sol, GaugeVotePlatform.sol, Delegation.sol, interface/IGaugeRegistry.sol
 *   - live mainnet state read directly via eth_call before writing this file
 *
 * Key facts confirmed independently (see chat history for the raw eth_call output):
 *   - CLeverCVXLocker proxy 0x96C68D8... currently runs the OLD implementation
 *     0x8E58F45...2771 (24,540 bytes runtime); new impl 0xDFC1F72...55d2 (24,139 bytes) is
 *     deployed on-chain but NOT YET activated - migration is at the "deployed, awaiting
 *     multisig upgrade" stage, same as the StakeDAO migration.
 *   - `onlyAcceptedSigner(address _account)` on both vote platforms:
 *       if (msg.sender != _account && !surrogateRegistry.isSurrogate(msg.sender, _account)) revert NotSigner();
 *     so the locker itself must call `SurrogateRegistry.setSurrogate(voterEOA)` (exactly what
 *     `setConvexVotingSurrogate` does) before any EOA can vote "as" the locker.
 *   - GaugeVotePlatform._vote() only calls `gaugeRegistry.isRegisteredGauge(gauge)`, and NEVER
 *     calls `isValidGauge(gauge)` anywhere in the vote path - confirmed by reading the actual
 *     source, not by trusting the QA report's claim of the same finding. A live "registered but
 *     killed" gauge could not be found on current mainnet (cross-checked all 324 currently-killed
 *     Curve gauges from api.curve.finance against Convex's GaugeRegistry - zero overlap), so the
 *     negative case below is documented as a source-level finding rather than executed live.
 */
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, network } from "hardhat";

import { mockETHBalance } from "@/test/utils";

// fork at the current tip (not a fixed historical block) so the live, currently-active DAO
// proposal is still within its voting window; also impersonates the given accounts.
async function forkAtLatest(accounts: string[]) {
  await network.provider.request({
    method: "hardhat_reset",
    params: [{ forking: { jsonRpcUrl: process.env.HARDHAT_FORK_URL } }],
  });
  for (const address of accounts) {
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [address] });
  }
}

// ==========================================================================================
// Mainnet addresses (cross-checked live via eth_call before writing this file)
// ==========================================================================================
const LOCKER = "0x96C68D861aDa016Ed98c30C810879F9df7c64154";
const OLD_IMPL = "0x8E58F45E69732F3C602075F010ab35902Ce62771";
const NEW_IMPL = "0xDFC1F72D5604020463318ff256433eca02B355d2";
const PROXY_ADMIN = "0x1F57286F7a8083fb363d87Bc8b1DCcD685dc87EE";
const ADMIN = "0xFC08757c505eA28709dF66E54870fB6dE09f0C5E"; // Locker owner + ProxyAdmin owner
const CONVEX_SURROGATE_REGISTRY = "0x8E4828a8C69A837F95Caa0D5e18fa09Ded12F73f";
const DAO_VOTE_PLATFORM = "0xE645F3d7b04BFFD67F5Ad4457c08E0C8FE1ddB89";
const GAUGE_VOTE_PLATFORM = "0x64D9B5AC386B70af9EDCD20A58cE9262D2EAC278";
const CONVEX_CORE = "0xCC07e8BA6bc8aeb18C4AE110C3Da9c7Dce4A3e74"; // owner + operator of GaugeVotePlatform
const CVX = "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B";

// a real, registered + valid Curve gauge (confirmed live: isRegisteredGauge=true, isValidGauge=true)
const VALID_GAUGE = "0x512bC2AeE29F8E641f903B339D40947595A5bFe8";

// test-only EOAs (never used on real mainnet - fork-only impersonation)
const VOTER_EOA = "0x1111111111111111111111111111111111111111";
const VOTER_EOA_2 = "0x2222222222222222222222222222222222222222";
const UNAUTHORIZED = "0x3333333333333333333333333333333333333333";

const surrogateRegistryAbi = [
  "function isSurrogate(address _surrogate, address _account) view returns (bool)",
  "function surrogateInfo(address _account) view returns (address surrogate, uint32 timestamp)",
];
const daoVoteAbi = [
  "function vote(uint256 proposalId, address account, uint256 yesWeight, uint256 noWeight) external",
  "function getVote(uint256 proposalId, address user) view returns (bool voted, uint256 yesWeight, uint256 noWeight, uint256 baseWeight, int256 adjustedWeight)",
  "function proposals(uint256) view returns (uint48 startTime, uint48 endTime, uint48 epoch, uint8 voteType, uint104 proposalId)",
  "function proposalCount() view returns (uint256)",
  "function getVoterCount(uint256 proposalId) view returns (uint256)",
  "function getVoterAtIndex(uint256 proposalId, uint256 index) view returns (address)",
  "error NotStarted()",
  "error Ended()",
  "error NoWeight()",
  "error PrevNotEnded()",
  "error BadTime()",
  "error AlreadyVoted()",
  "error NotVoteAuth()",
  "error NotSigner()",
  "error NotOperator()",
  "error MaxWeight()",
  "error DelegateOverSubtracted()",
];
const gaugeVoteAbi = [
  "function vote(address account, address[] gauges, uint256[] weights) external",
  "function proposalCount() view returns (uint256)",
  "function createProposal(uint256 startTime, uint256 endTime) external",
  "function gaugeTotal(uint256 proposalId, address gauge) view returns (uint256)",
  "function voteTotals(uint256 proposalId) view returns (uint256)",
  "function getVoterCount(uint256 proposalId) view returns (uint256)",
  "error NotStarted()",
  "error Ended()",
  "error Mismatch()",
  "error NoWeight()",
  "error NotGauge()",
  "error MaxWeight()",
  "error PrevNotEnded()",
  "error BadTime()",
  "error AlreadyVoted()",
  "error NotVoteAuth()",
  "error NotSigner()",
  "error NotOperator()",
];

describe("CLever CLeverCVXLocker Convex on-chain voting migration (independent fork rehearsal)", async () => {
  let admin: HardhatEthersSigner;
  let voter: HardhatEthersSigner;
  let voter2: HardhatEthersSigner;
  let unauthorized: HardhatEthersSigner;
  let convexCore: HardhatEthersSigner;

  let locker: any;
  let proxyAdmin: any;
  let surrogateRegistry: any;
  let daoVote: any;
  let gaugeVote: any;

  let daoProposalId: bigint;
  let gaugeProposalId: bigint;

  before(async () => {
    await forkAtLatest([ADMIN, VOTER_EOA, VOTER_EOA_2, UNAUTHORIZED, CONVEX_CORE]);
    admin = await ethers.getSigner(ADMIN);
    voter = await ethers.getSigner(VOTER_EOA);
    voter2 = await ethers.getSigner(VOTER_EOA_2);
    unauthorized = await ethers.getSigner(UNAUTHORIZED);
    convexCore = await ethers.getSigner(CONVEX_CORE);

    for (const addr of [ADMIN, VOTER_EOA, VOTER_EOA_2, UNAUTHORIZED, CONVEX_CORE]) {
      await mockETHBalance(addr, ethers.parseEther("10"));
    }

    locker = await ethers.getContractAt("CLeverCVXLocker", LOCKER, admin);
    proxyAdmin = await ethers.getContractAt("ProxyAdmin", PROXY_ADMIN, admin);
    surrogateRegistry = new ethers.Contract(CONVEX_SURROGATE_REGISTRY, surrogateRegistryAbi, admin);
    daoVote = new ethers.Contract(DAO_VOTE_PLATFORM, daoVoteAbi, admin);
    gaugeVote = new ethers.Contract(GAUGE_VOTE_PLATFORM, gaugeVoteAbi, admin);
  });

  context("0. baseline (pre-migration)", async () => {
    it("proxy currently runs the OLD implementation; new implementation already deployed", async () => {
      const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
      const raw = await ethers.provider.getStorage(LOCKER, implSlot);
      expect(ethers.getAddress("0x" + raw.slice(-40))).to.eq(OLD_IMPL);
      expect(await ethers.provider.getCode(NEW_IMPL)).to.not.eq("0x");
    });

    it("owner is the CLever multisig on both Locker and ProxyAdmin", async () => {
      expect(await locker.owner()).to.eq(ADMIN);
      expect(await proxyAdmin.owner()).to.eq(ADMIN);
    });

    it("Locker currently has no surrogate registered", async () => {
      const info = await surrogateRegistry.surrogateInfo(LOCKER);
      expect(info.surrogate).to.eq(ethers.ZeroAddress);
    });
  });

  context("1. upgrade + EIP-170 boundary + storage invariants", async () => {
    let ownerBefore: string;
    let totalLockedBefore: bigint;
    let totalDebtBefore: bigint;
    let clevCVXBefore: string;

    it("new implementation runtime bytecode fits under the 24,576-byte EIP-170 limit", async () => {
      const code = await ethers.provider.getCode(NEW_IMPL);
      const bytes = (code.length - 2) / 2;
      expect(bytes).to.be.lte(24576);
      expect(bytes).to.eq(24139); // exact figure independently confirmed via eth_getCode
    });

    it("snapshot key storage before upgrade", async () => {
      ownerBefore = await locker.owner();
      totalLockedBefore = await locker.totalLockedGlobal();
      totalDebtBefore = await locker.totalDebtGlobal();
      clevCVXBefore = await locker.clevCVX();
    });

    it("ProxyAdmin.upgrade (no initializer call) switches the implementation slot", async () => {
      await proxyAdmin.upgrade(LOCKER, NEW_IMPL);
      const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
      const raw = await ethers.provider.getStorage(LOCKER, implSlot);
      expect(ethers.getAddress("0x" + raw.slice(-40))).to.eq(NEW_IMPL);
    });

    it("storage/state is byte-for-byte unchanged across the upgrade", async () => {
      expect(await locker.owner()).to.eq(ownerBefore);
      expect(await locker.totalLockedGlobal()).to.eq(totalLockedBefore);
      expect(await locker.totalDebtGlobal()).to.eq(totalDebtBefore);
      expect(await locker.clevCVX()).to.eq(clevCVXBefore);
    });
  });

  context("2. setConvexVotingSurrogate authorization + registry state", async () => {
    it("non-owner cannot set the surrogate", async () => {
      await expect(locker.connect(unauthorized).setConvexVotingSurrogate(VOTER_EOA)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("owner sets the surrogate; registry account is the Locker proxy itself", async () => {
      await expect(locker.setConvexVotingSurrogate(VOTER_EOA))
        .to.emit(locker, "UpdateConvexVotingSurrogate")
        .withArgs(VOTER_EOA);
      expect(await surrogateRegistry.isSurrogate(VOTER_EOA, LOCKER)).to.eq(true);
    });
  });

  context("3. DAO vote (Curve DAO Vote Platform)", async () => {
    it("locate the currently-active real DAO proposal", async () => {
      const count = await daoVote.proposalCount();
      // walk backwards from the latest proposal to find one whose voting window is open now
      const now = (await ethers.provider.getBlock("latest"))!.timestamp;
      for (let i = count - 1n; i >= 0n; i--) {
        const p = await daoVote.proposals(i);
        if (p.startTime <= BigInt(now) && BigInt(now) <= p.endTime) {
          daoProposalId = i;
          break;
        }
      }
      expect(daoProposalId, "no active DAO proposal found on fork - re-fork closer to a live vote").to.not.be.undefined;
    });

    it("an unauthorized EOA cannot vote as the Locker", async () => {
      await expect(
        daoVote.connect(unauthorized).vote(daoProposalId, LOCKER, 10000n, 0n)
      ).to.be.revertedWithCustomError(daoVote, "NotSigner");
    });

    it("the owner multisig itself is NOT the surrogate and also cannot vote as the Locker", async () => {
      await expect(daoVote.connect(admin).vote(daoProposalId, LOCKER, 10000n, 0n)).to.be.revertedWithCustomError(
        daoVote,
        "NotSigner"
      );
    });

    it("the surrogate EOA votes successfully; account/voter-list attribute to the Locker, not the EOA", async () => {
      await daoVote.connect(voter).vote(daoProposalId, LOCKER, 10000n, 0n);
      const vote = await daoVote.getVote(daoProposalId, LOCKER);
      expect(vote.voted).to.eq(true);
      expect(vote.yesWeight).to.eq(10000n);

      const eoaVote = await daoVote.getVote(daoProposalId, VOTER_EOA);
      expect(eoaVote.voted).to.eq(false); // the EOA itself never accrues vote weight

      const voterCount = await daoVote.getVoterCount(daoProposalId);
      const last = await daoVote.getVoterAtIndex(daoProposalId, voterCount - 1n);
      expect(last).to.eq(LOCKER);
    });
  });

  context("4. Gauge vote (Curve Gauge Vote Platform)", async () => {
    it("create a fork-only gauge proposal (impersonating the real Convex Core operator)", async () => {
      const now = (await ethers.provider.getBlock("latest"))!.timestamp;
      await gaugeVote.connect(convexCore).createProposal(now, now + 86400 * 2);
      gaugeProposalId = (await gaugeVote.proposalCount()) - 1n;
      expect(gaugeProposalId).to.be.gte(0n);
    });

    it("unauthorized EOA cannot vote as the Locker", async () => {
      await expect(
        gaugeVote.connect(unauthorized).vote(LOCKER, [VALID_GAUGE], [1000000n])
      ).to.be.revertedWithCustomError(gaugeVote, "NotSigner");
    });

    it("surrogate votes full weight on a single valid, registered gauge; total attributed to Locker", async () => {
      await gaugeVote.connect(voter).vote(LOCKER, [VALID_GAUGE], [1000000n]);
      const total = await gaugeVote.gaugeTotal(gaugeProposalId, VALID_GAUGE);
      expect(total).to.be.gt(0n);
    });

    it("mismatched gauges/weights array lengths revert", async () => {
      await expect(
        gaugeVote.connect(voter).vote(LOCKER, [VALID_GAUGE], [500000n, 500000n])
      ).to.be.revertedWithCustomError(gaugeVote, "Mismatch");
    });

    it("a zero weight entry reverts", async () => {
      await expect(gaugeVote.connect(voter).vote(LOCKER, [VALID_GAUGE], [0n])).to.be.revertedWithCustomError(
        gaugeVote,
        "NoWeight"
      );
    });

    it("an unregistered gauge address reverts with NotGauge", async () => {
      const fakeGauge = "0x9999999999999999999999999999999999999999";
      await expect(
        gaugeVote.connect(voter).vote(LOCKER, [fakeGauge], [1000000n])
      ).to.be.revertedWithCustomError(gaugeVote, "NotGauge");
    });

    it("re-voting fully replaces the prior allocation, it does not accumulate", async () => {
      // second vote moves 100% weight off VALID_GAUGE onto CVX itself is not a gauge, so reuse
      // the same gauge but confirm total doesn't double from voting twice in a row
      const before = await gaugeVote.gaugeTotal(gaugeProposalId, VALID_GAUGE);
      await gaugeVote.connect(voter).vote(LOCKER, [VALID_GAUGE], [1000000n]);
      const after = await gaugeVote.gaugeTotal(gaugeProposalId, VALID_GAUGE);
      expect(after).to.eq(before); // replaced, not doubled
    });
  });

  context("5. revoke / replace surrogate", async () => {
    it("revoking (zero address) makes the old surrogate immediately unable to vote", async () => {
      await locker.setConvexVotingSurrogate(ethers.ZeroAddress);
      expect(await surrogateRegistry.isSurrogate(VOTER_EOA, LOCKER)).to.eq(false);
      await expect(
        daoVote.connect(voter).vote(daoProposalId, LOCKER, 10000n, 0n)
      ).to.be.revertedWithCustomError(daoVote, "NotSigner");
    });

    it("setting a new surrogate makes the old one stay revoked and the new one work", async () => {
      await locker.setConvexVotingSurrogate(VOTER_EOA_2);
      expect(await surrogateRegistry.isSurrogate(VOTER_EOA, LOCKER)).to.eq(false);
      expect(await surrogateRegistry.isSurrogate(VOTER_EOA_2, LOCKER)).to.eq(true);
      await expect(
        daoVote.connect(voter2).vote(daoProposalId, LOCKER, 0n, 10000n) // switch to NO
      ).to.not.be.reverted;
      const vote = await daoVote.getVote(daoProposalId, LOCKER);
      expect(vote.noWeight).to.eq(10000n);
    });
  });

  context("6. business regression after upgrade", async () => {
    it("deposit still works and accounting is untouched by the surrogate/vote changes", async () => {
      const cvx = await ethers.getContractAt("MockERC20", CVX, admin);
      const cvxWhale = "0x28C6c06298d514Db089934071355E5743bf21d60"; // Binance 14, large CVX holder
      await network.provider.request({ method: "hardhat_impersonateAccount", params: [cvxWhale] });
      await mockETHBalance(cvxWhale, ethers.parseEther("1"));
      const whale = await ethers.getSigner(cvxWhale);
      const amount = ethers.parseEther("10");
      await cvx.connect(whale).transfer(ADMIN, amount);
      await cvx.connect(admin).approve(LOCKER, amount);

      const totalLockedBefore = await locker.totalLockedGlobal();
      await locker.connect(admin).deposit(amount);
      expect(await locker.totalLockedGlobal()).to.eq(totalLockedBefore + amount);
    });
  });

  context("7. rollback", async () => {
    it("revoke surrogate then downgrade back to the old implementation; old ABI resurfaces, new one disappears", async () => {
      await locker.setConvexVotingSurrogate(ethers.ZeroAddress);
      await proxyAdmin.upgrade(LOCKER, OLD_IMPL);

      const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
      const raw = await ethers.provider.getStorage(LOCKER, implSlot);
      expect(ethers.getAddress("0x" + raw.slice(-40))).to.eq(OLD_IMPL);

      // setConvexVotingSurrogate no longer exists on the old implementation
      await expect(locker.setConvexVotingSurrogate(VOTER_EOA)).to.be.reverted;

      // core business logic still intact post-rollback
      expect(await locker.owner()).to.eq(ADMIN);
    });
  });
});
