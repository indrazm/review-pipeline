export const RUN_MODE_ITEMS = [
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
    description: "Reviews, verifies, fixes, prepares a PR, then monitors and repairs it.",
  },
] as const;

export const CONNECT_PROVIDER_ITEM = {
  id: "connect-provider",
  label: "Connect provider",
  description: "Save and verify an OpenAI-compatible or Anthropic-compatible endpoint.",
} as const;

export const MENU_ITEMS = [...RUN_MODE_ITEMS, CONNECT_PROVIDER_ITEM] as const;
