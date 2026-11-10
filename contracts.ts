import type { Contracts } from "https://raw.githubusercontent.com/puddle-works/puddle-tooling/v0.2.3/contracts/check.ts";
import { model as harvester } from "./extensions/models/harvester.ts";

// Maps each model instance a workflow reads with data.latest(...) to its type
// and the data names it writes. The weekly workflow only calls methods, but
// the entry records what the model writes.
export const CONTRACTS: Contracts = {
  harvester: { model: harvester, data: { candidates: "candidates" } },
};
