# 2D熱帯魚水槽シミュレーション

リアル寄りの2Dスプライトで熱帯魚が泳ぐ、Web向けのパーソナルアクアリウムです。「見ていて気持ちいい」ことを軸に、水槽と住人が再訪後も続いている所有感、時間帯で変わる光、静かな環境音を組み合わせています。失敗や作業を強いる本格飼育シミュレーションではありません。

Demo: https://sakataka.github.io/tropical-aquarium-sim/

## 開発

```bash
bun install
bun run dev
bun run test
bun run build
```

通常画面:

```text
http://127.0.0.1:5173/
```

魚図鑑画面:

```text
http://127.0.0.1:5173/?view=guide
```

## 構成

- `src/core`: schema検証、水槽定義、実寸スケール計算、遊泳シミュレーション
- `src/render`: PixiJS描画、生成画像アセット参照、魚スプライト表示
- `src/ui`: 住人追加、愛称・お気に入り、水槽カスタマイズ、観賞モード、餌やり、魚図鑑
- `src/content`: 魚種ごとの `species.json` と画像、水槽背景画像、プリセットや図鑑文の設定JSON

今後の開発方向性は [docs/development-directions.md](docs/development-directions.md) に整理しています。

## 水槽カスタマイズ

通常画面の「水槽設定」から、魚種ごとの匹数、背景スタイル、後景水草、前景水草、水草の濃さ、照明を変更できます。
植物系の見た目は、画像生成した前景/後景水草レイヤーを表示、非表示、透過、スケール調整で組み合わせます。手描き風の簡易図形や PixiJS のコード生成水草は使わず、PixiJS 側は生成画像の合成、水、光、泡の演出に限定します。

水槽の状態は `localStorage` の `tropical-aquarium.state.v2` に保存します。
保存対象は水槽名、環境設定、自動照明・環境音の設定と、住人ごとの固定ID、迎えた日時、愛称、お気に入り、空腹状態です。魚の現在座標や速度、PixiJS の描画オブジェクトは保存せず、再訪時に自然な位置から泳ぎ始めます。
旧 `tropical-aquarium.customization.v1` がある場合は、初回に住人を作って v2 へ移行します。
魚数は魚種ごとに最大12匹、水槽全体で最大30匹に丸めます。
壊れた保存データ、未知の魚種、不正な値が入っていた場合は安全なデフォルトへ戻します。
プリセット、保存キー、魚数上限、デフォルト環境は `src/content/aquarium/customization.json` に集約しています。

## 所有感と観賞体験

- 水槽名と住人は再読み込み後も維持されます。住人には愛称とお気に入りを設定できます。
- 「今日の観察」は、時刻・照明・選択中の住人に合わせて短い変化を伝えます。
- 自動照明は現在時刻に連動して自然光、クール、夕景、夜景を切り替えます。手動照明も選べます。
- 環境音は水とフィルターの低い音を Web Audio で合成します。初期状態はOFFで、音量を調整できます。
- 45秒操作がない場合は操作パネルを隠す観賞モードへ入り、手動でも切り替えられます。
- 空腹は実時間に近い緩やかな速度で進み、最大48時間分の不在時間だけ反映します。放置を罰するゲームにはしません。

組み込みプリセットは URL からも指定できます。

```text
http://127.0.0.1:5173/?preset=community
http://127.0.0.1:5173/?preset=school
http://127.0.0.1:5173/?preset=calm
```

`?preset=` がある場合は、ローカル保存よりも URL のプリセットを優先します。

## 魚種

現在は以下の10種を同じ60cm水槽に入れられます。

- `neon-tetra`: 中層の小型群泳魚
- `white-cloud-minnow`: 表層から中層を軽快に巡る小型群泳魚
- `harlequin-rasbora`: 中層でまとまりやすい落ち着いた群泳魚
- `cherry-barb`: 中層から下層を巡る赤い小型魚
- `guppy`: 表層寄りに動く小型魚
- `platy`: 表層から中層で明るい色を足す温和な小型魚
- `corydoras`: 底層寄りで構造物付近をゆっくり巡回する魚
- `kuhli-loach`: 底層と物陰を細かく巡回する細長い魚
- `dwarf-gourami`: 中層から上層をゆったり泳ぐ単独寄りの魚
- `angelfish`: 中層で存在感を作る大きめの魚

