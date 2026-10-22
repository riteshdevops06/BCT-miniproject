# Examiner Demo Script — GiveTrace

**Everything you need to run and explain this project. Keep this open during the demo.**

---

## 0. Before The Exam (5 minutes prep)

1. Open this file in a text editor.
2. Open `README.md` in another tab (examiner may ask to see the code).
3. Open VS Code with the project folder.
4. **Do NOT install MetaMask.** The app works without it — it uses the local node's
   first account automatically. This removes the biggest risk (MetaMask network
   switching, "unrecognized chain" errors, wrong account connected).

   *If the examiner insists on seeing MetaMask*, see §6.

---

## 1. Start The Project (ONE command)

```bash
cd "E:\BCT Miniproject"
npm install      # only the very first time
npm start
```

`npm start` does everything automatically:

```
[1/5] Frees ports 8545 and 3000      <- kills any stale process
[2/5] Starts local blockchain
[3/5] Compiles the contract
[4/5] Deploys + seeds 2 demo campaigns
[5/5] Starts the web server
```

It ends with **DEMO IS READY** and opens `http://localhost:3000` in your browser.
Leave that terminal running. Press **Ctrl+C** when the exam is over.

> **You are now ready to present. Do not close that terminal.**

### One thing to know before you start

In the top-right of the app there is an **"Acting as" dropdown** listing the local
test accounts with their roles (Admin / Charity Org / Donor). It appears **after
you click Connect Wallet**, and only when MetaMask is not installed.

This is what lets you demonstrate that **different roles have different powers** —
the charity can request money, only the admin can approve it. Use it in Step 2 and
Step 4.

---

## 2. The 30-Second Pitch (say this first)

> "My project is called **GiveTrace**. It's a charity donation platform built on
> Ethereum.
>
> The problem it solves is **trust**. When you donate to a normal charity, you have
> no way to check how much was really collected or where the money actually went.
>
> GiveTrace puts every donation permanently on the blockchain, and — this is the key
> part — it puts the money in **escrow**. A charity physically cannot withdraw the
> money. It has to request a withdrawal with a **reason and a public proof link**,
> an admin has to approve it, and only then can the money move.
>
> So donors can see exactly where every rupee went, and nobody can quietly take it."

---

## 3. Live Demo — What To Click, What To Say

> Tip: do these steps **in order**. Each one builds on the last.
>
> **The account dropdown** (top right, next to Connect Wallet) lets you act as
> different people — Admin, Charity Org, Donor. This is what makes the role
> separation visible without MetaMask. It only appears in local mode.

### Step 1 — Show the Campaigns page (30 sec)

**Say:** "These are live campaigns. You can see the goal, how much was raised, and
a progress bar. Note the donor can see the money that was raised *and* the money
already spent."

**Do:** Point at the stats row at the top — *Total Raised*, *Total Spent*, *Held in Escrow*.

**Say:** "That top bar is the whole project in one line. Money in, money out, and
money still sitting safely in escrow."

---

### Step 2 — Donate, as a Donor (45 sec)

1. Click **Connect Wallet** (top right). No MetaMask needed.
2. The badge changes to your address, and an **"Acting as"** dropdown appears
   listing the test accounts with their roles:
   `0xf39f...2266 — Admin`, `0x7099...79c8 — Charity Org`, ..., `0x90F7...b906 — Donor`
3. In that dropdown, select **any Donor** account.
4. Click the **Donate** tab.
5. Pick campaign 1, amount `0.5`, message `Thank you`, click **Donate Now**.
6. A toast appears: *"Donated 0.5 ETH. Thank you!"*

**Say:** "Notice that I did not fill any bank details, no bank form, no OTP. The
donation is a transaction on the blockchain. It was recorded instantly and it cannot
be edited or deleted afterwards — not by the charity, not by me, not by an admin."

---

### Step 3 — The Public Ledger (45 sec) ⭐ MOST IMPORTANT

1. Click the **Public Ledger** tab.

