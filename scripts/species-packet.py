# /// script
# requires-python = ">=3.11"
# ///
"""種の下書きを書くための材料を、1種ぶんまとめて表示する（保管庫を読むだけ）。

  uv run scripts/species-packet.py <species-id>

出すもの: 名前、絵の説明（どの姿で描いたか）、置く水槽（展示計画の大きさ・ねらい・水景、同じ水槽の種）、
調査（research.json）の各項目を1行ずつ（値・範囲・単位・成長段階・根拠の強さ・注記）、出典の一覧。
調査の全文（約50KB）を読まずに済ませるためのもの。根拠の強さが unverified・unknown の項目は、
事実として書かないよう、行の頭に「?」を付ける。
"""

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
vault = Path(os.environ.get("AQUARIUM_ASSET_VAULT", "~/Documents/aquarium-assets")).expanduser()


def short(value) -> str:
    return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)


def main() -> None:
    species_id = sys.argv[1]
    folder = vault / "drafts" / species_id
    research_file = sorted(folder.glob("*/research/*/*/research.json"))[-1]
    research = json.loads(research_file.read_text())
    print(f"# {species_id} {research['names'].get('nameJa', '')}（{research['names'].get('scientificName', '')}）")
    print(f"調査: {research_file}（variant {research.get('variantId')}）")

    adoption_file = vault / "adoptions" / f"{species_id}.json"
    generations = sorted(folder.glob("*/image/*/*/generation.json"))
    if adoption_file.exists():
        chosen = Path(json.loads(adoption_file.read_text())["image"]["path"]).parent
        generations = [vault / chosen / "generation.json"]
        print(f"採用した絵: {chosen}/original.png")
    elif generations:
        print(f"絵（採否はまだ。最新の版）: {generations[-1].parent.relative_to(vault)}/original.png")
    order = None
    if generations:
        generation = json.loads(generations[-1].read_text())
        order = generation.get("workQueueOrder")
        image = generation["normalizedJob"]["image"]
        print(f"画風: {image.get('styleId')}")
        print(f"絵の説明: {image.get('subjectEn', '')}")

    print("\n## 置く水槽")
    plan = json.loads((vault / "catalog" / "exhibit-plan.json").read_text())
    scientific = research["names"].get("scientificName", "")
    found = None
    for floor in plan["floors"]:
        for hall in floor["halls"]:
            for tank in hall["tanks"]:
                in_species = species_id in tank.get("species", [])
                in_candidates = any(candidate.get("speciesId") == species_id
                                    or candidate.get("scientificName", "").split()[:2] == scientific.split()[:2]
                                    for candidate in tank.get("candidates", []))
                if in_species or (in_candidates and not found):
                    found = (floor, hall, tank)
    if found:
        floor, hall, tank = found
        print(f"{tank['id']}「{tank.get('displayName')}」 幅{tank.get('widthCm')}×高さ{tank.get('heightCm')}×奥行{tank.get('depthCm')}cm")
        print(f"展示室: {hall.get('displayName')}（{hall['id']}。{floor.get('displayName')}）")
        print(f"ねらい: {tank.get('storyJa', '')}")
        print(f"水景: {tank.get('sceneEn', '')}")
        others = []
        for other in tank.get("species", []):
            if other == species_id:
                continue
            for base in (ROOT / "src" / "content" / "fish", ROOT / "content-drafts" / "fish", ROOT / "content-drafts" / "prepared" / "fish"):
                file = base / other / "species.json"
                if file.exists():
                    data = json.loads(file.read_text())
                    others.append(f"{data.get('displayName', other)}（{data.get('realBodyLengthCm', '?')}cm）")
                    break
            else:
                others.append(other)
        print(f"同じ水槽の種: {'、'.join(others) or 'なし'}")
        if tank["id"] in {path.name for path in (ROOT / 'src' / 'content' / 'tanks').iterdir()}:
            print(f"この水槽は開いている: src/content/tanks/{tank['id']}/tank.json")
    else:
        print(f"展示計画に置き場所が見つからない（作業リストの order {order}。unplacedSpecies か、候補から外れた種）")

    for section, items in research["sections"].items():
        print(f"\n## {section}")
        for item in items:
            weak = item.get("evidenceStatus") in ("unverified", "unknown")
            parts = [short(item.get("value")) if item.get("value") is not None else ""]
            if item.get("range"):
                parts.append(f"範囲 {short(item['range'])}")
            if item.get("unit"):
                parts.append(f"単位 {item['unit']}")
            if item.get("lifeStage"):
                parts.append(f"段階 {item['lifeStage']}")
            parts.append(f"[{item.get('evidenceStatus')}; {','.join(item.get('sourceIds') or [])}]")
            if item.get("notesJa"):
                parts.append(f"注 {item['notesJa']}")
            print(f"{'? ' if weak else '- '}{item['field']}: {' | '.join(part for part in parts if part)}")

    print("\n## issues")
    for issue in research.get("issues", []):
        print(f"- {short(issue)}")
    print("\n## sources")
    for source_id, source in research["sources"].items():
        print(f"- {source_id}: {source.get('title')} <{source.get('url')}>")


main()
