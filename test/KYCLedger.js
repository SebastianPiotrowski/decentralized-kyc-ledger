const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("KYCLedger Enterprise Suite", function () {
  let KYCLedger;
  let kycLedger;
  let owner;
  let authorizedBank;
  let unauthorizedNode;
  let newOwner;

  // Predictable, robust test data structured as bytes32 primitives
  const customerId = ethers.encodeBytes32String("customer_9482019");
  const identityHash = ethers.encodeBytes32String("aws_s3_encrypted_payload_hash");

  beforeEach(async function () {
    // Retrieve signers for infrastructure nodes
    [owner, authorizedBank, unauthorizedNode, newOwner] = await ethers.getSigners();

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

  describe("Governance Owner Rotation", function () {
    it("Should allow the current governance owner to transfer ownership", async function () {
      await expect(kycLedger.connect(owner).transferGovernance(newOwner.address))
        .to.emit(kycLedger, "GovernanceTransferred")
        .withArgs(owner.address, newOwner.address);
      
      expect(await kycLedger.governanceOwner()).to.equal(newOwner.address);
    });

    it("Should strictly reject ownership transfer requests from unauthorized accounts", async function () {
      await expect(
        kycLedger.connect(unauthorizedNode).transferGovernance(newOwner.address)
      ).to.be.revertedWithCustomError(kycLedger, "Unauthorized");
    });

    it("Should reject ownership transfer to address(0)", async function () {
      await expect(
        kycLedger.connect(owner).transferGovernance(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(kycLedger, "InvalidGovernanceOwner");
    });
  });

  describe("KYC Operations & Gas Optimization Validation", function () {
    it("Should allow authorized bank to record a KYC proof", async function () {
      // Execute the on-chain cryptographic anchoring
      await kycLedger.connect(authorizedBank).recordKYC(customerId, identityHash);

      // Extract the structured audit trail from the registry
      const auditTrail = await kycLedger.getAuditTrail(customerId);

      // Verify strict data alignment and state persistence (customerId is removed for packing)
      expect(auditTrail.identityHash).to.equal(identityHash);
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
      ).to.be.revertedWithCustomError(kycLedger, "ValidatorOnly");
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
      ).to.be.revertedWithCustomError(kycLedger, "ProfileAlreadyInactiveOrNonExistent");
    });

    it("Should reject KYC recording if customer ID is empty (bytes32(0))", async function () {
      await expect(
        kycLedger.connect(authorizedBank).recordKYC(ethers.ZeroHash, identityHash)
      ).to.be.revertedWithCustomError(kycLedger, "InvalidCustomerAnchor");
    });

    it("Should reject KYC recording if identity hash is empty (bytes32(0))", async function () {
      await expect(
        kycLedger.connect(authorizedBank).recordKYC(customerId, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(kycLedger, "InvalidIdentityPayload");
    });

    it("Should successfully overwrite an existing KYC record", async function () {
      await kycLedger.connect(authorizedBank).recordKYC(customerId, identityHash);
      
      const newIdentityHash = ethers.encodeBytes32String("new_s3_payload_hash");
      await kycLedger.connect(owner).recordKYC(customerId, newIdentityHash);

      const auditTrail = await kycLedger.getAuditTrail(customerId);
      expect(auditTrail.identityHash).to.equal(newIdentityHash);
      expect(auditTrail.validatingBank).to.equal(owner.address);
      expect(auditTrail.isValid).to.be.true;
    });

    it("Should revert with ProfileNotFound for unregistered customer IDs", async function () {
      const nonExistentCustomerId = ethers.encodeBytes32String("non_existent_customer");
      await expect(
        kycLedger.getAuditTrail(nonExistentCustomerId)
      ).to.be.revertedWithCustomError(kycLedger, "ProfileNotFound");
    });
  });

  describe("Validator Status Management", function () {
    it("Should allow governance owner to set validator status and emit status change event", async function () {
      await expect(kycLedger.connect(owner).setValidatorStatus(unauthorizedNode.address, true))
        .to.emit(kycLedger, "ValidatorStatusChanged")
        .withArgs(unauthorizedNode.address, true);

      expect(await kycLedger.authorizedValidators(unauthorizedNode.address)).to.be.true;
    });

    it("Should strictly prevent non-governance accounts from setting validator status", async function () {
      await expect(
        kycLedger.connect(unauthorizedNode).setValidatorStatus(newOwner.address, true)
      ).to.be.revertedWithCustomError(kycLedger, "Unauthorized");
    });

    it("Should prevent a revoked validator from recording KYC", async function () {
      // Revoke authorizedBank's validator privileges
      await kycLedger.connect(owner).setValidatorStatus(authorizedBank.address, false);

      await expect(
        kycLedger.connect(authorizedBank).recordKYC(customerId, identityHash)
      ).to.be.revertedWithCustomError(kycLedger, "ValidatorOnly");
    });

    it("Should prevent a revoked validator from revoking KYC", async function () {
      // First record a valid profile using owner node (who is a validator)
      await kycLedger.connect(owner).recordKYC(customerId, identityHash);

      // Revoke authorizedBank's validator privileges
      await kycLedger.connect(owner).setValidatorStatus(authorizedBank.address, false);

      await expect(
        kycLedger.connect(authorizedBank).revokeKYC(customerId)
      ).to.be.revertedWithCustomError(kycLedger, "ValidatorOnly");
    });
  });

  describe("Governance Transfer Scope and Restrictions", function () {
    it("Should prevent the old governance owner from calling governance tasks after ownership rotation", async function () {
      // Transfer governance to newOwner
      await kycLedger.connect(owner).transferGovernance(newOwner.address);

      // Old owner tries to add a validator
      await expect(
        kycLedger.connect(owner).setValidatorStatus(unauthorizedNode.address, true)
      ).to.be.revertedWithCustomError(kycLedger, "Unauthorized");

      // Old owner tries to transfer governance again
      await expect(
        kycLedger.connect(owner).transferGovernance(owner.address)
      ).to.be.revertedWithCustomError(kycLedger, "Unauthorized");
    });

    it("Should allow the new governance owner to perform governance tasks after ownership rotation", async function () {
      // Transfer governance to newOwner
      await kycLedger.connect(owner).transferGovernance(newOwner.address);

      // New owner adds a validator
      await expect(kycLedger.connect(newOwner).setValidatorStatus(unauthorizedNode.address, true))
        .to.emit(kycLedger, "ValidatorStatusChanged")
        .withArgs(unauthorizedNode.address, true);

      expect(await kycLedger.authorizedValidators(unauthorizedNode.address)).to.be.true;
    });
  });
});