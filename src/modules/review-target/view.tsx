import { useCallback, useEffect, useState } from "react";
import { Box, Text, useInput, useStdin, useStdout, useWindowSize } from "ink";
import { DIFF_SCOPE_ITEMS, type DiffScopeId } from "../diff-scope/index.js";
import {
  getGitDiff,
  getGitDiffSummary,
  type GitDiffSummary,
} from "../git-diff/index.js";
import { useMenuNavigation, type MenuItem } from "../main-menu/index.js";
import type { ReviewTarget } from "./types.js";

type ReviewTargetMenuProps = {
  readonly cwd: string;
  readonly mode?: MenuItem | undefined;
  readonly onBack: () => void;
  readonly onChoose: (target: ReviewTarget) => void;
  readonly onFooterChange?: (footer: string | undefined) => void;
};

type ScopeSummaryState =
  | {
      readonly status: "loading";
    }
  | {
      readonly status: "ready";
      readonly summary: GitDiffSummary;
    }
  | {
      readonly error: string;
      readonly status: "error";
    };

type Step = "scope" | "diff";

type StackedDiffState =
  | {
      readonly status: "idle";
    }
  | {
      readonly status: "loading";
    }
  | {
      readonly error: string;
      readonly status: "error";
    }
  | {
      readonly lines: readonly DiffDisplayLine[];
      readonly status: "ready";
    };

type DiffDisplayLine = {
  readonly language?: SyntaxLanguage;
  readonly newLineNumber?: number;
  readonly oldLineNumber?: number;
  readonly text: string;
};

type HighlightSegment = {
  readonly color?: "blue" | "cyan" | "green" | "magenta" | "yellow";
  readonly text: string;
};

type SyntaxLanguage =
  | "css"
  | "html"
  | "javascript"
  | "json"
  | "markdown"
  | "python"
  | "ruby"
  | "shell"
  | "toml"
  | "yaml";

const ENABLE_MOUSE_REPORTING = "\u001B[?1000h\u001B[?1006h";
const DISABLE_MOUSE_REPORTING = "\u001B[?1006l\u001B[?1000l";
const MOUSE_WHEEL_STEP = 3;

