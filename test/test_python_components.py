import sys
import os
import unittest
from typing import Dict

# Add the scripts directory to path to enable imports
scripts_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "scripts"))
if scripts_dir not in sys.path:
    sys.path.insert(0, scripts_dir)

from kyc_boundary import KYCCryptographicBoundary
from multisig_governance import MultiSigKYCGovernance
from ai_lineage_tracker import AILineageAuditTracker


class TestKYCCryptographicBoundary(unittest.TestCase):
    def setUp(self):
        self.pii_data = {
            "first_name": "Sebastian",
            "last_name": "Piotrowski",
            "date_of_birth": "1984-04-12",
            "document_number": "POL-987654321"
        }

    def test_generate_salt_length(self):
        # Default length is 32 bytes -> 64 hex characters
        salt = KYCCryptographicBoundary.generate_salt()
        self.assertEqual(len(salt), 64)
        
        # Specific length
        salt_16 = KYCCryptographicBoundary.generate_salt(16)
        self.assertEqual(len(salt_16), 32)

    def test_hash_pii_determinism_and_canonicalization(self):
        salt = KYCCryptographicBoundary.generate_salt()
        
        # Test basic determinism
        hash1 = KYCCryptographicBoundary.hash_pii(self.pii_data, salt)
        hash2 = KYCCryptographicBoundary.hash_pii(self.pii_data, salt)
        self.assertEqual(hash1, hash2)

        # Test canonicalization (different key orders in dict should yield the same hash)
        pii_reordered = {
            "document_number": "POL-987654321",
            "date_of_birth": "1984-04-12",
            "last_name": "Piotrowski",
            "first_name": "Sebastian"
        }
        hash3 = KYCCryptographicBoundary.hash_pii(pii_reordered, salt)
        self.assertEqual(hash1, hash3)

    def test_verify_on_chain_hash_success(self):
        kyc_hash, salt = KYCCryptographicBoundary.create_on_chain_attestation(self.pii_data)
        self.assertTrue(
            KYCCryptographicBoundary.verify_on_chain_hash(self.pii_data, salt, kyc_hash)
        )

    def test_verify_on_chain_hash_tampered(self):
        kyc_hash, salt = KYCCryptographicBoundary.create_on_chain_attestation(self.pii_data)
        
        # Alter a PII field
        tampered_pii = self.pii_data.copy()
        tampered_pii["document_number"] = "POL-999999999"
        
        self.assertFalse(
            KYCCryptographicBoundary.verify_on_chain_hash(tampered_pii, salt, kyc_hash)
        )


class TestMultiSigKYCGovernance(unittest.TestCase):
    def setUp(self):
        self.signers = ["0xBankNode_1", "0xAuditorNode_2", "0xRegulatorNode_3"]
        self.governance = MultiSigKYCGovernance(required_signatures=2, authorized_signers=self.signers)
        self.target_kyc_hash = "0x8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4"

    def test_init_validation(self):
        # Should raise ValueError if required signatures exceed authorized signers list
        with self.assertRaises(ValueError):
            MultiSigKYCGovernance(required_signatures=4, authorized_signers=self.signers)

    def test_create_attestation_request(self):
        req_id = self.governance.create_attestation_request(self.target_kyc_hash, requester="0xBankNode_1")
        self.assertIsNotNone(req_id)
        self.assertIn(req_id, self.governance.pending_requests)
        
        req = self.governance.pending_requests[req_id]
        self.assertEqual(req["kyc_hash"], self.target_kyc_hash)
        self.assertEqual(req["requester"], "0xBankNode_1")
        self.assertEqual(req["signatures"], set())
        self.assertEqual(req["status"], "PENDING")

    def test_sign_request_success_flow(self):
        req_id = self.governance.create_attestation_request(self.target_kyc_hash, requester="0xBankNode_1")
        
        # Sign 1: Threshold not met (1/2 signatures)
        reached_threshold = self.governance.sign_request(req_id, "0xBankNode_1")
        self.assertFalse(reached_threshold)
        self.assertEqual(self.governance.pending_requests[req_id]["status"], "PENDING")
        self.assertIn("0xBankNode_1", self.governance.pending_requests[req_id]["signatures"])

        # Sign again by the same signer (should not increment signature count)
        reached_threshold = self.governance.sign_request(req_id, "0xBankNode_1")
        self.assertFalse(reached_threshold)

        # Sign 2: Threshold met (2/2 signatures)
        reached_threshold = self.governance.sign_request(req_id, "0xAuditorNode_2")
        self.assertTrue(reached_threshold)
        self.assertEqual(
            self.governance.pending_requests[req_id]["status"],
            "APPROVED_READY_FOR_ONCHAIN_COMMIT"
        )

    def test_sign_request_unauthorized_signer(self):
        req_id = self.governance.create_attestation_request(self.target_kyc_hash, requester="0xBankNode_1")
        with self.assertRaises(PermissionError):
            self.governance.sign_request(req_id, "0xMaliciousNode")

    def test_sign_request_nonexistent_id(self):
        with self.assertRaises(KeyError):
            self.governance.sign_request("invalid_id", "0xBankNode_1")


class TestAILineageAuditTracker(unittest.TestCase):
    def test_generate_lineage_anchor(self):
        pipeline_id = "pipe-eu-risk-v4"
        model_version = "gpt-5.6-sol"
        data_hash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

        anchor = AILineageAuditTracker.generate_lineage_anchor(
            pipeline_id=pipeline_id,
            model_version=model_version,
            data_snapshot_hash=data_hash
        )

        self.assertEqual(anchor["pipeline_id"], pipeline_id)
        self.assertEqual(anchor["model_version"], model_version)
        self.assertIsInstance(anchor["timestamp"], int)
        
        # Verify hash format (should be 0x followed by a 64-character SHA-256 hex string)
        audit_hash = anchor["audit_anchor_hash"]
        self.assertTrue(audit_hash.startswith("0x"))
        self.assertEqual(len(audit_hash), 66)  # 2 + 64


if __name__ == "__main__":
    unittest.main()
