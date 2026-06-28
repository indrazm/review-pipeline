#!/usr/bin/env node
import { render } from "ink";
import { App } from "./app/App.js";
import { flushLogs } from "./lib/logger.js";
import { assertInteractiveTerminal } from "./lib/terminal.js";

assertInteractiveTerminal();

const instance = render(<App />, {
  alternateScreen: true,
  exitOnCtrlC: true,
  interactive: true,
});

await instance.waitUntilExit();
flushLogs();