export function ReviewTargetMenu({
  cwd,
  mode,
  onBack,
  onChoose,
  onFooterChange,
}: ReviewTargetMenuProps) {
  const { columns, rows } = useWindowSize();
  const separatorWidth = Math.max(24, columns - 8);
  const visibleDiffLineCount = Math.max(8, rows - 11);
  const [diffScrollOffset, setDiffScrollOffset] = useState(0);
  const [diffState, setDiffState] = useState<StackedDiffState>({
    status: "idle",
  });
  const [selectedPaths, setSelectedPaths] = useState<readonly string[]>([]);
  const [scopeStates, setScopeStates] = useState(toLoadingScopeStates);
  const [step, setStep] = useState<Step>("scope");

  useEffect(() => {
    onFooterChange?.(
      step === "scope"
        ? "Up/Down select | Enter inspect diff | b back | q / Esc exit"
        : "Wheel or Up/Down scroll | PgUp/PgDn page | g/G top/bottom | Enter continue | b back | q / Esc exit",
    );

    return () => {
      onFooterChange?.(undefined);
    };
  }, [onFooterChange, step]);

  useEffect(() => {
    let isMounted = true;

    setScopeStates(toLoadingScopeStates());

    void Promise.all(
      DIFF_SCOPE_ITEMS.map(async (scope) => {
        try {
          return {
            scopeId: scope.id,
            state: {
              status: "ready",
              summary: await getGitDiffSummary(cwd, scope),
            } satisfies ScopeSummaryState,
          };
        } catch (error: unknown) {
          return {
            scopeId: scope.id,
            state: {
              error: error instanceof Error ? error.message : String(error),
              status: "error",
            } satisfies ScopeSummaryState,
          };
        }
      }),
    ).then((entries) => {
      if (!isMounted) {
        return;
      }

      setScopeStates(
        Object.fromEntries(
          entries.map((entry) => [entry.scopeId, entry.state]),
        ) as Record<DiffScopeId, ScopeSummaryState>,
      );
    });

    return () => {
      isMounted = false;
    };
  }, [cwd]);

  const { selectedIndex: selectedScopeIndex } = useMenuNavigation({
    isActive: step === "scope",
    isItemDisabled: (index) => isScopeDisabled(scopeStates[DIFF_SCOPE_ITEMS[index].id]),
    itemCount: DIFF_SCOPE_ITEMS.length,
    onChoose: (index) => {
      const scope = DIFF_SCOPE_ITEMS[index];
      const scopeState = scopeStates[scope.id];

      if (scopeState.status !== "ready" || scopeState.summary.files.length === 0) {
        return;
      }

      setSelectedPaths(scopeState.summary.files.map((file) => file.path));
      setStep("diff");
    },
  });

  const selectedScope = DIFF_SCOPE_ITEMS[selectedScopeIndex];
  const selectedScopeState = scopeStates[selectedScope.id];
  const selectedSummary =
    selectedScopeState.status === "ready" ? selectedScopeState.summary : undefined;

  useEffect(() => {
    if (step !== "diff" || selectedPaths.length === 0) {
      setDiffState({ status: "idle" });
      setDiffScrollOffset(0);
      return;
    }

    let isMounted = true;

    setDiffState({ status: "loading" });
    setDiffScrollOffset(0);

    void getGitDiff(cwd, selectedScope, {
      paths: selectedPaths,
    })
      .then((snapshot) => {
        if (!isMounted) {
          return;
        }

        setDiffState({
          lines: toPatchLines(snapshot.patch),
          status: "ready",
        });
      })
      .catch((error: unknown) => {
        if (!isMounted) {
          return;
        }

        setDiffState({
          error: error instanceof Error ? error.message : String(error),
          status: "error",
        });
      });

    return () => {
      isMounted = false;
    };
  }, [cwd, selectedPaths, selectedScope, step]);

  useInput(
    (input) => {
      if (input === "b") {
        onBack();
      }
    },
    { isActive: step === "scope" },
  );

  useInput(
    (input, key) => {
      if (input === "b") {
        setStep("scope");
        return;
      }

      const maxScrollOffset = getMaxDiffScrollOffset(
        diffState,
        visibleDiffLineCount,
      );
      const pageSize = Math.max(1, visibleDiffLineCount - 1);
      const halfPageSize = Math.max(1, Math.floor(visibleDiffLineCount / 2));

      if (key.home || input === "g") {
        setDiffScrollOffset(0);
        return;
      }

      if (key.end || input === "G") {
        setDiffScrollOffset(maxScrollOffset);
        return;
      }

      if (key.upArrow || input === "k") {
        setDiffScrollOffset((offset) => Math.max(0, offset - 1));
        return;
      }

      if (key.downArrow || input === "j") {
        setDiffScrollOffset((offset) =>
          Math.min(maxScrollOffset, offset + 1),
        );
        return;
      }

      if (key.ctrl && input === "u") {
        setDiffScrollOffset((offset) =>
          Math.max(0, offset - halfPageSize),
        );
        return;
      }

      if (key.ctrl && input === "d") {
        setDiffScrollOffset((offset) =>
          Math.min(maxScrollOffset, offset + halfPageSize),
        );
        return;
      }

      if (key.pageUp || input === "u") {
        setDiffScrollOffset((offset) =>
          Math.max(0, offset - pageSize),
        );
        return;
      }

      if (key.pageDown || input === "d") {
        setDiffScrollOffset((offset) =>
          Math.min(maxScrollOffset, offset + pageSize),
        );
        return;
      }

      if (key.return && selectedPaths.length > 0) {
        onChoose({
          scope: selectedScope,
          selectedPaths,
        });
      }
    },
    { isActive: step === "diff" },
  );

  const handleMouseScroll = useCallback(
    (delta: number) => {
      setDiffScrollOffset((offset) =>
        Math.min(
          getMaxDiffScrollOffset(diffState, visibleDiffLineCount),
          Math.max(0, offset + delta),
        ),
      );
    },
    [diffState, visibleDiffLineCount],
  );

  useMouseWheelScroll({
    isActive: step === "diff",
    onScroll: handleMouseScroll,
  });

  return (
    <Box flexDirection="column" flexGrow={1} width="100%" paddingX={1} gap={1}>
      <Box flexDirection="column">
        <Text bold wrap="truncate">
          {mode === undefined ? "Inspect Diff" : mode.label}
        </Text>
        <Text dimColor wrap="truncate">
          {step === "scope"
            ? "Choose the git diff scope to inspect."
            : "Review the stacked code diff for every changed file in this scope."}
        </Text>
        {mode !== undefined && (
          <Text dimColor wrap="truncate">
            {mode.description}
          </Text>
        )}
      </Box>

      {step === "scope" ? (
        <ScopePicker
          scopeStates={scopeStates}
          selectedScopeIndex={selectedScopeIndex}
        />
      ) : (
        <StackedDiffView
          diffScrollOffset={diffScrollOffset}
          diffState={diffState}
          selectedFileCount={selectedPaths.length}
          separatorWidth={separatorWidth}
          visibleDiffLineCount={visibleDiffLineCount}
          scopeLabel={selectedScope.label}
          summary={selectedSummary}
        />
      )}
    </Box>
  );
}

