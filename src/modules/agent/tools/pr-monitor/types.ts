import type { PrMonitorStatus } from "../../types.js";
import type {
  ActionableReviewThread,
  PrRepairTrigger,
} from "./schemas.js";

export type GhPrView = {
  readonly isDraft?: boolean;
  readonly mergeStateStatus?: string;
  readonly mergeable?: string;
  readonly reviewDecision?: string;
  readonly state?: string;
  readonly title?: string;
  readonly url?: string;
};

export type GhCheck = {
  readonly bucket?: string;
  readonly link?: string;
  readonly name?: string;
  readonly state?: string;
  readonly workflow?: string;
};

export type GhReviewThreadComment = {
  readonly author?: {
    readonly login?: string;
  } | null;
  readonly body?: string;
  readonly line?: number | null;
  readonly path?: string | null;
  readonly url?: string;
};

export type GhReviewThread = {
  readonly comments?: {
    readonly nodes?: readonly (GhReviewThreadComment | null)[] | null;
  } | null;
  readonly isOutdated?: boolean;
  readonly isResolved?: boolean;
  readonly line?: number | null;
  readonly path?: string | null;
  readonly startLine?: number | null;
};

export type GhReviewThreadsResponse = {
  readonly data?: {
    readonly repository?: {
      readonly pullRequest?: {
        readonly reviewThreads?: {
          readonly nodes?: readonly (GhReviewThread | null)[] | null;
        } | null;
      } | null;
    } | null;
  };
  readonly errors?: readonly {
    readonly message?: string;
  }[];
  readonly repository?: {
    readonly pullRequest?: {
      readonly reviewThreads?: {
        readonly nodes?: readonly (GhReviewThread | null)[] | null;
      } | null;
    } | null;
  } | null;
};

export type ReviewThreadSummary = {
  readonly actionable: number;
  readonly outdated: number;
  readonly total: number;
  readonly unresolved: number;
};

export type PollSnapshot = {
  readonly actionableReviewThreads: readonly ActionableReviewThread[];
  readonly checks: readonly GhCheck[];
  readonly pr: GhPrView;
  readonly reviewThreadSummary: ReviewThreadSummary;
};

export type TerminalClassification = {
  readonly reason: string;
  readonly repairable: boolean;
  readonly repairTriggers: readonly PrRepairTrigger[];
  readonly status: PrMonitorStatus;
};

export type InternalClassification =
  | TerminalClassification
  | {
      readonly reason: string;
      readonly status: "pending";
    };

export type GhResult = {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
};
