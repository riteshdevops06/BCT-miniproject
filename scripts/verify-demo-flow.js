/* Verifies the exact click-through documented in DEMO_SCRIPT.md, in a headless
   DOM against the live chain: connect -> donate -> request (as charity org)
   -> blocked before approval -> approve (as admin) -> execute -> ledger.

   Run: node scripts/verify-demo-flow.js
*/
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const FE = path.join(ROOT, "frontend");

(async () => {
  const html = fs.readFileSync(path.join(FE, "index.html"), "utf8");
  const vc = new VirtualConsole();
  const errors = [];
  vc.on("jsdomError", (e) => errors.push("jsdomError: " + e.message));

  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "http://localhost/",
    virtualConsole: vc,
  });
  const { window } = dom;
  const $ = (id) => window.document.getElementById(id);

  window.fetch = async (url, opts) => {
    const s = String(url);
    if (s.endsWith("config.json") || s.endsWith("abi.json")) {
      return {
        ok: true,
        status: 200,
        json: async () => JSON.parse(fs.readFileSync(path.join(FE, path.basename(s)), "utf8")),
      };
    }
    return globalThis.fetch(url, opts);
  };

  window.ethers = require("ethers");
  window.console.error = (...a) =>
    errors.push("console.error: " + a.map((x) => (x && x.stack ? x.stack : String(x))).join(" "));

  window.eval(fs.readFileSync(path.join(FE, "app.js"), "utf8"));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(4000);

  const results = [];
  const check = (name, cond, extra = "") => results.push({ name, pass: !!cond, extra });

  // ---------------------------------------------------------------- step 1
  console.log("=== Step 1: Connect wallet ===");
  $("connectBtn").click();
  await wait(2500);
  check("connected", $("connectBtn").textContent === "Disconnect", $("connectBtn").textContent);
  check("account switcher is visible", !$("acctSel").classList.contains("hidden"));

  const sel = $("acctSel");
  const opts = [...sel.options].map((o) => o.textContent);
  console.log("  accounts:", opts.slice(0, 3).join(" | "));
  check("switcher labels roles", opts.some((t) => t.includes("Admin")) && opts.some((t) => t.includes("Charity Org")),
    opts.slice(0, 2).join(" | "));

  // ---------------------------------------------------------------- step 2
  console.log("\n=== Step 2: Donate as donor ===");
  // Donor = account index 3 (not admin, not a charity org).
  const donorIdx = [...sel.options].findIndex((o) => o.textContent.includes("Donor"));
  sel.value = String(donorIdx);
  await sel.onchange();
  await wait(2000);
  check("switched to a donor account", $("netBadge").textContent.includes("..."), $("netBadge").textContent);

  $("dCampaign").value = "0";
  $("dAmount").value = "0.5";
  $("dMessage").value = "Thank you";
  $("donateBtn").click();
  await wait(4000);
  check("donation succeeded", $("toast").textContent.includes("Donated"), $("toast").textContent.trim());
  check("ledger shows the donation", $("donationTable").textContent.includes("Thank you"));

  // ---------------------------------------------------------------- step 3
  console.log("\n=== Step 3: Charity org requests a withdrawal ===");
  const orgIdx = [...sel.options].findIndex((o) => o.textContent.includes("Charity Org"));
  sel.value = String(orgIdx);
  await sel.onchange();
  await wait(2000);

  $("rCampaign").value = "0";
  $("rAmount").value = "0.2";
  $("rReason").value = "Purchased 500 food packets";
  $("rProof").value = "https://example.org/invoice.pdf";
  $("requestBtn").click();
  await wait(4000);
  const reqToast = $("toast").textContent.trim();
  console.log("  toast:", reqToast);
  check("withdrawal request submitted", reqToast.includes("submitted") || reqToast.includes("Awaiting"), reqToast);

  const reqText = $("requestTable").textContent;
  check("request row shows Pending status", reqText.includes("Pending"), "");
  check("request row shows the reason", reqText.includes("Purchased 500 food packets"), "");
  check("request row shows the proof link", reqText.includes("proof"), "");

  // ------------------------------------------------- step 4: blocked execute
  console.log("\n=== Step 4: Try to execute BEFORE approval (must be blocked) ===");
  const { ethers } = require("ethers");
  const cfg = JSON.parse(fs.readFileSync(path.join(FE, "config.json"), "utf8"));
  const rpc = new ethers.JsonRpcProvider(cfg.rpcUrl);
  const c = new ethers.Contract(
    cfg.address,
    JSON.parse(fs.readFileSync(path.join(FE, "abi.json"), "utf8")),
    rpc
  );
  const totalReq = Number(await c.totalRequests());
  const reqId = totalReq - 1;
  let blocked = false;
  try {
    await c.connect(await rpc.getSigner(cfg.charityOrgs[0])).executeWithdrawal(reqId);
  } catch (e) {
    blocked = /not approved/.test(e.shortMessage || e.message);
    console.log("  blocked by contract:", e.shortMessage || e.message);
  }
  check("contract blocks execution without approval", blocked);

  // ---------------------------------------------------------------- step 5
  console.log("\n=== Step 5: Admin approves, then executes ===");
  const adminIdx = [...sel.options].findIndex((o) => o.textContent.includes("Admin"));
  sel.value = String(adminIdx);
  await sel.onchange();
  await wait(2000);
  check("admin sees the Admin tab", !$("adminTab").classList.contains("hidden"));

  const approveBtn = $("requestTable").querySelector(".approve-r");
  check("admin sees an Approve button", !!approveBtn);
  if (approveBtn) {
    approveBtn.click();
    await wait(4000);
    console.log("  toast:", $("toast").textContent.trim());
    check("request approved", $("toast").textContent.includes("approved"), $("toast").textContent.trim());
    check("status now Approved", $("requestTable").textContent.includes("Approved"), "");

    const execBtn = $("requestTable").querySelector(".exec-r");
    check("execute button available after approval", !!execBtn);
    if (execBtn) {
      execBtn.click();
      await wait(4000);
      console.log("  toast:", $("toast").textContent.trim());
      check("withdrawal executed", $("toast").textContent.includes("released"), $("toast").textContent.trim());
    }
  }

  // ---------------------------------------------------------------- step 6
  console.log("\n=== Step 6: Public ledger reflects it all ===");
  const ledger = $("withdrawTable").textContent;
  check("ledger lists the withdrawal", ledger.includes("0.2000 ETH"), "");
  check("ledger shows the reason", ledger.includes("Purchased 500 food packets"), "");
  check("ledger shows proof link", ledger.includes("proof"), "");
  const stats = $("stats").textContent;
  check("stats show money in escrow", stats.includes("Held in Escrow"), "");

  // ---------------------------------------------------------------- report
  console.log("\n=== Demo flow verification ===");
  let failed = 0;
  for (const r of results) {
    if (!r.pass) failed++;
    console.log(`  ${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.extra ? "  [" + r.extra + "]" : ""}`);
  }
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  if (errors.length) {
    console.log("\nConsole errors:");
    errors.forEach((e) => console.log("  " + e));
  }
  process.exit(failed ? 1 : 0);
})();
