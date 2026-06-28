import { createTool } from "@anvia/core";
import { z } from "zod";
import type { PtySessionManager } from "./ptySessionManager.js";

const waitMsSchema = z
  .number()
  .int()
  .min(0)
  .max(5_000)
  .optional()
  .describe("How long to wait before returning buffered terminal output, in milliseconds.");

export function createAgentTools(ptySessions: PtySessionManager) {
  return [
    createTool({
      name: "execCommand",
      description:
        "Run a shell command in a pseudo-terminal from the current project root. Returns a sessionId, output, and process status.",
      input: z.object({
        command: z.string().min(1).describe("The shell command to execute."),
        waitMs: waitMsSchema,
      }),
      execute: (input) => ptySessions.execCommand(input),
    }),
    createTool({
      name: "writeStdin",
      description:
        "Write input to an existing pseudo-terminal session and return any new output.",
      input: z.object({
        input: z.string().describe("The text to write to the terminal session."),
        sessionId: z.string().min(1).describe("The sessionId returned by execCommand."),
        waitMs: waitMsSchema,
      }),
      execute: (input) => ptySessions.writeStdin(input),
    }),
  ];
}
