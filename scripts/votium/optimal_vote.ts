import { Command } from "commander";
import axios from "axios";

const program = new Command();
program.version("1.0.0");

async function main(round: number, proposalId: string, total: number) {
  const voted = await axios.post(
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
  console.log(voted.data);
  const bribed = await axios.post(
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
  console.log(bribed.data);
}

program.option("--round <round>", "round number");
program.option("--proposal <proposal id>", "ipfs hash of snapshot proposal");
program.option("--votes <votes>", "number of votes you have");
program.parse(process.argv);
const options = program.opts();

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main(parseInt(options.round), options.proposal || "", parseFloat(options.votes)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
