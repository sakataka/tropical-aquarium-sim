# /// script
# requires-python = ">=3.11"
# ///
"""保管庫（sakataka/aquarium-assets）のうち dots が読むものを、Google Drive のフォルダへ写す。

dots の窓口は Drive だけにしている（2026年10月10日から）。dots → 保管庫は receive-vault-delivery.py、
保管庫 → dots がこのスクリプト。GitHub へ commit・push 済みの内容だけを、ZIP 1個と小さな JSON 1個にして置く。

  uv run scripts/publish-vault-to-dots.py            何を置くかを表示する（何も書かない）
  uv run scripts/publish-vault-to-dots.py --apply    Drive の from-claude-code/ に置く

置くもの（Drive の <配送フォルダ>/from-claude-code/）:
  aquarium-vault-snapshot-<日付>-<commit>.zip            下の PATHS の、その commit での内容
  aquarium-vault-snapshot-<日付>-<commit>.snapshot.json  commit、ZIP のサイズと SHA-256、前回から変わったファイル
  aquarium-vault-inventory-<日付>-<commit>.json          保存済みの成果物の一覧（素材ID、jobId、revision、パス、サイズ、SHA-256）と、
                                                          画風・参照画像の一覧（パス、サイズ、SHA-256）
  latest-snapshot.json                                    いちばん新しい .snapshot.json の写し（毎回書き換える）

決まり:
  - 保管庫の HEAD が origin/main と同じで、対象のパスに commit していない変更がないときだけ置く
    （GitHub の正本と Drive の写しが食い違わないように）。
  - 文字のファイルだけ（依頼、採否、展示計画、要件、返事、受領の記録、制作方針、画風、成果の記録）。原画などの画像は入れない。
    ジョブの状態（queue/state・queue/current・queue/receipts）は入れない。
    dots が修正のために原画を要るときは、その都度 from-claude-code/originals/ に個別に置く。
  - 古い写しは消さない。同じ commit の写しがすでにあれば、何もしない。

保管庫は AQUARIUM_ASSET_VAULT、Drive のフォルダは AQUARIUM_DELIVERY_DIR（既定は receive-vault-delivery.py と同じ）。
"""

import argparse
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone, timedelta
from functools import cache
from pathlib import Path

DEFAULT_DELIVERY_DIR = "~/Library/CloudStorage/GoogleDrive-sakataka@gmail.com/マイドライブ/aquarium-dot-delivery"
OUTBOX = "from-claude-code"
# dots が読む、Claude Code の持ち物。画像は除く。
PATHS = [
    "catalog",
    "adoptions",
    "consumer",
    "queue/requests",
    "queue/schemas",
    "queue/README.md",
    "queue/policy.json",
    # 成果の記録（どの job のどの revision が、どのパス・ハッシュで保存されているか）。dots が書いたもの。
    "queue/results",
    "styles",
    "references",
    ":(exclude)consumer/app-originals",
    ":(exclude)consumer/proposed-references",
    ":(exclude)*.png",
    ":(exclude)*.webp",
    ":(exclude)*.jpg",
]
JST = timezone(timedelta(hours=9))


def git(vault: Path, *args: str, binary: bool = False):
    result = subprocess.run(["git", "-C", str(vault), *args], capture_output=True, check=True)
    return result.stdout if binary else result.stdout.decode().strip()


