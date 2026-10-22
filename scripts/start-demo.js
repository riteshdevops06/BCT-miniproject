/* One-command demo launcher for the exam.
   Starts a fresh blockchain, deploys the contract, seeds demo data,
   serves the frontend, and opens the browser.

   Usage:  npm run start
   Stop:   Ctrl+C  (also cleans up the background processes)
*/
const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
const RPC_URL = "http://127.0.0.1:8545";
const WEB_PORT = 3000;

let children = [];

function log(msg) {
  console.log(msg);
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: ROOT, shell: true, stdio: "inherit" });
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited with ${code}`))
    );
  });
}

// Free a port so a stale process from an earlier run cannot break the demo.
function freePort(port) {
  try {
    const out = execSync(`netstat -ano | grep ":${port}" | grep LISTENING`, {
      shell: "cmd.exe",
      stdio: ["ignore", "pipe", "ignore"],
    }).toString();
    const pids = [...new Set(out.split(/\r?\n/).map((l) => l.trim().split(/\s+/).pop()))];
    for (const pid of pids) {
      if (!/^\d+$/.test(pid)) continue;
      log(`  freeing port ${port} (stopping stale process ${pid})`);
      try {
        execSync(`taskkill /PID ${pid} /F`, { shell: "cmd.exe", stdio: "ignore" });
      } catch (_) {}
    }
    if (pids.length) return true;
  } catch (_) {}
  return false;
}

async function waitForRpc(timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      });
      if (res.ok) return true;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function startBackground(cmd, args, logFile) {
  const p = spawn(cmd, args, { cwd: ROOT, shell: true, stdio: ["ignore", "pipe", "pipe"] });
  p.on("error", () => {});
  if (logFile) {
    // Keep the node's account list (private keys) available for MetaMask import.
    const out = fs.createWriteStream(path.join(ROOT, logFile), { flags: "w" });
    p.stdout.pipe(out);
    p.stderr.pipe(out);
  }
  children.push(p);
  return p;
}

function cleanup() {
  log("\nShutting down...");
  for (const c of children) {
    try { c.kill(); } catch (_) {}
  }
  // The node/server may have been started detached; make sure the ports clear.
  for (const port of [8545, WEB_PORT]) {
    try {
      const out = execSync(`netstat -ano | grep ":${port}" | grep LISTENING`, {
        shell: "cmd.exe",
        stdio: ["ignore", "pipe", "ignore"],
      }).toString();
      for (const pid of [...new Set(out.split(/\r?\n/).map((l) => l.trim().split(/\s+/).pop()))]) {
        if (/^\d+$/.test(pid)) execSync(`taskkill /PID ${pid} /F`, { shell: "cmd.exe", stdio: "ignore" });
      }
    } catch (_) {}
  }
  log("Done. Ports 8545 and 3000 are free.");
  process.exit(0);
}

async function main() {
  console.log("\n=========================================================");
  console.log("  GiveTrace - Transparent Charity (BCT Mini Project)");
  console.log("=========================================================\n");

  log("[1/5] Freeing ports 8545 and 3000...");
  freePort(8545);
  freePort(WEB_PORT);
  await new Promise((r) => setTimeout(r, 1500));

  log("[2/5] Starting local blockchain (Hardhat node)...");
  startBackground("npx", ["hardhat", "node"], "demo-node.log");
  const up = await waitForRpc();
  if (!up) {
    console.error("\nCould not start the local blockchain on port 8545.");
    cleanup();
    return;
  }
  log("      blockchain is live at " + RPC_URL);

  log("[3/5] Compiling the contract...");
  await run("npx", ["hardhat", "compile"]);

  log("[4/5] Deploying contract + seeding demo campaigns...");
  await run("npx", ["hardhat", "run", "scripts/deploy.js", "--network", "localhost"]);

  log("[5/5] Starting the web server...");
  startBackground("node", ["scripts/serve.js"], null);

  // Wait for the web server to answer.
  let webUp = false;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://localhost:${WEB_PORT}/`);
      if (res.ok) { webUp = true; break; }
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!webUp) console.error("  (web server did not respond - check manually)");

  console.log("\n=========================================================");
  console.log("  DEMO IS READY");
  console.log("=========================================================");
  console.log(`  App:      http://localhost:${WEB_PORT}`);
  console.log(`  Contract: see frontend/config.json`);
  console.log(`  RPC:      ${RPC_URL}`);
  console.log("\n  Demo accounts (Hardhat):");
  console.log("    Admin        0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
  console.log("    Charity org  0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
  console.log("    Charity org  0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC");
  console.log("    Donor        0x90F79bf6EB2c4f870365E785982E1f101E93b906");
  console.log("\n  Press Ctrl+C to stop everything.\n");

  // Open the browser (best effort - fails silently on headless machines).
  try {
    const opener =
      process.platform === "win32" ? "start" : process.platform === "darwin" ? "open" : "xdg-open";
    execSync(`${opener} http://localhost:${WEB_PORT}`, { shell: "cmd.exe", stdio: "ignore" });
  } catch (_) {}

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  // Keep the launcher alive so it owns the child processes.
  setInterval(() => {}, 1 << 30);
}

main().catch((e) => {
  console.error("\nFailed to start the demo:", e.message);
  cleanup();
});
