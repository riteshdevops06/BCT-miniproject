/* GiveTrace — frontend logic for the Charity smart contract.
   Plain JS + ethers v6 (loaded from CDN). No build step. */

let provider, signer, contract, account;
let config, abi;
let campaignCache = [];
const ADMIN_ADDR = ""; // filled from config.json

// ---------------------------------------------------------------- helpers
const $ = (id) => document.getElementById(id);
const fmtEth = (v) => (Number(v) / 1e18).toFixed(4) + " ETH";
const short = (a) => (a ? a.slice(0, 6) + "..." + a.slice(-4) : "-");
const ts = (t) => (Number(t) ? new Date(Number(t) * 1000).toLocaleString() : "-");

function toast(msg, isErr = false) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast" + (isErr ? " err" : "");
  t.classList.remove("hidden");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add("hidden"), 6000);
}

const STATUS_LABEL = { 0: "Active", 1: "Completed", 2: "Cancelled" };
const STATUS_CLASS = { 0: "active", 1: "completed", 2: "cancelled" };
const REQ_LABEL = { 0: "None", 1: "Pending", 2: "Approved", 3: "Rejected", 4: "Executed" };

// ---------------------------------------------------------------- init
async function init() {
  try {
    [config, abi] = await Promise.all([
      fetch("config.json").then((r) => r.json()),
      fetch("abi.json").then((r) => r.json()),
    ]);
  } catch (e) {
    toast("Could not load config.json / abi.json. Run `npm run deploy` first.", true);
    return;
  }

  // Fall back to injected wallet (MetaMask) if present, else local hardhat node.
  if (window.ethereum) {
    provider = new ethers.BrowserProvider(window.ethereum);
    $("netBadge").textContent = "MetaMask";
  } else {
    provider = new ethers.JsonRpcProvider(config.rpcUrl);
    $("netBadge").textContent = "Local RPC";
  }

  contract = new ethers.Contract(config.address, abi, provider);

  // Ethers v6 enum helpers may not exist on older builds; build our own maps.
  await refresh();
  wireEvents();
}

async function connect() {
  try {
    if (window.ethereum) {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      signer = await provider.getSigner();
    } else {
      // Local node: use the first hardhat account as a stand-in for MetaMask.
      // NOTE: ethers v6 listAccounts() returns Account objects, not address
      // strings, so use eth_accounts directly for plain addresses.
      const accounts = await provider.send("eth_accounts", []);
      if (!accounts || !accounts.length) {
        throw new Error("No accounts available on the local node.");
      }
      signer = await provider.getSigner(accounts[0]);
    }
    account = await signer.getAddress();
    contract = contract.connect(signer);
    $("netBadge").textContent = short(account);
    $("connectBtn").textContent = "Disconnect";
    $("connectBtn").onclick = disconnect;

    // Role-based tabs
    const isAdmin = account.toLowerCase() === config.admin.toLowerCase();
    $("adminTab").classList.toggle("hidden", !isAdmin);
    $("createTab").classList.toggle("hidden", !(await contract.isCharityOrg(account)));

    await refresh();
    toast("Wallet connected: " + short(account));
  } catch (e) {
    toast(e.message || "Connection failed", true);
  }
}

function disconnect() {
  signer = null;
  account = null;
  contract = contract.connect(provider);
  $("connectBtn").textContent = "Connect Wallet";
  $("connectBtn").onclick = connect;
  $("netBadge").textContent = window.ethereum ? "MetaMask" : "Local RPC";
  $("adminTab").classList.add("hidden");
  $("createTab").classList.add("hidden");
  refresh();
}

