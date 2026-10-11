"""Delivery CLI must record the chosen operator without guessing or rewriting receipts."""

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile


SCRIPT = Path(__file__).with_name("receive-vault-delivery.py")


class ReceiptOperatorTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="vault-receive-test-")
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        self.vault = root / "vault"
        (self.vault / "drafts").mkdir(parents=True)
        self.source = root / "delivery"
        self.source.mkdir()
        self.path = "drafts/example/adult/research/request-r1/attempt-1/research.json"
        payload = b'{"example": true}\n'
        manifest = {
            "schemaVersion": "aquarium-delivery-manifest/1", "deliveryId": "example",
            "files": [{"path": self.path, "kind": "research", "size": len(payload),
                       "sha256": hashlib.sha256(payload).hexdigest()}],
        }
        archive = self.source / "example.zip"
        with zipfile.ZipFile(archive, "w") as zipped:
            zipped.writestr("manifest.json", json.dumps(manifest))
            zipped.writestr(self.path, payload)
        data = archive.read_bytes()
        (self.source / "example.delivery.json").write_text(json.dumps({
            "schemaVersion": "aquarium-delivery/1", "deliveryId": "example",
            "zip": {"name": archive.name, "size": len(data),
                    "sha256": hashlib.sha256(data).hexdigest()},
        }))
        self.receipt = self.vault / "consumer/deliveries/example.json"

    def run_cli(self, *arguments):
        return subprocess.run(
            [sys.executable, str(SCRIPT), *arguments], capture_output=True, text=True,
            env={**os.environ, "AQUARIUM_ASSET_VAULT": str(self.vault),
                 "AQUARIUM_DELIVERY_DIR": str(self.source)},
        )

    def test_codex_and_claude_receipts_follow_explicit_operator(self):
        for operator in ("codex", "claude-code"):
            with self.subTest(operator=operator):
                result = self.run_cli("--apply", "--by", operator)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(json.loads(self.receipt.read_text())["receivedBy"], operator)
                self.receipt.unlink()
                (self.vault / self.path).unlink()

    def test_missing_or_invalid_operator_cannot_write(self):
        for arguments in (("--apply",), ("--apply", "--by", "unknown")):
            with self.subTest(arguments=arguments):
                result = self.run_cli(*arguments)
                self.assertEqual(result.returncode, 2)
                self.assertFalse(self.receipt.exists())
                self.assertFalse((self.vault / self.path).exists())

    def test_dry_run_needs_no_operator_and_does_not_write(self):
        result = self.run_cli()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(self.receipt.exists())
        self.assertFalse((self.vault / self.path).exists())

    def test_retry_preserves_original_operator_and_receipt(self):
        self.assertEqual(self.run_cli("--apply", "--by", "codex").returncode, 0)
        receipt = self.receipt.read_bytes()
        result = self.run_cli("--apply", "--by", "claude-code")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.receipt.read_bytes(), receipt)


if __name__ == "__main__":
    unittest.main()
