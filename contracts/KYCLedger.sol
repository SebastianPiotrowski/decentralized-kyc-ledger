// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title KYCLedger
 * @notice Implements a decentralized, GDPR-compliant architecture for cross-institution KYC verification.
 * @dev Stores cryptographic hashes of validated identities to prevent data duplication without exposing PII.
 */
contract KYCLedger {
    
    struct AuditTrail {
        bytes32 identityHash;  // SHA-256 hash of the customer's off-chain data
        address validatingBank; // Address of the financial institution that performed the KYC
        uint256 timestamp;     // Block timestamp of the validation
        bool isValid;          // Operational and legal status of the verification
    }

    // Mapping: Customer ID hash (e.g., hashed passport/tax ID) -> KYC Audit Trail
    mapping(bytes32 => AuditTrail) private kycRegistry;
    
    // Mapping of trusted ecosystem validators (e.g., central banks, audited financial institutions)
    mapping(address => bool) public authorizedValidators;
    
    address public governanceOwner;

    event KYCVerified(bytes32 indexed customerId, address indexed bank, bytes32 identityHash);
    event ValidatorStatusChanged(address indexed validator, bool status);

    modifier onlyGovernor() {
        require(msg.sender == governanceOwner, "Governance: Unauthorized access");
        _;
    }

    modifier onlyValidator() {
        require(authorizedValidators[msg.sender], "Governance: Caller is not an authorized validator");
        _;
    }

    constructor() {
        governanceOwner = msg.sender;
        authorizedValidators[msg.sender] = true;
    }

    /**
     * @notice Authorizes or revokes a financial institution's validator status.
     * @param _validator The address of the financial institution.
     * @param _status True to authorize, false to revoke.
     */
    function setValidatorStatus(address _validator, bool _status) external onlyGovernor {
        authorizedValidators[_validator] = _status;
        emit ValidatorStatusChanged(_validator, _status);
    }

    /**
     * @notice Records a pre-validated KYC profile hash on the ledger.
     * @dev Fully compliant with GDPR/RODO as no personal identifiable information (PII) touches the state.
     * @param _customerId The cryptographic anchor representing the customer.
     * @param _identityHash The hash of the validated identity dataset.
     */
    function recordKYC(bytes32 _customerId, bytes32 _identityHash) external onlyValidator {
        require(_customerId != bytes32(0), "Data: Invalid customer ID anchor");
        require(_identityHash != bytes32(0), "Data: Invalid identity payload hash");

        kycRegistry[_customerId] = AuditTrail({
            identityHash: _identityHash,
            validatingBank: msg.sender,
            timestamp: block.timestamp,
            isValid: true
        });

        emit KYCVerified(_customerId, msg.sender, _identityHash);
    }

    /**
     * @notice Retrieves the cryptographic proof of a customer's KYC verification for auditing purposes.
     * @param _customerId The cryptographic anchor representing the customer.
     * @return identityHash The verification payload hash.
     * @return validatingBank The institution that performed the audit.
     * @return timestamp The time of verification.
     * @return isValid The current status of the compliance record.
     */
    function getKYCProof(bytes32 _customerId) external view returns (bytes32 identityHash, address validatingBank, uint256 timestamp, bool isValid) {
        AuditTrail memory audit = kycRegistry[_customerId];
        require(audit.timestamp > 0, "Data: KYC record missing or expired");
        return (audit.identityHash, audit.validatingBank, audit.timestamp, audit.isValid);
    }
}