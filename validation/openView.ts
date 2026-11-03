import { spawn, spawnSync } from "node:child_process";

/**
 * Runs the validation suite, then opens the app on the validation view, which shows the report it
 * wrote. The view opens even when a target fails, as that is what it is for.
 */
const suite = spawnSync("npm run validate", { stdio: "inherit", shell: true });
if (suite.error) throw suite.error;
if (suite.status !== 0) {
  console.log("The validation suite failed. The view shows why.");
}
spawn("npx vite --open /?view=validation", { stdio: "inherit", shell: true });
