import { Box, Text } from "ink";
import Markdown from "ink-markdown-es";

type ReviewOutputProps = {
  readonly output: string;
};

const markdownStyles = {
  h1: {
    bold: true,
    color: "cyan",
    marginTop: 1,
    wrap: "hard",
  },
  h2: {
    bold: true,
    color: "cyan",
    marginTop: 1,
    wrap: "hard",
  },
  h3: {
    bold: true,
    color: "yellow",
    wrap: "hard",
  },
  paragraph: {
    wrap: "hard",
  },
  list: {
    width: "100%",
  },
  listItem: {
    bullet: "-",
    paddingLeft: 2,
    wrap: "hard",
  },
  code: {
    paddingX: 1,
    wrap: "hard",
  },
  codespan: {
    dimColor: true,
    wrap: "hard",
  },
  strong: {
    bold: true,
  },
} as const;

export function ReviewOutput({ output }: ReviewOutputProps) {
  const normalizedOutput = output.trim();

  return (
    <Box flexDirection="column" flexShrink={1} width="100%">
      <Text bold>Review</Text>
      {normalizedOutput.length === 0 ? (
        <Text dimColor>No review output.</Text>
      ) : (
        <Markdown styles={markdownStyles}>{normalizedOutput}</Markdown>
      )}
    </Box>
  );
}
