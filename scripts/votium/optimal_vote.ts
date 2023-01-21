/* eslint-disable camelcase */
import { Command } from "commander";
import axios from "axios";
import * as fs from "fs";
import assert from "assert";

const directory = ".store/vlcvx";

const program = new Command();
program.version("1.0.0");

interface ISnapshotProposal {
  author: string;
  body: string;
  choices: string[];
  created: number;
  discussion: string;
  end: number;
  id: string;
  ipfs: string;
  network: string;
  plugins: {};
  privacy: string;
  quorum: number;
  scores: number[];
  scores_by_strategy: number[][];
  scores_state: string;
  scores_total: number;
  snapshot: string;
  space: {
    id: string;
    name: string;
  };
  start: number;
  state: string;
  strategies: {
    name: string;
    network: string;
    params: {
      symbol: string;
      address: string;
      decimals: number;
    };
  }[];
  symbol: string;
  title: string;
  type: string;
  validation: {
    name: string;
    params: {};
  };
  votes: number;
}

interface ISnapshotProposalResponse {
  data: {
    proposal: ISnapshotProposal;
  };
}

interface ISnapshotVotes {
  choice: { [id: number]: number };
  created: number;
  ipfs: string;
  reason: string;
  voter: string;
  vp: number;
  vp_by_strategy: number[];
}

interface ISnapshotVotesResponse {
  data: {
    votes: ISnapshotVotes[];
  };
}

interface IVotiumBribe {
  platform: string;
  proposal: string;
  protocol: string;
  round: number;
  end: number;
  bribes: {
    amount: number;
    amountDollars: number;
    pool: string;
    token: string;
  }[];
  bribed: { [pool: string]: number };
}

interface IVotiumBribeResponse {
  success: boolean;
  epoch: IVotiumBribe;
}

async function fetchVotes(proposalId: string, users: number): Promise<ISnapshotVotes[]> {
  const batchSize = 100;
  const votes: ISnapshotVotes[] = [];
  for (let skip = 0; skip < users; skip += batchSize) {
    const response = await axios.post<ISnapshotVotesResponse>(
      "https://hub.snapshot.org/graphql",
      JSON.stringify({
        operationName: "Votes",
        variables: {
          first: batchSize,
          orderBy: "vp",
          orderDirection: "desc",
          skip,
          id: proposalId,
        },
        query:
          "query Votes($id: String!, $first: Int, $skip: Int, $orderBy: String, $orderDirection: OrderDirection, $voter: String, $space: String) {\n  votes(\n    first: $first\n    skip: $skip\n    where: {proposal: $id, vp_gt: 0, voter: $voter, space: $space}\n    orderBy: $orderBy\n    orderDirection: $orderDirection\n  ) {\n    ipfs\n    voter\n    choice\n    vp\n    vp_by_strategy\n    reason\n    created\n  }\n}",
      }),
      {
        headers: {
          "content-type": "application/json",
        },
      }
    );
    votes.push(...response.data.data.votes);
  }

  return votes;
}

