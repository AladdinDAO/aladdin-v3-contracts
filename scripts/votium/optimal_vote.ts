/* eslint-disable node/no-extraneous-import */
/* eslint-disable camelcase */
import { Command } from "commander";
import axios from "axios";
import * as fs from "fs";
import assert from "assert";
import Table from "tty-table";
import { Wallet } from "ethers";
import snapshot from "@snapshot-labs/snapshot.js";
import { JsonRpcProvider } from "@ethersproject/providers";

const directory = ".store/vlcvx";

const program = new Command();
program.version("1.0.0");

export declare type ProposalType = "single-choice" | "approval" | "quadratic" | "ranked-choice" | "weighted" | "basic";

interface ISnapshotVote {
  from?: string;
  space: string;
  timestamp?: number;
  proposal: string;
  type: ProposalType;
  choice:
    | number
    | number[]
    | string
    | {
        [key: string]: number;
      };
  privacy?: string;
  reason?: string;
  app?: string;
  metadata?: string;
}

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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
): Array<number> {
  const scores: number[] = new Array(proposal.choices.length);
  const bribes: number[] = new Array(proposal.choices.length);
  const bribeTokens: string[][] = new Array(proposal.choices.length);
  scores.fill(0);
  bribes.fill(0);
  for (let i = 0; i < proposal.choices.length; i++) {
    bribeTokens[i] = [];
  }

  // compute bribes for each choice
  for (const bribe of votium.bribes) {
    const pool = proposal.choices.findIndex((name) => name === bribe.pool);
    bribes[pool] += bribe.amountDollars;
    bribeTokens[pool].push(bribe.token);
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
      console.log(`  + choice[${proposal.choices[i]}] amountUSD[${bribes[i].toFixed(2)}] tokens[${bribeTokens[i]}]`);
    }
  }

  let currentProfit = 0;
  let tokenAmounts: { [symbol: string]: { amount: number; dollar: number } } = {};

  const showTable = () => {
    const symbols = Object.keys(tokenAmounts).sort();
    const computeWidth = (symbol: string) => {
      const dollar = tokenAmounts[symbol].dollar.toFixed(1);
      const amount = tokenAmounts[symbol].amount.toFixed(0);
      return Math.floor(Math.max(dollar.length, amount.length) * 1.5);
    };
    const computeAmount = (symbol: string) => {
      const dollar = tokenAmounts[symbol].dollar.toFixed(1);
      const amount = tokenAmounts[symbol].amount.toFixed(0);
      if (dollar.length <= amount.length) return amount;
      else return tokenAmounts[symbol].amount.toFixed(dollar.length - amount.length - 1);
    };
    console.log(
      Table(
        [
          { value: "", width: 10 },
          ...symbols.map((s) => {
            return {
              value: s,
              width: computeWidth(s),
            };
          }),
        ],
        [
          ["Amount", ...symbols.map((s) => computeAmount(s))],
          ["Dollar", ...symbols.map((s) => tokenAmounts[s].dollar.toFixed(1))],
        ]
      ).render()
    );
  };

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

        for (const bribe of votium.bribes) {
          const pool = proposal.choices.findIndex((name) => name === bribe.pool);
          if (pool !== index) continue;
          if (tokenAmounts[bribe.token] === undefined) {
            tokenAmounts[bribe.token] = { amount: 0, dollar: 0 };
          }
          tokenAmounts[bribe.token].amount += (bribe.amount * score) / proposal.scores[index];
          tokenAmounts[bribe.token].dollar += (bribe.amountDollars * score) / proposal.scores[index];
        }
      }
      console.log("Current Profit USD:", currentProfit.toFixed(2));
      showTable();
    } else {
      for (const [pool, value] of Object.entries(vote.choice)) {
        scores[parseInt(pool) - 1] += (vote.vp * value) / sum;
      }
    }
  }

  // Assume that
  //   + the current votes for each choice is v[1], v[2], ..., v[n]
  //   + the current bribes for each choice is b[1], b[2], ..., b[n]
  //   + the current votes we have is s
  //
  // We want to maximum
  //                                  b[i] * x[i]
  //   f(x[1], x[2], ..., x[n]) = sum -----------    (1 <= i <= n)
  //                                  x[i] + v[i]
  //   where, x[i] >= 0 and x[1] + x[2] + ... + x[n] = s
  //
  // By using the method of Lagrange multipliers, we can find the optimal value of x[1], x[2], ..., x[n]
  //          (s + sum v[i]) * sqrt(b[i] * v[i])
  //   x[i] = ----------------------------------  - v[i]
  //                sum sqrt(b[i] * v[i])
  //
  // Notice that  some of the x[i] may be negative, we should ignore such choice.
  // To achieve this, we can run the algorithm iteratively until all the x[i] is non-negative.
  const finalWeights: Array<number> = new Array(proposal.choices.length);
  for (let round = 1; round < 100; ++round) {
    const extraVotes: number[] = new Array(proposal.choices.length);
    const x: number[] = new Array(proposal.choices.length);
    const s: number[] = new Array(proposal.choices.length);
    for (let i = 0; i < s.length; ++i) {
      s[i] = scores[i];
      // clip very small value
      if (s[i] <= 1e-8) s[i] = 0;
    }
    extraVotes.fill(0);

    // holder is votium, 5% is used for cvxCRV
    const cvxCRVChoiceIndex = proposal.choices.findIndex((name) => name === "CRV+cvxCRV (0x9D04…)");
    if (voter.toLowerCase() === "0xde1E6A7ED0ad3F61D531a8a78E83CcDdbd6E0c49".toLowerCase()) {
      extraVotes[cvxCRVChoiceIndex] = (holderVotes * 5) / 100;
      s[cvxCRVChoiceIndex] += extraVotes[cvxCRVChoiceIndex];
    }

    let totalX = 0;
    let totalVotes = holderVotes;
    for (let i = 0; i < x.length; i++) {
      x[i] = Math.sqrt(s[i] * bribes[i]);
      if (x[i] > 0) {
        totalX += x[i];
        totalVotes += s[i];
      } else if (s[i] === 0 && bribes[i] > 0) {
        // get small bribes with tiny votes
        extraVotes[i] += holderVotes / 1e6;
        s[i] = holderVotes / 1e6;
      }
      totalVotes -= extraVotes[i];
    }
    for (let i = 0; i < x.length; i++) {
      if (x[i] > 0) {
        x[i] = (totalVotes * x[i]) / totalX - s[i];
      }
    }

    let adjustedProfit = 0;
    console.log(`\nRound[${round}] -`, "Adjusted Holder Votes:");
    let bribeIgnoreTimes = 0;
    let sumVotes = 0;
    let sumPercentage = 0;
    tokenAmounts = {};
    finalWeights.fill(0);
    for (let i = 0; i < x.length; i++) {
      if (x[i] > 0 || (x[i] === 0 && extraVotes[i] > 0)) {
        const profit = ((x[i] + extraVotes[i]) * bribes[i]) / (s[i] + x[i]);
        const percentage = ((x[i] + extraVotes[i]) * 100) / holderVotes;
        const voted = x[i] + extraVotes[i];
        finalWeights[i] = Math.floor(percentage * 10000 + 1e-8);

        sumVotes += voted;
        sumPercentage += percentage;
        adjustedProfit += profit;
        console.log(
          `  + choice[${proposal.choices[i]}]`,
          `percentage[${percentage.toFixed(4)}%]`,
          `votes[${voted.toFixed(4)}]`,
          `profitUSD[${profit.toFixed(2)}]`
        );
        if (x[i] > 0 && profit < minProfitUSD) {
          bribes[i] = 0;
          bribeIgnoreTimes++;
          console.log(`  + Ignore choice[${proposal.choices[i]}] due to small profit`);
        }
        for (const bribe of votium.bribes) {
          const pool = proposal.choices.findIndex((name) => name === bribe.pool);
          if (pool !== i) continue;
          if (tokenAmounts[bribe.token] === undefined) {
            tokenAmounts[bribe.token] = { amount: 0, dollar: 0 };
          }
          tokenAmounts[bribe.token].amount += (bribe.amount * voted) / (s[i] + x[i]);
          tokenAmounts[bribe.token].dollar += (bribe.amountDollars * voted) / (s[i] + x[i]);
        }
      } else if (x[i] < 0 && bribes[i] !== 0) {
        bribes[i] = 0;
        bribeIgnoreTimes++;
        console.log(`  + Ignore choice[${proposal.choices[i]}] due to negative votes`);
      }
    }
    const accepted = sumPercentage <= 100 + 1e-8 && bribeIgnoreTimes === 0;
    console.log(`Round[${round}] -`, "Adjusted Profit USD:", adjustedProfit.toFixed(2));
    console.log(
      `${accepted ? "✅ Accepted" : "❌ Abandoned"},`,
      `sumVotes[${sumVotes.toFixed(4)}]`,
      `actualVotes[${holderVotes.toFixed(4)}]`,
      `sumPercentage[${sumPercentage.toFixed(4)}]`
    );
    if (accepted) {
      showTable();
    }
    if (accepted) break;
  }
  return finalWeights;
}

