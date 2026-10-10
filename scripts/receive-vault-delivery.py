# /// script
# requires-python = ">=3.11"
# ///
"""dots が Google Drive に置いた配送（ZIP と外部の JSON）を照合し、保管庫（sakataka/aquarium-assets）へ置く。

GitHub 経由で dots から直接受け取れない間の受け渡し。Drive のフォルダは、Google Drive のデスクトップアプリで
ローカルのフォルダとして見えている前提（読むだけで、書き換えない）。

  uv run scripts/receive-vault-delivery.py                 届いている配送を照合し、置く内容を表示する（何も書かない）
  uv run scripts/receive-vault-delivery.py --apply         照合に通った配送を保管庫へ置き、受領の記録を書く
  uv run scripts/receive-vault-delivery.py <配送ID>...      配送を絞る

配送の形（1回の配送 = ZIP 1個 + 外部の JSON 1個。項目は docs/asset-vault.md の「Drive 経由の受領」）:
  aquarium-delivery-<配送ID>.zip            manifest.json と、そこに書いたファイルだけを含む
  aquarium-delivery-<配送ID>.delivery.json  配送ID、ZIP のサイズと SHA-256、依存する配送

決まり:
  - ZIP のサイズと SHA-256、manifest の各ファイルのサイズと SHA-256 が合わなければ、何も置かずに止まる。
  - 置けるのは保管庫の drafts/ の下だけ（ALLOWED_PREFIXES）。queue/state などのジョブ状態は受け取らない。
  - 保管庫に同じパス・同じハッシュがあれば飛ばす。違うハッシュがあれば、何も置かずに止まる（上書きしない）。
  - 同じ配送ID・同じ ZIP のハッシュを受領済みなら飛ばす。同じ配送IDでハッシュが違えば止まる。
  - dependsOn に書かれた配送が未受領なら止まる（previousDeliveryId は記録するだけ）。
  - commit・push はしない。受領の記録（consumer/deliveries/<配送ID>.json）が GitHub の main に入った時点が「保存完了」。

保管庫は AQUARIUM_ASSET_VAULT、Drive のフォルダは AQUARIUM_DELIVERY_DIR（既定は下の DEFAULT_DELIVERY_DIR）。
"""

import argparse
import hashlib
import json
import os
import shutil
import stat
import sys
import tempfile
import zipfile
from datetime import datetime, timezone, timedelta
from pathlib import Path, PurePosixPath

DEFAULT_DELIVERY_DIR = "~/Library/CloudStorage/GoogleDrive-sakataka@gmail.com/マイドライブ/aquarium-dot-delivery"
ALLOWED_PREFIXES = ("drafts/",)
KINDS = {"image", "research", "provenance", "qa"}
MAX_TOTAL_BYTES = 2 * 1024 ** 3
JST = timezone(timedelta(hours=9))


class Stop(Exception):
    """照合に通らなかった。この配送は何も置かない。"""


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def need(mapping: dict, key: str, kind: type, where: str):
    if not isinstance(mapping.get(key), kind):
        raise Stop(f"{where}: {key} がないか、形が違います")
    return mapping[key]


def safe_path(path: str) -> PurePosixPath:
    pure = PurePosixPath(path)
    if pure.is_absolute() or ".." in pure.parts or "\\" in path or path.startswith("~") or not pure.parts:
        raise Stop(f"保管庫の外へ出るパス: {path}")
    return pure


def ledger_dir(vault: Path) -> Path:
    return vault / "consumer" / "deliveries"


def read_ledger(vault: Path, delivery_id: str) -> dict | None:
    file = ledger_dir(vault) / f"{delivery_id}.json"
    return json.loads(file.read_text()) if file.exists() else None