function compute(
  voter: string,
  holderVotes: number,
  minProfitUSD: number,
  proposal: ISnapshotProposal,
  votium: IVotiumBribe,
  votes: ISnapshotVotes[]
) {
  const scores: number[] = new Array(proposal.choices.length);
  const bribes: number[] = new Array(proposal.choices.length);
  scores.fill(0);
  bribes.fill(0);

  // compute bribes for each choice
  for (const bribe of votium.bribes) {
    const pool = proposal.choices.findIndex((name) => name === bribe.pool);
    bribes[pool] += bribe.amountDollars;
  }

  for (const vote of votes) {
    if (vote.voter.toLowerCase() === voter.toLowerCase()) {
      holderVotes = vote.vp;
    }
  }
  console.log("\nVoter:", voter);
  console.log("Votes:", holderVotes);
  console.log("\nCurrent Bribes:");
  for (let i = 0; i < bribes.length; i++) {
    if (bribes[i] > 0) {
      console.log(`  + choice[${proposal.choices[i]}] amountUSD[${bribes[i]}]`);
    }
  }

  let currentProfit = 0;
  // compute score without holder
  for (const vote of votes) {
    let sum = 0;
    for (const value of Object.values(vote.choice)) {
      sum += value;
    }
    if (vote.voter.toLowerCase() === voter.toLowerCase()) {
      console.log("\nCurrent Holder Votes:");
      for (const [pool, value] of Object.entries(vote.choice)) {
        const index = parseInt(pool) - 1;
        const score = (vote.vp * value) / sum;
        const profit = (score * bribes[index]) / proposal.scores[index];
        console.log(
          `  + choice[${proposal.choices[index]}]`,
          `percentage[${((value * 100) / sum).toFixed(4)}%]`,
          `votes[${score.toFixed(4)}]`,
          `profitUSD[${profit.toFixed(2)}]`
        );
        currentProfit += (score * bribes[index]) / proposal.scores[index];
      }
      console.log("Current Profit USD:", currentProfit.toFixed(2));
    } else {
      for (const [pool, value] of Object.entries(vote.choice)) {
        scores[parseInt(pool) - 1] += (vote.vp * value) / sum;
      }
    }
  }

  // holder is votium, 5% is used for cvxCRV
  let cvxCRVExtraVotes = 0;
  const cvxCRVChoiceIndex = proposal.choices.findIndex((name) => name === "CRV+cvxCRV (0x9D04…)");
  if (voter.toLowerCase() === "0xde1E6A7ED0ad3F61D531a8a78E83CcDdbd6E0c49".toLowerCase()) {
    cvxCRVExtraVotes = (holderVotes * 5) / 100;
    scores[cvxCRVChoiceIndex] += cvxCRVExtraVotes;
  }
  console.log("cvxCRVChoiceIndex:", cvxCRVChoiceIndex, "cvxCRVExtraVotes:", cvxCRVExtraVotes);

  for (let round = 1; round < 100; ++round) {
    const x: number[] = new Array(proposal.choices.length);
    let totalX = 0;
    let totalVotes = holderVotes - cvxCRVExtraVotes;
    for (let i = 0; i < x.length; i++) {
      x[i] = Math.sqrt(scores[i] * bribes[i]);
      if (x[i] > 0) {
        totalX += x[i];
        totalVotes += scores[i];
      }
    }
    for (let i = 0; i < x.length; i++) {
      if (x[i] > 0) {
        x[i] = (totalVotes * x[i]) / totalX - scores[i];
      }
    }

    let adjustedProfit = 0;
    console.log(`\nRound[${round}] -`, "Adjusted Holder Votes:");
    let bribeIgnoreTimes = 0;
    let sumVotes = 0;
    let sumPercentage = 0;
    for (let i = 0; i < x.length; i++) {
      if (x[i] === 0) continue;

      if (x[i] > 0) {
        let profit = 0;
        let percentage = 0;
        let voted = 0;
        if (i === cvxCRVChoiceIndex) {
          profit = ((x[i] + cvxCRVExtraVotes) * bribes[i]) / (scores[i] + x[i]);
          percentage = ((x[i] + cvxCRVExtraVotes) * 100) / holderVotes;
          voted = x[i] + cvxCRVExtraVotes;
        } else {
          profit = (x[i] * bribes[i]) / (scores[i] + x[i]);
          percentage = (x[i] * 100) / holderVotes;
          voted = x[i];
        }
        sumVotes += voted;
        sumPercentage += percentage;
        adjustedProfit += profit;
        console.log(
          `  + choice[${proposal.choices[i]}]`,
          `percentage[${percentage.toFixed(4)}%]`,
          `votes[${voted.toFixed(4)}]`,
          `profitUSD[${profit.toFixed(2)}]`
        );
        if (profit < minProfitUSD) {
          bribes[i] = 0;
          bribeIgnoreTimes++;
        }
      } else if (bribes[i] !== 0) {
        bribes[i] = 0;
        bribeIgnoreTimes++;
      }
    }
    console.log(`Round[${round}] -`, "Adjusted Profit USD:", adjustedProfit.toFixed(2));
    console.log(
      `${sumPercentage <= 100 + 1e-8 && bribeIgnoreTimes === 0 ? "✅ Accepted" : "❌ Abandoned"},`,
      `sumVotes[${sumVotes.toFixed(4)}]`,
      `actualVotes[${holderVotes.toFixed(4)}]`,
      `sumPercentage[${sumPercentage.toFixed(4)}]`
    );
    if (bribeIgnoreTimes === 0) break;
  }
}

