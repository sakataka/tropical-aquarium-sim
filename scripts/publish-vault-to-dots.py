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
  latest-snapshot.json                                    いちばん新しい .snapshot.json の写し（毎回書き換える）

決まり:
  - 保管庫の HEAD が origin/main と同じで、対象のパスに commit していない変更がないときだけ置く
    （GitHub の正本と Drive の写しが食い違わないように）。
  - 文字のファイルだけ（依頼、採否、展示計画、要件、返事、受領の記録）。原画などの画像は入れない。
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
    note = {
        "schemaVersion": "aquarium-vault-snapshot/1",
        "purpose": "保管庫（GitHub の main）のうち、dots が読む文字のファイルの写し。正本は GitHub。",
        "vaultCommit": head,
        "createdAt": stamp.isoformat(timespec="seconds"),
        "createdBy": "claude-code",
        "zip": {"name": f"{base}.zip", "size": len(data), "sha256": hashlib.sha256(data).hexdigest()},
        "fileCount": len(files),
        "includes": [path for path in PATHS if not path.startswith(":(exclude)")],
        "previousVaultCommit": previous["vaultCommit"] if previous else None,
        "changedSincePrevious": changed,
    }
    print(f"保管庫 {head[:8]}: {len(files)} ファイル、ZIP {len(data)} バイト")
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
    text = json.dumps(note, ensure_ascii=False, indent=2) + "\n"
    (outbox / f"{base}.snapshot.json").write_text(text)
    latest_file.write_text(text)
    print(f"置きました: {OUTBOX}/{zip_file.name} と {base}.snapshot.json、latest-snapshot.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
