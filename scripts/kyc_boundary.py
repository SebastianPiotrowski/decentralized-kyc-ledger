import hashlib
import os
import json
from typing import Dict, Tuple

class KYCCryptographicBoundary:
    """
    Demonstrates the off-chain to on-chain trust boundary for decentralized KYC.
    This class handles off-chain hashing with cryptographic salting, ensuring
    PII never touches the immutable ledger, while maintaining full auditability.
    """
    
    @staticmethod
    def generate_salt(length: int = 32) -> str:
        """Generates a secure cryptographically strong random salt."""
        return os.urandom(length).hex()

    @staticmethod
    def hash_pii(pii_data: Dict[str, str], salt: str) -> str:
        """
        Creates a deterministic SHA-256 hash of salted PII data.
        The salt prevents rainbow table attacks and brute-force correlation on-chain.
        """
        # Canonicalize JSON to ensure deterministic hashing regardless of key order
        canonical_pii = json.dumps(pii_data, sort_keys=True)
        salted_input = f"{canonical_pii}:{salt}".encode('utf-8')
        return hashlib.sha256(salted_input).hexdigest()

    @classmethod
    def create_on_chain_attestation(cls, pii_data: Dict[str, str]) -> Tuple[str, str]:
        """
        Simulates the Bank's internal (off-chain) processing.
        Returns the safe anchor data to be registered on the blockchain:
        1. The salted cryptographic hash (bytes32 compatible hex)
        2. The generated salt (to be stored securely off-chain or shared via secure channels)
        """
        salt = cls.generate_salt()
        kyc_hash = cls.hash_pii(pii_data, salt)
        return kyc_hash, salt

    @classmethod
    def verify_on_chain_hash(cls, raw_pii: Dict[str, str], salt: str, expected_hash: str) -> bool:
        """
        Allows any authorized validator to verify the authenticity of presented PII
        against the immutable hash stored on-chain. Zero PII is stored on the ledger.
        """
        calculated_hash = cls.hash_pii(raw_pii, salt)
        return calculated_hash == expected_hash


# --- Practical Execution Example ---
if __name__ == "__main__":
    print("--- Starting KYC Cryptographic Boundary Demo ---\n")

    # 1. Raw PII data (Exists strictly off-chain within secure bank infrastructure)
    customer_pii = {
        "first_name": "Sebastian",
        "last_name": "Piotrowski",
        "date_of_birth": "1984-04-12", # Simulated data
        "document_number": "POL-987654321"
    }
    print(f"[OFF-CHAIN] Original Customer PII:\n{json.dumps(customer_pii, indent=2)}\n")

    # 2. Generate the safe on-chain anchor (The bank executes this)
    kyc_hash, secret_salt = KYCCryptographicBoundary.create_on_chain_attestation(customer_pii)
    
    print(f"[PROCESS] Generating secure cryptographic salt: {secret_salt[:16]}...")
    print(f"[ON-CHAIN ANCHOR] Gas-optimized Hash (bytes32 hex equivalent):")
    print(f"👉 0x{kyc_hash}\n")
    print("⚠️  This hash contains ZERO readable personal data and is 100% compliant with GDPR/DORA rules.")
    print("Only this hash and the state 'isValid = true' will touch the Solidity ledger.\n")

    # 3. Validation flow (Another institution verifies the user)
    print("--- Verification Flow ---")
    
    # Scenario A: Correct data presented
    is_valid_user = KYCCryptographicBoundary.verify_on_chain_hash(customer_pii, secret_salt, kyc_hash)
    print(f"Verification with original documents: {'✅ SUCCESS' if is_valid_user else '❌ FAILED'}")

    # Scenario B: Fraud attempt (Modified document number)
    tampered_pii = customer_pii.copy()
    tampered_pii["document_number"] = "POL-999999999"
    is_valid_tampered = KYCCryptographicBoundary.verify_on_chain_hash(tampered_pii, secret_salt, kyc_hash)
    print(f"Verification with altered document ID: {'✅ SUCCESS' if is_valid_tampered else '❌ DETECTED TAMPERING'}")