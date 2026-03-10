import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const root = path.resolve(scriptDir, "..");
const runtimeDir = path.join(root, ".demo-runtime");
const logsDir = path.join(runtimeDir, "logs");
const binDir = path.join(runtimeDir, "bin");
const sessionPath = path.join(runtimeDir, "session.json");
const cloudflaredPath = path.join(binDir, "cloudflared.exe");
const cmdPath = process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe";
const powerShellPath = path.join(
  process.env.SystemRoot ?? "C:\\Windows",
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
);
const bootstrap = process.argv.includes("--bootstrap");

mkdirSync(logsDir, { recursive: true });
mkdirSync(binDir, { recursive: true });

stopExistingSession();

runSetup("scripts\\run-backend-prod.cmd", bootstrap ? ["-Bootstrap", "-SetupOnly"] : ["-SetupOnly"]);
runSetup("scripts\\run-frontend-prod.cmd", bootstrap ? ["-Bootstrap", "-SetupOnly"] : ["-SetupOnly"]);

await ensureCloudflared();

const username = process.env.DEMO_USERNAME ?? "demo";
const password = process.env.DEMO_PASSWORD ?? randomBytes(9).toString("base64url");
const backendLog = path.join(logsDir, "backend.log");
const frontendLog = path.join(logsDir, "frontend.log");
const gatewayLog = path.join(logsDir, "gateway.log");
const tunnelLog = path.join(logsDir, "tunnel.log");

clearLog(backendLog);
clearLog(frontendLog);
clearLog(gatewayLog);
clearLog(tunnelLog);

const backendPid = startDetached("scripts\\run-backend-prod.cmd", [], backendLog);
await waitForHttp("http://127.0.0.1:8000/health", { timeoutMs: 90_000 });

const frontendPid = startDetached("scripts\\run-frontend-prod.cmd", [], frontendLog);
await waitForHttp("http://127.0.0.1:3000", { timeoutMs: 180_000 });

const gatewayPid = startDetached(
  "scripts\\run-demo-gateway.cmd",
  ["-Username", username, "-Password", password],
  gatewayLog,
);
const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
await waitForHttp("http://127.0.0.1:8080/_demo/health", {
  timeoutMs: 60_000,
  headers: { Authorization: authHeader },
});

const session = {
  startedAt: new Date().toISOString(),
  publicUrl: null,
  username,
  password,
  pids: {
    backend: backendPid,
    frontend: frontendPid,
    gateway: gatewayPid,
  },
  logs: {
    backend: backendLog,
    frontend: frontendLog,
    gateway: gatewayLog,
    tunnel: tunnelLog,
  },
};

writeFileSync(sessionPath, `${JSON.stringify(session, null, 2)}\n`, "utf8");

const tunnelPid = startCloudflaredTunnel(tunnelLog);
const publicUrl = await waitForTunnelUrl(tunnelLog, 90_000);

session.publicUrl = publicUrl;
session.pids.tunnel = tunnelPid;

writeFileSync(sessionPath, `${JSON.stringify(session, null, 2)}\n`, "utf8");

console.log(`AUTONOW private demo URL: ${publicUrl}`);
console.log(`Username: ${username}`);
console.log(`Password: ${password}`);
console.log(`Session file: ${sessionPath}`);


function clearLog(logPath) {
  writeFileSync(logPath, "", "utf8");
}

function runSetup(relativeCommand, args) {
  const commandPath = path.join(root, relativeCommand);
  const result = runViaShell(commandPath, args, "sync");

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`Setup failed for ${relativeCommand}.\n${output}`);
  }
}

function startDetached(relativeCommand, args, logPath) {
  const commandPath = path.join(root, relativeCommand);
  const logFd = openSync(logPath, "a");
  const child = runViaShell(commandPath, args, "detached", logFd);

  child.unref();
  closeSync(logFd);
  return child.pid;
}

function startCloudflaredTunnel(logPath) {
  const logFd = openSync(logPath, "a");
  const child = spawn(
    cloudflaredPath,
    [
      "tunnel",
      "--url",
      "http://127.0.0.1:8080",
      "--no-autoupdate",
      "--loglevel",
      "info",
      "--logfile",
      logPath,
      "--output",
      "json",
    ],
    {
      cwd: root,
      env: process.env,
      detached: true,
      stdio: ["ignore", logFd, logFd],
      windowsHide: true,
    },
  );

  child.unref();
  closeSync(logFd);
  return child.pid;
}

function runViaShell(commandPath, args, mode, logFd) {
  const usePowerShell = commandPath.endsWith(".ps1");
  const executable = usePowerShell ? powerShellPath : cmdPath;
  const shellArgs = usePowerShell
    ? ["-ExecutionPolicy", "Bypass", "-File", commandPath, ...args]
    : ["/c", commandPath, ...args];

  if (mode === "sync") {
    return spawnSync(executable, shellArgs, {
      cwd: root,
      env: process.env,
      encoding: "utf8",
      stdio: "pipe",
      windowsHide: true,
    });
  }

  return spawn(executable, shellArgs, {
    cwd: root,
    env: process.env,
    detached: true,
    stdio: ["ignore", logFd, logFd],
    windowsHide: true,
  });
}

async function waitForHttp(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const headers = options.headers ?? {};
  const deadline = Date.now() + timeoutMs;
  let lastError = "request did not succeed";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { headers, redirect: "manual" });
      if (response.ok || response.status === 307 || response.status === 308) {
        return;
      }
      lastError = `status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await delay(1_000);
  }

  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

async function waitForTunnelUrl(logPath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const pattern = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi;

  while (Date.now() < deadline) {
    const content = readFileSync(logPath, "utf8");
    const match = content.match(pattern);
    if (match?.[0]) {
      return match[0];
    }

    await delay(1_000);
  }

  const logContent = readFileSync(logPath, "utf8");
  throw new Error(`Timed out waiting for cloudflared URL.\n${logContent}`);
}

async function ensureCloudflared() {
  if (existsSync(cloudflaredPath)) {
    return;
  }

  console.log("cloudflared not found in workspace cache. Downloading local binary...");
  const response = await fetch(
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe",
  );

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download cloudflared binary: ${response.status}`);
  }
  const binary = Buffer.from(await response.arrayBuffer());
  writeFileSync(cloudflaredPath, binary);
}

function stopExistingSession() {
  if (!existsSync(sessionPath)) {
    return;
  }

  try {
    const existing = JSON.parse(readFileSync(sessionPath, "utf8"));
    for (const pid of Object.values(existing.pids ?? {})) {
      if (typeof pid === "number") {
        try {
          process.kill(pid);
        } catch {
        }
      }
    }
    rmSync(sessionPath, { force: true });
  } catch {
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
