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
| `consumer/app-originals/` | Claude Code | アプリ側で作った原画。保管庫ができる前からいた35種（`fish/`）、Codex の画像生成で作った館内図の断面図（`museum/`）と、展示室の絵・水景（`environment/<entityId>/`。下の「展示室を開ける流れ」） |
| `adoptions/<speciesId>.json` | Claude Code | 採否（`accepted`、修正を頼んで仮に使う `accepted-provisional`）と、採用した画像の path と sha256 |
| `queue/state`・`queue/current`・`queue/results`・`drafts/`・`species/`・`vault-index.json` | dots | 状態、草案、種ごとの最新の草案 |

## dots との連絡

dots と Claude Code は直接やりとりできないので、保管庫で連絡する。保管庫を触る作業を始めるときは、`git pull` のあと、まず `notes/to-claude-code/`（dots からの連絡）を確認し、返事は `consumer/replies/` に同じファイル名で置く。dots は作業の記録を `docs/` にも残す。

## Drive 経由の受領（2026年10月10日から）

**dots の窓口は Google Drive だけにし、GitHub への commit・push は Claude Code が行う**（2026年10月10日、ユーザーより。dots が GitHub へ置けず、PNG も GitHub から取れなかったため。dots の側がうまく動くようになるまで続ける）。GitHub（`sakataka/aquarium-assets`）が正本であることは変わらない。

| 向き | 置き場所（Drive のフォルダの中） | スクリプト |
|---|---|---|
| dots → 保管庫 | フォルダの直下に、配送の ZIP と外部の JSON | `scripts/receive-vault-delivery.py` |
| 保管庫 → dots | `from-claude-code/` に、保管庫の文字のファイルの写し（ZIP と JSON）と、保存済みの成果物の一覧。原画や参照画像が要るときは `from-claude-code/originals/` に、保管庫と同じパスで個別に | `scripts/publish-vault-to-dots.py` |
| dots からの連絡 | `to-claude-code/` に Markdown。保管庫の `notes/to-claude-code/` へ写して commit し、返事は今までどおり `consumer/replies/` に同じファイル名で書く（写しに入る） | 手で写す |

保管庫を commit・push したら、`AQUARIUM_ASSET_VAULT=~/Documents/aquarium-assets uv run scripts/publish-vault-to-dots.py --apply` で写しを置き直す（依頼、採否、展示計画、要件、返事、受領の記録。画像は入れない。`latest-snapshot.json` に、写した commit と、前回から変わったファイルがある）。保管庫の HEAD が origin/main と同じで、対象に commit していない変更がないときだけ置ける。古い写しは消さない。

dots に新しい種を頼むときは、(1) `catalog/species-backlog.json` に項目を足し、(2) `uv run --with jsonschema python catalog/build_request.py --ids <種> --request-id <id>` で依頼ファイルを作り、(3) `consumer/assignments/<番号>.json` に担当と付帯情報（依頼ファイルと job ごとの入力のハッシュ、納品先のパス、画風と参照のパス・ハッシュ、基点 commit、ほかの作業の担当）を書き、(4) 展示計画のその水槽の候補に `speciesId` と `requested` を付け、(5) commit・push して写しを置き直す。参照画像は `from-claude-code/originals/` に置く。Drive 経由の間は1種ずつ進め、ジョブの状態（`queue/state`・`queue/current`）は Claude Code は書かない。

dots からの配送の受領は次のとおり。保存完了は、commit のハッシュと、置き直した写しで dots に伝わる。

