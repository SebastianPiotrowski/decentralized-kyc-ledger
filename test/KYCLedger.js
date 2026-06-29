const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("KYCLedger", function () {
  let kycLedger;
  let owner;
  let bankA;
  let bankB;
  let customerId;
  let identityHash;

  beforeEach(async function () {
    [owner, bankA, bankB] = await ethers.getSigners();
    
    const KYCLedgerFactory = await ethers.getContractFactory("KYCLedger");
    kycLedger = await KYCLedgerFactory.deploy();

    // Generate mock cryptographic bytes32 data
    customerId = ethers.id("customer_passport_12345");
    identityHash = ethers.id("kyc_dataset_payload_hash_abcde");
  });

  describe("Governance & Initialization", function () {
    it("Should set the deployer as the governance owner", async function () {
      expect(await kycLedger.governanceOwner()).to.equal(owner.address);
    });

    it("Should allow owner to authorize a new validator bank", async function () {
      await kycLedger.setValidatorStatus(bankA.address, true);
      expect(await kycLedger.authorizedValidators(bankA.address)).to.be.true;
    });
  });

  describe("KYC Operations", function () {
    beforeEach(async function () {
      // Authorize Bank A before running operational tests
      await kycLedger.setValidatorStatus(bankA.address, true);
    });

    it("Should allow authorized bank to record a KYC proof", async function () {
      await expect(kycLedger.connect(bankA).recordKYC(customerId, identityHash))
        .to.emit(kycLedger, "KYCVerified")
        .withArgs(customerId, bankA.address, identityHash);

      const [retrievedHash, validator, , isValid] = await kycLedger.getKYCProof(customerId);
      expect(retrievedHash).to.equal(identityHash);
      expect(validator).to.equal(bankA.address);
      expect(isValid).to.be.true;
    });

    it("Should fail if an unauthorized bank tries to record KYC", async function () {
      await expect(
        kycLedger.connect(bankB).recordKYC(customerId, identityHash)
      ).to.be.revertedWith("Governance: Caller is not an authorized validator");
    });
  });
});