/* End-to-end demo against the running local node.
   Simulates: donate -> milestone -> request withdrawal -> admin approve -> execute -> ledger.
   Run: npx hardhat run scripts/demo.js --network localhost */
const { ethers } = require("hardhat");

const fmt = (v) => (Number(v) / 1e18).toFixed(4) + " ETH";

async function main() {
  const [admin, ngo, donor, beneficiary] = await ethers.getSigners();

  const addr = require("../frontend/config.json").address;
  const abi = require("../frontend/abi.json");
  const charity = await ethers.getContractAt("Charity", addr);

  console.log("=== GiveTrace end-to-end demo ===\n");
  console.log("Contract:", addr);

  // 1. A donor donates to campaign 0
  console.log("\n[1] Donor donates 1.5 ETH to campaign 0");
  await (await charity.connect(donor).donate(0, "Get well soon", { value: ethers.parseEther("1.5") })).wait();
  let c = await charity.getCampaign(0);
  console.log("    raised:", fmt(c.raisedAmount), "of goal", fmt(c.goalAmount));

  // 2. Charity posts a milestone with evidence
  console.log("\n[2] Charity posts milestone with evidence link");
  await (
    await charity
      .connect(ngo)
      .postMilestone(0, "Distributed 300 food packets", "https://example.org/photo1.jpg")
  ).wait();
  const m = await charity.getMilestone(0);
  console.log("    milestone:", m.description, "->", m.proofUrl);

  // 3. Charity requests a withdrawal
  console.log("\n[3] Charity requests withdrawal of 0.8 ETH (needs admin approval)");
  // staticCall returns the new request id without changing state.
  const reqId = await charity
    .connect(ngo)
    .requestWithdrawal.staticCall(
      0,
      ethers.parseEther("0.8"),
      "Purchased relief material",
      "https://example.org/invoice.pdf"
    );
  await (
    await charity
      .connect(ngo)
      .requestWithdrawal(0, ethers.parseEther("0.8"), "Purchased relief material", "https://example.org/invoice.pdf")
  ).wait();
  let r = await charity.getRequest(reqId);
  console.log("    request id:", reqId.toString(), "status:", Number(r.status), "(1 = Pending)");

  // 4. Try to execute WITHOUT approval -> must fail
  console.log("\n[4] Attempting execution before approval (must fail)");
  try {
    await charity.connect(ngo).executeWithdrawal(reqId);
    console.log("    !! ERROR: should have been blocked");
  } catch (e) {
    console.log("    correctly blocked:", e.shortMessage || e.message);
  }

  // 5. Admin approves, then charity executes
  console.log("\n[5] Admin approves, charity executes");
  await (await charity.connect(admin).approveWithdrawal(reqId)).wait();
  // The payout goes to the campaign's beneficiary, whoever that is.
  const benAddr = (await charity.getCampaign(0)).beneficiary;
  console.log("    campaign beneficiary:", benAddr);
  const before = await ethers.provider.getBalance(benAddr);
  await (await charity.connect(ngo).executeWithdrawal(reqId)).wait();
  const after = await ethers.provider.getBalance(benAddr);
  r = await charity.getRequest(reqId);
  console.log("    request status:", Number(r.status), "(4 = Executed)");
  console.log("    beneficiary received:", fmt(after - before));

  // 6. Transparency report
  console.log("\n[6] Transparency report for campaign 0");
  const rep = await charity.transparencyReport(0);
  console.log("    raised:      ", fmt(rep.raisedAmount));
  console.log("    spent:       ", fmt(rep.spentAmount));
  console.log("    in escrow:   ", fmt(rep.availableAmount));
  console.log("    % of goal:   ", rep.percentRaised.toString() + "%");
  console.log("    donations:   ", rep.donationCount.toString());

  // 7. Public ledger
  console.log("\n[7] Public ledger");
  const [ids] = await charity.withdrawalsMade();
  for (const id of ids) {
    const wr = await charity.getRequest(id);
    console.log(`    withdrawal #${id}: ${fmt(wr.amount)} - ${wr.reason} - proof: ${wr.proofUrl}`);
  }
  console.log("    escrow balance in contract:", fmt(await charity.escrowBalance()));
  console.log("\n=== demo complete ===");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