- Drive のフォルダは、この Mac では Google Drive のデスクトップアプリでローカルのフォルダとして見える: `~/Library/CloudStorage/GoogleDrive-sakataka@gmail.com/マイドライブ/aquarium-dot-delivery/`。読むだけで、書き換えない。アプリが止まっていると、ファイルの一覧は見えても中身が「Operation timed out」で読めない。`pgrep -lf "Google Drive"` で確かめ、止まっていたら `open -a "Google Drive"` で起動して20秒ほど待つ。
- 1回の配送は、ZIP 1個（`aquarium-delivery-<配送ID>.zip`）と、外部の小さな JSON 1個（`aquarium-delivery-<配送ID>.delivery.json`）。外部の JSON に配送ID・ZIP のサイズと SHA-256・依存する配送（`dependsOn`）・前の配送（`previousDeliveryId`。追跡用）があり、ZIP の直下の `manifest.json` に、各ファイルの保管庫でのパス・サイズ・SHA-256・素材ID・jobId・revision・種類（`image`・`research`・`provenance`・`qa`）がある。
- 作業リスト（`consumer/work-queue/`）の種は、dots が speciesId（学名由来）・画像の説明を決めて作る。カタログの項目は配送に入らないので、採用するときに、画像の `generation.json` の `normalizedJob`（subjectEn・framingEn）と `research.json`（和名・英名・別名・飼育区分）から `catalog/dots-additions.json` へ写す（2026年10月10日。dots には `catalog-entry.json` は要らないと伝えた）。
- 配送に入るのは画像・調査・出典・QA だけ。`queue/state` などのジョブ状態は受け取らない（GitHub 側で拒否された状態の更新を、こちらで代わりに書かない）。

手順:

1. `AQUARIUM_ASSET_VAULT=~/Documents/aquarium-assets uv run scripts/receive-vault-delivery.py` で、届いている配送を照合し、置く内容を見る（何も書かない）。
2. 問題がなければ `--apply` を付けて置く。保管庫の `drafts/` の下にファイルが置かれ、受領の記録 `consumer/deliveries/<配送ID>.json` が書かれる。ここまでが「受領」。
3. 保管庫で差分を確かめ、commit・push する。受領の記録が GitHub の main に入った時点が「保存完了」。その commit のハッシュを dots に返す。

スクリプトは、次のときに何も置かずに止まる: ZIP やファイルのサイズ・SHA-256 が合わない、`drafts/` の外や保管庫の外へ出るパスがある、manifest に書かれていないファイルが ZIP にある、保管庫に同じパスで中身の違うファイルがある（上書きしない）、同じ配送IDで ZIP のハッシュが違う、依存する配送が未受領。同じパス・同じ中身のファイルと、受領済みの配送は飛ばすので、同じ配送を二度流しても何も起きない。

## 生き物を取り込む流れ

1. 草案を確かめる: 画像は自動検査（外接矩形、見切れ、離れたもや）とコンタクトシートの目視で判断し、`adoptions/` に記録する。直したいものは修正依頼にまとめる。
2. 画像を取り込む: `AQUARIUM_ASSET_VAULT=~/Documents/aquarium-assets uv run scripts/install-vault-species.py --all-adopted`（または species-id を並べる）。採用した原画から `body.webp` と `sourceBodyBounds` を作り、`content-drafts/fish/<id>/` に置く。
3. 下書きを書く: `content-drafts/fish/<id>/species.json` に、調査（`species/<id>/meta.json` が指す `research.json`。Drive 経由で届いた種は `species/` がないので、`drafts/<id>/<variant>/research/request-rN/attempt-N/research.json` を直接読む）から生態・図鑑の項目を出典つきで書く。`src/core/drafts.test.ts` が形を検証する。
4. 展示室を開けるときに `content-drafts/fish/<id>/` を `src/content/fish/<id>/` へ移し、水槽の `tank.json` に足す。アプリが読むのは `src/content/` だけ。開けてから準備中に戻した水槽は、仕上げた `tank.json` と水景の `scene.json`・`terrain.json` を `content-drafts/tanks/<tank-id>/`・`content-drafts/scenes/<tank-id>/` に残す（`plate.webp` は保管庫から作り直せるので残さない）。

修正版の画像が届いたら、`adoptions/` を書き換えて手順2をやり直す（`species.json` があれば `sourceBodyBounds` だけを書き換える）。

## 展示室を開ける流れ

