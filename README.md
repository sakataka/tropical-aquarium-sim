# 2D熱帯魚水槽シミュレーション

リアル寄りの2Dスプライトで熱帯魚が泳ぐ、Web向け水槽シミュレーションです。初期版は「見ていて気持ちいい」「魚がそれっぽく見える」ことを優先し、飼育シミュレーションは最小限にしています。

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

サイズ確認用 dev 画面:

```text
http://127.0.0.1:5173/?view=dev
```

## 構成

- `src/core`: 魚種定義、schema検証、水槽定義、実寸スケール計算、遊泳シミュレーション
- `src/render`: PixiJS描画、生成画像アセット参照、魚スプライト表示
- `src/ui`: 魚追加、餌やり、一時停止、dev画面
- `src/content`: 魚種ごとの `species.json` と画像、水槽背景画像

## 魚種追加

魚種ごとに `src/content/fish/<species-id>/species.json` と `side.png` を追加します。コード側で魚種別の if 文は追加しません。
泳ぎのアニメーションを入れる場合は `src/content/fish/<species-id>/swim/frame-01.png` のような連番PNGを追加し、`species.json` の `animation.framePattern` と `animation.framesPerSecond` を設定します。フレームがない場合は `side.png` の静止表示にフォールバックします。
魚種ごとの習性は `species.json` の `behavior` に集約します。群れで近づく/離れる距離、壁際を巡回する頻度、水草寄り、表層寄りなどを魚種ごとに調整できます。

`species.json` の重要項目:

- `realBodyLengthCm`: 実際の体長cm
- `sideImage`: 通常は `./side.png`
- `animation`: 任意。泳ぎフレームのパターンと基本FPS
- `sourceBodyBounds`: 元画像内で魚体が占める範囲。実寸スケール計算に必須
- `preferredZone`: 水槽内で好む泳層
- `schooling`: 群れ行動の弱い追従設定
- `behavior`: 魚種ごとの距離感、壁回避、構造物/表層の好み

表示サイズは次の式で決まります。

```text
targetBodyLengthPx = viewportWidthPx * (realBodyLengthCm / tankWidthCm)
spriteScale = targetBodyLengthPx / sourceBodyBounds.width
```

画像キャンバスの大きさではなく、実寸と `sourceBodyBounds` から見た目サイズを決めます。

## 初期アセット

初期版では生成AIで作成した以下の画像を使用しています。

- `src/content/environment/aquarium-background.png`
- `src/content/fish/neon-tetra/side.png`
- `src/content/fish/guppy/side.png`
- `src/content/fish/angelfish/side.png`

魚画像は左向き横姿勢、背景透過PNGとして扱い、右向きは実行時に反転します。
水槽背景は単一背景に加えて `src/content/environment/layers/` の透明PNGレイヤー、泡用の `bubble.png`、PixiJS 上の水面/光レイヤーを重ねて奥行きと動きを作ります。
