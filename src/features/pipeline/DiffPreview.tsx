import { Box, Text } from "ink";

type DiffPreviewProps = {
  readonly maxLines?: number;
  readonly patch: string;
};

export function DiffPreview({ maxLines = 12, patch }: DiffPreviewProps) {
  const lines = patch.trim() === "" ? ["No diff."] : patch.split(/\r?\n/);
  const visibleLines = lines.slice(0, maxLines);
  const hiddenLineCount = Math.max(0, lines.length - visibleLines.length);

  return (
    <Box
      flexDirection="column"
      width="100%"
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      overflow="hidden"
    >
      <Text bold>Diff</Text>
      {visibleLines.map((line, index) => (
        <DiffLine key={`${index}-${line}`} line={line} />
      ))}
      {hiddenLineCount > 0 && (
        <Text dimColor wrap="truncate">
          ... {hiddenLineCount} more lines
        </Text>
      )}
    </Box>
  );
}

type DiffLineProps = {
  readonly line: string;
};

function DiffLine({ line }: DiffLineProps) {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return (
      <Text color="green" wrap="truncate">
        {line}
      </Text>
    );
  }

  if (line.startsWith("-") && !line.startsWith("---")) {
    return (
      <Text color="red" wrap="truncate">
        {line}
      </Text>
    );
  }

  if (line.startsWith("@@")) {
    return (
      <Text color="cyan" wrap="truncate">
        {line}
      </Text>
    );
  }

  return (
    <Text dimColor wrap="truncate">
      {line}
    </Text>
  );
}
