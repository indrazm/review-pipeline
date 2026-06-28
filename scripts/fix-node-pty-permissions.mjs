import { chmod, access } from "node:fs/promises";
import { constants } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

async function chmodIfPresent(filePath) {
  try {
    await access(filePath, constants.F_OK);
    await chmod(filePath, 0o755);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

try {
  const packageJsonPath = require.resolve("node-pty/package.json");
  const packageDir = dirname(packageJsonPath);

  await Promise.all([
    chmodIfPresent(join(packageDir, "build", "Release", "spawn-helper")),
    chmodIfPresent(join(packageDir, "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper")),
  ]);
} catch (error) {
  if (error?.code !== "MODULE_NOT_FOUND") {
    throw error;
  }
}
