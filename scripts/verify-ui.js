/* Headless verification of the frontend: loads frontend/index.html + app.js in a
   jsdom window with real ethers talking to the live local node, then asserts the
   UI actually rendered. Run: node scripts/verify-ui.js */
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const FE = path.join(ROOT, "frontend");

(async () => {
  const html = fs.readFileSync(path.join(FE, "index.html"), "utf8");

  const vc = new VirtualConsole();
  const logs = [];
  vc.on("jsdomError", (e) => logs.push("jsdomError: " + e.message));
  vc.on("error", (...a) => logs.push("console.error: " + a.join(" ")));

  // Serve abi.json / config.json from disk instead of HTTP.
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "http://localhost/",
    virtualConsole: vc,
  });
  const { window } = dom;

  // Serve abi.json / config.json from disk; delegate everything else (the
  // JSON-RPC calls) to the real fetch so ethers gets a proper Response.
  window.fetch = async (url, opts) => {
    const s = String(url);
    if (s.endsWith("config.json") || s.endsWith("abi.json")) {
      const p = path.join(FE, path.basename(s));
      return {
        ok: true,
        status: 200,
        json: async () => JSON.parse(fs.readFileSync(p, "utf8")),
      };
    }
    return globalThis.fetch(url, opts);
  };

  // Real ethers inside the jsdom window.
  // First: assert the browser UMD bundle (the one the page loads from the CDN)
  // exposes the API app.js relies on. We only check the surface here, no network.
  const ethersSrc = fs.readFileSync(
    path.join(ROOT, "node_modules", "ethers", "dist", "ethers.umd.min.js"),
    "utf8"
  );
  window.eval(ethersSrc);
  const umdApi = [
    "BrowserProvider",
    "JsonRpcProvider",
    "Contract",
    "parseEther",
    "formatEther",
    "ZeroAddress",
  ];
  const umdMissing = umdApi.filter((k) => typeof window.ethers?.[k] === "undefined");
  console.log(
    `\nBrowser UMD bundle exposes ${umdApi.length - umdMissing.length}/${umdApi.length} required APIs` +
      (umdMissing.length ? `  MISSING: ${umdMissing.join(", ")}` : "  PASS")
  );

  // For the live render we swap in ethers' Node build: its HTTP transport uses
  // Node's http module, so it is unaffected by jsdom's window/fetch realm.
  window.ethers = require("ethers");

  // No MetaMask in this environment -> the app falls back to the local RPC.
  delete window.ethereum;

  const appSrc = fs.readFileSync(path.join(FE, "app.js"), "utf8");
  // Surface full stack traces from the page's own error handler.
  window.console.error = (...a) => {
    logs.push(
      "console.error: " +
        a
          .map((x) => (x && x.stack ? x.stack : String(x)))
          .join(" ")
    );
  };
  window.eval(appSrc);

  // init() is async; give it time to fetch config + render.
  await new Promise((r) => setTimeout(r, 4000));

  const $ = (id) => window.document.getElementById(id);
  const results = [];
  const check = (name, cond, extra = "") =>
    results.push({ name, pass: !!cond, extra });

  // --- stats bar ---
  const stats = $("stats").textContent.replace(/\s+/g, " ").trim();
  check("stats bar rendered", stats.length > 20, stats.slice(0, 90));
  check("stats show Total Raised", stats.includes("Total Raised"));
  check("stats show Held in Escrow", stats.includes("Held in Escrow"));

  // --- campaigns ---
  const cards = $("campaignGrid").querySelectorAll(".card");
  check("campaign cards rendered", cards.length === 2, `${cards.length} cards`);
  const firstTitle = cards[0]?.querySelector("h3")?.textContent || "";
  check("card title is non-empty", firstTitle.trim().length > 0, firstTitle);
  const bar = cards[0]?.querySelector(".bar > i");
  check("progress bar has width", bar && bar.style.width !== "", bar?.style.width);
  const cardText = cards[0]?.textContent || "";
  check("card shows raised amount", cardText.includes("raised of"), "");
  check("card shows spent amount", cardText.includes("Spent:"), "");

  // --- selects populated ---
  const dOpts = $("dCampaign").querySelectorAll("option");
  check("donate dropdown populated", dOpts.length === 2, `${dOpts.length} options`);

  // --- ledger ---
  const donRows = $("donationTable").querySelectorAll("tbody tr");
  check("donation ledger has rows", donRows.length >= 1, `${donRows.length} rows`);
  const donText = donRows[0]?.textContent || "";
  check("ledger row shows donor + amount", donText.includes("ETH"), donText.replace(/\s+/g, " ").trim().slice(0, 70));
  const wdRows = $("withdrawTable").querySelectorAll("tbody tr");
  check("withdrawal ledger has rows", wdRows.length >= 1, `${wdRows.length} rows`);
  check("withdrawal ledger shows proof link", (wdRows[0]?.textContent || "").includes("proof"));

  // --- requests ---
  const reqRows = $("requestTable").querySelectorAll("tbody tr");
  check("request table has rows", reqRows.length >= 1, `${reqRows.length} rows`);
  const reqText = reqRows[0]?.textContent || "";
  check("request row shows status", reqText.includes("Executed") || reqText.includes("Pending"), reqText.replace(/\s+/g, " ").trim().slice(0, 80));
  check("request row shows reason", reqText.includes("relief material") || reqText.includes("Purchased"), "");

  // --- milestones ---
  const ms = $("milestoneList").textContent.replace(/\s+/g, " ").trim();
  check("milestone list rendered", ms.includes("food packets"), ms.slice(0, 80));

  // --- tabs ---
  const tabs = window.document.querySelectorAll("nav button");
  check("nav tabs present", tabs.length >= 6, `${tabs.length} tabs`);
  $("tab-ledger").classList.remove("hidden");
  check("ledger section exists", !!$("tab-ledger"));

  // --- report ---
  console.log("\n=== Frontend render verification ===");
  let failed = 0;
  const report = () => {
    for (const r of results) {
      if (!r.pass) failed++;
      console.log(`  ${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.extra ? "  [" + r.extra + "]" : ""}`);
    }
    console.log(`\n${results.length - failed}/${results.length} checks passed`);
  };

  // ---------------------------------------------------------------------
  // Interaction test: connect a wallet and donate through the real UI.
  // ---------------------------------------------------------------------
  console.log("\n=== Interaction test (connect + donate via UI buttons) ===");
  const donBefore = $("donationTable").querySelectorAll("tbody tr").length;

  $("connectBtn").click();
  await new Promise((r) => setTimeout(r, 2500));
  check("wallet connected (button label changed)", $("connectBtn").textContent === "Disconnect",
    $("connectBtn").textContent);
  check("network badge shows an account", $("netBadge").textContent.includes("..."),
    $("netBadge").textContent);

  // Go to the donate tab, pick campaign 0, donate 0.25 ETH.
  $("tab-donate").classList.remove("hidden");
  $("dCampaign").value = "0";
  $("dAmount").value = "0.25";
  $("dMessage").value = "UI test donation";
  $("donateBtn").click();
  await new Promise((r) => setTimeout(r, 4000));

  const toastText = $("toast").textContent.trim();
  if (toastText) console.log("  toast: " + toastText.replace(/\s+/g, " "));

  const donAfter = $("donationTable").querySelectorAll("tbody tr").length;
  check("donation added through the UI", donAfter === donBefore + 1, `${donBefore} -> ${donAfter} rows`);

  const ledgerText = $("donationTable").textContent;
  check("new donation shows its message", ledgerText.includes("UI test donation"), "");
  check("new donation amount appears", ledgerText.includes("0.2500 ETH"), "");

  // The stats bar should have moved too.
  const statsAfter = $("stats").textContent;
  check("stats bar reflects the new donation", statsAfter.includes("1.7500 ETH"),
    (statsAfter.match(/Total Raised[\s\S]{0,20}/) || [""])[0]);

  report();
  if (logs.length) {
    console.log("\nConsole errors:");
    logs.forEach((l) => console.log("  " + l));
  }
  process.exit(failed ? 1 : 0);
})();
