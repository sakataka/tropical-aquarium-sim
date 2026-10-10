"""Inventory entries must describe the recorded commit, not local edits."""

import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location(
    "publish_vault_to_dots", Path(__file__).with_name("publish-vault-to-dots.py")
)
publisher = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(publisher)


class InventoryCommitTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="vault-inventory-test-")
        self.addCleanup(self.temporary.cleanup)
        self.vault = Path(self.temporary.name)
        self.git("init")
        self.artifact_path = "drafts/fish/adult/image/request-r1/attempt-1/original.png"
        self.artifact = self.vault / self.artifact_path
        self.artifact.parent.mkdir(parents=True)
        self.original = b"committed image"
        self.artifact.write_bytes(self.original)
        self.reference = self.vault / "references/style.png"
        self.reference.parent.mkdir(parents=True)
        self.reference.write_bytes(self.original)
        self.receipt = self.vault / "consumer/deliveries/example.json"
        self.receipt.parent.mkdir(parents=True)
        self.receipt.write_text(json.dumps({
            "deliveryId": "example",
            "placed": [{"path": self.artifact_path,
                        "sha256": hashlib.sha256(self.original).hexdigest()}],
        }))
        self.record = self.vault / "queue/results/fish.adult.image/r1/output-1.json"
        self.record.parent.mkdir(parents=True)
        self.record.write_text(json.dumps({
            "requestRevision": 1, "outputRevision": 1, "isCurrent": True,
            "artifacts": [{"path": self.artifact_path, "bytes": len(self.original),
                           "sha256": hashlib.sha256(self.original).hexdigest()}],
        }))
        self.git("add", ".")
        self.git("-c", "user.name=Test", "-c", "user.email=test@example.invalid",
                 "commit", "-m", "fixture")
        self.head = self.git("rev-parse", "HEAD")
        self.expected = publisher.build_inventory(self.vault, self.head)

    def git(self, *args):
        return subprocess.check_output(
            ["git", "-C", str(self.vault), *args], stderr=subprocess.DEVNULL
        ).decode().strip()

    def inventory(self):
        return publisher.build_inventory(self.vault, self.head)

    def test_committed_artifact_is_present(self):
        entry = self.expected["jobs"][0]["files"][0]
        self.assertTrue(entry["inVault"])
        self.assertEqual(entry["size"], len(self.original))
        self.assertEqual(self.expected["missingOrChanged"], [])
        self.assertEqual(len(entry["evidence"]), 2)

    def test_uncommitted_image_changes_do_not_change_inventory(self):
        self.artifact.write_bytes(b"uncommitted image edit")
        self.reference.write_bytes(b"uncommitted reference edit")
        self.assertEqual(self.git("status", "--porcelain", "--", *publisher.PATHS), "")
        self.assertEqual(self.inventory(), self.expected)

    def test_local_image_deletion_does_not_remove_committed_files(self):
        self.artifact.unlink()
        self.reference.unlink()
        self.assertEqual(self.inventory(), self.expected)

    def test_staged_reference_is_not_in_recorded_commit(self):
        (self.vault / "references/new.png").write_bytes(b"not committed")
        self.git("add", "references/new.png")
        self.assertEqual(self.inventory(), self.expected)

    def test_local_receipt_edits_do_not_change_recorded_metadata(self):
        self.receipt.write_text(json.dumps({"deliveryId": "edited", "placed": []}))
        self.assertEqual(self.inventory(), self.expected)

    def test_local_result_edits_do_not_change_recorded_metadata(self):
        self.record.write_text(json.dumps({"requestRevision": 2, "artifacts": []}))
        self.assertEqual(self.inventory(), self.expected)

    def test_later_commit_does_not_change_requested_snapshot(self):
        self.artifact.write_bytes(b"later committed image")
        self.reference.write_bytes(b"later committed reference")
        self.git("add", ".")
        self.git("-c", "user.name=Test", "-c", "user.email=test@example.invalid",
                 "commit", "-m", "later")
        self.assertEqual(self.inventory(), self.expected)


if __name__ == "__main__":
    unittest.main()