def build_inventory(vault: Path, head: str) -> dict:
    """
    保存済みの成果物と、画風・参照画像の一覧。成果物は job（素材・型・画像か調査・依頼の版）ごとにまとめる。
    根拠は2つ: dots が GitHub に書いた成果の記録（queue/results）と、Drive 経由の配送の受領の記録（consumer/deliveries）。
    同じファイルが両方にあれば1件にまとめ、両方の根拠を残す。どのファイルも、保管庫の実際の中身と照らす。
    """
    # 画像は未commit変更の検査対象から除いてあるため、作業ツリーではなく指定commitを読む。
    tracked = set(git(vault, "ls-tree", "-r", "--name-only", head).splitlines())

    def read_committed(path: str) -> bytes:
        return git(vault, "cat-file", "blob", f"{head}:{path}", binary=True)

    @cache
    def committed_info(path: str) -> tuple[int, str]:
        content = read_committed(path)
        return len(content), hashlib.sha256(content).hexdigest()

    in_vault = lambda path, digest: path in tracked and committed_info(path)[1] == digest
    jobs: dict[tuple, dict] = {}

    def job_entry(job_id: str, request_revision) -> dict:
        entity, variant, kind = (job_id.split(".") + ["", ""])[:3]
        return jobs.setdefault((job_id, request_revision), {
            "entityId": entity, "variantId": variant, "kind": kind, "jobId": job_id,
            "requestRevision": request_revision, "outputRevisions": [], "sources": [], "files": [],
        })

    def add_file(job: dict, path: str, size, digest: str, **evidence) -> None:
        known = next((item for item in job["files"] if item["path"] == path and item["sha256"] == digest), None)
        if not known:
            known = {"path": path, "size": size, "sha256": digest, "inVault": in_vault(path, digest), "evidence": []}
            job["files"].append(known)
        known["evidence"].append(evidence)

    for relative in sorted(path for path in tracked if len(Path(path).parts) == 5
                           and Path(path).match("queue/results/*/r*/output-*.json")):
        record_file = vault / relative
        record = json.loads(read_committed(relative))
        job = job_entry(record_file.parts[-3], record.get("requestRevision"))
        if record.get("outputRevision") not in job["outputRevisions"]:
            job["outputRevisions"].append(record.get("outputRevision"))
        if "queue-results" not in job["sources"]:
            job["sources"].append("queue-results")
        job.setdefault("savedAt", record.get("savedAt"))
        job["isCurrent"] = job.get("isCurrent") or record.get("isCurrent")
        for artifact in record.get("artifacts", []):
            add_file(job, artifact["path"], artifact.get("bytes"), artifact.get("sha256"),
                     source="queue-results", record=str(record_file.relative_to(vault)), outputRevision=record.get("outputRevision"))

    deliveries = []
    for relative in sorted(path for path in tracked if len(Path(path).parts) == 3
                           and Path(path).match("consumer/deliveries/*.json")):
        receipt = json.loads(read_committed(relative))
        # 受領の記録が main に入った commit。この commit（かそれより前）に、配送のファイルが入っている。
        saved = git(vault, "log", head, "--diff-filter=A", "--format=%H", "-1", "--", relative) or None
        delivered = [*receipt.get("placed", []), *receipt.get("alreadyInVault", [])]
        for item in delivered:
            parts = item["path"].split("/")
            # drafts/<素材>/<型>/<image|research>/request-r<N>/attempt-<M>/<ファイル>
            fallback = len(parts) >= 6 and parts[0] == "drafts" and parts[4].startswith("request-r")
            job_id = item.get("jobId") or (f"{parts[1]}.{parts[2]}.{parts[3]}" if fallback else None)
            revision = item.get("requestRevision") or (int(parts[4].removeprefix("request-r")) if fallback else None)
            if not job_id:
                continue
            job = job_entry(job_id, revision)
            if item.get("outputRevision") is not None and item["outputRevision"] not in job["outputRevisions"]:
                job["outputRevisions"].append(item["outputRevision"])
            if "drive-delivery" not in job["sources"]:
                job["sources"].append("drive-delivery")
            size = item.get("size") or (committed_info(item["path"])[0] if item["path"] in tracked else None)
            add_file(job, item["path"], size, item["sha256"], source="drive-delivery", deliveryId=receipt["deliveryId"],
                     receipt=relative, savedCommit=saved, outputRevision=item.get("outputRevision"), kind=item.get("kind"))
        deliveries.append({
            "deliveryId": receipt["deliveryId"], "receivedAt": receipt.get("receivedAt"), "receipt": relative, "savedCommit": saved,
            "entities": receipt.get("entities", []), "placed": len(receipt.get("placed", [])), "alreadyInVault": len(receipt.get("alreadyInVault", [])),
        })
    references = [{"path": path, "size": committed_info(path)[0], "sha256": committed_info(path)[1]}
                  for path in sorted(tracked) if path.startswith(("styles/", "references/"))]
    job_list = sorted(jobs.values(), key=lambda job: (job["jobId"], job["requestRevision"] or 0))
    return {
        "schemaVersion": "aquarium-vault-inventory/2",
        "purpose": "保管庫（GitHub の main）に保存済みの成果物と、画風・参照画像の一覧。成果物・依頼のメタデータだけで、ジョブの状態は含まない。"
                   "「保存済み」は保管庫に原本があるという意味で、アプリでの採用（adoptions/）とは別。",
        "vaultCommit": head,
        "jobCount": len(job_list),
        "entityCount": len({job["entityId"] for job in job_list}),
        "evidenceNoteJa": "files[].evidence の source が queue-results なら dots が GitHub に書いた成果の記録、drive-delivery なら Drive 経由の配送（deliveryId、受領の記録、"
                          "その記録が main に入った commit）。同じファイルが両方にあれば、1件の files に両方の evidence が付く。inVault は、vaultCommit の保管庫に同じ中身で入っているか。",
        "missingOrChanged": [file["path"] for job in job_list for file in job["files"] if not file["inVault"]],
        "jobs": job_list,
        "deliveries": deliveries,
        "styleAndReferenceFiles": references,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="保管庫の、dots が読むものを Drive へ写す")
    parser.add_argument("--apply", action="store_true", help="Drive に置く（省くと表示だけ）")
    args = parser.parse_args()
    vault_value = os.environ.get("AQUARIUM_ASSET_VAULT")
    if not vault_value:
        sys.exit("AQUARIUM_ASSET_VAULT に保管庫の clone のパスを入れてください")
    vault = Path(vault_value).expanduser().resolve()
    source = Path(os.environ.get("AQUARIUM_DELIVERY_DIR", DEFAULT_DELIVERY_DIR)).expanduser()
    if not source.is_dir():
        sys.exit(f"Drive のフォルダが見えません（Google Drive のアプリが動いているか確かめてください）: {source}")

    head = git(vault, "rev-parse", "HEAD")
    if git(vault, "status", "--porcelain", "--", *PATHS):
        sys.exit("対象のパスに commit していない変更があります。commit・push してから写してください")
    try:
        remote = git(vault, "rev-parse", "origin/main")
    except subprocess.CalledProcessError:
        sys.exit("origin/main が分かりません（git fetch してください）")
    if remote != head:
        sys.exit(f"保管庫の HEAD（{head[:8]}）が origin/main（{remote[:8]}）と違います。push か pull をしてから写してください")

    outbox = source / OUTBOX
    latest_file = outbox / "latest-snapshot.json"
    previous = json.loads(latest_file.read_text()) if latest_file.exists() else None
    if previous and previous["vaultCommit"] == head:
        print(f"この commit（{head[:8]}）の写しは、すでに置いてあります: {previous['zip']['name']}")
        return 0

    files = [path for path in git(vault, "ls-files", "--", *PATHS).splitlines() if path]
    data = git(vault, "archive", "--format=zip", head, "--", *PATHS, binary=True)
    changed = None
    if previous:
        try:
            changed = [path for path in git(vault, "diff", "--name-only", previous["vaultCommit"], head, "--", *PATHS).splitlines() if path]
        except subprocess.CalledProcessError:
            changed = None
    stamp = datetime.now(JST)
    base = f"aquarium-vault-snapshot-{stamp:%Y%m%d}-{head[:8]}"
    inventory = build_inventory(vault, head)
    inventory_text = json.dumps(inventory, ensure_ascii=False, indent=1) + "\n"
    inventory_name = f"aquarium-vault-inventory-{stamp:%Y%m%d}-{head[:8]}.json"
    note = {
        "schemaVersion": "aquarium-vault-snapshot/1",
        "purpose": "保管庫（GitHub の main）のうち、dots が読む文字のファイルの写し。正本は GitHub。",
        "vaultCommit": head,
        "createdAt": stamp.isoformat(timespec="seconds"),
        "createdBy": "claude-code",
        "zip": {"name": f"{base}.zip", "size": len(data), "sha256": hashlib.sha256(data).hexdigest()},
        "fileCount": len(files),
        "inventory": {"name": inventory_name, "size": len(inventory_text.encode()), "sha256": hashlib.sha256(inventory_text.encode()).hexdigest(),
                      "jobCount": inventory["jobCount"], "entityCount": inventory["entityCount"]},
        "includes": [path for path in PATHS if not path.startswith(":(exclude)")],
        "previousVaultCommit": previous["vaultCommit"] if previous else None,
        "changedSincePrevious": changed,
    }
    print(f"保管庫 {head[:8]}: {len(files)} ファイル、ZIP {len(data)} バイト。成果物の一覧 {inventory['jobCount']} job・{inventory['entityCount']} 素材"
          f"（記録と保管庫が食い違うファイル {len(inventory['missingOrChanged'])}）")
    if changed is not None:
        print(f"前回（{previous['vaultCommit'][:8]}）から変わったファイル: {len(changed)}")
        for path in changed[:15]:
            print(f"    {path}")
        if len(changed) > 15:
            print(f"    … ほか {len(changed) - 15} 件")
    if not args.apply:
        print("表示だけです。置くには --apply を付けます")
        return 0
    outbox.mkdir(exist_ok=True)
    zip_file = outbox / note["zip"]["name"]
    if zip_file.exists():
        sys.exit(f"同じ名前の写しがすでにあります（上書きしません）: {zip_file.name}")
    zip_file.write_bytes(data)
    (outbox / inventory_name).write_text(inventory_text)
    text = json.dumps(note, ensure_ascii=False, indent=2) + "\n"
    (outbox / f"{base}.snapshot.json").write_text(text)
    latest_file.write_text(text)
    print(f"置きました: {OUTBOX}/{zip_file.name}、{base}.snapshot.json、{inventory_name}、latest-snapshot.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