展示室の絵・水景・館内図は、保管庫の `adoptions/`（hall-*・scene-*・museum-section）に採否を記録してから取り込む。水槽の並びと大きさは展示計画（`catalog/exhibit-plan.json`）が正本。計画中の展示室の枠は、館内図にはすでに「準備中」で出ている（`src/content/museum/buildings/<建物>/building.json` の `halls`）。

**Codex の画像生成で絵を作るとき**（dots が止まっている間。2026年10月10日に「琉球の川と河口」で通した）:

- 絵の説明は、dots の草案の `prompt.txt`（共通の条件）に、展示計画の `sceneEn`（水景）や、階の `interiorEn` とガラスの並び・縦横比（展示室）を足して書く。同じ階の既存の絵2枚を参照画像として渡す。`codex exec` は標準入力を閉じて流す（開いたままだと入力を待って止まる）。
- 展示室の絵は、パネルの大きさの目安（画素）を説明に書く。書かないと、大型の水槽が細長い帯になりやすい。
- 幅3m 以上の大きな水槽の水景は、絵の幅が実際に何 m にあたるかと、物の大きさ（落ち葉は絵の幅の1.5%以下、石は 0.5〜1m など）を説明に書く。書かないと、落ち葉や礫の大きい接写になり、大きな魚が小さく見える（「北の川とサケの遡上」のサケの水景で描き直した）。
- できた絵は `AQUARIUM_ASSET_VAULT=... uv run scripts/place-codex-environment.py <hall-…|scene-…> --image <PNG> --prompt <txt> --ref <参照画像の保管庫のパス>...` で、保管庫の `consumer/app-originals/environment/<entityId>/`（原画、説明、作った記録）に置き、`adoptions/` に採用を記録する。展示室の絵は、ガラスの緑を #00FF00 にそろえて矩形を測り（dots と同じ形の `green-normalization-qa.json`）、測った縦横比を展示計画の `glassAspect` と水槽の高さに書く。
- あとの取り込み（下の2と3）は、dots の絵と同じスクリプトで通る。
- 水景を作るときに、地形の下書きに使う案内の絵（遮蔽にする物体の塗り分け版、隠れ場所の印の版）も一緒に作る（[地形の下書き](terrain-drafting.md#案内の絵を使う2026年10月10日)）。

0. 計画を確かめる: `bun run plan:check` で、開ける展示室の水槽と、そこに置く種（「水槽を待つ」と出ている種。「画像を待つ」は、画像が保管庫にまだ届いていない種）を見る。展示室や水槽を計画から変えるときは、先に展示計画を直し、`building.json` の枠も同じ並びにする。

1. 水槽の雛形を作る: 開ける水槽ごとに `src/content/tanks/<tank-id>/tank.json` を置き、入る魚を `content-drafts/fish/` から `src/content/fish/` へ移す。まだ開けない水槽（魚以外の生き物を待つものなど）は tank.json を置かない。
2. 水景を取り込む: `AQUARIUM_ASSET_VAULT=~/Documents/aquarium-assets uv run scripts/install-vault-scene.py <tank-id>...`。水景の id は水槽の id と同じ。dots は中央で切り取る前提で構図を作るので、ガラスが画像より横長な水槽には `framing.plateBottom` を自動で入れる。続けて `uv run scripts/build-scene-thumbs.py`。
3. 展示室を作る: `AQUARIUM_ASSET_VAULT=... uv run scripts/install-vault-hall.py <hall-id>...`。dots が測った緑のガラスの矩形から `room/<hall-id>.json` を書き、絵の緑を塗る。tank.json のない水槽のガラスには、その水槽の水景を暗く焼き込んで準備中として見せる。続けて `uv run scripts/build-room-thumbs.py`。
4. 中身を作る: 水槽ごとに `terrain.json`（面・遮蔽・回避・隠れ場所）を絵に合わせて書き（下書きの道具 `draft-terrain.py` は、3で展示室を取り込んでから流す。先に流すと、ガラスの縦横比が分からず、見える範囲を外した枠で下書きが出る）、`scene.json` の名前・説明・水の色と、`tank.json` の名前・説明・匹数を決める。見える範囲を切り出した絵に地形を重ねた確認画像で合わせる。
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
