import { createTool } from "@anvia/core";
import { toSteeringMessage } from "./pr-monitor/output.js";
import { pollPullRequest } from "./pr-monitor/polling.js";
import {
  pollingInputSchema,
  pollingOutputSchema,
} from "./pr-monitor/schemas.js";

type CreatePrMonitorToolsOptions = {
  readonly cwd: string;
  readonly steer: (input: string) => boolean;
};

export function createPrMonitorTools(options: CreatePrMonitorToolsOptions) {
  return [
    createTool({
      name: "polling",
      description:
        "Poll a GitHub pull request until it is ready to merge, failing, or the timeout expires.",
      input: pollingInputSchema,
      output: pollingOutputSchema,
      async execute(input) {
        const result = await pollPullRequest(options.cwd, input);

        options.steer(toSteeringMessage(result));

        return result;
      },
    }),
  ];
}
