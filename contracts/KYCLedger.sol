// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Decentralized KYC Ledger (Enterprise Architecture)
 * @notice Optimizes compliance verification costs and eliminates PII exposure on-chain.
 */
contract KYCLedger {
    
    struct AuditTrail {
        bytes32 customerId;      // SHA-256 hash of the unique customer identifier
        bytes32 identityHash;    // Cryptographic anchor of off-chain encrypted document (AWS)
        address validatingBank;  // Node address that executed the verification
        uint256 timestamp;       // Block timestamp of the transaction
        bool isValid;            // Current operational status of the profile
    }

    address public governanceOwner;
    
    // Mapping from Customer ID to their specific Audit Trail
    mapping(bytes32 => AuditTrail) private kycRegistry;
    
    // Mapping to manage authorized institutional validator nodes (e.g., Tier-1 Banks)
    mapping(address => bool) public authorizedValidators;

    event KYCVerified(bytes32 indexed customerId, address indexed bank, bytes32 identityHash);
    event KYCRevoked(bytes32 indexed customerId, address indexed bank);
    event ValidatorStatusChanged(address indexed validator, bool status);

    modifier onlyGovernance() {
        require(msg.sender == governanceOwner, "Governance: Unauthorized access");
        _;
    }

    modifier onlyValidator() {
        require(authorizedValidators[msg.sender], "Governance: Caller is not an authorized validator");
        _;
    }

    constructor() {
        governanceOwner = msg.sender;
        authorizedValidators[msg.sender] = true; // Owner as initial seed validator
    }

    function setValidatorStatus(address _validator, bool _status) external onlyGovernance {
        authorizedValidators[_validator] = _status;
        emit ValidatorStatusChanged(_validator, _status);
    }

    /**
     * @notice Anchors a cryptographic proof of KYC without revealing PII.
     * @param _customerId SHA-256 hash representing the verified entity.
     * @param _identityHash Immutable pointer to the secure off-chain storage.
     */
    function recordKYC(bytes32 _customerId, bytes32 _identityHash) external onlyValidator {
        require(_customerId != bytes32(0), "Data: Invalid customer anchor");
        require(_identityHash != bytes32(0), "Data: Invalid identity payload");

        kycRegistry[_customerId] = AuditTrail({
            customerId: _customerId,
            identityHash: _identityHash,
            validatingBank: msg.sender,
            timestamp: block.timestamp,
            isValid: true
        });

        emit KYCVerified(_customerId, msg.sender, _identityHash);
    }

    function revokeKYC(bytes32 _customerId) external onlyValidator {
        require(kycRegistry[_customerId].isValid, "Data: Profile already inactive or non-existent");
        
        kycRegistry[_customerId].isValid = false;
        kycRegistry[_customerId].timestamp = block.timestamp;

        emit KYCRevoked(_customerId, msg.sender);
    }

    function getAuditTrail(bytes32 _customerId) external view returns (AuditTrail memory) {
        require(kycRegistry[_customerId].customerId != bytes32(0), "Data: Profile not found");
        return kycRegistry[_customerId];
    }
}