def check(note_file: Path, vault: Path) -> dict:
    """配送を照合し、置く内容を返す。何も書かない。"""
    try:
        note = json.loads(note_file.read_text())
    except (OSError, ValueError) as error:
        raise Stop(f"{note_file.name}: 読めません（{error}）")
    where = note_file.name
    if note.get("schemaVersion") != "aquarium-delivery/1":
        raise Stop(f"{where}: schemaVersion が aquarium-delivery/1 ではありません")
    delivery_id = need(note, "deliveryId", str, where)
    if not delivery_id.replace("-", "").replace("_", "").isalnum():
        raise Stop(f"{where}: deliveryId に使えない文字があります: {delivery_id}")
    zip_note = need(note, "zip", dict, where)
    zip_name = need(zip_note, "name", str, where)
    if "/" in zip_name or not zip_name.endswith(".zip"):
        raise Stop(f"{where}: zip.name が ZIP のファイル名ではありません: {zip_name}")
    zip_sha = need(zip_note, "sha256", str, where).lower()

    known = read_ledger(vault, delivery_id)
    if known:
        if known["zip"]["sha256"] != zip_sha:
            raise Stop(f"配送 {delivery_id} は受領済みですが、ZIP のハッシュが違います（受領済み {known['zip']['sha256'][:12]}… / 今回 {zip_sha[:12]}…）")
        return {"deliveryId": delivery_id, "status": "already-received", "receivedAt": known["receivedAt"]}
    for dependency in note.get("dependsOn") or []:
        if not read_ledger(vault, dependency):
            raise Stop(f"配送 {delivery_id} が依存する配送 {dependency} が未受領です")

    zip_file = note_file.parent / zip_name
    if not zip_file.exists():
        raise Stop(f"ZIP がありません: {zip_name}")
    data = zip_file.read_bytes()
    if len(data) != need(zip_note, "size", int, where):
        raise Stop(f"ZIP のサイズが違います: 実測 {len(data)} / 外部の JSON {zip_note['size']}")
    if sha256(data) != zip_sha:
        raise Stop(f"ZIP の SHA-256 が違います: 実測 {sha256(data)}")

    with zipfile.ZipFile(zip_file) as archive:
        broken = archive.testzip()
        if broken:
            raise Stop(f"ZIP の CRC が合いません: {broken}")
        entries = {info.filename: info for info in archive.infolist() if not info.is_dir()}
        for info in entries.values():
            safe_path(info.filename)
            if stat.S_ISLNK(info.external_attr >> 16):
                raise Stop(f"ZIP にシンボリックリンクがあります: {info.filename}")
        if sum(info.file_size for info in entries.values()) > MAX_TOTAL_BYTES:
            raise Stop("ZIP の展開後が大きすぎます")
        if "manifest.json" not in entries:
            raise Stop("ZIP の直下に manifest.json がありません")
        try:
            manifest = json.loads(archive.read("manifest.json"))
        except ValueError as error:
            raise Stop(f"manifest.json を読めません（{error}）")
        if manifest.get("schemaVersion") != "aquarium-delivery-manifest/1":
            raise Stop("manifest.json: schemaVersion が aquarium-delivery-manifest/1 ではありません")
        if manifest.get("deliveryId") != delivery_id:
            raise Stop(f"manifest.json の deliveryId（{manifest.get('deliveryId')}）が外部の JSON（{delivery_id}）と違います")
        files = need(manifest, "files", list, "manifest.json")
        if "fileCount" in note and note["fileCount"] != len(files):
            raise Stop(f"ファイルの数が違います: manifest {len(files)} / 外部の JSON {note['fileCount']}")
        listed = set()
        new, same, payload = [], [], {}
        for index, item in enumerate(files):
            label = f"manifest.json files[{index}]"
            if not isinstance(item, dict):
                raise Stop(f"{label}: 形が違います")
            path = need(item, "path", str, label)
            safe_path(path)
            if not path.startswith(ALLOWED_PREFIXES):
                raise Stop(f"受け取れない置き場所です（{', '.join(ALLOWED_PREFIXES)} の下だけ）: {path}")
            if item.get("kind") not in KINDS:
                raise Stop(f"{label}: kind は {sorted(KINDS)} のどれかにしてください: {item.get('kind')}")
            if path in listed:
                raise Stop(f"manifest.json に同じパスが2回あります: {path}")
            listed.add(path)
            if path not in entries:
                raise Stop(f"manifest.json にあるファイルが ZIP にありません: {path}")
            content = archive.read(path)
            if len(content) != need(item, "size", int, label) or sha256(content) != need(item, "sha256", str, label).lower():
                raise Stop(f"サイズか SHA-256 が manifest と違います: {path}")
            target = vault / path
            if target.is_symlink() or any(parent.is_symlink() for parent in target.parents if vault in parent.parents):
                raise Stop(f"保管庫の置き場所がシンボリックリンクです: {path}")
            if target.exists():
                if sha256(target.read_bytes()) != sha256(content):
                    raise Stop(f"保管庫に同じパスで中身の違うファイルがあります（上書きしません）: {path}")
                same.append(path)
            else:
                new.append(path)
                payload[path] = content
        extra = sorted(set(entries) - listed - {"manifest.json"})
        if extra:
            raise Stop(f"manifest.json に書かれていないファイルが ZIP にあります: {', '.join(extra[:5])}")
    return {
        "deliveryId": delivery_id, "status": "ready", "note": note, "manifest": manifest,
        "zip": {"name": zip_name, "size": len(data), "sha256": zip_sha},
        "new": new, "same": same, "payload": payload,
    }


