// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Decentralized KYC Ledger (Enterprise Architecture)
 * @notice Optimizes compliance verification costs and eliminates PII exposure on-chain.
 */
contract KYCLedger {
    
    struct AuditTrail {
        bytes32 identityHash;    // Cryptographic anchor of off-chain encrypted document (AWS)
        address validatingBank;  // Node address that executed the verification (packed)
        uint64 timestamp;        // Block timestamp of the transaction (packed)
        bool isValid;            // Current operational status of the profile (packed)
    }

    address public governanceOwner;
    
    // Mapping from Customer ID to their specific Audit Trail
    mapping(bytes32 => AuditTrail) private kycRegistry;
    
    // Mapping to manage authorized institutional validator nodes (e.g., Tier-1 Banks)
    mapping(address => bool) public authorizedValidators;

    // Custom errors for gas efficiency
    error Unauthorized();
    error ValidatorOnly();
    error InvalidCustomerAnchor();
    error InvalidIdentityPayload();
    error ProfileAlreadyInactiveOrNonExistent();
    error ProfileNotFound();
    error InvalidGovernanceOwner();

    event KYCVerified(bytes32 indexed customerId, address indexed bank, bytes32 identityHash);
    event KYCRevoked(bytes32 indexed customerId, address indexed bank);
    event ValidatorStatusChanged(address indexed validator, bool status);
    event GovernanceTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyGovernance() {
        if (msg.sender != governanceOwner) {
            revert Unauthorized();
        }
        _;
    }

    modifier onlyValidator() {
        if (!authorizedValidators[msg.sender]) {
            revert ValidatorOnly();
        }
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

    function transferGovernance(address _newOwner) external onlyGovernance {
        if (_newOwner == address(0)) {
            revert InvalidGovernanceOwner();
        }
        emit GovernanceTransferred(governanceOwner, _newOwner);
        governanceOwner = _newOwner;
    }

    /**
     * @notice Anchors a cryptographic proof of KYC without revealing PII.
     * @param _customerId SHA-256 hash representing the verified entity.
     * @param _identityHash Immutable pointer to the secure off-chain storage.
     */
    function recordKYC(bytes32 _customerId, bytes32 _identityHash) external onlyValidator {
        if (_customerId == bytes32(0)) {
            revert InvalidCustomerAnchor();
        }
        if (_identityHash == bytes32(0)) {
            revert InvalidIdentityPayload();
        }

        kycRegistry[_customerId] = AuditTrail({
            identityHash: _identityHash,
            validatingBank: msg.sender,
            timestamp: uint64(block.timestamp),
            isValid: true
        });

        emit KYCVerified(_customerId, msg.sender, _identityHash);
    }

    function revokeKYC(bytes32 _customerId) external onlyValidator {
        if (!kycRegistry[_customerId].isValid) {
            revert ProfileAlreadyInactiveOrNonExistent();
        }
        
        kycRegistry[_customerId].isValid = false;
        kycRegistry[_customerId].timestamp = uint64(block.timestamp);

        emit KYCRevoked(_customerId, msg.sender);
    }

    function getAuditTrail(bytes32 _customerId) external view returns (AuditTrail memory) {
        if (kycRegistry[_customerId].validatingBank == address(0)) {
            revert ProfileNotFound();
        }
        return kycRegistry[_customerId];
    }
}