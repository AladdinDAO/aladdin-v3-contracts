/* eslint-disable node/no-missing-import */
import assert from "assert";
import { selectDeployments } from "../utils";

export interface MultisigDeployment {
  Management: string;
  AladdinDAO: string;
  Concentrator: string;
  CLever: string;
  Fx: string;
}

export function deploy(network: string): MultisigDeployment {
  const deployment = selectDeployments(network, "Multisig");

  assert(deployment.get("Management"), "Management multisig is missing");
  assert(deployment.get("AladdinDAO"), "AladdinDAO multisig is missing");
  assert(deployment.get("Concentrator"), "Concentrator multisig is missing");
  assert(deployment.get("CLever"), "CLever multisig is missing");
  assert(deployment.get("Fx"), "Fx multisig is missing");

  return deployment.toObject() as MultisigDeployment;
}
