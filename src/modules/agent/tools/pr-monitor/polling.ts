import { classifySnapshot } from "./classify.js";
import { readPullRequestSnapshot } from "./github.js";
import {
  emptyPollingOutput,
  toPollingOutput,
} from "./output.js";
import type {
  PollingInput,
  PollingOutput,
} from "./schemas.js";

const DEFAULT_TIMEOUT_SECONDS = 15 * 60;
const DEFAULT_INTERVAL_SECONDS = 30;
const REQUIRED_READY_SNAPSHOTS = 2;

export async function pollPullRequest(
  cwd: string,
  input: PollingInput,
): Promise<PollingOutput> {
  const timeoutSeconds = input.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  const intervalSeconds = input.intervalSeconds ?? DEFAULT_INTERVAL_SECONDS;
  const startedAt = Date.now();
  const deadline = startedAt + timeoutSeconds * 1000;
  let attempts = 0;
  let cleanReadySnapshots = 0;

  while (true) {
    attempts += 1;

    try {
      const snapshot = await readPullRequestSnapshot(cwd, input.prUrl);
      const classification = classifySnapshot(snapshot);
      const elapsedSeconds = secondsSince(startedAt);

      if (classification.status === "ready") {
        cleanReadySnapshots += 1;

        if (cleanReadySnapshots >= REQUIRED_READY_SNAPSHOTS) {
          return toPollingOutput({
            attempts,
            classification,
            elapsedSeconds,
            prUrl: input.prUrl,
            snapshot,
            timedOut: false,
          });
        }

        const remainingMs = deadline - Date.now();

        if (remainingMs <= 0) {
          return toPollingOutput({
            attempts,
            classification: {
              reason: `Timed out after ${timeoutSeconds} seconds before observing ${REQUIRED_READY_SNAPSHOTS} consecutive clean PR snapshots. Last observed state: ${classification.reason}`,
              repairable: false,
              repairTriggers: [],
              status: "timeout",
            },
            elapsedSeconds,
            prUrl: input.prUrl,
            snapshot,
            timedOut: true,
          });
        }

        await wait(Math.min(intervalSeconds * 1000, remainingMs));
        continue;
      }

      cleanReadySnapshots = 0;

      if (classification.status !== "pending") {
        return toPollingOutput({
          attempts,
          classification,
          elapsedSeconds,
          prUrl: input.prUrl,
          snapshot,
          timedOut: false,
        });
      }

      const remainingMs = deadline - Date.now();

      if (remainingMs <= 0) {
        return toPollingOutput({
          attempts,
          classification: {
            reason: `Timed out after ${timeoutSeconds} seconds. Last observed state: ${classification.reason}`,
            repairable: false,
            repairTriggers: [],
            status: "timeout",
          },
          elapsedSeconds,
          prUrl: input.prUrl,
          snapshot,
          timedOut: true,
        });
      }

      await wait(Math.min(intervalSeconds * 1000, remainingMs));
    } catch (error) {
      return emptyPollingOutput({
        attempts,
        elapsedSeconds: secondsSince(startedAt),
        prUrl: input.prUrl,
        reason: error instanceof Error ? error.message : String(error),
        status: "error",
        timedOut: false,
      });
    }
  }
}

function secondsSince(startedAt: number): number {
  return (Date.now() - startedAt) / 1000;
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