**Say:** "This is the transparent part. Every single donation ever made, in a public
table. Scroll down and you see the second table — 'Money Out' — which lists every
rupee that has left the escrow, along with **why** it went and **proof** that it was
genuinely spent.

> This table is the actual product. A donor can check it any time, and nobody can
> remove a line from it."

---

### Step 4 — The Anti-Fraud Demo (2 min) ⭐⭐ THE SHOWSTOPPER

This is the moment that proves the project works. **Do not skip this.**

**Part A — the charity asks to be paid**

1. Click the **Withdrawals** tab.
2. In the **"Acting as"** dropdown, switch to **Charity Org**
   (`0x7099...79c8 — Charity Org`). *Say: "Now I'm acting as the charity."*
3. Fill in the **Request a Withdrawal** form:
   - Campaign: *Flood Relief 2026*
   - Amount: `0.2`
   - Reason: `Purchased 500 food packets`
   - Proof URL: `https://example.org/invoice.pdf`
4. Click **Submit Request**.

**Say:** "A charity wants to spend the money. It has stated why, and attached a proof
link. Note it is only a *request* — look at the status."

**Do:** Point at the status column: it says **Pending**.

**Say:** "Now here's the important part. The money is still in escrow. Let me try to
actually take it out."

**Part B — the blockchain says no**

5. Open a **second terminal** in the project folder and run:

```bash
npm run demo
```

**Say:** "This script runs against the same live blockchain. It attempts to execute
a withdrawal *before* approval."

**Do:** The terminal prints:

```
[3] Charity requests withdrawal of 0.8 ETH (needs admin approval)
    request id: 1 status: 1 (1 = Pending)

[4] Attempting execution before approval (must fail)
    correctly blocked: reverted with reason string 'Charity: not approved'
```

*(The request id may differ if you already made a request in the UI — the point
is the `Pending` status and the blocked execution.)*

**Say:**

> "**The blockchain rejected it.** Not the UI — the *contract*. Even if you bypassed
> the website entirely and wrote your own code to call the contract, it would still
> fail. That's the point of putting the rule in a smart contract instead of in the
> application code."

**Part C — the admin approves and the money moves**

6. Switch the **"Acting as"** dropdown back to **Admin** (`0xf39f...2266 — Admin`).
   *Say: "Now I'm the admin. Only I can approve."*
7. The **Withdrawals** table now shows an **Approve** button (and the **Admin** tab
   appears in the nav bar). Click **Approve**.
8. The status changes to **Approved**, and an **Execute** button appears. Click it.

**Say:** "Approved, and now the funds are released. Let me check the ledger."

9. Click the **Public Ledger** tab. The **Money Out** table now shows:
   `0.2000 ETH — Purchased 500 food packets — proof`

**Say:** "There it is. The money that went out, why it went out, and the proof — all
public and permanent. Money in minus money out always equals what's left in escrow,
and anyone can verify that number themselves."

---

### Step 5 — Milestones (30 sec, optional if short on time)

1. Click the **Milestones** tab.

**Say:** "Charities can also publish progress updates with evidence — photos,
receipts. So it's not just money being tracked, it's whether the work actually
happened."

---

### Step 6 — Close (20 sec)

**Say:**

> "To summarise: donations are permanent and public. Money sits in escrow, not with
> the charity. Every withdrawal needs admin approval and public proof. And donors
> can reclaim their money if a campaign is cancelled.
>
> The blockchain here isn't decorative — it enforces a rule that no database
> administrator could quietly override. Thank you."

---

## 4. Simple Explanations (Use These If Asked)

Keep these to one or two sentences each.