async function main(
  round: number,
  voter: string,
  holderVotes: number,
  minProfitUSD: number,
  force: boolean,
  voteConfig?: {
    private: string;
    mode: string;
    autoInterval: number;
  }
) {
  const proposal_file = `${directory}/${round}.proposal.json`;
  const votes_file = `${directory}/${round}.votes.json`;
  const bribes_file = `${directory}/${round}.bribes.json`;

  if (voteConfig) force = true;

  while (true) {
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

    const proposalId = bribes.proposal;

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
      const finalWeights = compute(voter, holderVotes, minProfitUSD, proposal, bribes, votes);
      const choices: { [index: string]: number } = {};
      finalWeights.forEach((weight, index) => {
        if (weight > 0) {
          choices[(index + 1).toString()] = weight;
        }
      });
      console.log("Vote choices:", choices);
      if (voteConfig) {
        const provider = new JsonRpcProvider("https://rpc.ankr.com/eth");
        const account = new Wallet(voteConfig.private, provider);

        const hub = "https://hub.snapshot.org";
        const client = new snapshot.Client712(hub);
        const message: ISnapshotVote = {
          space: "cvx.eth",
          proposal: proposalId,
          timestamp: Math.floor(Date.now() / 1000),
          type: "weighted",
          choice: choices,
          reason: "CLever",
        };
        console.log("Do voting:", message);
        const receipt = await client.vote(account, voter, message);
        console.log("Voted:", receipt);
        if (voteConfig.mode === "manual") {
          break;
        } else {
          console.log(`Sleep for ${voteConfig.autoInterval} seconds for next vote round`);
          await delay(voteConfig.autoInterval * 1000);
          continue;
        }
      } else {
        break;
      }
    } else {
      break;
    }
  }
}

program.option("--round <round>", "round number");
program.option("--voter <voter>", "the address of voter");
program.option("--votes <votes>", "number of votes you have");
program.option("--min-profit-usd <min profit usd>", "the minimum profit in USD in each choice", "1000");
program.option("--force", "whether to force update local cache");
program.option("--private <private key>", "the private key of signer", "");
program.option("--mode <mode>", "current vote mode: manual, auto", "manual");
program.option("--auto-interval <interval>", "the number of seconds between each vote when in auto mode", "60");
program.parse(process.argv);
const options = program.opts();

console.log(options);

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main(
  parseInt(options.round),
  options.voter,
  parseFloat(options.votes),
  parseFloat(options.minProfitUsd),
  options.force,
  options.private
    ? {
        private: options.private!,
        mode: options.mode || "manual",
        autoInterval: parseInt(options.autoInterval || "60"),
      }
    : undefined
).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