def apply(result: dict, vault: Path) -> Path:
    """照合に通った配送を保管庫へ置き、受領の記録を書く。途中で失敗しても、置きかけのファイルを残さない。"""
    staging = Path(tempfile.mkdtemp(prefix="aquarium-delivery-"))
    written: list[Path] = []
    try:
        for path, content in result["payload"].items():
            staged = staging / path
            staged.parent.mkdir(parents=True, exist_ok=True)
            staged.write_bytes(content)
        for path in result["new"]:
            target = vault / path
            if target.exists():
                raise Stop(f"照合のあとに保管庫へファイルが現れました: {path}")
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(staging / path, target)
            written.append(target)
        note, manifest = result["note"], result["manifest"]
        by_path = {item["path"]: item for item in manifest["files"]}
        record = {
            "schemaVersion": "aquarium-delivery-receipt/1",
            "deliveryId": result["deliveryId"],
            "receivedAt": datetime.now(JST).isoformat(timespec="seconds"),
            "receivedBy": "claude-code",
            "createdAt": note.get("createdAt"),
            "previousDeliveryId": note.get("previousDeliveryId"),
            "dependsOn": note.get("dependsOn") or [],
            "baseCommit": note.get("baseCommit"),
            "zip": result["zip"],
            "placed": [{"path": path, "sha256": by_path[path]["sha256"].lower()} for path in result["new"]],
            "alreadyInVault": [{"path": path, "sha256": by_path[path]["sha256"].lower()} for path in result["same"]],
            "entities": sorted({item["entityId"] for item in manifest["files"] if isinstance(item.get("entityId"), str)}),
            "noteJa": "Drive から受領し、照合して保管庫へ置いた。この記録が GitHub の main にあれば保存完了。",
        }
        file = ledger_dir(vault) / f"{result['deliveryId']}.json"
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
        return file
    except Exception:
        for target in written:
            target.unlink(missing_ok=True)
        raise
    finally:
        shutil.rmtree(staging, ignore_errors=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Drive に届いた dots の配送を照合し、保管庫へ置く")
    parser.add_argument("deliveries", nargs="*", help="配送ID（省くと、届いている配送すべて）")
    parser.add_argument("--apply", action="store_true", help="照合に通った配送を保管庫へ置く（省くと表示だけ）")
    args = parser.parse_args()
    vault_value = os.environ.get("AQUARIUM_ASSET_VAULT")
    if not vault_value:
        sys.exit("AQUARIUM_ASSET_VAULT に保管庫の clone のパスを入れてください")
    vault = Path(vault_value).expanduser().resolve()
    source = Path(os.environ.get("AQUARIUM_DELIVERY_DIR", DEFAULT_DELIVERY_DIR)).expanduser()
    if not (vault / "drafts").is_dir():
        sys.exit(f"保管庫ではないようです（drafts/ がありません）: {vault}")
    if not source.is_dir():
        sys.exit(f"Drive のフォルダが見えません（Google Drive のアプリが動いているか確かめてください）: {source}")

    notes = sorted(source.glob("*.delivery.json"))
    if not notes:
        print(f"配送はありません（{source} に *.delivery.json がない）")
        return 0
    failed = False
    seen = set()
    for note_file in notes:
        try:
            delivery_id = json.loads(note_file.read_text()).get("deliveryId")
        except (OSError, ValueError):
            delivery_id = None
        if args.deliveries and delivery_id not in args.deliveries:
            continue
        seen.add(delivery_id)
        try:
            result = check(note_file, vault)
            if result["status"] == "already-received":
                print(f"[受領済み] {result['deliveryId']}（{result['receivedAt']}）。飛ばします")
                continue
            print(f"[照合OK] {result['deliveryId']}: 新しく置く {len(result['new'])} 件、保管庫に同じものがある {len(result['same'])} 件"
                  f"（ZIP {result['zip']['size']} バイト）")
            for path in result["new"][:20]:
                print(f"    + {path}")
            if len(result["new"]) > 20:
                print(f"    … ほか {len(result['new']) - 20} 件")
            if args.apply:
                file = apply(result, vault)
                print(f"    保管庫へ置き、受領の記録を書きました: {file.relative_to(vault)}（まだ commit していません）")
            else:
                print("    表示だけです。置くには --apply を付けます")
        except Stop as stop:
            failed = True
            print(f"[停止] {note_file.name}: {stop}")
    for delivery_id in args.deliveries:
        if delivery_id not in seen:
            failed = True
            print(f"[停止] 配送 {delivery_id} の外部の JSON が見つかりません")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
