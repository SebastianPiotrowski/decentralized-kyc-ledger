import hashlib
import json
import time
from typing import List, Dict, Any

class MultiSigKYCGovernance:
    """
    Demonstrates multi-entity consensus for identity state changes on-chain.
    Prevents single-point-of-failure governance risks in compliance workflows.
    Aligns with DORA & EU AI Act requirements for distributed authorization.
    """

    def __init__(self, required_signatures: int, authorized_signers: List[str]):
        if required_signatures > len(authorized_signers):
            raise ValueError("Required signatures cannot exceed total authorized signers.")
        self.required_signatures = required_signatures
        self.authorized_signers = authorized_signers
        self.pending_requests: Dict[str, Dict[str, Any]] = {}

    def create_attestation_request(self, kyc_hash: str, requester: str) -> str:
        """Initiates a governance proposal to update or anchor a KYC state."""
        request_id = hashlib.sha256(f"{kyc_hash}:{time.time()}".encode()).hexdigest()[:16]
        self.pending_requests[request_id] = {
            "kyc_hash": kyc_hash,
            "requester": requester,
            "signatures": set(),
            "status": "PENDING"
        }
        return request_id

    def sign_request(self, request_id: str, signer_id: str) -> bool:
        """Simulates a cryptographic signature from an authorized entity (e.g., Bank, Auditor)."""
        if signer_id not in self.authorized_signers:
            raise PermissionError(f"Signer {signer_id} is not authorized in this governance group.")
        
        req = self.pending_requests.get(request_id)
        if not req:
            raise KeyError("Request ID not found.")

        req["signatures"].add(signer_id)
        
        # Check if threshold is reached
        if len(req["signatures"]) >= self.required_signatures:
            req["status"] = "APPROVED_READY_FOR_ONCHAIN_COMMIT"
            return True
        return False


# --- Execution Example ---
if __name__ == "__main__":
    print("--- Multi-Signer Compliance Governance Demo ---\n")

    # Define governance group: Bank, External Auditor, Regulatory Gateway
    signers = ["0xBankNode_1", "0xAuditorNode_2", "0xRegulatorNode_3"]
    governance = MultiSigKYCGovernance(required_signatures=2, authorized_signers=signers)

    # Simulated salted KYC hash ready for anchoring
    target_kyc_hash = "0x8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4"

    # Step 1: Bank initiates request
    req_id = governance.create_attestation_request(target_kyc_hash, requester="0xBankNode_1")
    print(f"[INITIATED] Request ID: {req_id} for Hash: {target_kyc_hash[:18]}...")

    # Step 2: Bank signs its own request
    governance.sign_request(req_id, "0xBankNode_1")
    print(f"[STATUS] 1/2 Signatures collected. State: {governance.pending_requests[req_id]['status']}")

    # Step 3: External Auditor signs after verifying off-chain proof
    is_ready = governance.sign_request(req_id, "0xAuditorNode_2")
    print(f"[STATUS] 2/2 Signatures collected. State: {governance.pending_requests[req_id]['status']}")

    print("\n✅ Multi-sig quorum reached! State update is now cryptographically authorized for ledger commit.")