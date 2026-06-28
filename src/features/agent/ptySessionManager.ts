import { randomUUID } from "node:crypto";
import process from "node:process";
import pty, { type IPty } from "node-pty";

const DEFAULT_WAIT_MS = 750;
const MAX_WAIT_MS = 5_000;
const MAX_OUTPUT_CHARS = 20_000;

export type PtyCommandResult = {
  readonly exitCode: number | null;
  readonly output: string;
  readonly running: boolean;
  readonly sessionId: string;
  readonly signal: number | null;
};

type PtyExit = {
  readonly exitCode: number;
  readonly signal: number | null;
};

type PtySession = {
  readonly process: IPty;
  exit: PtyExit | null;
  output: string;
  readOffset: number;
};

type ExecCommandInput = {
  readonly command: string;
  readonly waitMs?: number | undefined;
};

type WriteStdinInput = {
  readonly input: string;
  readonly sessionId: string;
  readonly waitMs?: number | undefined;
};

export class PtySessionManager {
  private readonly sessions = new Map<string, PtySession>();

  constructor(private readonly defaultCwd: string) {}

  async execCommand(input: ExecCommandInput): Promise<PtyCommandResult> {
    const sessionId = randomUUID();
    const invocation = getShellInvocation(input.command);
    const child = pty.spawn(invocation.file, invocation.args, {
      cols: 120,
      cwd: this.defaultCwd,
      env: getPtyEnv(),
      name: "xterm-color",
      rows: 30,
    });

    const session: PtySession = {
      exit: null,
      output: "",
      process: child,
      readOffset: 0,
    };

    this.sessions.set(sessionId, session);

    child.onData((chunk) => {
      appendOutput(session, chunk);
    });

    child.onExit(({ exitCode, signal }) => {
      session.exit = {
        exitCode,
        signal: signal ?? null,
      };
    });

    return this.waitForResult(sessionId, input.waitMs);
  }

  async writeStdin(input: WriteStdinInput): Promise<PtyCommandResult> {
    const session = this.getSession(input.sessionId);

    if (session.exit === null) {
      session.process.write(input.input);
    }

    return this.waitForResult(input.sessionId, input.waitMs);
  }

  dispose(): void {
    for (const session of this.sessions.values()) {
      if (session.exit === null) {
        session.process.kill();
      }
    }

    this.sessions.clear();
  }

  private async waitForResult(
    sessionId: string,
    waitMs: number | undefined,
  ): Promise<PtyCommandResult> {
    await wait(normalizeWaitMs(waitMs));

    const session = this.getSession(sessionId);
    const output = session.output.slice(session.readOffset);

    session.readOffset = session.output.length;

    return {
      exitCode: session.exit?.exitCode ?? null,
      output,
      running: session.exit === null,
      sessionId,
      signal: session.exit?.signal ?? null,
    };
  }

  private getSession(sessionId: string): PtySession {
    const session = this.sessions.get(sessionId);

    if (session === undefined) {
      throw new Error(`Unknown pty session: ${sessionId}`);
    }

    return session;
  }
}

function appendOutput(session: PtySession, chunk: string): void {
  session.output += chunk;

  if (session.output.length <= MAX_OUTPUT_CHARS) {
    return;
  }

  const trimmedChars = session.output.length - MAX_OUTPUT_CHARS;

  session.output = session.output.slice(trimmedChars);
  session.readOffset = Math.max(0, session.readOffset - trimmedChars);
}

function getPtyEnv(): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      env[key] = value;
    }
  }

  env.TERM = env.TERM ?? "xterm-color";

  return env;
}

function getShellInvocation(command: string): { args: string[]; file: string } {
  if (process.platform === "win32") {
    return {
      args: ["/d", "/s", "/c", command],
      file: process.env.COMSPEC ?? "cmd.exe",
    };
  }

  return {
    args: ["-c", command],
    file: process.env.RP_SHELL ?? "/bin/sh",
  };
}

function normalizeWaitMs(waitMs: number | undefined): number {
  if (waitMs === undefined) {
    return DEFAULT_WAIT_MS;
  }

  return Math.min(Math.max(Math.trunc(waitMs), 0), MAX_WAIT_MS);
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
