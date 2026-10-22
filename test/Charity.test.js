const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Charity", function () {
  let charity;
  let admin, ngo, donor, beneficiary, stranger;

  const GOAL = ethers.parseEther("10");
  const DONATION = ethers.parseEther("2");

  beforeEach(async function () {
    [admin, ngo, donor, beneficiary, stranger] = await ethers.getSigners();
    const Charity = await ethers.getContractFactory("Charity");
    charity = await Charity.deploy();
    await charity.waitForDeployment();
    await charity.addCharityOrg(ngo.address);
  });

  describe("Deployment & access control", function () {
    it("sets the deployer as admin", async function () {
      expect(await charity.admin()).to.equal(admin.address);
    });

    it("lets admin register and remove charity orgs", async function () {
      expect(await charity.isCharityOrg(ngo.address)).to.equal(true);
      expect(await charity.charityOrgCount()).to.equal(1);
      await charity.removeCharityOrg(ngo.address);
      expect(await charity.isCharityOrg(ngo.address)).to.equal(false);
    });

    it("blocks non-admin from registering orgs", async function () {
      await expect(
        charity.connect(stranger).addCharityOrg(stranger.address)
      ).to.be.revertedWith("Charity: not admin");
    });

    it("blocks unregistered addresses from creating campaigns", async function () {
      await expect(
        charity
          .connect(stranger)
          .createCampaign("Fake", "d", "cause", GOAL, beneficiary.address)
      ).to.be.revertedWith("Charity: not a registered charity");
    });
  });

  describe("Campaign creation", function () {
    it("lets a registered org create a campaign", async function () {
      await charity
        .connect(ngo)
        .createCampaign("Flood Relief", "Help flood victims", "Disaster", GOAL, beneficiary.address);

      const c = await charity.getCampaign(0);
      expect(c.owner).to.equal(ngo.address);
      expect(c.title).to.equal("Flood Relief");
      expect(c.raisedAmount).to.equal(0);
      expect(c.status).to.equal(0n); // Active
    });

    it("rejects a zero goal", async function () {
      await expect(
        charity
          .connect(ngo)
          .createCampaign("T", "d", "c", 0, beneficiary.address)
      ).to.be.revertedWith("Charity: goal must be > 0");
    });

    it("rejects a zero beneficiary", async function () {
      await expect(
        charity
          .connect(ngo)
          .createCampaign("T", "d", "c", GOAL, ethers.ZeroAddress)
      ).to.be.revertedWith("Charity: zero beneficiary");
    });
  });

  describe("Donations", function () {
    beforeEach(async function () {
      await charity
        .connect(ngo)
        .createCampaign("Flood Relief", "Help", "Disaster", GOAL, beneficiary.address);
    });

    it("records a donation on-chain", async function () {
      await charity.connect(donor).donate(0, "God bless", { value: DONATION });
      const d = await charity.getDonation(0);
      expect(d.donor).to.equal(donor.address);
      expect(d.amount).to.equal(DONATION);
      expect(d.message).to.equal("God bless");
      expect(d.refunded).to.equal(false);
    });

    it("increases raised amount and total donated", async function () {
      await charity.connect(donor).donate(0, "", { value: DONATION });
      await charity.connect(stranger).donate(0, "", { value: DONATION });
      const c = await charity.getCampaign(0);
      expect(c.raisedAmount).to.equal(DONATION * 2n);
      expect(await charity.totalDonated()).to.equal(DONATION * 2n);
    });

    it("rejects zero-value donations", async function () {
      await expect(
        charity.connect(donor).donate(0, "", { value: 0 })
      ).to.be.revertedWith("Charity: zero donation");
    });

    it("rejects donations to unknown campaigns", async function () {
      await expect(
        charity.connect(donor).donate(99, "", { value: DONATION })
      ).to.be.revertedWith("Charity: campaign does not exist");
    });
  });

  describe("Withdrawal approval flow (anti-fraud core)", function () {
    beforeEach(async function () {
      await charity
        .connect(ngo)
        .createCampaign("Flood Relief", "Help", "Disaster", GOAL, beneficiary.address);
      await charity.connect(donor).donate(0, "Support", { value: DONATION });
    });

    it("moves money to the beneficiary after approval", async function () {
      await charity
        .connect(ngo)
        .requestWithdrawal(0, DONATION, "Bought food packets", "https://proof/receipt1.pdf");

      const before = await ethers.provider.getBalance(beneficiary.address);
      await charity.connect(admin).approveWithdrawal(0);
      await charity.connect(ngo).executeWithdrawal(0);

      const after = await ethers.provider.getBalance(beneficiary.address);
      expect(after - before).to.equal(DONATION);
      expect((await charity.getRequest(0)).status).to.equal(4n); // Executed
      expect(await charity.totalWithdrawn()).to.equal(DONATION);
    });

    it("blocks execution before admin approval", async function () {
      await charity
        .connect(ngo)
        .requestWithdrawal(0, DONATION, "Food", "https://proof/r.pdf");
      await expect(
        charity.connect(ngo).executeWithdrawal(0)
      ).to.be.revertedWith("Charity: not approved");
    });

    it("blocks execution when no proof is attached", async function () {
      await charity
        .connect(ngo)
        .requestWithdrawal(0, DONATION, "Food", "https://proof/r.pdf");
      await charity.connect(admin).approveWithdrawal(0);
      // proof present in this test, so instead verify an empty-proof request fails
      await charity
        .connect(ngo)
        .requestWithdrawal(0, DONATION, "Food2", "");
      await charity.connect(admin).approveWithdrawal(1);
      await expect(
        charity.connect(ngo).executeWithdrawal(1)
      ).to.be.revertedWith("Charity: proof required");
    });

    it("lets admin reject a request", async function () {
      await charity
        .connect(ngo)
        .requestWithdrawal(0, DONATION, "Food", "https://proof/r.pdf");
      await charity.connect(admin).rejectWithdrawal(0, "Invoice looks wrong");
      expect((await charity.getRequest(0)).status).to.equal(3n); // Rejected
    });

    it("only the admin can approve", async function () {
      await charity
        .connect(ngo)
        .requestWithdrawal(0, DONATION, "Food", "https://proof/r.pdf");
      await expect(
        charity.connect(stranger).approveWithdrawal(0)
      ).to.be.revertedWith("Charity: not admin");
    });

    it("only the campaign owner can request a withdrawal", async function () {
      await expect(
        charity
          .connect(stranger)
          .requestWithdrawal(0, DONATION, "Food", "https://proof/r.pdf")
      ).to.be.revertedWith("Charity: not campaign owner");
    });

    it("rejects withdrawing more than was raised", async function () {
      await expect(
        charity
          .connect(ngo)
          .requestWithdrawal(0, ethers.parseEther("50"), "Too much", "https://p.pdf")
      ).to.be.revertedWith("Charity: amount exceeds available funds");
    });

    it("lets the requester attach proof later", async function () {
      await charity
        .connect(ngo)
        .requestWithdrawal(0, DONATION, "Food", "");
      await charity.connect(ngo).attachProof(0, "https://proof/late.pdf");
      expect((await charity.getRequest(0)).proofUrl).to.equal("https://proof/late.pdf");
    });
  });

  describe("Milestones", function () {
    beforeEach(async function () {
      await charity
        .connect(ngo)
        .createCampaign("Flood Relief", "Help", "Disaster", GOAL, beneficiary.address);
    });

    it("lets the campaign owner post a milestone with proof", async function () {
      await charity
        .connect(ngo)
        .postMilestone(0, "Distributed 100 food packets", "https://img/photo1.jpg");
      const m = await charity.getMilestone(0);
      expect(m.description).to.equal("Distributed 100 food packets");
      expect(m.proofUrl).to.equal("https://img/photo1.jpg");
    });

    it("blocks strangers from posting milestones", async function () {
      await expect(
        charity.connect(stranger).postMilestone(0, "fake", "https://x")
      ).to.be.revertedWith("Charity: not campaign owner");
    });
  });

  describe("Cancellation & refunds", function () {
    beforeEach(async function () {
      await charity
        .connect(ngo)
        .createCampaign("Flood Relief", "Help", "Disaster", GOAL, beneficiary.address);
      await charity.connect(donor).donate(0, "Support", { value: DONATION });
    });

    it("lets the owner cancel the campaign", async function () {
      await charity.connect(ngo).cancelCampaign(0);
      expect((await charity.getCampaign(0)).status).to.equal(2n); // Cancelled
    });

    it("refunds the donor on request", async function () {
      await charity.connect(ngo).cancelCampaign(0);
      const before = await ethers.provider.getBalance(donor.address);
      await charity.connect(donor).claimRefund(0);
      const after = await ethers.provider.getBalance(donor.address);
      expect(after).to.be.greaterThan(before);
      expect((await charity.getDonation(0)).refunded).to.equal(true);
    });

    it("blocks a double refund", async function () {
      await charity.connect(ngo).cancelCampaign(0);
      await charity.connect(donor).claimRefund(0);
      await expect(
        charity.connect(donor).claimRefund(0)
      ).to.be.revertedWith("Charity: already refunded");
    });

    it("blocks refunds on active campaigns", async function () {
      await expect(
        charity.connect(donor).claimRefund(0)
      ).to.be.revertedWith("Charity: campaign not cancelled");
    });

    it("blocks donations to a cancelled campaign", async function () {
      await charity.connect(ngo).cancelCampaign(0);
      await expect(
        charity.connect(stranger).donate(0, "", { value: DONATION })
      ).to.be.revertedWith("Charity: campaign not active");
    });
  });

  describe("Transparency report", function () {
    it("reports money in, money out and balance", async function () {
      await charity
        .connect(ngo)
        .createCampaign("Flood Relief", "Help", "Disaster", GOAL, beneficiary.address);
      await charity.connect(donor).donate(0, "", { value: DONATION });
      await charity
        .connect(ngo)
        .requestWithdrawal(0, DONATION, "Food", "https://p.pdf");
      await charity.connect(admin).approveWithdrawal(0);
      await charity.connect(ngo).executeWithdrawal(0);

      const r = await charity.transparencyReport(0);
      expect(r.raisedAmount).to.equal(DONATION);
      expect(r.spentAmount).to.equal(DONATION);
      expect(r.availableAmount).to.equal(0n);
      expect(r.percentRaised).to.equal(20n); // 2 of 10 ETH
      expect(r.donationCount).to.equal(1n);
    });

    it("keeps the escrow balance equal to raised minus spent", async function () {
      await charity
        .connect(ngo)
        .createCampaign("Flood Relief", "Help", "Disaster", GOAL, beneficiary.address);
      await charity.connect(donor).donate(0, "", { value: DONATION });
      expect(await charity.escrowBalance()).to.equal(DONATION);
    });
  });
});