async function main(
  round: number,
  proposalId: string,
  voter: string,
  holderVotes: number,
  minProfitUSD: number,
  force: boolean
) {
  const proposal_file = `${directory}/${proposalId}.proposal.json`;
  const votes_file = `${directory}/${proposalId}.votes.json`;
  const bribes_file = `${directory}/${proposalId}.bribes.json`;

  // load data
  let proposal: ISnapshotProposal;
  if (fs.existsSync(proposal_file) && !force) {
    proposal = JSON.parse(fs.readFileSync(proposal_file).toString());
  } else {
    const response = await axios.post<ISnapshotProposalResponse>(
      "https://hub.snapshot.org/graphql",
      JSON.stringify({
        operationName: "Proposal",
        variables: {
          id: proposalId,
        },
        query:
          "query Proposal($id: String!) {\n  proposal(id: $id) {\n    id\n    ipfs\n    title\n    body\n    discussion\n    choices\n    start\n    end\n    snapshot\n    state\n    author\n    created\n    plugins\n    network\n    type\n    quorum\n    symbol\n    privacy\n    strategies {\n      name\n      network\n      params\n    }\n    space {\n      id\n      name\n    }\n    scores_state\n    scores\n    scores_by_strategy\n    scores_total\n    votes\n  }\n}",
      }),
      {
        headers: {
          "content-type": "application/json",
        },
      }
    );
    proposal = response.data.data.proposal;
    console.log("save proposal data to:", proposal_file);
    fs.writeFileSync(proposal_file, JSON.stringify(proposal));
  }

  let votes: ISnapshotVotes[];
  if (fs.existsSync(votes_file) && !force) {
    votes = JSON.parse(fs.readFileSync(votes_file).toString());
  } else {
    votes = await fetchVotes(proposalId, proposal.votes);
    console.log("save votes data to:", votes_file);
    fs.writeFileSync(votes_file, JSON.stringify(votes));
  }

  let bribes: IVotiumBribe;
  if (fs.existsSync(bribes_file) && !force) {
    bribes = JSON.parse(fs.readFileSync(bribes_file).toString());
  } else {
    const response = await axios.post<IVotiumBribeResponse>(
      "https://api.llama.airforce//bribes",
      JSON.stringify({
        platform: "votium",
        protocol: "cvx-crv",
        round: round.toString(),
      }),
      {
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
      }
    );
    bribes = response.data.epoch;
    console.log("save bribes data to:", bribes_file);
    fs.writeFileSync(bribes_file, JSON.stringify(bribes));
  }

  // do verification
  const scores: number[] = new Array(proposal.choices.length);
  scores.fill(0);
  let totalVotes = 0;
  for (const vote of votes) {
    let sum = 0;
    for (const value of Object.values(vote.choice)) {
      sum += value;
    }
    for (const [pool, value] of Object.entries(vote.choice)) {
      scores[parseInt(pool) - 1] += (vote.vp * value) / sum;
    }
    totalVotes += vote.vp;
  }
  assert.strictEqual(proposal.votes, votes.length, "user count mismatch");
  assert.strictEqual(proposal.id, proposalId, "proposal_id mismatch");
  assert.strictEqual(bribes.round, round, "round mismatch");
  assert.strictEqual(bribes.proposal, proposalId, "proposal_id in bribes mismatch");

  console.log("User voted:", proposal.votes);
  console.log("Remote total votes:", proposal.scores_total);
  console.log("Computed total votes:", totalVotes);
  console.log("Min profit usd:", minProfitUSD);
  console.log("\nCurrent Status:");
  for (let i = 0; i < scores.length; i++) {
    if (proposal.scores[i] === 0) {
      assert.strictEqual(scores[i], 0, `votes mismatch for choice[${proposal.choices[i]}]`);
    } else {
      console.log(
        `  + choice[${proposal.choices[i]}] remote_votes[${proposal.scores[i]}] computed_votes[${scores[i]}]`
      );
      const absError = Math.abs(proposal.scores[i] - scores[i]);
      if (absError > 1e-5) {
        assert.fail(`absolute error[${absError}] for choice[${proposal.choices[i]}] exceed 1e-5`);
      }
    }
  }

  if (voter) {
    compute(voter, holderVotes, minProfitUSD, proposal, bribes, votes);
  }
}

program.option("--round <round>", "round number");
program.option("--proposal <proposal id>", "ipfs hash of snapshot proposal");
program.option("--voter <voter>", "the address of voter");
program.option("--votes <votes>", "number of votes you have");
program.option("--min-profit-usd <min profit usd>", "the minimum profit in USD in each choice", "1000");
program.option("--force", "whether to force update local cache");
program.parse(process.argv);
const options = program.opts();

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main(
  parseInt(options.round),
  options.proposal || "",
  options.voter,
  parseFloat(options.votes),
  parseFloat(options.minProfitUsd),
  options.force
).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
