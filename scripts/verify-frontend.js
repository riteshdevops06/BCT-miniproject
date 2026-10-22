/* Verifies the assumptions the frontend makes about ethers v6 results,
   against the live contract. Run: npx hardhat run scripts/verify-frontend.js --network localhost */
const { ethers } = require("hardhat");

async function main() {
  const addr = require("../frontend/config.json").address;
  const abi = require("../frontend/abi.json");
  const charity = await ethers.getContractAt("Charity", addr);

  const c = await charity.getCampaign(0);
  const spread = { ...c, id: 0 };

  console.log("1) Named fields survive object spread (frontend relies on this):");
  console.log("   spread.title      =", JSON.stringify(spread.title));
  console.log("   spread.owner      =", spread.owner);
  console.log("   spread.goalAmount =", spread.goalAmount?.toString());
  console.log("   spread.status     =", spread.status?.toString());
  console.log("   ->", spread.title !== undefined && spread.owner !== undefined
    ? "PASS" : "FAIL (named fields are lost on spread)");

  console.log("\n2) multi-return function must be destructured:");
  const asTuple = await charity.withdrawalsMade();
  console.log("   withdrawalsMade() returned length =", asTuple.length);
  console.log("   asTuple[0] is array? =", Array.isArray(asTuple[0]));
  const [ids] = await charity.withdrawalsMade();
  console.log("   destructured ids    =", JSON.stringify(ids.map(String)));
  console.log("   ->", Array.isArray(asTuple[0]) ? "PASS (must use [ids])" : "FAIL");

  console.log("\n3) campaignCache lookup by BigInt id:");
  const cache = [];
  for (let i = 0; i < Number(await charity.totalCampaigns()); i++) {
    cache.push({ ...(await charity.getCampaign(i)), id: i });
  }
  const r0 = await charity.getRequest(0);
  const hit = cache[r0.campaignId];
  console.log("   cache[BigInt] resolves to:", hit ? hit.title : "undefined");
  console.log("   ->", hit ? "PASS" : "FAIL");

  console.log("\n4) status enum values match frontend labels:");
  console.log("   request[0].status =", Number(r0.status));
  const LABEL = { 0: "None", 1: "Pending", 2: "Approved", 3: "Rejected", 4: "Executed" };
  console.log("   label             =", LABEL[Number(r0.status)]);
  console.log("   ->", LABEL[Number(r0.status)] === "Executed" ? "PASS" : "FAIL");

  console.log("\n5) transparencyReport named fields:");
  const rep = await charity.transparencyReport(0);
  console.log("   raised =", rep.raisedAmount.toString(), " spent =", rep.spentAmount.toString());
  console.log("   ->", rep.raisedAmount !== undefined ? "PASS" : "FAIL");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
