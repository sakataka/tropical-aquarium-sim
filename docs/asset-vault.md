# アセットの保管庫（2026年10月）

生き物・水景・展示室・館内図の画像と、生き物の調査を、外部のエージェント（dots）にまとめて作ってもらい、手元で確かめてから取り込むための仕組み。数百種まで増やしても、このリポジトリを重くせず、制作の流れを毎回同じにするのが目的。

## 決まったこと

- 保管庫は非公開の GitHub リポジトリ [`sakataka/aquarium-assets`](https://github.com/sakataka/aquarium-assets)。手元では `~/Documents/aquarium-assets` に clone し、スクリプトには環境変数 `AQUARIUM_ASSET_VAULT` でパスを渡す。
- 原画（生き物の真横の画像、水景・展示室・館内図の元画像）と調査は保管庫に置く。このリポジトリには配信用の `body.webp`・`plate.webp` などだけを入れる。保管庫ができる前からいた35種の原画（`side.png`）は、保管庫の `consumer/app-originals/fish/<species-id>/` にある（2026年10月10日にこのリポジトリから移した。dots の `species/` とは別の、アプリ側の置き場所）。
- 受け渡しの書式は dots のキュー形式を正とする（2026年10月4日に、アプリ側の旧案から切り替えた）。運用の詳細は保管庫の `queue/README.md`、アプリ側の要件は `consumer/app-requirements-ja.md` にある。
- 採用するかどうかは手元で決め、`adoptions/` に記録する。生成物を自動では取り込まない。

## 誰がどこを書くか

| 場所 | 書く人 | 中身 |
|---|---|---|
| `catalog/species-backlog.json` | Claude Code | 生き物の候補一覧（初回261種） |
| `catalog/exhibit-plan.json` | Claude Code | 展示計画（第2版）。建物 → 階 → 展示室 → 水槽 → 生き物と、水槽ごとの水景の説明、計画中の水槽に入れたい種の手がかり（`candidates`）。アプリとの食い違いは `bun run plan:check` で見る |
| `catalog/dots-additions.json` | dots | dots が自分で足す候補 |
| `consumer/` | Claude Code | dots への依頼文と参照画像（[水景・展示室・館内図の制作依頼](https://github.com/sakataka/aquarium-assets/blob/main/consumer/environment-requests-ja.md)、[今後の生き物の増やし方](https://github.com/sakataka/aquarium-assets/blob/main/consumer/expansion-guidelines-ja.md)） |
| `queue/requests/` | Claude Code（`dots-` で始まるものは dots） | 実行する依頼。修正は `revisionTarget` 付きの新しい依頼ファイルで出す |
| `adoptions/<speciesId>.json` | Claude Code | 採否（`accepted`、修正を頼んで仮に使う `accepted-provisional`）と、採用した画像の path と sha256 |
| `queue/state`・`queue/current`・`queue/results`・`drafts/`・`species/`・`vault-index.json` | dots | 状態、草案、種ごとの最新の草案 |

## dots との連絡

dots と Claude Code は直接やりとりできないので、保管庫で連絡する。保管庫を触る作業を始めるときは、`git pull` のあと、まず `notes/to-claude-code/`（dots からの連絡）を確認し、返事は `consumer/replies/` に同じファイル名で置く。dots は作業の記録を `docs/` にも残す。

## Drive 経由の受領（2026年10月10日から）

**dots の窓口は Google Drive だけにし、GitHub への commit・push は Claude Code が行う**（2026年10月10日、ユーザーより。dots が GitHub へ置けず、PNG も GitHub から取れなかったため。dots の側がうまく動くようになるまで続ける）。GitHub（`sakataka/aquarium-assets`）が正本であることは変わらない。

| 向き | 置き場所（Drive のフォルダの中） | スクリプト |
|---|---|---|
| dots → 保管庫 | フォルダの直下に、配送の ZIP と外部の JSON | `scripts/receive-vault-delivery.py` |
| 保管庫 → dots | `from-claude-code/` に、保管庫の文字のファイルの写し（ZIP と JSON）。原画が要るときは `from-claude-code/originals/` に個別に | `scripts/publish-vault-to-dots.py` |

保管庫を commit・push したら、`AQUARIUM_ASSET_VAULT=~/Documents/aquarium-assets uv run scripts/publish-vault-to-dots.py --apply` で写しを置き直す（依頼、採否、展示計画、要件、返事、受領の記録。画像は入れない。`latest-snapshot.json` に、写した commit と、前回から変わったファイルがある）。保管庫の HEAD が origin/main と同じで、対象に commit していない変更がないときだけ置ける。古い写しは消さない。

dots からの配送の受領は次のとおり。保存完了は、commit のハッシュと、置き直した写しで dots に伝わる。

- Drive のフォルダは、この Mac では Google Drive のデスクトップアプリでローカルのフォルダとして見える: `~/Library/CloudStorage/GoogleDrive-sakataka@gmail.com/マイドライブ/aquarium-dot-delivery/`。読むだけで、書き換えない。
- 1回の配送は、ZIP 1個（`aquarium-delivery-<配送ID>.zip`）と、外部の小さな JSON 1個（`aquarium-delivery-<配送ID>.delivery.json`）。外部の JSON に配送ID・ZIP のサイズと SHA-256・依存する配送（`dependsOn`）・前の配送（`previousDeliveryId`。追跡用）があり、ZIP の直下の `manifest.json` に、各ファイルの保管庫でのパス・サイズ・SHA-256・素材ID・jobId・revision・種類（`image`・`research`・`provenance`・`qa`）がある。
- 配送に入るのは画像・調査・出典・QA だけ。`queue/state` などのジョブ状態は受け取らない（GitHub 側で拒否された状態の更新を、こちらで代わりに書かない）。

手順:

1. `AQUARIUM_ASSET_VAULT=~/Documents/aquarium-assets uv run scripts/receive-vault-delivery.py` で、届いている配送を照合し、置く内容を見る（何も書かない）。
2. 問題がなければ `--apply` を付けて置く。保管庫の `drafts/` の下にファイルが置かれ、受領の記録 `consumer/deliveries/<配送ID>.json` が書かれる。ここまでが「受領」。
3. 保管庫で差分を確かめ、commit・push する。受領の記録が GitHub の main に入った時点が「保存完了」。その commit のハッシュを dots に返す。

スクリプトは、次のときに何も置かずに止まる: ZIP やファイルのサイズ・SHA-256 が合わない、`drafts/` の外や保管庫の外へ出るパスがある、manifest に書かれていないファイルが ZIP にある、保管庫に同じパスで中身の違うファイルがある（上書きしない）、同じ配送IDで ZIP のハッシュが違う、依存する配送が未受領。同じパス・同じ中身のファイルと、受領済みの配送は飛ばすので、同じ配送を二度流しても何も起きない。

## 生き物を取り込む流れ

1. 草案を確かめる: 画像は自動検査（外接矩形、見切れ、離れたもや）とコンタクトシートの目視で判断し、`adoptions/` に記録する。直したいものは修正依頼にまとめる。
2. 画像を取り込む: `AQUARIUM_ASSET_VAULT=~/Documents/aquarium-assets uv run scripts/install-vault-species.py --all-adopted`（または species-id を並べる）。採用した原画から `body.webp` と `sourceBodyBounds` を作り、`content-drafts/fish/<id>/` に置く。
3. 下書きを書く: `content-drafts/fish/<id>/species.json` に、調査（`species/<id>/meta.json` が指す `research.json`）から生態・図鑑の項目を出典つきで書く。`src/core/drafts.test.ts` が形を検証する。
4. 展示室を開けるときに `content-drafts/fish/<id>/` を `src/content/fish/<id>/` へ移し、水槽の `tank.json` に足す。アプリが読むのは `src/content/` だけ。

修正版の画像が届いたら、`adoptions/` を書き換えて手順2をやり直す（`species.json` があれば `sourceBodyBounds` だけを書き換える）。

## 展示室を開ける流れ

展示室の絵・水景・館内図は、保管庫の `adoptions/`（hall-*・scene-*・museum-section）に採否を記録してから取り込む。水槽の並びと大きさは展示計画（`catalog/exhibit-plan.json`）が正本。計画中の展示室の枠は、館内図にはすでに「準備中」で出ている（`src/content/museum/buildings/<建物>/building.json` の `halls`）。

0. 計画を確かめる: `bun run plan:check` で、開ける展示室の水槽と、そこに置く種（「水槽を待つ」と出ている種）を見る。展示室や水槽を計画から変えるときは、先に展示計画を直し、`building.json` の枠も同じ並びにする。

1. 水槽の雛形を作る: 開ける水槽ごとに `src/content/tanks/<tank-id>/tank.json` を置き、入る魚を `content-drafts/fish/` から `src/content/fish/` へ移す。まだ開けない水槽（魚以外の生き物を待つものなど）は tank.json を置かない。
2. 水景を取り込む: `AQUARIUM_ASSET_VAULT=~/Documents/aquarium-assets uv run scripts/install-vault-scene.py <tank-id>...`。水景の id は水槽の id と同じ。dots は中央で切り取る前提で構図を作るので、ガラスが画像より横長な水槽には `framing.plateBottom` を自動で入れる。続けて `uv run scripts/build-scene-thumbs.py`。
3. 展示室を作る: `AQUARIUM_ASSET_VAULT=... uv run scripts/install-vault-hall.py <hall-id>...`。dots が測った緑のガラスの矩形から `room/<hall-id>.json` を書き、絵の緑を塗る。tank.json のない水槽のガラスには、その水槽の水景を暗く焼き込んで準備中として見せる。続けて `uv run scripts/build-room-thumbs.py`。
4. 中身を作る: 水槽ごとに `terrain.json`（面・遮蔽・回避・隠れ場所）を絵に合わせて書き、`scene.json` の名前・説明・水の色と、`tank.json` の名前・説明・匹数を決める。見える範囲を切り出した絵に地形を重ねた確認画像で合わせる。
5. `building.json` の枠の id と展示室の id が同じなら、館内図で開いた展示室として出る（枠の `displayName` は消してよい）。`bun run test`・`bun run build`・`bun run plan:check`・`bun run verify:webview` で確かめる。

## 建物を足す流れ

1. 展示計画の `buildings` に建物を、`floors` にその建物の階（`buildingId` を付け、階の id は建物名を頭に付けて館全体で重ならないようにする）を足す。
2. 断面図の絵を作る（1536×1100。本館の断面図を参照画像にして、階の数だけ水の帯を描く。水槽の数・仕切り・生き物は描かない）。原画は保管庫の `consumer/app-originals/museum/<建物>/` に置く。
3. `src/content/museum/buildings/<建物>/` に `building.json`（`order`、名前、紹介文、`map`、階と `mapArea`、展示室の枠）と `section.webp` を置く。`mapArea` は絵の水の帯の範囲を画素で測って書く（`content.test.ts` が、絵の中に収まり、上から順に並ぶことを確かめる）。
4. `bun run plan:check` と、館内図の画面（広い画面と 420×912）で、帯の位置と建物の切り替えを確かめる。

## 画像の条件

共通（[`AGENTS.md`](../AGENTS.md) のアセット制作方針）:

- 既存の素材と同じ、リアル寄りの2D熱帯魚水槽として見える絵にする。色味、光、水中感、描き込みの密度をそろえる。
- 簡易図形やイラスト調にしない。既存の画像をスタイル参照にする。

生き物: 1536×1024px のアルファ付き PNG。真横から見た姿で頭が左、1枚に1個体、背景・影・床・泡なし。四辺に48px以上の透明な余白を取り、ひれや尾は自然に伸ばした中立の姿勢にする（動きはアプリのメッシュ変形で付ける）。アプリは alpha 3以下を0、240以上を255にそろえ、alpha 16を超える画素の外接矩形で切り出すので、体の外の薄いもやは問題にならない。

水景・展示室・館内図: 保管庫の `consumer/environment-requests-ja.md` に条件を書いた。水景は完成した一枚絵で、生き物を描かない。展示室はガラスを純粋な緑（#00FF00）で塗ってもらい、手元で位置を測って透明に切り抜く。
