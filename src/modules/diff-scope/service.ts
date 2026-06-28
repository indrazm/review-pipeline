export const DIFF_SCOPE_ITEMS = [
  {
    id: "current-changes",
    label: "Current changes",
    description: "Tracked changes since HEAD, plus untracked files.",
  },
  {
    id: "branch-against-main",
    label: "Current branch against main",
    description: "Committed changes on this branch compared with main.",
  },
  {
    id: "staged-changes",
    label: "Staged changes",
    description: "Only the changes currently staged for commit.",
  },
] as const;
