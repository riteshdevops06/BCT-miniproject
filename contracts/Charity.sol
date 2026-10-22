// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Charity
 * @notice A transparent charity ledger on Ethereum. Every rupee donated is
 *         recorded on-chain, and money can only leave a campaign after an
 *         admin-approved withdrawal request that carries public proof
 *         (bill / receipt / photo hash) so donors can verify it.
 */
contract Charity {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    enum CampaignStatus {
        Active,
        Completed,
        Cancelled
    }

    enum RequestStatus {
        None,
        Pending,
        Approved,
        Rejected,
        Executed
    }

    struct Campaign {
        uint256 id;
        address owner; // charity organisation that created it
        string title;
        string description;
        string cause; // "Flood Relief", "Education" ...
        uint256 goalAmount;
        uint256 raisedAmount;
        uint256 spentAmount;
        address beneficiary; // where approved funds are sent
        CampaignStatus status;
        uint256 createdAt;
        uint256[] donationIds;
        uint256[] requestIds;
    }

    struct Donation {
        uint256 id;
        uint256 campaignId;
        address donor;
        uint256 amount;
        uint256 timestamp;
        string message; // donor's wish / note
        bool refunded;
    }

    struct WithdrawalRequest {
        uint256 id;
        uint256 campaignId;
        address requester;
        uint256 amount;
        string reason; // purpose of the withdrawal
        string proofUrl; // receipt / bill / image link proving the spend
        RequestStatus status;
        uint256 createdAt;
        uint256 decidedAt;
    }

    struct Milestone {
        uint256 id;
        uint256 campaignId;
        string description;
        string proofUrl;
        uint256 timestamp;
    }

    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------

    address public admin; // platform owner: approves NGOs and withdrawals
    bool public paused;

    address[] public charityOrgs;
    mapping(address => bool) public isCharityOrg;

    Campaign[] private campaigns;
    Donation[] private donations;
    WithdrawalRequest[] private requests;
    Milestone[] private milestones;

    uint256 public milestoneCount;

    uint256 public totalDonated;
    uint256 public totalWithdrawn;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event AdminChanged(address indexed previousAdmin, address indexed newAdmin);
    event CharityOrgAdded(address indexed org);
    event CharityOrgRemoved(address indexed org);
    event CampaignCreated(
        uint256 indexed id,
        address indexed owner,
        string title,
        uint256 goalAmount
    );
    event Donated(
        uint256 indexed donationId,
        uint256 indexed campaignId,
        address indexed donor,
        uint256 amount
    );
    event MilestonePosted(
        uint256 indexed milestoneId,
        uint256 indexed campaignId,
        string proofUrl
    );
    event WithdrawalRequested(
        uint256 indexed requestId,
        uint256 indexed campaignId,
        address indexed requester,
        uint256 amount
    );
    event WithdrawalApproved(uint256 indexed requestId);
    event WithdrawalRejected(uint256 indexed requestId, string reason);
    event WithdrawalExecuted(
        uint256 indexed requestId,
        uint256 indexed campaignId,
        address indexed beneficiary,
        uint256 amount
    );
    event CampaignCompleted(uint256 indexed campaignId);
    event CampaignCancelled(uint256 indexed campaignId);
    event Refunded(
        uint256 indexed donationId,
        address indexed donor,
        uint256 amount
    );
    event Paused(bool isPaused);

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    modifier onlyAdmin() {
        require(msg.sender == admin, "Charity: not admin");
        _;
    }

    modifier onlyCharityOrg() {
        require(isCharityOrg[msg.sender], "Charity: not a registered charity");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Charity: paused");
        _;
    }

    modifier campaignExists(uint256 campaignId) {
        require(
            campaignId < campaigns.length && campaigns[campaignId].id == campaignId,
            "Charity: campaign does not exist"
        );
        _;
    }

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor() {
        admin = msg.sender;
        emit AdminChanged(address(0), msg.sender);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Charity: zero address");
        emit AdminChanged(admin, newAdmin);
        admin = newAdmin;
    }

    function setPaused(bool value) external onlyAdmin {
        paused = value;
        emit Paused(value);
    }

    function addCharityOrg(address org) external onlyAdmin {
        require(org != address(0), "Charity: zero address");
        require(!isCharityOrg[org], "Charity: already registered");
        isCharityOrg[org] = true;
        charityOrgs.push(org);
        emit CharityOrgAdded(org);
    }

    function removeCharityOrg(address org) external onlyAdmin {
        require(isCharityOrg[org], "Charity: not registered");
        isCharityOrg[org] = false;
        emit CharityOrgRemoved(org);
    }

    function charityOrgCount() external view returns (uint256) {
        return charityOrgs.length;
    }

    function charityOrgAt(uint256 index) external view returns (address) {
        require(index < charityOrgs.length, "Charity: index out of range");
        return charityOrgs[index];
    }

    // ---------------------------------------------------------------------
    // Campaigns
    // ---------------------------------------------------------------------

    function createCampaign(
        string calldata title,
        string calldata description,
        string calldata cause,
        uint256 goalAmount,
        address beneficiary
    ) external onlyCharityOrg whenNotPaused returns (uint256 id) {
        require(bytes(title).length > 0, "Charity: empty title");
        require(goalAmount > 0, "Charity: goal must be > 0");
        require(beneficiary != address(0), "Charity: zero beneficiary");

        id = campaigns.length;
        campaigns.push(
            Campaign({
                id: id,
                owner: msg.sender,
                title: title,
                description: description,
                cause: cause,
                goalAmount: goalAmount,
                raisedAmount: 0,
                spentAmount: 0,
                beneficiary: beneficiary,
                status: CampaignStatus.Active,
                createdAt: block.timestamp,
                donationIds: new uint256[](0),
                requestIds: new uint256[](0)
            })
        );
        emit CampaignCreated(id, msg.sender, title, goalAmount);
    }

    function completeCampaign(uint256 campaignId) external {
        require(campaignId < campaigns.length, "Charity: campaign does not exist");
        Campaign storage c = campaigns[campaignId];
        require(c.owner == msg.sender || msg.sender == admin, "Charity: not allowed");
        require(c.status == CampaignStatus.Active, "Charity: not active");
        c.status = CampaignStatus.Completed;
        emit CampaignCompleted(campaignId);
    }

    /// @notice Cancel a campaign. Donors can then reclaim their money.
    function cancelCampaign(uint256 campaignId) external {
        require(campaignId < campaigns.length, "Charity: campaign does not exist");
        Campaign storage c = campaigns[campaignId];
        require(c.owner == msg.sender || msg.sender == admin, "Charity: not allowed");
        require(c.status == CampaignStatus.Active, "Charity: not active");
        c.status = CampaignStatus.Cancelled;
        emit CampaignCancelled(campaignId);
    }

    // ---------------------------------------------------------------------
    // Donations
    // ---------------------------------------------------------------------

    function donate(
        uint256 campaignId,
        string calldata message
    ) external payable whenNotPaused campaignExists(campaignId) {
        Campaign storage c = campaigns[campaignId];
        require(c.status == CampaignStatus.Active, "Charity: campaign not active");
        require(msg.value > 0, "Charity: zero donation");

        uint256 id = donations.length;
        donations.push(
            Donation({
                id: id,
                campaignId: campaignId,
                donor: msg.sender,
                amount: msg.value,
                timestamp: block.timestamp,
                message: message,
                refunded: false
            })
        );
        c.donationIds.push(id);
        c.raisedAmount += msg.value;
        totalDonated += msg.value;

        emit Donated(id, campaignId, msg.sender, msg.value);
    }

    /// @notice Reclaim a donation if the campaign was cancelled.
    function claimRefund(uint256 donationId) external {
        require(donationId < donations.length, "Charity: donation does not exist");
        Donation storage d = donations[donationId];
        require(d.donor == msg.sender, "Charity: not your donation");
        require(!d.refunded, "Charity: already refunded");
        require(
            campaigns[d.campaignId].status == CampaignStatus.Cancelled,
            "Charity: campaign not cancelled"
        );

        d.refunded = true;
        campaigns[d.campaignId].raisedAmount -= d.amount;
        totalDonated -= d.amount;

        (bool ok, ) = msg.sender.call{value: d.amount}("");
        require(ok, "Charity: refund failed");
        emit Refunded(donationId, msg.sender, d.amount);
    }

    // ---------------------------------------------------------------------
    // Milestones (progress reporting with evidence)
    // ---------------------------------------------------------------------

    function postMilestone(
        uint256 campaignId,
        string calldata description,
        string calldata proofUrl
    ) external campaignExists(campaignId) {
        Campaign storage c = campaigns[campaignId];
        require(c.owner == msg.sender, "Charity: not campaign owner");
        require(c.status == CampaignStatus.Active, "Charity: not active");

        uint256 id = milestones.length;
        milestones.push(
            Milestone({
                id: id,
                campaignId: campaignId,
                description: description,
                proofUrl: proofUrl,
                timestamp: block.timestamp
            })
        );
        milestoneCount = id + 1;

        emit MilestonePosted(id, campaignId, proofUrl);
    }

    // ---------------------------------------------------------------------
    // Withdrawals  (the core anti-fraud mechanism)
    // ---------------------------------------------------------------------

    /// @notice A charity org asks to move raised money to its beneficiary.
    ///         Funds stay locked until an admin approves AND a proof link
    ///         is supplied, so donors can always check where money went.
    function requestWithdrawal(
        uint256 campaignId,
        uint256 amount,
        string calldata reason,
        string calldata proofUrl
    ) external campaignExists(campaignId) returns (uint256 id) {
        Campaign storage c = campaigns[campaignId];
        require(c.owner == msg.sender, "Charity: not campaign owner");
        require(c.status == CampaignStatus.Active, "Charity: not active");
        require(amount > 0, "Charity: zero amount");
        require(
            amount <= c.raisedAmount - c.spentAmount,
            "Charity: amount exceeds available funds"
        );
        require(bytes(reason).length > 0, "Charity: empty reason");

        id = requests.length;
        requests.push(
            WithdrawalRequest({
                id: id,
                campaignId: campaignId,
                requester: msg.sender,
                amount: amount,
                reason: reason,
                proofUrl: proofUrl,
                status: RequestStatus.Pending,
                createdAt: block.timestamp,
                decidedAt: 0
            })
        );
        c.requestIds.push(id);

        emit WithdrawalRequested(id, campaignId, msg.sender, amount);
    }

    function approveWithdrawal(uint256 requestId) external onlyAdmin {
        require(requestId < requests.length, "Charity: request does not exist");
        WithdrawalRequest storage r = requests[requestId];
        require(r.status == RequestStatus.Pending, "Charity: not pending");
        r.status = RequestStatus.Approved;
        r.decidedAt = block.timestamp;
        emit WithdrawalApproved(requestId);
    }

    function rejectWithdrawal(
        uint256 requestId,
        string calldata reason
    ) external onlyAdmin {
        require(requestId < requests.length, "Charity: request does not exist");
        WithdrawalRequest storage r = requests[requestId];
        require(r.status == RequestStatus.Pending, "Charity: not pending");
        r.status = RequestStatus.Rejected;
        r.decidedAt = block.timestamp;
        emit WithdrawalRejected(requestId, reason);
    }

    /// @notice Execute an approved withdrawal. The proof link is mandatory:
    ///         without public evidence of the spend, the money cannot move.
    function executeWithdrawal(uint256 requestId) external {
        require(requestId < requests.length, "Charity: request does not exist");
        WithdrawalRequest storage r = requests[requestId];
        require(r.status == RequestStatus.Approved, "Charity: not approved");
        require(bytes(r.proofUrl).length > 0, "Charity: proof required");
        require(r.requester == msg.sender || msg.sender == admin, "Charity: not allowed");

        Campaign storage c = campaigns[r.campaignId];
        require(
            r.amount <= c.raisedAmount - c.spentAmount,
            "Charity: insufficient campaign funds"
        );

        r.status = RequestStatus.Executed;
        c.spentAmount += r.amount;
        totalWithdrawn += r.amount;

        (bool ok, ) = c.beneficiary.call{value: r.amount}("");
        require(ok, "Charity: transfer failed");

        emit WithdrawalExecuted(requestId, r.campaignId, c.beneficiary, r.amount);
    }

    /// @notice Attach proof to a pending request (charity uploads the bill).
    function attachProof(uint256 requestId, string calldata proofUrl) external {
        require(requestId < requests.length, "Charity: request does not exist");
        WithdrawalRequest storage r = requests[requestId];
        require(r.requester == msg.sender, "Charity: not requester");
        require(
            r.status == RequestStatus.Pending || r.status == RequestStatus.Approved,
            "Charity: request closed"
        );
        require(bytes(proofUrl).length > 0, "Charity: empty proof");
        r.proofUrl = proofUrl;
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getCampaign(uint256 campaignId)
        external
        view
        returns (
            uint256 id,
            address owner,
            string memory title,
            string memory description,
            string memory cause,
            uint256 goalAmount,
            uint256 raisedAmount,
            uint256 spentAmount,
            address beneficiary,
            CampaignStatus status,
            uint256 createdAt
        )
    {
        Campaign storage c = campaigns[campaignId];
        return (
            c.id,
            c.owner,
            c.title,
            c.description,
            c.cause,
            c.goalAmount,
            c.raisedAmount,
            c.spentAmount,
            c.beneficiary,
            c.status,
            c.createdAt
        );
    }

    function getDonation(uint256 donationId)
        external
        view
        returns (
            uint256 id,
            uint256 campaignId,
            address donor,
            uint256 amount,
            uint256 timestamp,
            string memory message,
            bool refunded
        )
    {
        Donation storage d = donations[donationId];
        return (
            d.id,
            d.campaignId,
            d.donor,
            d.amount,
            d.timestamp,
            d.message,
            d.refunded
        );
    }

    function getRequest(uint256 requestId)
        external
        view
        returns (
            uint256 id,
            uint256 campaignId,
            address requester,
            uint256 amount,
            string memory reason,
            string memory proofUrl,
            RequestStatus status,
            uint256 createdAt,
            uint256 decidedAt
        )
    {
        WithdrawalRequest storage r = requests[requestId];
        return (
            r.id,
            r.campaignId,
            r.requester,
            r.amount,
            r.reason,
            r.proofUrl,
            r.status,
            r.createdAt,
            r.decidedAt
        );
    }

    function getMilestone(uint256 milestoneId)
        external
        view
        returns (
            uint256 id,
            uint256 campaignId,
            string memory description,
            string memory proofUrl,
            uint256 timestamp
        )
    {
        Milestone storage m = milestones[milestoneId];
        return (m.id, m.campaignId, m.description, m.proofUrl, m.timestamp);
    }

    function campaignDonationIds(uint256 campaignId)
        external
        view
        returns (uint256[] memory)
    {
        require(campaignId < campaigns.length, "Charity: campaign does not exist");
        return campaigns[campaignId].donationIds;
    }

    function campaignRequestIds(uint256 campaignId)
        external
        view
        returns (uint256[] memory)
    {
        require(campaignId < campaigns.length, "Charity: campaign does not exist");
        return campaigns[campaignId].requestIds;
    }

    function campaignMilestoneIds(uint256 campaignId)
        external
        view
        returns (uint256[] memory)
    {
        require(campaignId < campaigns.length, "Charity: campaign does not exist");
        uint256[] memory out = new uint256[](milestoneCount);
        uint256 n = 0;
        for (uint256 i = 0; i < milestones.length; i++) {
            if (milestones[i].campaignId == campaignId) {
                out[n] = milestones[i].id;
                n++;
            }
        }
        uint256[] memory trimmed = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            trimmed[i] = out[i];
        }
        return trimmed;
    }

    /// @notice Public transparency report: money in vs money out.
    function transparencyReport(uint256 campaignId)
        external
        view
        campaignExists(campaignId)
        returns (
            uint256 raisedAmount,
            uint256 spentAmount,
            uint256 availableAmount,
            uint256 goalAmount,
            uint256 percentRaised,
            uint256 donationCount,
            uint256 requestCount
        )
    {
        Campaign storage c = campaigns[campaignId];
        availableAmount = c.raisedAmount - c.spentAmount;
        percentRaised =
            c.goalAmount == 0
                ? 0
                : (c.raisedAmount * 100) / c.goalAmount;
        return (
            c.raisedAmount,
            c.spentAmount,
            availableAmount,
            c.goalAmount,
            percentRaised,
            c.donationIds.length,
            c.requestIds.length
        );
    }

    /// @notice All money that left the contract, for the public ledger.
    function withdrawalsMade()
        external
        view
        returns (uint256[] memory ids, uint256[] memory amounts)
    {
        uint256 n = 0;
        for (uint256 i = 0; i < requests.length; i++) {
            if (requests[i].status == RequestStatus.Executed) n++;
        }
        ids = new uint256[](n);
        amounts = new uint256[](n);
        uint256 k = 0;
        for (uint256 i = 0; i < requests.length; i++) {
            if (requests[i].status == RequestStatus.Executed) {
                ids[k] = requests[i].id;
                amounts[k] = requests[i].amount;
                k++;
            }
        }
    }

    function totalCampaigns() external view returns (uint256) {
        return campaigns.length;
    }

    function totalDonations() external view returns (uint256) {
        return donations.length;
    }

    function totalRequests() external view returns (uint256) {
        return requests.length;
    }

    /// @notice Address holding the pooled donations (escrow).
    function escrowBalance() external view returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {
        revert("Charity: use donate()");
    }
}
