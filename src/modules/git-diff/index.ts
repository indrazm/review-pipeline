export { getGitDiff, getGitDiffStats, getGitDiffSummary } from "./service.js";
export type {
  GitDiffFileStat,
  GitDiffOptions,
  GitDiffSnapshot,
  GitDiffStats,
  GitDiffSummary,
} from "./types.js";
export {
  aggregateGitDiffFileStats,
  parseGitNumstat,
  parseGitNumstatFiles,
} from "./utils.js";
