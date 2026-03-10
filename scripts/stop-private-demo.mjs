import { existsSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const root = path.resolve(scriptDir, "..");
const sessionPath = path.join(root, ".demo-runtime", "session.json");

if (!existsSync(sessionPath)) {
  console.log("No active AUTONOW demo session found.");
  process.exit(0);
}

const session = JSON.parse(readFileSync(sessionPath, "utf8"));

for (const [label, pid] of Object.entries(session.pids ?? {})) {
  if (typeof pid !== "number") {
    continue;
  }

  try {
    process.kill(pid);
    console.log(`Stopped ${label} (PID ${pid}).`);
  } catch {
    console.log(`Process for ${label} was already stopped (PID ${pid}).`);
  }
}

rmSync(sessionPath, { force: true });
console.log("AUTONOW private demo session cleaned up.");
