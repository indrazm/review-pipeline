import type { DIFF_SCOPE_ITEMS } from "./service.js";

export type DiffScopeItem = (typeof DIFF_SCOPE_ITEMS)[number];
export type DiffScopeId = DiffScopeItem["id"];