| Question | Simple answer |
|---|---|
| **What is a blockchain?** | A shared database that no single person controls. Data is grouped into blocks, each block is linked to the previous one by a hash, so changing an old record breaks the whole chain — so nobody can quietly edit history. |
| **What is a smart contract?** | A program that lives on the blockchain and automatically enforces rules. Here it's written in Solidity and it holds the donated money and decides when it can be released. |
| **Why not just use a normal database?** | A database has an admin who can change the records. A blockchain makes every entry public and permanent, and puts the *rules* in code — so even the admin can't bypass them. |
| **Why escrow?** | So the charity never holds the money. The contract holds it, and it can only be released when the approval rules are met. |
| **What makes this "transparent"?** | Every donation, every withdrawal, every reason and every proof link is a public on-chain record. A donor can verify it independently at any time. |
| **What makes it "genuine"?** | Two hard constraints: money can't leave without admin approval, and it can't leave without a proof link. Plus donors get refunds if a campaign is cancelled. |
| **Why Ethereum?** | It's the most widely used blockchain with the best tooling and libraries. My contract is standard Solidity, so it can deploy to Ethereum, Polygon, or a testnet with almost no changes. |
| **Why Solidity?** | It's the native language of the EVM — Ethereum, Polygon, BSC all run it. It's statically typed, so many bugs are caught at compile time. |
| **What is gas?** | The small fee the network charges to store a transaction. It's paid by the sender and it makes spam expensive. On our local test chain it's free. |
| **Can a donation be deleted?** | No. Every function is `append-only` — donations can only be added. The only thing that changes is a `refunded` flag, and the original record stays. |
| **What is reentrancy?** | An attack where a malicious recipient re-enters a function before its state is updated, to withdraw money twice. I prevent it by updating the balance *before* sending the transfer (checks-effects-interactions). |
| **How did you test it?** | 28 automated tests using Hardhat + Mocha + Chai, covering every access-control rule and the full donation→withdrawal→refund lifecycle. I also wrote a headless-DOM test that loads the real webpage against a live chain and donates through the actual UI buttons — 25 checks. |
| **What does the admin do?** | Approves or rejects withdrawal requests, and registers which wallets are genuine charity organisations. The admin *cannot* move money directly or edit records. |
| **How much did this cost?** | The contract deployment on a real network would cost gas — a few dollars for a contract this size. The frontend is plain HTML and JavaScript with no hosting cost. |
| **Is it really decentralized if there's an admin?** | Honestly, no — not fully. That's a deliberate limitation I list in my report. The production fix is a multi-signature wallet or a DAO vote, so no single person can approve. The *records* are already decentralized; it's the approval authority that isn't. |

---

## 5. Likely Examiner Questions & Answers

**Q: What if the admin is corrupt and approves a fake charity?**
> "That's a real limitation. The protection I built is that the admin can't move money
> silently — every withdrawal is published with a reason and proof link, so donors and
> journalists can audit it after the fact. But an admin *could* approve a bad request.
> The fix is a multi-sig: instead of one admin, require e.g. 3 of 5 independent
> approvers, so one corrupt person isn't enough. Or a DAO where token holders vote.
> That's the first thing I'd build next."

**Q: Anyone can upload a fake proof URL, so what's the point?**
> "Right now the URL is stored immutably but its contents aren't verified — I listed
> this as a limitation. The proper fix is to hash the actual receipt document and store
> the document on IPFS, so the receipt is pinned and tamper-proof, and a reviewer
> attests that it matches the amount. The proof is a starting point for auditability
> rather than automatic verification."

**Q: Why store the title and description on-chain? That's expensive.**
> "It was a mini project, so I kept it self-contained and avoided a separate database
> — everything works from one contract with no server. For production I'd move the text
> to IPFS and keep only the hash on-chain, which is much cheaper."

**Q: How is this different from a normal database app?**
> "Functionally it looks similar. The difference is *who can change what*. In a
> database, one admin can edit a donation record. Here, the contract is the admin —
> and the rules are 'append only' plus 'no withdrawal without approval and proof'.
> The database version would have those same rules written in application code, which
> means the company behind it can change that code. On-chain, changing the rules means
> deploying a new contract, and users can see that happened."

**Q: What's the scalability limit?**
> "Every donation is a transaction, so throughput and cost are limited by the chain.
> For a charity with thousands of donations that's fine on a normal chain. For a
> country-wide system I'd use a Layer 2 like Polygon, where transactions cost
> fractions of a cent."

