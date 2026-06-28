export const DIFF_SCOPE_ITEMS = [
  {
    id: "current-changes",
    label: "Current changes",
    description: "Working tree changes, including untracked files",
  },
  {
    id: "branch-against-main",
    label: "Current branch against main",
    description: "Committed branch changes since main",
  },
  {
    id: "staged-changes",
    label: "Staged changes",
    description: "Only what is staged for commit",
  },
] as const;

export type DiffScopeItem = (typeof DIFF_SCOPE_ITEMS)[number];
export type DiffScopeId = DiffScopeItem["id"];
