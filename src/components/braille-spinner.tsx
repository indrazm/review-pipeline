import { useEffect, useState } from "react";
import { Box, Text } from "ink";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

type BrailleSpinnerProps = {
  readonly label: string;
};

export function BrailleSpinner({ label }: BrailleSpinnerProps) {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrameIndex((current) => (current + 1) % FRAMES.length);
    }, 80);

    return () => {
      clearInterval(interval);
    };
  }, []);

  return (
    <Box>
      <Text color="cyan">{FRAMES[frameIndex]}</Text>
      <Text dimColor> {label}</Text>
    </Box>
  );
}

