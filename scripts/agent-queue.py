# /// script
# requires-python = ">=3.11"
# ///
"""エージェント（Codex・Claude Code）が、同じ作業を二重に進めないための作業リスト。

作業の一覧は、ファイルの有無から毎回組み立てる（中央の一覧ファイルを手で書き換えない）。
1つの作業は「担当の印（claim.json）を置く → 成果物を書く」で進み、成果物があれば済み。
担当の印は、同じ作業フォルダに排他的に作る（同じ Mac の同じ checkout を2つのエージェントが使う前提）。

  uv run scripts/agent-queue.py status                       レーンごとの数（未着手・作業中・済み）
  uv run scripts/agent-queue.py list <レーン> [--all]         未着手の作業を順に表示（--all は作業中・済みも）
  uv run scripts/agent-queue.py claim <レーン> <件数> --by <名前> [<id>...]
                                                             先頭から件数ぶん（id を並べればその作業）に印を置き、id を表示
  uv run scripts/agent-queue.py release <レーン> <id>         印を外す（成果物を書かずにやめるとき）

レーンと手順書は docs/codex-queue.md。印を置いてから STALE_HOURS 時間たっても成果物がない作業は、
未着手として扱う（途中で止まったエージェントの作業を、ほかのエージェントが引き取れるようにする）。
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STALE_HOURS = 12
JST = timezone(timedelta(hours=9))


def vault_path() -> Path:
    return Path(os.environ.get("AQUARIUM_ASSET_VAULT", "~/Documents/aquarium-assets")).expanduser()


def species_prepare_tasks() -> list[tuple[str, str]]:
    """調査が保管庫に届いていて、アプリにまだ下書きのない種。作業リストの順。"""
    vault = vault_path()
    tasks = []
    for folder in sorted((vault / "drafts").iterdir()):
        species_id = folder.name
        if species_id.startswith(("hall-", "scene-", "museum-")) or not any(folder.glob("*/research/*/*/research.json")):
            continue
        if (ROOT / "src" / "content" / "fish" / species_id).exists():
            continue
        draft = ROOT / "content-drafts" / "fish" / species_id / "species.json"
        if draft.exists() and "profile" in json.loads(draft.read_text()):
            continue
        order = 10 ** 6
        for generation in folder.glob("*/image/*/*/generation.json"):
            order = min(order, json.loads(generation.read_text()).get("workQueueOrder") or order)
        research = json.loads(sorted(folder.glob("*/research/*/*/research.json"))[-1].read_text())
        tasks.append((order, species_id, research.get("names", {}).get("nameJa", "")))
    return [(species_id, f"order {order} {name}") for order, species_id, name in sorted(tasks)]


def census_tasks() -> list[tuple[str, str]]:
    """日本の水族館の飼育種の調査。最初の1件は出発点の確認（setup）、あとは館ごと。"""
    base = ROOT / "research" / "aquarium-census"
    tasks = [("setup", "出発点の確認と館の一覧づくり")]
    listing = base / "facilities.json"
    if listing.exists():
        for facility in json.loads(listing.read_text())["facilities"]:
            tasks.append((facility["id"], facility.get("nameJa", "")))
    return tasks


LANES = {
    "species-prepare": {
        "tasks": species_prepare_tasks,
        "dir": lambda task_id: ROOT / "content-drafts" / "prepared" / "fish" / task_id,
        "done": "species.json",
        "playbook": "docs/agent-lanes/species-prepare.md",
    },
    "aquarium-census": {
        "tasks": census_tasks,
        "dir": lambda task_id: ROOT / "research" / "aquarium-census" / "facilities" / task_id,
        "done": "species.json",
        "playbook": "docs/agent-lanes/aquarium-census.md",
    },
}
# setup の成果物は館の一覧そのもの。
CENSUS_SETUP_DONE = ROOT / "research" / "aquarium-census" / "facilities.json"


def state(lane: str, task_id: str) -> tuple[str, dict | None]:
    spec = LANES[lane]
    folder = spec["dir"](task_id)
    done = CENSUS_SETUP_DONE if (lane, task_id) == ("aquarium-census", "setup") else folder / spec["done"]
    claim_file = folder / "claim.json"
    claim = json.loads(claim_file.read_text()) if claim_file.exists() else None
    if done.exists():
        return "done", claim
    if claim:
        age = datetime.now(JST) - datetime.fromisoformat(claim["at"])
        return ("stale" if age > timedelta(hours=STALE_HOURS) else "claimed"), claim
    return "open", None


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status")
    listing = sub.add_parser("list")
    listing.add_argument("lane", choices=LANES)
    listing.add_argument("--all", action="store_true")
    claim = sub.add_parser("claim")
    claim.add_argument("lane", choices=LANES)
    claim.add_argument("count", type=int)
    claim.add_argument("ids", nargs="*")
    claim.add_argument("--by", required=True)
    release = sub.add_parser("release")
    release.add_argument("lane", choices=LANES)
    release.add_argument("id")
    args = parser.parse_args()

    if args.command == "status":
        for lane, spec in LANES.items():
            counts = {"open": 0, "claimed": 0, "stale": 0, "done": 0}
            working = []
            for task_id, _ in spec["tasks"]():
                kind, who = state(lane, task_id)
                counts[kind] += 1
                if kind == "claimed":
                    working.append(f"{task_id}（{who['by']}）")
            print(f"{lane}: 未着手 {counts['open'] + counts['stale']}（うち印が古い {counts['stale']}）· 作業中 {counts['claimed']} · 済み {counts['done']} — 手順書 {spec['playbook']}")
            if working:
                print(f"  作業中: {', '.join(working)}")
        return

    spec = LANES[args.lane]
    if args.command == "list":
        for task_id, label in spec["tasks"]():
            kind, who = state(args.lane, task_id)
            if args.all or kind in ("open", "stale"):
                print(f"{task_id}\t{kind}{'（' + who['by'] + '）' if who and kind != 'open' else ''}\t{label}")
        return

    if args.command == "release":
        claim_file = spec["dir"](args.id) / "claim.json"
        if claim_file.exists():
            claim_file.unlink()
            print(f"印を外しました: {args.id}")
        return

    known = dict(spec["tasks"]())
    wanted = args.ids or list(known)
    taken = []
    for task_id in wanted:
        if len(taken) >= args.count:
            break
        if task_id not in known:
            sys.exit(f"{args.lane} にない作業: {task_id}")
        kind, who = state(args.lane, task_id)
        if kind in ("done", "claimed"):
            if args.ids:
                print(f"飛ばします: {task_id} は {kind}{'（' + who['by'] + '）' if who else ''}", file=sys.stderr)
            continue
        folder = spec["dir"](task_id)
        folder.mkdir(parents=True, exist_ok=True)
        record = json.dumps({"lane": args.lane, "id": task_id, "by": args.by, "at": datetime.now(JST).isoformat(timespec="seconds")}, ensure_ascii=False, indent=2) + "\n"
        claim_file = folder / "claim.json"
        if kind == "stale":
            claim_file.unlink()
        try:
            # 排他的に作る。同時にほかのエージェントが置いたら、その作業は飛ばす。
            with open(claim_file, "x") as file:
                file.write(record)
        except FileExistsError:
            continue
        taken.append(task_id)
    for task_id in taken:
        print(f"{task_id}\t{known[task_id]}")
    if not taken:
        print("印を置ける作業がありません", file=sys.stderr)


main()
