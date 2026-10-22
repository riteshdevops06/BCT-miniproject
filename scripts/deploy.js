const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [admin, ngo1, ngo2] = await ethers.getSigners();

  console.log("Deploying Charity contract...");
  const Charity = await ethers.getContractFactory("Charity");
  const charity = await Charity.deploy();
  await charity.waitForDeployment();

  const address = await charity.getAddress();
  console.log("Charity deployed at:", address);
  console.log("Admin:", admin.address);

  // Register two demo charity organisations so the demo data is usable.
  console.log("Registering demo charity orgs...");
  await (await charity.addCharityOrg(ngo1.address)).wait();
  await (await charity.addCharityOrg(ngo2.address)).wait();
  console.log("  org1:", ngo1.address);
  console.log("  org2:", ngo2.address);

  // Seed one demo campaign so the UI is not empty on first load.
  await (
    await charity
      .connect(ngo1)
      .createCampaign(
        "Flood Relief 2026",
        "Providing food, drinking water and shelter kits to families affected by the recent floods.",
        "Disaster Relief",
        ethers.parseEther("10"),
        ngo1.address
      )
  ).wait();
  await (
    await charity
      .connect(ngo2)
      .createCampaign(
        "Education for Rural Kids",
        "Sponsor school supplies, books and digital tablets for 100 students in rural villages.",
        "Education",
        ethers.parseEther("20"),
        ngo2.address
      )
  ).wait();
  console.log("Seeded 2 demo campaigns.");

  // Export ABI + address for the plain-HTML frontend.
  const artifact = await hre.artifacts.readArtifact("Charity");
  const outDir = path.join(__dirname, "..", "frontend");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "abi.json"),
    JSON.stringify(artifact.abi, null, 2)
  );
  fs.writeFileSync(
    path.join(outDir, "config.json"),
    JSON.stringify(
      {
        address,
        chainId: 31337,
        rpcUrl: "http://127.0.0.1:8545",
        admin: admin.address,
        charityOrgs: [ngo1.address, ngo2.address],
      },
      null,
      2
    )
  );
  console.log("ABI + address written to frontend/abi.json and frontend/config.json");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
