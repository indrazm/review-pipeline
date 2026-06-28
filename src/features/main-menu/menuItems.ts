export const MENU_ITEMS = [
  {
    id: "review",
    label: "Review",
    description: "Reports findings from the selected diff without edits.",
  },
  {
    id: "review-and-fix",
    label: "Review and Fix",
    description: "Reviews the diff, then fixes supported findings.",
  },
  {
    id: "full-pipeline",
    label: "Full pipeline",
    description: "Reviews, verifies, fixes, then prepares a PR.",
  },
] as const;

export type MenuItem = (typeof MENU_ITEMS)[number];
