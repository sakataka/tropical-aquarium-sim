# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow>=11"]
# ///
"""Drive 経由で届いた種の絵を確かめ、採用を保管庫に記録する。

絵の採否は目で決める（Claude Code の仕事）。このスクリプトは、その前後の機械的な部分を受け持つ。

  AQUARIUM_ASSET_VAULT=~/Documents/aquarium-assets uv run scripts/vault-adoption.py sheet <出力.png> <species-id>...
      届いている版を灰色の背景に並べた一覧を作り、外接矩形・余白・dots の QA の推す版を表示する（1枚に6種までが見やすい）

  AQUARIUM_ASSET_VAULT=... uv run scripts/vault-adoption.py record <species-id> --tank <tank-id> --name-en <英名> --hint <ひとこと>
      [--attempt N] [--alias <別名>]... [--water freshwater|brackish|marine] [--keeping publicAquarium|home|rarelyDisplayed] [--note <追記>]
      採用の記録（adoptions/<id>.json）を書き、カタログ（catalog/dots-additions.json）に項目がなければ足し、
      展示計画のその水槽の候補（candidates）から種（species）へ移す。版を省くと、dots の QA の推す版
      （なければ最新の版）。既知の差は、QA の notImproved を写す。保管庫の commit・push はしない。

カタログの項目は、画像の generation.json の normalizedJob（subjectEn・framingEn）と research.json（和名・学名）から写す
（配送にカタログの項目が入っていないため）。英名とひとこと（exhibitHint）は調査の欄の名前が種ごとに違うので、引数で渡す。
"""

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from PIL import Image, ImageDraw

JST = timezone(timedelta(hours=9))
# 画風の頭の部分 -> カタログの bodyPlan と view。
STYLES = {
    "fish-side": ("fish", "lateral"),
    "crustacean-side": ("crustacean", "lateral"),
    "crab-oblique": ("crab", "oblique"),
    "gastropod-oblique": ("gastropod", "oblique"),
    "gelatinous-side": ("jelly", "lateral"),
    "amphibian-side": ("walker", "lateral"),
    "frog-dorsal": ("frog", "dorsal"),
    "ray-dorsal": ("ray", "dorsal"),
}


def vault_path() -> Path:
    value = os.environ.get("AQUARIUM_ASSET_VAULT")
    if not value:
        sys.exit("AQUARIUM_ASSET_VAULT に保管庫の clone のパスを入れてください")
    return Path(value).expanduser()


def attempts(vault: Path, species_id: str) -> list[Path]:
    return sorted((vault / "drafts" / species_id).glob("*/image/*/*/original.png"))


def read_json(path: Path) -> dict:
    return json.loads(path.read_text()) if path.exists() else {}


