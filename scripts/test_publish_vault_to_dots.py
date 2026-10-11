"""Inventory entries must describe the recorded commit, not local edits."""

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
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
        self.assertEqual(entry["vaultStatus"], "stored")
        self.assertEqual(self.expected["missingFiles"], [])
        self.assertEqual(self.expected["changedFiles"], [])

    def commit_fixture(self):
        self.git("add", "-A")
        self.git("-c", "user.name=Test", "-c", "user.email=test@example.invalid",
                 "commit", "-m", "fixture update")
        self.head = self.git("rev-parse", "HEAD")

    def test_missing_noncurrent_output_remains_visible_without_hash_mismatch(self):
        self.artifact.unlink()
        record = json.loads(self.record.read_text())
        record["isCurrent"] = False
        self.record.write_text(json.dumps(record))
        self.commit_fixture()
        inventory = self.inventory()
        self.assertEqual(inventory["missingFiles"], [self.artifact_path])
        self.assertEqual(inventory["changedFiles"], [])
        self.assertEqual(inventory["missingOrChanged"], [self.artifact_path])
        entry = inventory["jobs"][0]["files"][0]
        self.assertEqual(entry["vaultStatus"], "missing")
        self.assertFalse(entry["evidence"][0]["isCurrent"])

    def test_changed_committed_bytes_are_separate_from_missing_files(self):
        self.artifact.write_bytes(b"different committed image")
        self.commit_fixture()
        inventory = self.inventory()
        self.assertEqual(inventory["missingFiles"], [])
        self.assertEqual(inventory["changedFiles"], [self.artifact_path])
        self.assertEqual(inventory["jobs"][0]["files"][0]["vaultStatus"], "changed")

    def test_receiving_exact_original_resolves_missing_inventory_entry(self):
        self.artifact.unlink()
        self.commit_fixture()
        self.assertEqual(self.inventory()["missingFiles"], [self.artifact_path])
        self.artifact.write_bytes(self.original)
        self.commit_fixture()
        self.assertEqual(self.inventory()["missingOrChanged"], [])
        self.assertEqual(self.inventory()["missingFiles"], [])

    def test_published_snapshot_records_explicit_operator(self):
        # git archive は指定した各パスが実際にある保管庫を前提にする。
        for path in publisher.PATHS:
            if path.startswith(":(exclude)"):
                continue
            target = self.vault / path
            if target.exists():
                continue
            if not target.suffix:
                target /= "fixture.json"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("{}\n")
        self.commit_fixture()
        self.git("update-ref", "refs/remotes/origin/main", self.head)
        source = self.vault / "drive"
        source.mkdir()
        env = {**os.environ, "AQUARIUM_ASSET_VAULT": str(self.vault),
               "AQUARIUM_DELIVERY_DIR": str(source)}
        command = [sys.executable, str(Path(publisher.__file__)), "--apply"]
        missing = subprocess.run(command, env=env, capture_output=True, text=True)
        self.assertEqual(missing.returncode, 2)
        self.assertFalse((source / publisher.OUTBOX).exists())
        for operator in ("codex", "claude-code"):
            with self.subTest(operator=operator):
                result = subprocess.run(command + ["--by", operator], env=env,
                                        capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                latest = source / publisher.OUTBOX / "latest-snapshot.json"
                self.assertEqual(json.loads(latest.read_text())["createdBy"], operator)
                for file in latest.parent.iterdir():
                    file.unlink()

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
