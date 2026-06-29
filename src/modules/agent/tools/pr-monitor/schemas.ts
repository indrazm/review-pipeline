import { z } from "zod";

export const pollingInputSchema = z.object({
  intervalSeconds: z
    .number()
    .int()
    .min(5)
    .max(120)
    .optional()
    .describe("Polling interval in seconds. Defaults to 30 seconds."),
  prUrl: z.string().url().describe("GitHub pull request URL to monitor."),
  timeoutSeconds: z
    .number()
    .int()
    .min(1)
    .max(3600)
    .optional()
    .describe("Maximum time to poll in seconds. Defaults to 900 seconds."),
});

export const checkItemSchema = z.object({
  bucket: z.string(),
  link: z.string().optional(),
  name: z.string(),
  state: z.string().optional(),
  workflow: z.string().optional(),
});

export const repairTriggerSchema = z.enum(["checks", "review-comments"]);

export const actionableReviewThreadSchema = z.object({
  author: z.string().optional(),
  bodyExcerpt: z.string(),
  line: z.number().int().optional(),
  path: z.string().optional(),
  url: z.string().optional(),
});

export const pollingOutputSchema = z.object({
  actionableReviewThreads: z.array(actionableReviewThreadSchema),
  attempts: z.number().int().nonnegative(),
  checkSummary: z.object({
    cancelled: z.number().int().nonnegative(),
    failing: z.number().int().nonnegative(),
    pass: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    skipping: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
  }),
  elapsedSeconds: z.number().nonnegative(),
  failingChecks: z.array(checkItemSchema),
  isDraft: z.boolean().optional(),
  mergeStateStatus: z.string().optional(),
  mergeable: z.string().optional(),
  pendingChecks: z.array(checkItemSchema),
  prUrl: z.string(),
  reason: z.string(),
  repairable: z.boolean(),
  repairTriggers: z.array(repairTriggerSchema),
  reviewDecision: z.string().optional(),
  reviewThreadSummary: z.object({
    actionable: z.number().int().nonnegative(),
    outdated: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    unresolved: z.number().int().nonnegative(),
  }),
  state: z.string().optional(),
  status: z.enum(["ready", "failing", "timeout", "error"]),
  timedOut: z.boolean(),
  title: z.string().optional(),
});

export type ActionableReviewThread = z.input<
  typeof actionableReviewThreadSchema
>;
export type CheckItem = z.input<typeof checkItemSchema>;
export type PollingInput = z.output<typeof pollingInputSchema>;
export type PollingOutput = z.input<typeof pollingOutputSchema>;
export type PrRepairTrigger = z.output<typeof repairTriggerSchema>;