type UseMouseWheelScrollOptions = {
  readonly isActive: boolean;
  readonly onScroll: (delta: number) => void;
};

function useMouseWheelScroll({
  isActive,
  onScroll,
}: UseMouseWheelScrollOptions): void {
  const { stdin } = useStdin();
  const { write } = useStdout();

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const handleData = (data: Buffer | string): void => {
      const delta = parseMouseWheelDelta(data);

      if (delta !== 0) {
        onScroll(delta);
      }
    };

    write(ENABLE_MOUSE_REPORTING);
    stdin.on("data", handleData);

    return () => {
      stdin.off("data", handleData);
      write(DISABLE_MOUSE_REPORTING);
    };
  }, [isActive, onScroll, stdin, write]);
}

function parseMouseWheelDelta(data: Buffer | string): number {
  const input = typeof data === "string" ? data : data.toString("binary");
  let delta = 0;

  for (const match of input.matchAll(/\u001B\[<(\d+);\d+;\d+M/g)) {
    const buttonCode = Number.parseInt(match[1] ?? "", 10);

    if (buttonCode === 64) {
      delta -= MOUSE_WHEEL_STEP;
    } else if (buttonCode === 65) {
      delta += MOUSE_WHEEL_STEP;
    }
  }

  for (let index = 0; index <= input.length - 6; index += 1) {
    if (input.slice(index, index + 3) !== "\u001B[M") {
      continue;
    }

    const buttonCode = input.charCodeAt(index + 3) - 32;

    if (buttonCode === 64) {
      delta -= MOUSE_WHEEL_STEP;
    } else if (buttonCode === 65) {
      delta += MOUSE_WHEEL_STEP;
    }
  }

  return delta;
}

type ScopePickerProps = {
  readonly scopeStates: Record<DiffScopeId, ScopeSummaryState>;
  readonly selectedScopeIndex: number;
};

function ScopePicker({
  scopeStates,
  selectedScopeIndex,
}: ScopePickerProps) {
  return (
    <Box flexDirection="column" gap={1}>
      {DIFF_SCOPE_ITEMS.map((scope, index) => {
        const isSelected = selectedScopeIndex === index;
        const state = scopeStates[scope.id];
        const isDisabled = isScopeDisabled(state);

        return (
          <Box key={scope.id} flexDirection="column">
            <Text
              color={isSelected ? "cyan" : undefined}
              bold={isSelected}
              dimColor={isDisabled}
            >
              {isSelected ? "> " : "  "}
              {index + 1}. {scope.label}
            </Text>
            <Text dimColor wrap="truncate">
              {"     "}
              {scope.description}
            </Text>
            <Text color={state.status === "error" ? "yellow" : undefined} dimColor={state.status !== "error"} wrap="truncate">
              {"     "}
              {formatScopeState(state)}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

type StackedDiffViewProps = {
  readonly diffScrollOffset: number;
  readonly diffState: StackedDiffState;
  readonly selectedFileCount: number;
  readonly separatorWidth: number;
  readonly scopeLabel: string;
  readonly summary: GitDiffSummary | undefined;
  readonly visibleDiffLineCount: number;
};

function StackedDiffView({
  diffScrollOffset,
  diffState,
  selectedFileCount,
  separatorWidth,
  scopeLabel,
  summary,
  visibleDiffLineCount,
}: StackedDiffViewProps) {
  const fileCount = summary?.files.length ?? selectedFileCount;

  return (
    <Box flexDirection="column" flexGrow={1} width="100%">
      <Box flexDirection="column">
        <Text bold wrap="truncate">
          {scopeLabel}
        </Text>
        <Text dimColor wrap="truncate">
          {summary === undefined
            ? "No summary loaded."
            : `${formatStats(summary.stats)} | ${fileCount} files in review target`}
        </Text>
      </Box>

      <StackedDiff
        diffScrollOffset={diffScrollOffset}
        diffState={diffState}
        separatorWidth={separatorWidth}
        visibleDiffLineCount={visibleDiffLineCount}
      />
    </Box>
  );
}

type StackedDiffProps = {
  readonly diffScrollOffset: number;
  readonly diffState: StackedDiffState;
  readonly separatorWidth: number;
  readonly visibleDiffLineCount: number;
};

function StackedDiff({
  diffScrollOffset,
  diffState,
  separatorWidth,
  visibleDiffLineCount,
}: StackedDiffProps) {
  if (diffState.status === "idle") {
    return null;
  }

  if (diffState.status === "loading") {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text bold wrap="truncate">
          Diff
        </Text>
        <Text dimColor wrap="truncate">
          Loading stacked patch ...
        </Text>
      </Box>
    );
  }

  if (diffState.status === "error") {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text bold wrap="truncate">
          Diff
        </Text>
        <Text color="yellow" wrap="truncate">
          {diffState.error}
        </Text>
      </Box>
    );
  }

  const visibleLines = diffState.lines.slice(
    diffScrollOffset,
    diffScrollOffset + visibleDiffLineCount,
  );

  return (
    <Box flexDirection="column" flexGrow={1} marginTop={1} width="100%">
      <Text bold wrap="truncate">
        Diff
      </Text>
      {diffState.lines.length > visibleDiffLineCount && (
        <Text dimColor wrap="truncate">
          Lines {diffScrollOffset + 1}-
          {Math.min(
            diffScrollOffset + visibleDiffLineCount,
            diffState.lines.length,
          )}{" "}
          of {diffState.lines.length}
        </Text>
      )}
      {visibleLines.length === 0 ? (
        <Text dimColor wrap="truncate">
          No patch content.
        </Text>
      ) : (
        visibleLines.map((line, index) => (
          <PatchLine
            key={`${diffScrollOffset + index}-${line.text}`}
            line={line}
            separatorWidth={separatorWidth}
          />
        ))
      )}
    </Box>
  );
}

type PatchLineProps = {
  readonly line: DiffDisplayLine;
  readonly separatorWidth: number;
};

function PatchLine({ line, separatorWidth }: PatchLineProps) {
  if (line.text.startsWith("diff --git")) {
    return (
      <Text color="cyan" bold wrap="truncate">
        {formatFileSeparator(line.text, separatorWidth)}
      </Text>
    );
  }

  const color = getPatchLineColor(line.text);
  const gutter = formatLineNumberGutter(line);
  const codeLine = parseCodeLine(line.text);
  const backgroundColor = getPatchLineBackgroundColor(line.text);

  if (codeLine !== undefined && line.language !== undefined) {
    const contentWidth = gutter.length + 1 + codeLine.code.length;

    return (
      <Text backgroundColor={backgroundColor} wrap="truncate">
        <Text dimColor>{gutter}</Text>
        <Text color={getDiffPrefixColor(codeLine.prefix)}>
          {codeLine.prefix}
        </Text>
        {highlightCode(codeLine.code, line.language).map((segment, index) => (
          <Text key={`${index}-${segment.text}`} color={segment.color}>
            {segment.text}
          </Text>
        ))}
        {backgroundColor !== undefined && (
          <Text>{getLinePadding(contentWidth, separatorWidth)}</Text>
        )}
      </Text>
    );
  }

  const plainText = line.text.length === 0 ? " " : line.text;

  return (
    <Text backgroundColor={backgroundColor} wrap="truncate">
      <Text dimColor>{gutter}</Text>
      <Text color={color} dimColor={color === undefined}>
        {plainText}
      </Text>
      {backgroundColor !== undefined && (
        <Text>{getLinePadding(gutter.length + plainText.length, separatorWidth)}</Text>
      )}
    </Text>
  );
}

function getLinePadding(contentWidth: number, targetWidth: number): string {
  return " ".repeat(Math.max(0, targetWidth - contentWidth));
}

function formatLineNumberGutter(line: DiffDisplayLine): string {
  return `${formatLineNumber(line.oldLineNumber)} ${formatLineNumber(line.newLineNumber)} | `;
}

function formatLineNumber(lineNumber: number | undefined): string {
  return lineNumber === undefined ? "     " : lineNumber.toString().padStart(5, " ");
}

function parseCodeLine(
  line: string,
): { readonly code: string; readonly prefix: "+" | "-" | " " } | undefined {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return {
      code: line.slice(1),
      prefix: "+",
    };
  }

  if (line.startsWith("-") && !line.startsWith("---")) {
    return {
      code: line.slice(1),
      prefix: "-",
    };
  }

  if (line.startsWith(" ")) {
    return {
      code: line.slice(1),
      prefix: " ",
    };
  }

  return undefined;
}

function getDiffPrefixColor(
  prefix: "+" | "-" | " ",
): "green" | "red" | undefined {
  if (prefix === "+") {
    return "green";
  }

  if (prefix === "-") {
    return "red";
  }

  return undefined;
}

function formatFileSeparator(line: string, width: number): string {
  const filePath = extractDiffGitPath(line) ?? line;
  const label = ` ${filePath} `;

  if (label.length >= width - 2) {
    return `${label.slice(0, Math.max(0, width - 5))} ---`;
  }

  const rightWidth = Math.max(3, width - label.length - 3);

  return `${"-".repeat(3)}${label}${"-".repeat(rightWidth)}`;
}

function extractDiffGitPath(line: string): string | undefined {
  const match = line.match(/^diff --git (.+) (.+)$/);
  const rawPath = match?.[2] ?? match?.[1];

  if (rawPath === undefined) {
    return undefined;
  }

  return normalizeDiffPath(rawPath);
}

function normalizeDiffPath(path: string): string {
  const unquoted = unquoteDiffPath(path.trim());

  if (unquoted.startsWith("a/") || unquoted.startsWith("b/")) {
    return unquoted.slice(2);
  }

  return unquoted;
}

function unquoteDiffPath(path: string): string {
  if (!path.startsWith('"') || !path.endsWith('"')) {
    return path;
  }

  try {
    return JSON.parse(path) as string;
  } catch {
    return path.slice(1, -1);
  }
}

function toLoadingScopeStates(): Record<DiffScopeId, ScopeSummaryState> {
  return Object.fromEntries(
    DIFF_SCOPE_ITEMS.map((scope) => [scope.id, { status: "loading" }]),
  ) as Record<DiffScopeId, ScopeSummaryState>;
}

function isScopeDisabled(state: ScopeSummaryState): boolean {
  return state.status !== "ready" || state.summary.files.length === 0;
}

function formatScopeState(state: ScopeSummaryState): string {
  if (state.status === "loading") {
    return "Loading diff stats ...";
  }

  if (state.status === "error") {
    return state.error;
  }

  return formatStats(state.summary.stats);
}

function formatStats(stats: GitDiffSummary["stats"]): string {
  const commitText =
    stats.commitCount === undefined ? "" : `, ${stats.commitCount} commits`;
  const binaryText =
    stats.binaryFiles === 0 ? "" : `, ${stats.binaryFiles} binary`;

  return `${stats.changedFiles} files, +${stats.addedLines} / -${stats.removedLines}${binaryText}${commitText}`;
}

function toPatchLines(patch: string): readonly DiffDisplayLine[] {
  const trimmedPatch = patch.trimEnd();

  if (trimmedPatch.length === 0) {
    return [];
  }

  return annotatePatchLines(trimmedPatch.split(/\r?\n/));
}

function annotatePatchLines(lines: readonly string[]): readonly DiffDisplayLine[] {
  const annotatedLines: DiffDisplayLine[] = [];
  let language: SyntaxLanguage | undefined;
  let oldLineNumber: number | undefined;
  let newLineNumber: number | undefined;

  for (const line of lines) {
    if (line.startsWith("diff --git")) {
      const filePath = extractDiffGitPath(line);

      language = filePath === undefined ? undefined : getSyntaxLanguage(filePath);
      oldLineNumber = undefined;
      newLineNumber = undefined;
      annotatedLines.push({ text: line });
      continue;
    }

    const hunkStart = parseHunkStart(line);

    if (hunkStart !== undefined) {
      oldLineNumber = hunkStart.oldLineNumber;
      newLineNumber = hunkStart.newLineNumber;
      annotatedLines.push({ language, text: line });
      continue;
    }

    if (oldLineNumber === undefined || newLineNumber === undefined) {
      annotatedLines.push({ language, text: line });
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      annotatedLines.push({
        language,
        newLineNumber,
        text: line,
      });
      newLineNumber += 1;
      continue;
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      annotatedLines.push({
        language,
        oldLineNumber,
        text: line,
      });
      oldLineNumber += 1;
      continue;
    }

    if (line.startsWith("\\")) {
      annotatedLines.push({ language, text: line });
      continue;
    }

    annotatedLines.push({
      language,
      newLineNumber,
      oldLineNumber,
      text: line,
    });
    oldLineNumber += 1;
    newLineNumber += 1;
  }

  return annotatedLines;
}

function parseHunkStart(
  line: string,
): { readonly newLineNumber: number; readonly oldLineNumber: number } | undefined {
  const match = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  const oldLineNumber = match?.[1];
  const newLineNumber = match?.[2];

  if (oldLineNumber === undefined || newLineNumber === undefined) {
    return undefined;
  }

  return {
    newLineNumber: Number.parseInt(newLineNumber, 10),
    oldLineNumber: Number.parseInt(oldLineNumber, 10),
  };
}

function getSyntaxLanguage(filePath: string): SyntaxLanguage | undefined {
  const lowerPath = filePath.toLowerCase();

  if (/\.(?:js|jsx|mjs|cjs|ts|tsx)$/.test(lowerPath)) {
    return "javascript";
  }

  if (/\.jsonc?$/.test(lowerPath)) {
    return "json";
  }

  if (/\.(?:css|scss|sass|less)$/.test(lowerPath)) {
    return "css";
  }

  if (/\.(?:html|htm|xml|svg)$/.test(lowerPath)) {
    return "html";
  }

  if (/\.(?:md|mdx)$/.test(lowerPath)) {
    return "markdown";
  }

  if (/\.py$/.test(lowerPath)) {
    return "python";
  }

  if (/\.rb$/.test(lowerPath)) {
    return "ruby";
  }

  if (/\.(?:sh|bash|zsh)$/.test(lowerPath)) {
    return "shell";
  }

  if (/\.ya?ml$/.test(lowerPath)) {
    return "yaml";
  }

  if (/\.toml$/.test(lowerPath)) {
    return "toml";
  }

  return undefined;
}

function highlightCode(
  code: string,
  language: SyntaxLanguage,
): readonly HighlightSegment[] {
  const ranges: HighlightRange[] = [];

  addRanges(ranges, code, getStringPattern(language), "green");
  addRanges(ranges, code, getCommentPattern(language), "blue");
  addRanges(ranges, code, /\b(?:0x[\da-f]+|\d+(?:\.\d+)?)\b/gi, "yellow");
  addRanges(ranges, code, getKeywordPattern(language), "magenta");
  addRanges(
    ranges,
    code,
    /\b[A-Za-z_$][\w$]*(?=\s*\()/g,
    "cyan",
    (value) => !isKeyword(value, language),
  );

  return toHighlightSegments(code, ranges);
}

type HighlightRange = {
  readonly color: HighlightSegment["color"];
  readonly end: number;
  readonly start: number;
};

function addRanges(
  ranges: HighlightRange[],
  code: string,
  pattern: RegExp,
  color: HighlightSegment["color"],
  isAllowed: (value: string) => boolean = () => true,
): void {
  pattern.lastIndex = 0;

  for (const match of code.matchAll(pattern)) {
    const value = match[0];
    const start = match.index;

    if (
      start === undefined ||
      value.length === 0 ||
      !isAllowed(value) ||
      ranges.some((range) => start < range.end && start + value.length > range.start)
    ) {
      continue;
    }

    ranges.push({
      color,
      end: start + value.length,
      start,
    });
  }
}

function toHighlightSegments(
  code: string,
  ranges: readonly HighlightRange[],
): readonly HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  let offset = 0;

  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    if (range.start > offset) {
      segments.push({
        text: code.slice(offset, range.start),
      });
    }

    segments.push({
      color: range.color,
      text: code.slice(range.start, range.end),
    });
    offset = range.end;
  }

  if (offset < code.length) {
    segments.push({
      text: code.slice(offset),
    });
  }

  return segments.length === 0 ? [{ text: code }] : segments;
}

function getStringPattern(language: SyntaxLanguage): RegExp {
  if (language === "yaml" || language === "toml") {
    return /(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g;
  }

  return /(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/g;
}

function getCommentPattern(language: SyntaxLanguage): RegExp {
  if (language === "html" || language === "markdown") {
    return /<!--.*?-->/g;
  }

  if (language === "python" || language === "ruby" || language === "shell" || language === "yaml" || language === "toml") {
    return /#.*/g;
  }

  if (language === "css") {
    return /\/\*.*?\*\//g;
  }

  return /\/\/.*|\/\*.*?\*\//g;
}

function getKeywordPattern(language: SyntaxLanguage): RegExp {
  return new RegExp(`\\b(?:${getKeywords(language).join("|")})\\b`, "g");
}

function getKeywords(language: SyntaxLanguage): readonly string[] {
  if (language === "python") {
    return [
      "False",
      "None",
      "True",
      "and",
      "as",
      "async",
      "await",
      "class",
      "def",
      "elif",
      "else",
      "except",
      "finally",
      "for",
      "from",
      "if",
      "import",
      "in",
      "is",
      "lambda",
      "not",
      "or",
      "pass",
      "raise",
      "return",
      "try",
      "while",
      "with",
      "yield",
    ];
  }

  if (language === "ruby") {
    return [
      "BEGIN",
      "END",
      "alias",
      "and",
      "begin",
      "break",
      "case",
      "class",
      "def",
      "defined",
      "do",
      "else",
      "elsif",
      "end",
      "ensure",
      "false",
      "for",
      "if",
      "module",
      "next",
      "nil",
      "not",
      "or",
      "redo",
      "rescue",
      "return",
      "self",
      "super",
      "then",
      "true",
      "unless",
      "until",
      "when",
      "while",
      "yield",
    ];
  }

  if (language === "shell") {
    return [
      "case",
      "do",
      "done",
      "elif",
      "else",
      "esac",
      "fi",
      "for",
      "function",
      "if",
      "in",
      "then",
      "until",
      "while",
    ];
  }

  if (language === "json" || language === "yaml" || language === "toml") {
    return ["false", "null", "true"];
  }

  if (language === "css") {
    return ["important", "inherit", "initial", "unset"];
  }

  if (language === "html" || language === "markdown") {
    return ["DOCTYPE", "script", "style"];
  }

  return [
    "as",
    "async",
    "await",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "debugger",
    "default",
    "delete",
    "do",
    "else",
    "enum",
    "export",
    "extends",
    "false",
    "finally",
    "for",
    "from",
    "function",
    "if",
    "implements",
    "import",
    "in",
    "instanceof",
    "interface",
    "let",
    "new",
    "null",
    "private",
    "protected",
    "public",
    "return",
    "static",
    "super",
    "switch",
    "this",
    "throw",
    "true",
    "try",
    "type",
    "typeof",
    "undefined",
    "var",
    "void",
    "while",
    "with",
    "yield",
  ];
}

function isKeyword(value: string, language: SyntaxLanguage): boolean {
  return getKeywords(language).includes(value);
}

function getMaxDiffScrollOffset(
  diffState: StackedDiffState,
  visibleDiffLineCount: number,
): number {
  if (diffState.status !== "ready") {
    return 0;
  }

  return Math.max(0, diffState.lines.length - visibleDiffLineCount);
}

function getPatchLineColor(
  line: string,
): "green" | "red" | "cyan" | "yellow" | undefined {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return "green";
  }

  if (line.startsWith("-") && !line.startsWith("---")) {
    return "red";
  }

  if (line.startsWith("@@")) {
    return "cyan";
  }

  return undefined;
}

function getPatchLineBackgroundColor(line: string): string | undefined {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return "#062615";
  }

  if (line.startsWith("-") && !line.startsWith("---")) {
    return "#2a0b0f";
  }

  return undefined;
}
