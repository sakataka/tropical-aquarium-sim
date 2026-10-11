# /// script
# requires-python = ">=3.11"
# ///
"""種の下書きを書くための材料を、1種ぶんまとめて表示する（保管庫を読むだけ）。

  uv run scripts/species-packet.py <species-id>
  uv run scripts/species-packet.py --body-plans <species-id>...   各種の画風と、その画風で使える体のつくりを JSON で出す（check-prepared.ts が読む）

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


def generation_style(generation: dict) -> str | None:
    """生成の記録の画風。配送の時期で形が違う（normalizedJob.image の中か、いちばん上）。"""
    return generation.get("normalizedJob", {}).get("image", {}).get("styleId") or generation.get("styleId")


def catalog_entry(species_id: str, variant_id: str | None) -> dict:
    entries = []
    for name in ("dots-additions.json", "species-backlog.json"):
        entries += [entry for entry in json.loads((vault / "catalog" / name).read_text())["entries"] if entry.get("speciesId") == species_id]
    return next((entry for entry in entries if entry.get("variantId") == variant_id), entries[0] if entries else {})


def body_plans_by_style() -> dict[str, dict[str, str]]:
    """館にいる種の、画風ごとの体のつくり（{画風: {体のつくり: 手本の種}}）。"""
    plans: dict[str, dict[str, str]] = {}
    for file in sorted((ROOT / "src" / "content" / "fish").glob("*/species.json")):
        other = file.parent.name
        adoption = vault / "adoptions" / f"{other}.json"
        records = sorted((vault / "drafts" / other).glob("*/image/*/*/generation.json"))
        if adoption.exists():
            chosen = vault / Path(json.loads(adoption.read_text())["image"]["path"]).parent / "generation.json"
            records = [chosen] if chosen.exists() else records
        style = generation_style(json.loads(records[-1].read_text())) if records else None
        if style:
            plans.setdefault(style, {}).setdefault(json.loads(file.read_text()).get("swim", {}).get("bodyPlan", "fish"), other)
    return plans


def describe_image(species_id: str, variant_id: str | None, generation: dict, file: Path) -> None:
    job = generation.get("normalizedJob", {}).get("image", {})
    entry = catalog_entry(species_id, variant_id)
    style = generation_style(generation)
    print(f"画風: {style or '記録なし'}" + ("" if style else f"（カタログでは bodyPlan {entry.get('bodyPlan')}、view {entry.get('view')}）"))
    if style:
        known = body_plans_by_style().get(style)
        if known:
            print("体のつくり: この画風の館の種は " + "、".join(f"bodyPlan {plan}（手本 {example}）" for plan, example in known.items()))
        else:
            print("体のつくり: この画風を描ける体のつくりは、まだアプリにない。下書きは書かず、"
                  f"`uv run scripts/agent-queue.py block species-prepare {species_id} --by <名前> --reason \"体のつくり待ち（{style}）\"` で保留にする")
    if generation.get("operation") and "generat" not in str(generation.get("executionMode", "generat")):
        source = generation.get("revisionTarget", {}).get("path", "")
        print(f"この版は、生成ではなく前の版から作った派生の画像（{generation.get('operation')}{'。元 ' + source if source else ''}）")
    subject = job.get("subjectEn") or entry.get("subjectEn")
    if subject:
        print(f"絵の説明{'' if job.get('subjectEn') else '（カタログの依頼文）'}: {subject}")
    else:
        prompt = file.parent / "prompt.txt"
        print(f"絵の説明: 記録に依頼文がない。{prompt if prompt.exists() else '生成の記録 ' + str(file)} を読む")


def expected_body_plans(species_ids: list[str]) -> dict[str, dict]:
    known = body_plans_by_style()
    result = {}
    for species_id in species_ids:
        folder = vault / "drafts" / species_id
        records = sorted(folder.glob("*/image/*/*/generation.json"))
        adoption = vault / "adoptions" / f"{species_id}.json"
        if adoption.exists():
            chosen = vault / Path(json.loads(adoption.read_text())["image"]["path"]).parent / "generation.json"
            records = [chosen] if chosen.exists() else records
        style = generation_style(json.loads(records[-1].read_text())) if records else None
        result[species_id] = {"style": style, "plans": sorted(known.get(style, {})) if style else None}
    return result


def main() -> None:
    if sys.argv[1] == "--body-plans":
        print(json.dumps(expected_body_plans(sys.argv[2:]), ensure_ascii=False))
        return
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
        describe_image(species_id, research.get("variantId"), generation, generations[-1])

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
