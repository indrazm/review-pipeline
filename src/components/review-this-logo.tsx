import { Box, Text } from "ink";

const LOGO_LINES = [
  "                 _                 _   _     _     ",
  " _ __ _____   _(_) _____      __  | |_| |__ (_)___ ",
  "| '__/ _ \\ \\ / / |/ _ \\ \\ /\\ / /  | __| '_ \\| / __|",
  "| | |  __/\\ V /| |  __/\\ V  V /   | |_| | | | \\__ \\",
  "|_|  \\___| \\_/ |_|\\___| \\_/\\_/     \\__|_| |_|_|___/",
  "                      review-this",
];

export function ReviewThisLogo() {
  return (
    <Box flexDirection="column">
      {LOGO_LINES.map((line) => (
        <Text key={line} color="cyan" bold wrap="truncate">
          {line}
        </Text>
      ))}
    </Box>
  );
}