**Q: What happens if the website goes down?**
> "Nothing is lost. The contract keeps running and the money stays safe. Someone could
> deploy a new frontend that talks to the same contract — the data and the rules live
> on-chain, not on the server. That's a real advantage of decentralised apps."

**Q: How do you prevent the same campaign from claiming money twice?**
> "Every withdrawal tracks `spentAmount` on the campaign, and a request can never be
> more than `raisedAmount - spentAmount`. The contract checks that, and it updates
> `spentAmount` before transferring the money. So the total withdrawn can never exceed
> what was raised."

**Q: Why does the beneficiary matter — who actually receives the money?**
> "The beneficiary address is fixed when the charity creates the campaign, and it's
> visible on the campaign card. The contract always sends the funds to that exact
> address — the charity can't redirect it at withdrawal time."

---

## 6. If You Need MetaMask After All

1. Open `demo-node.log` in the project folder — it has all 20 accounts with private keys.
2. Copy the private key for the account you want.
3. In MetaMask → **Import account** → paste the private key.
4. MetaMask → network dropdown → **Add network**:
   - Network name: `Localhost`
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `31337`
   - Currency symbol: `ETH`
5. Copy the deployed contract address from `frontend/config.json` → **Import token** →
   paste the address, symbol `GIVETRACE`, decimals `18`.

**The one thing that always breaks:** if MetaMask is on the wrong network, the app
shows zero campaigns. Check the network dropdown says `Localhost`.

**Note:** when MetaMask *is* installed, the "Acting as" dropdown is hidden — MetaMask
provides the account. To still show the role separation, import a different account
into MetaMask when you need to switch roles (the private keys are in
`demo-node.log`).

---

## 7. If Something Breaks

| Problem | Fix |
|---|---|
| `npm start` says port 8545 is in use | It kills the old process automatically. If it still fails, close other terminals running `npm run node`. |
| Page is blank / no campaigns | The contract address in `frontend/config.json` doesn't match the running node. Re-run `npm start`. |
| "Connect Wallet" does nothing | Make sure the `npm start` terminal is still open — the blockchain dies with it. |
| Browser cached old files | Press **Ctrl+F5** (hard refresh). |
| Want a clean slate | Just run `npm start` again — it redeploys a fresh contract every time. |
| Want to show the flow as a script | `npm run demo` — prints the whole donate→approve→execute flow. |
| Want to show the tests | `npm test` — 28 passing tests. |
| Want to show the UI test | `npm run verify:ui` — 25 checks against the live chain. |

---

## 8. Quick Facts to Quote

| | |
|---|---|
| Contract | `contracts/Charity.sol` — Solidity 0.8.24, 671 lines |
| Functions | 30 written (37 in the ABI, incl. auto-generated getters) |
| Read-only functions | 22 — anyone can query the ledger without paying gas |
| Events | 14 |
| Unit tests | 28 passing |
| UI tests | 25 checks passing |
| Frontend | Plain HTML/CSS/JS + ethers.js v6 — no build step, no framework |
| Contract address | `0x5FbDB2315678afecb367f032d93F642f64180aa3` (redeploys each run) |
| Admin | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| Charity org | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| Donor | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` |

---

## 9. The 60-Second Short Version

If the examiner says *"just show me it working"* and you have no time:

1. `npm start` → browser opens
2. **Connect Wallet** → dropdown → pick a **Donor** → **Donate** tab → donate `0.5` ETH
3. **Public Ledger** tab → *"Every donation, every payout with proof. Permanent and public."*
4. **Withdrawals** tab → dropdown → switch to **Charity Org** → request `0.2` with a
   proof link → status **Pending**
5. Second terminal → `npm run demo` → shows *"correctly blocked: not approved"*
6. *"The blockchain refused to release the money without approval. That's the whole project."*
7. Back in the browser → dropdown → switch to **Admin** → **Approve** → **Execute**
8. **Public Ledger** → the payout now appears with its proof. *"And here's where it went."*