function requireWallet() {
  if (!signer) {
    toast("Connect your wallet first.", true);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------- data
async function refresh() {
  try {
    const total = Number(await contract.totalCampaigns());
    const stats = await Promise.all(
      Array.from({ length: total }, (_, i) => contract.transparencyReport(i))
    );

    const raised = stats.reduce((s, r) => s + r.raisedAmount, 0n);
    const spent = stats.reduce((s, r) => s + r.spentAmount, 0n);
    const goal = stats.reduce((s, r) => s + r.goalAmount, 0n);

    $("stats").innerHTML = `
      <div class="stat"><div class="k">Total Raised</div><div class="v">${fmtEth(raised)}</div></div>
      <div class="stat"><div class="k">Total Spent (On-chain proof)</div><div class="v">${fmtEth(spent)}</div></div>
      <div class="stat"><div class="k">Held in Escrow</div><div class="v">${fmtEth(raised - spent)}</div></div>
      <div class="stat"><div class="k">Total Goal</div><div class="v">${fmtEth(goal)}</div></div>
      <div class="stat"><div class="k">Campaigns</div><div class="v">${total}</div></div>
    `;

    campaignCache = [];
    for (let i = 0; i < total; i++) {
      const c = await contract.getCampaign(i);
      // NB: ethers v6 Result objects lose their named fields when spread,
      // so copy each field explicitly instead of using {...c}.
      campaignCache.push({
        id: i,
        owner: c.owner,
        title: c.title,
        description: c.description,
        cause: c.cause,
        goalAmount: c.goalAmount,
        raisedAmount: c.raisedAmount,
        spentAmount: c.spentAmount,
        beneficiary: c.beneficiary,
        status: c.status,
        createdAt: c.createdAt,
      });
    }

    renderCampaigns();
    renderDonateSelects();
    renderRequests();
    renderMilestones();
    renderLedger();
    renderAdmin();
  } catch (e) {
    console.error(e);
    toast("Refresh failed: " + (e.shortMessage || e.message), true);
  }
}

// ---------------------------------------------------------------- render
function renderCampaigns() {
  const grid = $("campaignGrid");
  if (!campaignCache.length) {
    grid.innerHTML = "";
    $("campaignEmpty").classList.remove("hidden");
    return;
  }
  $("campaignEmpty").classList.add("hidden");

  grid.innerHTML = campaignCache
    .map((c) => {
      const pct =
        c.goalAmount > 0n
          ? Math.min(100, Number((c.raisedAmount * 100n) / c.goalAmount))
          : 0;
      const isOwner = account && account.toLowerCase() === c.owner.toLowerCase();
      const canRefund =
        account && Number(c.status) === 2 && c.raisedAmount > 0n;

      return `
      <div class="card">
        <span class="tag ${STATUS_CLASS[Number(c.status)]}">${STATUS_LABEL[Number(c.status)]}</span>
        <h3>${c.title}</h3>
        <div class="muted" style="font-size:12px">${c.cause} &middot; by ${short(c.owner)}</div>
        <p class="desc">${c.description}</p>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <div class="row"><span>${fmtEth(c.raisedAmount)} raised of ${fmtEth(c.goalAmount)}</span><span>${pct}%</span></div>
        <div class="row"><span>Spent: ${fmtEth(c.spentAmount)}</span><span>Balance: ${fmtEth(c.raisedAmount - c.spentAmount)}</span></div>
        <div class="actions">
          <button class="donate-c" data-id="${c.id}">Donate</button>
          ${isOwner && Number(c.status) === 0 ? `<button class="secondary req-c" data-id="${c.id}">Request Funds</button>` : ""}
          ${canRefund ? `<button class="blue refund-c" data-id="${c.id}">Claim Refund</button>` : ""}
        </div>
      </div>`;
    })
    .join("");

  grid.querySelectorAll(".donate-c").forEach((b) =>
    b.onclick = () => {
      switchTab("donate");
      $("dCampaign").value = b.dataset.id;
    }
  );
  grid.querySelectorAll(".req-c").forEach((b) =>
    b.onclick = () => {
      switchTab("requests");
      $("rCampaign").value = b.dataset.id;
    }
  );
  grid.querySelectorAll(".refund-c").forEach((b) =>
    b.onclick = async () => {
      if (!requireWallet()) return;
      const ids = await contract.campaignDonationIds(Number(b.dataset.id));
      let last = null;
      for (const did of ids) {
        const d = await contract.getDonation(did);
        if (
          d.donor.toLowerCase() === account.toLowerCase() &&
          !d.refunded
        ) {
          try {
            const tx = await contract.claimRefund(did);
            await tx.wait();
            toast("Refund received: " + fmtEth(d.amount));
          } catch (e) {
            toast(e.shortMessage || e.message, true);
          }
          last = did;
          break;
        }
      }
      if (last === null) toast("No refundable donation found for this campaign.", true);
      await refresh();
    }
  );
}

function renderDonateSelects() {
  const active = campaignCache.filter((c) => Number(c.status) === 0);
  const opts = active
    .map((c) => `<option value="${c.id}">${c.title} (${fmtEth(c.raisedAmount)} raised)</option>`)
    .join("");
  ["dCampaign", "rCampaign", "mCampaign"].forEach((id) => {
    const el = $(id);
    const prev = el.value;
    el.innerHTML = opts || '<option value="">No active campaigns</option>';
    if (prev && active.some((c) => String(c.id) === prev)) el.value = prev;
  });
}

async function renderRequests() {
  const total = Number(await contract.totalRequests());
  const tb = $("requestTable").querySelector("tbody");
  tb.innerHTML = "";
  $("requestEmpty").classList.toggle("hidden", total > 0);

  for (let i = 0; i < total; i++) {
    const r = await contract.getRequest(i);
    const camp = campaignCache[r.campaignId];
    const isAdmin = !!account && account.toLowerCase() === config.admin.toLowerCase();
    const isRequester = account && account.toLowerCase() === r.requester.toLowerCase();

    let action = "";
    if (Number(r.status) === 1 && isAdmin) {
      action = `<button class="approve-r" data-id="${i}">Approve</button>
                <button class="danger reject-r" data-id="${i}">Reject</button>`;
    } else if (Number(r.status) === 1 && isRequester) {
      action = `<button class="secondary proof-r" data-id="${i}">Attach Proof</button>`;
    } else if (Number(r.status) === 2 && isRequester) {
      action = `<button class="blue exec-r" data-id="${i}" data-camp="${r.campaignId}">Execute</button>`;
    }

    tb.innerHTML += `
      <tr>
        <td>${i}</td>
        <td>${camp ? camp.title : "#" + r.campaignId}</td>
        <td><b>${fmtEth(r.amount)}</b></td>
        <td>${r.reason}</td>
        <td>${r.proofUrl ? `<a href="${r.proofUrl}" target="_blank" rel="noopener">proof</a>` : '<span class="muted">none</span>'}</td>
        <td><span class="pill ${REQ_LABEL[Number(r.status)]}">${REQ_LABEL[Number(r.status)]}</span></td>
        <td>${action}</td>
      </tr>`;
  }

  tb.querySelectorAll(".approve-r").forEach((b) =>
    b.onclick = async () => {
      try {
        const tx = await contract.approveWithdrawal(Number(b.dataset.id));
        await tx.wait();
        toast("Request approved. Funds can now be released.");
        await refresh();
      } catch (e) {
        toast(e.shortMessage || e.message, true);
      }
    }
  );
  tb.querySelectorAll(".reject-r").forEach((b) =>
    b.onclick = async () => {
      const reason = prompt("Reason for rejection (visible on-chain):") || "No reason given";
      try {
        const tx = await contract.rejectWithdrawal(Number(b.dataset.id), reason);
        await tx.wait();
        toast("Request rejected.");
        await refresh();
      } catch (e) {
        toast(e.shortMessage || e.message, true);
      }
    }
  );
  tb.querySelectorAll(".proof-r").forEach((b) =>
    b.onclick = async () => {
      const url = prompt("Paste the proof URL (bill / receipt / photo):");
      if (!url) return;
      try {
        const tx = await contract.attachProof(Number(b.dataset.id), url);
        await tx.wait();
        toast("Proof attached.");
        await refresh();
      } catch (e) {
        toast(e.shortMessage || e.message, true);
      }
    }
  );
  tb.querySelectorAll(".exec-r").forEach((b) =>
    b.onclick = async () => {
      try {
        const tx = await contract.executeWithdrawal(Number(b.dataset.id));
        await tx.wait();
        toast("Funds released to the beneficiary.");
        await refresh();
      } catch (e) {
        toast(e.shortMessage || e.message, true);
      }
    }
  );
}

async function renderMilestones() {
  const total = Number(await contract.milestoneCount());
  const list = $("milestoneList");
  list.innerHTML = "";
  $("milestoneEmpty").classList.toggle("hidden", total > 0);

  for (let i = 0; i < total; i++) {
    const m = await contract.getMilestone(i);
    const camp = campaignCache[m.campaignId];
    list.innerHTML += `
      <div style="border-bottom:1px solid var(--line);padding:12px 0">
        <b>${m.description}</b>
        <div class="muted" style="font-size:12.5px">
          ${camp ? camp.title : "Campaign #" + m.campaignId} &middot; ${ts(m.timestamp)} &middot;
          ${m.proofUrl ? `<a href="${m.proofUrl}" target="_blank" rel="noopener">view evidence</a>` : "no evidence"}
        </div>
      </div>`;
  }
}

async function renderLedger() {
  const total = Number(await contract.totalDonations());
  const tb = $("donationTable").querySelector("tbody");
  tb.innerHTML = "";
  $("ledgerEmpty").classList.toggle("hidden", total > 0);

  for (let i = 0; i < total; i++) {
    const d = await contract.getDonation(i);
    const camp = campaignCache[d.campaignId];
    tb.innerHTML += `
      <tr>
        <td>${i}</td>
        <td>${camp ? camp.title : "#" + d.campaignId}</td>
        <td class="mono">${short(d.donor)}</td>
        <td><b>${fmtEth(d.amount)}</b></td>
        <td>${d.message || '<span class="muted">-</span>'}</td>
        <td class="muted">${ts(d.timestamp)}</td>
      </tr>`;
  }

  const [ids] = await contract.withdrawalsMade();
  const wb = $("withdrawTable").querySelector("tbody");
  wb.innerHTML = "";
  $("withdrawEmpty").classList.toggle("hidden", ids.length > 0);

  for (let k = 0; k < ids.length; k++) {
    const r = await contract.getRequest(ids[k]);
    const camp = campaignCache[r.campaignId];
    const ben = camp ? camp.beneficiary : "-";
    wb.innerHTML += `
      <tr>
        <td>${ids[k]}</td>
        <td>${camp ? camp.title : "#" + r.campaignId}</td>
        <td class="mono">${short(ben)}</td>
        <td><b>${fmtEth(r.amount)}</b></td>
        <td>${r.reason}</td>
        <td>${r.proofUrl ? `<a href="${r.proofUrl}" target="_blank" rel="noopener">proof</a>` : '<span class="muted">none</span>'}</td>
      </tr>`;
  }
}

async function renderAdmin() {
  if (!account || account.toLowerCase() !== config.admin.toLowerCase()) {
    $("orgList").innerHTML = '<span class="muted">Admin wallet not connected.</span>';
    $("adminPending").innerHTML = "";
    return;
  }
  const n = Number(await contract.charityOrgCount());
  let html = "";
  for (let i = 0; i < n; i++) {
    const a = await contract.charityOrgAt(i);
    html += `<div style="padding:6px 0;border-bottom:1px solid var(--line)">${a}</div>`;
  }
  $("orgList").innerHTML = html || '<span class="muted">No organisations registered.</span>';

  const total = Number(await contract.totalRequests());
  let pend = "";
  for (let i = 0; i < total; i++) {
    const r = await contract.getRequest(i);
    if (Number(r.status) === 1) {
      const camp = campaignCache[r.campaignId];
      pend += `<div style="border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:10px">
        <b>Request #${i}</b> &middot; ${camp ? camp.title : "#" + r.campaignId} &middot; ${fmtEth(r.amount)}
        <div class="muted" style="font-size:13px;margin:6px 0">${r.reason}</div>
        <div class="muted" style="font-size:12px">Proof: ${r.proofUrl ? `<a href="${r.proofUrl}" target="_blank" rel="noopener">attached</a>` : "not attached yet"}</div>
        <div class="actions">
          <button class="approve-r" data-id="${i}">Approve</button>
          <button class="danger reject-r" data-id="${i}">Reject</button>
        </div>
      </div>`;
    }
  }
  $("adminPending").innerHTML = pend;
  $("adminEmpty").classList.toggle("hidden", pend !== "");

  $("adminPending").querySelectorAll(".approve-r").forEach((b) =>
    b.onclick = async () => {
      try {
        const tx = await contract.approveWithdrawal(Number(b.dataset.id));
        await tx.wait();
        toast("Approved.");
        await refresh();
      } catch (e) {
        toast(e.shortMessage || e.message, true);
      }
    }
  );
  $("adminPending").querySelectorAll(".reject-r").forEach((b) =>
    b.onclick = async () => {
      const reason = prompt("Reason for rejection:") || "No reason given";
      try {
        const tx = await contract.rejectWithdrawal(Number(b.dataset.id), reason);
        await tx.wait();
        toast("Rejected.");
        await refresh();
      } catch (e) {
        toast(e.shortMessage || e.message, true);
      }
    }
  );
}

// ---------------------------------------------------------------- tabs
function switchTab(name) {
  document.querySelectorAll("main section").forEach((s) => s.classList.add("hidden"));
  $("tab-" + name).classList.remove("hidden");
  document.querySelectorAll("nav button").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === name)
  );
}

