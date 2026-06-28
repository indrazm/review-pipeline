export function extractChangedFilePaths(patch: string): readonly string[] {
  const paths = new Set<string>();

  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      for (const path of parseDiffGitPaths(line)) {
        addNormalizedPath(paths, path);
      }
      continue;
    }

    if (line.startsWith("--- ") || line.startsWith("+++ ")) {
      addNormalizedPath(paths, line.slice(4));
    }
  }

  return [...paths].sort((a, b) => a.localeCompare(b));
}

function parseDiffGitPaths(line: string): readonly string[] {
  const input = line.slice("diff --git ".length).trim();
  const paths: string[] = [];
  let index = 0;

  while (index < input.length && paths.length < 2) {
    while (input[index] === " ") {
      index += 1;
    }

    if (index >= input.length) {
      break;
    }

    const parsed =
      input[index] === '"'
        ? parseQuotedToken(input, index)
        : parseBareToken(input, index);

    paths.push(parsed.value);
    index = parsed.nextIndex;
  }

  return paths;
}

function parseBareToken(
  input: string,
  startIndex: number,
): { readonly value: string; readonly nextIndex: number } {
  let nextIndex = startIndex;

  while (nextIndex < input.length && input[nextIndex] !== " ") {
    nextIndex += 1;
  }

  return {
    nextIndex,
    value: input.slice(startIndex, nextIndex),
  };
}

function parseQuotedToken(
  input: string,
  startIndex: number,
): { readonly value: string; readonly nextIndex: number } {
  let nextIndex = startIndex + 1;
  let escaped = false;

  while (nextIndex < input.length) {
    const character = input[nextIndex];

    if (!escaped && character === '"') {
      nextIndex += 1;
      break;
    }

    escaped = !escaped && character === "\\";
    if (character !== "\\") {
      escaped = false;
    }
    nextIndex += 1;
  }

  const token = input.slice(startIndex, nextIndex);

  try {
    return {
      nextIndex,
      value: JSON.parse(token) as string,
    };
  } catch {
    return {
      nextIndex,
      value: token.slice(1, -1),
    };
  }
}

function addNormalizedPath(paths: Set<string>, rawPath: string): void {
  const normalizedPath = normalizeGitPath(rawPath);

  if (normalizedPath !== undefined) {
    paths.add(normalizedPath);
  }
}

function normalizeGitPath(rawPath: string): string | undefined {
  const withoutMetadata = rawPath.trim().split("\t")[0]?.trim() ?? "";
  const unquoted = unquotePath(withoutMetadata);

  if (unquoted === "" || unquoted === "/dev/null" || unquoted === "dev/null") {
    return undefined;
  }

  if (unquoted.startsWith("a/") || unquoted.startsWith("b/")) {
    return unquoted.slice(2);
  }

  return unquoted;
}

function unquotePath(path: string): string {
  if (!path.startsWith('"') || !path.endsWith('"')) {
    return path;
  }

  try {
    return JSON.parse(path) as string;
  } catch {
    return path.slice(1, -1);
  }
}
