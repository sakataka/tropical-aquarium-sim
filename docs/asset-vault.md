# アセットの保管庫（2026年10月）

生き物・水景・展示室・館内図の画像を、外部のエージェントにまとめて生成してもらい、手元で確かめてから取り込むための仕組み。数百種まで増やしても、このリポジトリを重くせず、制作の流れを毎回同じにするのが目的。

取り込みスクリプトはまだない（[ロードマップ](roadmap.md) の手順3）。この文書は、外部エージェントと手元の両方が従う書式の正本とする。

## 決まったこと

- 保管庫は非公開の GitHub リポジトリ [`sakataka/aquarium-assets`](https://github.com/sakataka/aquarium-assets)。外部エージェントも手元も、ここを読み書きする。
- 手元では clone したフォルダのパスを環境変数 `AQUARIUM_ASSET_VAULT` で渡す（例: `~/Documents/aquarium-assets`）。スクリプトは保管庫の実体に依存しない。
- 原画（生き物の `side.png`、水景・展示室・館内図の元画像）は保管庫に置く。このリポジトリには配信用の `body.webp`・`plate.webp` などだけを入れる。
- 採用するかどうかは手元で決める。生成物を自動では取り込まない。

## フォルダ構成

```
aquarium-assets/
  requests/
    species/<species-id>.json      生き物の制作依頼
    scenes/<scene-id>.json         水景の制作依頼
    halls/<room-id>.json           展示室の制作依頼
    museum/<name>.json             館内図などの制作依頼
  species/<species-id>/
    candidates/<YYYYMMDD-HHMM>-<n>.png   生成した候補（外部エージェントが置く）
    side.png                       採用した原画（手元で決める）
    research.json                  生態・図鑑の下書きと出典（任意）
    meta.json                      状態と経緯
  scenes/<scene-id>/ ...           水景（candidates/、plate.png、meta.json）
  halls/<room-id>/ ...             展示室（candidates/、hall.png、meta.json）
  museum/<name>/ ...               館内図など
```

ID は小文字英数字とハイフン（`^[a-z0-9-]+$`）で、このリポジトリの `src/content/` のフォルダ名と同じにする。

## 制作依頼（`requests/species/<species-id>.json`）

```json
{
  "id": "japanese-spiny-lobster",
  "kind": "species",
  "displayName": "イセエビ",
  "scientificName": "Panulirus japonicus",
  "bodyPlan": "crustacean",
  "tankId": "reef-120",
  "image": {
    "view": "真横、頭が左",
    "size": "1536x1024",
    "background": "透明（アルファ付きPNG）",
    "styleReferences": ["species/amano-shrimp/side.png", "species/ocellaris-clownfish/side.png"],
    "notes": "触角と脚の先まで画面内に収める。影や床、水中の背景を描かない。"
  },
  "research": true,
  "requestedAt": "2026-10-04",
  "candidates": 3
}
```

- `research: true` のときは、生態と図鑑の下書きを `research.json` に出典つきで書く（下記）。
- 依頼ファイルはスクリプトで作り、毎回同じ書式にする（手順3で用意する）。

## 画像の条件

共通（[`AGENTS.md`](../AGENTS.md) のアセット制作方針）:

- 既存の素材と同じ、リアル寄りの2D熱帯魚水槽として見える絵にする。色味、光、水中感、描き込みの密度をそろえる。
- 簡易図形やイラスト調にしない。既存の画像をスタイル参照にする。

生き物（`side.png`）:

- 1536×1024px、アルファ付きPNG。背景、影、床、泡を描かない。
- 真横から見た姿で、頭が左。体の全体（ひれ、触角、脚の先まで）が画面内に収まり、四辺に余白がある。
- 1枚に1個体。
- 体の動きはこのアプリのメッシュ変形で付けるので、ひれや尾は自然に伸ばした中立の姿勢にする。

水景・展示室・館内図: 既存の `plate.webp`・展示室の絵と同じカメラ位置、光の向き、空気遠近法。依頼ごとに `image.notes` で条件を書く。展示室は、ガラスの部分を純粋な緑（#00FF00）で塗ってもらい、手元で透明に切り抜く。

## 生態の下書き（`research.json`）

```json
{
  "catalog": { "scientificName": "", "origin": "", "habitat": "", "movement": "", "temperament": "" },
  "profile": { "order": "", "family": "", "adultSizeCm": 0, "keeping": "home | publicAquarium | rarelyDisplayed", "conservation": "" },
  "ecologyNotes": "泳層、群れ方、活動時間帯、特徴的な行動を文章で",
  "sources": [{ "title": "", "url": "" }]
}
```

数値は出典のあるものだけを書く。取り込むときに手元で出典を確かめ、`species.json` の `catalog`・`ecology`・図鑑用の `profile` に書き直す。

## 状態（`meta.json`）

```json
{
  "status": "generated",
  "history": [
    { "status": "requested", "at": "2026-10-04T12:00:00+09:00", "by": "claude-code" },
    { "status": "generated", "at": "2026-10-05T03:10:00+09:00", "by": "external-agent", "candidates": ["candidates/20261005-0310-1.png"], "prompt": "…" }
  ]
}
```

| 状態 | 意味 | 誰が進めるか |
|---|---|---|
| `requested` | 依頼を置いた | 手元 |
| `generated` | 候補を置いた | 外部エージェント |
| `accepted` | 候補の1枚を `side.png` などとして採用した | 手元 |
| `rejected` | どれも採用しない。理由を `history` に書き、依頼を直して `requested` に戻す | 手元 |
| `installed` | このリポジトリに配信用の画像とデータを取り込んだ | 手元 |

外部エージェントは `requests/` と `candidates/`・`research.json`・`meta.json` の追記だけを行い、採用済みの原画は書き換えない。

## 手元での取り込み（手順3で作るもの）

1. 依頼を作るスクリプト（`requests/` に書式どおりのファイルを置き、`meta.json` を `requested` にする）
2. 候補を確かめるスクリプト: 透過の有無、頭の向き、解像度、四辺の余白、体の外接矩形を検査し、一覧のスクリーンショットを `tmp/` に出す
3. 取り込みスクリプト: 採用した原画から `body.webp` を作り（今の `install-fish-sprite.py`・`build-fish-sprites.py` を保管庫に対応させる）、`sourceBodyBounds` を計算して `species.json` を更新し、`meta.json` を `installed` にする
4. このリポジトリの既存の `side.png` を保管庫へ移し、以後は `.gitignore` で入れない。Git の履歴にある分は残し、履歴の書き換えはしない