// ---------------------------------------------------------------- events
function wireEvents() {
  $("connectBtn").onclick = connect;

  document.querySelectorAll("nav button").forEach((b) => {
    b.onclick = () => switchTab(b.dataset.tab);
  });

  $("donateBtn").onclick = async () => {
    if (!requireWallet()) return;
    const id = $("dCampaign").value;
    if (id === "") return toast("No active campaign to donate to.", true);
    const amount = $("dAmount").value;
    if (!amount || Number(amount) <= 0) return toast("Enter a valid amount.", true);
    try {
      const tx = await contract.donate(Number(id), $("dMessage").value, {
        value: ethers.parseEther(amount),
      });
      await tx.wait();
      toast("Donated " + amount + " ETH. Thank you!");
      $("dMessage").value = "";
      await refresh();
    } catch (e) {
      toast(e.shortMessage || e.message, true);
    }
  };

  $("requestBtn").onclick = async () => {
    if (!requireWallet()) return;
    const id = $("rCampaign").value;
    if (id === "") return toast("No active campaign.", true);
    const amount = ethers.parseEther($("rAmount").value || "0");
    try {
      const tx = await contract.requestWithdrawal(
        Number(id),
        amount,
        $("rReason").value,
        $("rProof").value
      );
      await tx.wait();
      toast("Withdrawal request submitted. Awaiting admin approval.");
      $("rAmount").value = "";
      $("rReason").value = "";
      $("rProof").value = "";
      await refresh();
    } catch (e) {
      toast(e.shortMessage || e.message, true);
    }
  };

  $("milestoneBtn").onclick = async () => {
    if (!requireWallet()) return;
    const id = $("mCampaign").value;
    if (id === "") return toast("No active campaign.", true);
    try {
      const tx = await contract.postMilestone(
        Number(id),
        $("mDesc").value,
        $("mProof").value
      );
      await tx.wait();
      toast("Milestone posted publicly.");
      $("mDesc").value = "";
      $("mProof").value = "";
      await refresh();
    } catch (e) {
      toast(e.shortMessage || e.message, true);
    }
  };

  $("createBtn").onclick = async () => {
    if (!requireWallet()) return;
    try {
      const tx = await contract.createCampaign(
        $("cTitle").value,
        $("cDesc").value,
        $("cCause").value,
        ethers.parseEther($("cGoal").value || "0"),
        $("cBen").value || account
      );
      await tx.wait();
      toast("Campaign created.");
      $("cTitle").value = "";
      $("cDesc").value = "";
      $("cCause").value = "";
      $("cGoal").value = "";
      $("cBen").value = "";
      await refresh();
    } catch (e) {
      toast(e.shortMessage || e.message, true);
    }
  };

  $("addOrgBtn").onclick = async () => {
    if (!requireWallet()) return;
    try {
      const tx = await contract.addCharityOrg($("orgAddr").value);
      await tx.wait();
      toast("Organisation registered.");
      $("orgAddr").value = "";
      await refresh();
    } catch (e) {
      toast(e.shortMessage || e.message, true);
    }
  };

  $("removeOrgBtn").onclick = async () => {
    if (!requireWallet()) return;
    try {
      const tx = await contract.removeCharityOrg($("orgAddr").value);
      await tx.wait();
      toast("Organisation removed.");
      $("orgAddr").value = "";
      await refresh();
    } catch (e) {
      toast(e.shortMessage || e.message, true);
    }
  };

  if (window.ethereum) {
    window.ethereum.on("accountsChanged", () => location.reload());
  }
}

init();