def sheet(vault: Path, output: Path, species_ids: list[str]) -> None:
    cells = []
    for species_id in species_ids:
        for png in attempts(vault, species_id):
            image = Image.open(png).convert("RGBA")
            left, top, right, bottom = image.split()[3].point(lambda value: 255 if value > 16 else 0).getbbox()
            qa = read_json(png.with_name("image-qa.json"))
            label = (f"{species_id} {png.parent.parent.name}/{png.parent.name} "
                     f"余白 左{left} 上{top} 右{image.width - right} 下{image.height - bottom}")
            print(f"{label} | QA の推す版 {qa.get('comparison', {}).get('preferredAttempt')}")
            cell = Image.new("RGBA", image.size, (128, 128, 128, 255))
            cell.alpha_composite(image)
            cell = cell.convert("RGB").resize((768, 512))
            ImageDraw.Draw(cell).text((6, 4), f"{species_id} {png.parent.parent.name}/{png.parent.name}", fill=(255, 255, 0))
            cells.append(cell)
    rows = (len(cells) + 1) // 2
    page = Image.new("RGB", (768 * 2, 512 * rows), (60, 60, 60))
    for index, cell in enumerate(cells):
        page.paste(cell, ((index % 2) * 768, (index // 2) * 512))
    output.parent.mkdir(parents=True, exist_ok=True)
    page.save(output)
    print(f"一覧: {output}")


def record(vault: Path, args: argparse.Namespace) -> None:
    species_id = args.species_id
    candidates = attempts(vault, species_id)
    if not candidates:
        sys.exit(f"{species_id}: 保管庫に絵がありません")
    latest_request = candidates[-1].parent.parent
    in_request = [png for png in candidates if png.parent.parent == latest_request]
    attempt = args.attempt
    if attempt is None:
        preferred = [read_json(png.with_name("image-qa.json")).get("comparison", {}).get("preferredAttempt") for png in in_request]
        attempt = next((value for value in reversed(preferred) if value), len(in_request))
    png = latest_request / f"attempt-{attempt}" / "original.png"
    if not png.exists():
        sys.exit(f"{species_id}: {png.relative_to(vault)} がありません")
    generation = read_json(png.with_name("generation.json"))
    qa = read_json(png.with_name("image-qa.json"))
    research_files = sorted((vault / "drafts" / species_id).glob("*/research/*/*/research.json"))
    if not research_files:
        sys.exit(f"{species_id}: 調査がまだ届いていません（画像だけでは採用しない）")
    names = read_json(research_files[-1])["names"]
    job = generation.get("normalizedJob", {})
    image_job = job.get("image", {})
    relative = str(png.relative_to(vault))
    deliveries = sorted(file.stem for file in (vault / "consumer" / "deliveries").glob("*.json") if relative in file.read_text())
    request = int(latest_request.name.removeprefix("request-r"))

    known = "; ".join(qa.get("comparison", {}).get("notImproved", []) or [str(issue) for issue in qa.get("issues", [])][:6])
    note = (f"r{request} の{attempt}枚目（attempt-{attempt}）を採用（Drive 経由の配送 {'・'.join(deliveries) or '不明'}）。"
            "灰色の背景に重ねた一覧で目視し、依頼の姿・向き・体の全体が絵に入っていることを確かめた。"
            + (f"既知の差（dots の QA のとおり）: {known}。" if known else "")
            + "余白が目安に届かない点、alpha 1〜3 の薄い残りと最大 alpha 254 は、アプリが外接矩形で切り出し、"
              "alpha 3 以下を消して 240 以上を 255 にそろえるので支障なし。" + (args.note or ""))
    adoption = {
        "schemaVersion": "aquarium-adoption/1", "speciesId": species_id, "variantId": generation.get("variantId", png.parents[3].name), "tankId": args.tank,
        "image": {"status": "accepted", "jobId": job.get("jobId", f"{species_id}.{png.parents[3].name}.image"), "requestRevision": request, "outputRevision": attempt,
                  "path": relative, "sha256": hashlib.sha256(png.read_bytes()).hexdigest(),
                  "decidedAt": datetime.now(JST).isoformat(timespec="seconds"), "decidedBy": "claude-code", "notesJa": note},
    }
    (vault / "adoptions" / f"{species_id}.json").write_text(json.dumps(adoption, ensure_ascii=False, indent=2) + "\n")

    plan_file = vault / "catalog" / "exhibit-plan.json"
    plan = json.loads(plan_file.read_text())
    floor_id = None
    for floor in plan["floors"]:
        for hall in floor["halls"]:
            for tank in hall["tanks"]:
                if tank["id"] != args.tank:
                    continue
                floor_id = floor["id"]
                if species_id not in tank["species"]:
                    tank["species"].append(species_id)
                genus_species = names["scientificName"].split()[:2]
                tank["candidates"] = [candidate for candidate in tank.get("candidates", [])
                                      if candidate.get("speciesId") != species_id and candidate.get("nameJa") != names["nameJa"]
                                      and candidate.get("scientificName", "").split()[:2] != genus_species]
    if floor_id is None:
        sys.exit(f"展示計画に水槽 {args.tank} がありません")
    plan_file.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n")

    catalog_file = vault / "catalog" / "dots-additions.json"
    catalog = json.loads(catalog_file.read_text())
    if not any(entry["speciesId"] == species_id for entry in catalog["entries"]):
        style = image_job.get("styleId") or generation.get("styleId") or ""
        body_plan, view = next((value for prefix, value in STYLES.items() if style.startswith(prefix)), (None, None))
        if body_plan is None:
            sys.exit(f"{species_id}: 画風 {style} の bodyPlan と view が分かりません（STYLES に足す）")
        catalog["entries"].append({
            "speciesId": species_id, "variantId": adoption["variantId"], "nameJa": names["nameJa"], "nameEn": args.name_en,
            "scientificName": names["scientificName"], "aliases": args.alias, "floorId": floor_id, "tankId": args.tank, "exhibitHint": args.hint,
            "water": args.water, "keeping": args.keeping, "bodyPlan": body_plan, "view": view, "styleReady": True,
            "lifeStage": image_job.get("lifeStage", "adult"), "priority": 2, "subjectEn": image_job.get("subjectEn", ""), "framingEn": image_job.get("framingEn", ""),
            "notesJa": (f"作業リストの order {generation.get('workQueueOrder')}。dots が学名・和名・画像の説明を調査して決め、Drive 経由で納品した。"
                        "配送にカタログの項目がなかったので、Claude Code が画像の generation.json の normalizedJob と research.json から写した"
                        f"（{datetime.now(JST).date().isoformat()}）。"),
        })
        catalog["updatedAt"] = datetime.now(JST).date().isoformat()
        catalog_file.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
    print(f"{species_id}（{names['nameJa']}）: {relative} を採用 -> {args.tank}")


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    sheet_parser = sub.add_parser("sheet")
    sheet_parser.add_argument("output", type=Path)
    sheet_parser.add_argument("species_ids", nargs="+")
    record_parser = sub.add_parser("record")
    record_parser.add_argument("species_id")
    record_parser.add_argument("--tank", required=True)
    record_parser.add_argument("--name-en", required=True)
    record_parser.add_argument("--hint", required=True)
    record_parser.add_argument("--attempt", type=int)
    record_parser.add_argument("--alias", action="append", default=[])
    record_parser.add_argument("--water", default="freshwater", choices=["freshwater", "brackish", "marine"])
    record_parser.add_argument("--keeping", default="publicAquarium", choices=["publicAquarium", "home", "rarelyDisplayed"])
    record_parser.add_argument("--note")
    args = parser.parse_args()
    vault = vault_path()
    if args.command == "sheet":
        sheet(vault, args.output, args.species_ids)
    else:
        record(vault, args)


main()
