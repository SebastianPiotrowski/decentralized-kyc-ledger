const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("KYCLedger Enterprise Suite", function () {
  let KYCLedger;
  let kycLedger;
  let owner;
  let authorizedBank;
  let unauthorizedNode;

  // Predictable, robust test data structured as bytes32 primitives
  const customerId = ethers.encodeBytes32String("customer_9482019");
  const identityHash = ethers.encodeBytes32String("aws_s3_encrypted_payload_hash");
  const wrongIdentityHash = ethers.encodeBytes32String("malicious_payload_hash");

  beforeEach(async function () {
    // Retrieve signers for infrastructure nodes
    [owner, authorizedBank, unauthorizedNode] = await ethers.getSigners();

    // Deploy the high-integrity contract
    KYCLedger = await ethers.getContractFactory("KYCLedger");
    kycLedger = await KYCLedger.deploy();
    await kycLedger.waitForDeployment();

    // Provision validator permissions to the Tier-1 institutional node
    await kycLedger.setValidatorStatus(authorizedBank.address, true);
  });

  describe("Deployment & Governance Setup", function () {
    it("Should set the deploying account as the governance owner", async function () {
      expect(await kycLedger.governanceOwner()).to.equal(owner.address);
    });

    it("Should automatically authorize the governance owner as an initial validator", async function () {
      expect(await kycLedger.authorizedValidators(owner.address)).to.be.true;
    });
  });

  describe("KYC Operations & Gas Optimization Validation", function () {
    it("Should allow authorized bank to record a KYC proof", async function () {
      // Execute the on-chain cryptographic anchoring
      await kycLedger.connect(authorizedBank).recordKYC(customerId, identityHash);

      // Extract the structured audit trail from the registry
      const auditTrail = await kycLedger.getAuditTrail(customerId);

      // Verify strict data alignment and state persistence
      expect(auditTrail.customerId).to.equal(customerId);
      expect(auditTrail.identityHash).to.equal(identityHash); // Fixed Assertion Loop
      expect(auditTrail.validatingBank).to.equal(authorizedBank.address);
      expect(auditTrail.isValid).to.be.true;
    });

    it("Should emit a KYCVerified event upon successful anchoring", async function () {
      await expect(kycLedger.connect(authorizedBank).recordKYC(customerId, identityHash))
        .to.emit(kycLedger, "KYCVerified")
        .withArgs(customerId, authorizedBank.address, identityHash);
    });

    it("Should strictly reject record submissions from unauthorized infrastructure nodes", async function () {
      await expect(
        kycLedger.connect(unauthorizedNode).recordKYC(customerId, identityHash)
      ).to.be.revertedWith("Governance: Caller is not an authorized validator");
    });

    it("Should allow a validator to revoke a KYC record and update system state", async function () {
      await kycLedger.connect(authorizedBank).recordKYC(customerId, identityHash);
      
      await kycLedger.connect(authorizedBank).revokeKYC(customerId);
      
      const auditTrail = await kycLedger.getAuditTrail(customerId);
      expect(auditTrail.isValid).to.be.false;
    });

    it("Should reject revocation requests for records that are already inactive", async function () {
      await kycLedger.connect(authorizedBank).recordKYC(customerId, identityHash);
      await kycLedger.connect(authorizedBank).revokeKYC(customerId);

      await expect(
        kycLedger.connect(authorizedBank).revokeKYC(customerId)
      ).to.be.revertedWith("Data: Profile already inactive or non-existent");
    });
  });
});