魚種ごとに `src/content/fish/<species-id>/species.json` と `side.png` を追加します。コード側で魚種別の if 文は追加しません。
魚図鑑の説明文は `src/content/fish/guides.json` に集約します。新しい魚種を追加したら、魚種IDをキーにして同じJSONへ説明文を足します。
泳ぎのアニメーションを入れる場合は `src/content/fish/<species-id>/swim/frame-01.png` のような連番PNGを追加し、`species.json` の `animation.framesPerSecond` を設定します。フレームがない場合は `side.png` の静止表示にフォールバックします。
魚種ごとの習性は `species.json` の `behavior` に集約します。群れで近づく/離れる距離、壁際を巡回する頻度、水草寄り、表層寄りなどを魚種ごとに調整できます。
シミュレーション上では、泳ぎ先の理由を `targetKind` として `openWater` / `structure` / `edgeCruise` / `surfaceVisit` / `feed` / `tap` に分け、魚一覧にも現在の移動傾向を表示します。
通常の水槽画面では水槽内をダブルクリックするとガラスを軽く叩くインタラクションになり、魚種ごとの `tapResponse` と感度に応じて逃げる、警戒して止まる、近づいて様子を見るなどの反応をします。
魚ごとの `hunger` は軽い飼育状態として扱い、空腹時は餌への反応が強く、満腹時は弱くなります。魚一覧では数値ではなく `空腹` / `ふつう` / `満腹` の段階で表示します。

`species.json` の重要項目:

- `realBodyLengthCm`: 実際の体長cm
- `animation`: 任意。泳ぎフレームのパターンと基本FPS
- `sourceBodyBounds`: 元画像内で魚体が占める範囲。実寸スケール計算に必須
- `visual.fallbackColor`: 魚画像の読み込み前や失敗時に表示する簡易スプライト色
- `preferredZone`: 水槽内で好む泳層
- `schooling`: 群れ行動の弱い追従設定
- `behavior`: 魚種ごとの距離感、壁回避、構造物/表層の好み、タップ反応
- `motion`: キック、惰性、停止、餌への移動の時間と速度感

表示サイズは次の式で決まります。

```text
targetBodyLengthPx = viewportWidthPx * (realBodyLengthCm / tankWidthCm)
spriteScale = targetBodyLengthPx / sourceBodyBounds.width
```

画像キャンバスの大きさではなく、実寸と `sourceBodyBounds` から見た目サイズを決めます。

## 初期アセット

世界観を揃えるため、背景と全10魚種を同じリアル寄りの2D水槽表現として新規に画像生成しています。

- `src/content/environment/aquarium-background.png`
- `src/content/environment/layers/rear-plants.png`
- `src/content/environment/layers/foreground-plants.png`
- `src/content/environment/bubble.png`
- `src/content/fish/neon-tetra/side.png`
- `src/content/fish/white-cloud-minnow/side.png`
- `src/content/fish/harlequin-rasbora/side.png`
- `src/content/fish/cherry-barb/side.png`
- `src/content/fish/guppy/side.png`
- `src/content/fish/platy/side.png`
- `src/content/fish/angelfish/side.png`
- `src/content/fish/corydoras/side.png`
- `src/content/fish/kuhli-loach/side.png`
- `src/content/fish/dwarf-gourami/side.png`

魚画像は左向き横姿勢、背景透過PNGとして扱い、右向きは実行時に反転します。
水槽背景は画像生成した単一背景に加えて `src/content/environment/layers/` の透明PNGレイヤー、泡用の `bubble.png`、PixiJS 上の水面/光レイヤーを重ねて奥行きと動きを作ります。

## 検証

core の挙動は Vitest、画面の成立確認は Bun.WebView で検証します。
魚種、アセット、行動、カスタマイズ、魚図鑑を変更した場合は、通常の unit/build に加えて WebKit backend の WebView 検証を通します。

```bash
bun run test
bun run build
bun run verify:webview
```

`bun run test` はシミュレーションの境界回避、群れ、餌/タップ反応、実寸スケール計算、カスタマイズ正規化を確認します。
`bun run verify:webview` は Chrome/Chromium headless ではなく Bun.WebView の WebKit backend を使い、主要 UI、canvas の生成、魚リスト、プリセット変更、魚数変更、住人ID・水槽名の復元、観賞モード、環境音、魚図鑑切替を確認します。1440 × 960 px と、主なモバイル対象である 420 × 912 px のスクリーンショットも `tmp/webview/` に保存します。
画面検証は細かいピクセル一致より、主要な UI と canvas が成立していることを優先します。
スクリーンショットなどの一時成果物は `tmp/` 以下に出力し、Git管理しません。
