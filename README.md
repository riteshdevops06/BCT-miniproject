# GiveTrace — Blockchain Based Transparent Charity

**Blockchain Technology Mini Project**

A decentralised charity platform where every donation is permanently recorded on the
blockchain and **no charity can move money without an admin approval and a public proof link**
(bill / receipt / photo). Donors can verify exactly where their money went, at any time.

---

## 1. The Problem

Traditional charities suffer from a trust problem:

- Donors have **no way to verify** how much was actually collected.
- There is **no public record** of where the money was spent.
- A charity can quietly withdraw funds with no accountability.
- Reports are self-declared and can be manipulated.

## 2. How Blockchain Solves It

| Traditional charity | GiveTrace |
|---|---|
| Donation records kept in private databases | Every donation is an immutable on-chain transaction |
| Spending decided privately | Money is locked in **escrow** until an admin approves the withdrawal |
| Reports can be edited | Every withdrawal records a **reason and a public proof link** |
| Donor has no recourse | If a campaign is cancelled, donors can **reclaim their money** from the contract |

**The key mechanism** is the escrow + approval flow. Donated funds sit in the contract.
A charity org *requests* a withdrawal with a reason and a proof link; an admin *approves* it;
only then can the funds be released to the beneficiary. The contract **reverts** if anyone
tries to withdraw money without approval or without proof.

---

## 3. Features

- **Campaigns** — goal amount, cause, beneficiary, status (Active / Completed / Cancelled)
- **Donations** — recorded on-chain with donor, amount, message and timestamp
- **Escrow** — donated funds are held by the contract, not the charity
- **Approval-gated withdrawals** — request → admin approve → execute, with mandatory proof
- **Milestones** — progress updates published with evidence links (photos / receipts)
- **Refunds** — donors reclaim their money if a campaign is cancelled
- **Public ledger** — a complete, immutable view of money in and money out
- **Transparency report** — per-campaign raised / spent / available / % of goal
- **Role-based access** — admin, registered charity orgs, and donors have different powers

---

## 4. Tech Stack

| Layer | Technology |
|---|---|
| Smart contract | Solidity 0.8.24 |
| Blockchain | Ethereum (Hardhat local network, EVM-compatible) |
| Development | Hardhat 2 + `@nomicfoundation/hardhat-toolbox` |
| Testing | Hardhat + Mocha + Chai (28 tests) |
| Frontend | Plain HTML / CSS / JavaScript + ethers.js v6 |
| Wallet | MetaMask (optional — works without it on the local node) |

No frontend build step, no framework — open the page and it runs.

---

## 5. Project Structure

```
BCT Miniproject/
├── contracts/
│   └── Charity.sol          # The whole application logic
├── test/
│   └── Charity.test.js      # 28 unit tests
├── scripts/
│   ├── deploy.js             # Deploy + seed demo data + export ABI
│   ├── demo.js               # End-to-end scripted walkthrough
│   ├── serve.js              # Static server for the frontend
│   ├── verify-ui.js          # Headless UI render + interaction test
│   └── verify-frontend.js    # Checks ethers v6 result-handling assumptions
├── frontend/
│   ├── index.html            # UI (6 tabs)
│   ├── app.js                # Frontend logic (ethers v6)
│   ├── abi.json              # Generated from the contract
│   └── config.json           # Generated: contract address + network
├── hardhat.config.js
└── package.json
```

---

## 6. How to Run

