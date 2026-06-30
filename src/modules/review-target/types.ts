import type { DiffScopeItem } from "../diff-scope/index.js";

export type ReviewTarget = {
  readonly scope: DiffScopeItem;
  readonly selectedPaths: readonly string[];
};

