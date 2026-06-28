import type { DiffScopeItem } from "../../diff-scope/diffScopes.js";
import type { GitDiffSnapshot } from "../../git-diff/getGitDiffStats.js";
import type { MenuItem } from "../../main-menu/menuItems.js";

export function toDiffContextLines(
  mode: MenuItem,
  diffScope: DiffScopeItem,
  diff: GitDiffSnapshot,
): string[] {
  return [
    `Pipeline mode: ${mode.label}`,
    `Diff scope: ${diffScope.label}`,
    `Project path: ${diff.stats.cwd}`,
    `Changed files: ${diff.stats.changedFiles}`,
    `Added lines: ${diff.stats.addedLines}`,
    `Removed lines: ${diff.stats.removedLines}`,
    ...(diff.stats.binaryFiles > 0
      ? [`Binary files: ${diff.stats.binaryFiles}`]
      : []),
    ...(diff.stats.commitCount === undefined
      ? []
      : [`Commits in scope: ${diff.stats.commitCount}`]),
  ];
}

export function toMarkdownBlockLines(
  title: string,
  language: string,
  content: string | undefined,
  emptyFallback: string,
): string[] {
  const body =
    content !== undefined && content.trim().length > 0 ? content : emptyFallback;

  return [title, `\`\`\`${language}`, body, "```"];
}

export function toFileListLines(paths: readonly string[]): string[] {
  if (paths.length === 0) {
    return ["- (none detected)"];
  }

  return paths.map((path) => `- ${path}`);
}