### Prerequisites
- Node.js 18+ (developed on v22)
- Optional: [MetaMask](https://metamask.io) browser extension

### Quick start (one command)

```bash
npm install     # first time only
npm start
```

`npm start` frees the ports, starts a local blockchain, compiles and deploys the
contract, seeds two demo campaigns, serves the frontend, and opens your browser at
**http://localhost:3000**. Press **Ctrl+C** to stop everything.

> **For an exam or demo**, see **[DEMO_SCRIPT.md](DEMO_SCRIPT.md)** — a full
> click-through with the words to say, plus examiner Q&A prep.

### Manual start (three terminals)

**Step 1 — Install**

```bash
npm install
```

**Step 2 — Start the local blockchain**

```bash
npm run node
```

Leave this running. It prints 20 test accounts, each funded with 10000 ETH.
It also prints the **admin address** (`0xf39F...2266`) — that's the platform admin.

**Step 3 — Deploy the contract**

In a **second terminal**:

```bash
npm run deploy
```

This deploys the contract, registers two demo charity organisations, seeds two demo
campaigns, and writes `frontend/abi.json` + `frontend/config.json`.

**Step 4 — Start the frontend**

In a **third terminal**:

```bash
npm run serve
```

Open **http://localhost:3000**

### Step 5 — Connect

Click **Connect Wallet**.

- **Without MetaMask** (simplest): the app connects to the local node and shows an
  **"Acting as"** dropdown listing the test accounts with their roles
  (Admin / Charity Org / Donor). Switch between them to demonstrate that different
  roles have different powers.
- **With MetaMask**: import one of the accounts from `demo-node.log` into MetaMask,
  then switch MetaMask to `http://127.0.0.1:8545` (Local Network). Note the contract
  address in `frontend/config.json`.

---

## 7. Demo Script

To see the whole anti-fraud flow without touching the UI:

```bash
npm run demo
```

It performs, on the live local chain:

1. A donor donates 1.5 ETH
2. The charity posts a milestone with evidence
3. The charity requests a withdrawal of 0.8 ETH
4. **Execution is attempted before approval → the contract reverts** ✅
5. The admin approves, the charity executes → the beneficiary receives exactly 0.8 ETH
6. The transparency report shows raised 1.5 / spent 0.8 / in escrow 0.7
7. The public ledger lists the withdrawal with its proof link

### Demo accounts

| Role | Address | Notes |
|---|---|---|
| Admin | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | Approves withdrawals, registers NGOs |
| Charity org 1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | Owns "Flood Relief 2026" |
| Charity org 2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | Owns "Education for Rural Kids" |
| Donor | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` | Any account can donate |

> To try the admin flow in the UI, import the admin account into MetaMask. To try the
> charity-org flow, import charity org 1. Use a third account to donate.

---

## 8. Testing

```bash
npm test                # 28 unit tests
npm run verify:ui       # 25 headless UI render + interaction checks
npm run verify:demo     # 21 checks replaying the exact DEMO_SCRIPT.md walkthrough
npm run verify:ethers   # ethers v6 result-handling assumptions
```

All 28 contract tests pass. The UI suite loads `frontend/index.html` in a headless DOM
against the live node and asserts that campaigns, ledger rows, withdrawal requests and
milestones actually render — then connects a wallet and donates through the real UI
buttons, confirming the ledger and stats update.

`verify:demo` replays the examiner walkthrough end to end: connect → donate as a
donor → request a withdrawal as a charity org → **confirm the contract blocks
execution before approval** → approve as admin → execute → confirm the public ledger
shows the payout with its proof link.

---

## 9. Smart Contract API

### Campaign lifecycle

```
donate()  ──►  [ESCROW]  ──►  requestWithdrawal()  ──►  Pending
                                                 │
                              admin approves ─────┤
                                                 ▼
                              executeWithdrawal()  ──►  Executed  ──►  funds to beneficiary
```

### Main functions

| Function | Who can call | Purpose |
|---|---|---|
| `createCampaign(...)` | Registered charity org | Start a campaign |
| `donate(campaignId, message)` | Anyone | Donate (value required) |
| `requestWithdrawal(...)` | Campaign owner | Ask to move funds out of escrow |
| `approveWithdrawal(id)` | Admin | Approve a withdrawal request |
| `rejectWithdrawal(id, reason)` | Admin | Reject with an on-chain reason |
| `executeWithdrawal(id)` | Requester or admin | Release funds — **requires approval + proof** |
| `attachProof(id, url)` | Requester | Add a receipt/photo to a request |
| `postMilestone(...)` | Campaign owner | Publish progress with evidence |
| `cancelCampaign(id)` | Owner or admin | Cancel and allow donor refunds |
| `claimRefund(donationId)` | Donor | Get money back after cancellation |
| `addCharityOrg / removeCharityOrg` | Admin | Manage registered NGOs |
| `transparencyReport(id)` | Anyone | Raised / spent / available / % of goal |
| `withdrawalsMade()` | Anyone | All money that left escrow, with proof |

### Events

`CampaignCreated`, `Donated`, `MilestonePosted`, `WithdrawalRequested`,
`WithdrawalApproved`, `WithdrawalRejected`, `WithdrawalExecuted`, `Refunded`,
`CampaignCompleted`, `CampaignCancelled`, `Paused`, `AdminChanged`,
`CharityOrgAdded`, `CharityOrgRemoved`

---

## 10. Security Notes

- **Reentrancy**: state is updated *before* the external transfer in `executeWithdrawal`
  and `claimRefund`, following checks-effects-interactions.
- **Access control**: `onlyAdmin`, `onlyCharityOrg` and per-campaign ownership checks
  guard every privileged operation.
- **Over-withdrawal**: a request cannot exceed `raisedAmount - spentAmount`.
- **Proof required**: `executeWithdrawal` reverts if the request has no proof URL.
- **Escrow**: funds are held by the contract, not by the charity's wallet.

---

## 11. Limitations & Future Scope

This is a mini project, so some things are deliberately simple:

- **Single admin.** A production version would use a multi-sig or DAO so no one person
  can approve their own spending.
- **The proof URL is not verified on-chain.** It is stored immutably, but its content
  is not checked. A production version could hash documents, use IPFS, or have a
  reviewer attest to them.
- **No real currency.** ETH is used for the demo; a production version would need
  stablecoins or a payment gateway.
- **Off-chain storage.** Titles and descriptions live on-chain for simplicity, which
  is expensive at scale. A real system would store them on IPFS and keep only the
  hash on-chain.
- **No identity verification.** KYC for charity organisations is not implemented.

Possible extensions: multi-signature approval, an IPFS + SHA-256 proof registry,
a donor reputation score, recurring donations, a matching-funds mechanism, and
deployment to a public testnet (Sepolia) with a React/Vite frontend.

---

## 12. References

- Solidity 0.8 documentation — https://docs.soliditylang.org/
- Hardhat — https://hardhat.org/
- ethers.js v6 — https://docs.ethers.org/v6/
- Ethereum smart contract security — https://consensys.io/smart-contract-best-practices/
