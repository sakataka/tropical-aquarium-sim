# 熱帯魚アクアリウム

リアル寄りの熱帯魚を魚屋カタログから選び、統一感のある水景を組んで眺める、個人向けのWebアクアリウムです。飼育ゲームではなく、魚種固有の自然な泳ぎ、手動照明、環境音、観賞モードを中心にしています。

Demo: https://sakataka.github.io/tropical-aquarium-sim/

## 開発

```bash
bun install
bun run dev
bun run test
bun run build
bun run verify:webview
```

## 画面と機能

- 「魚」: 現在の10魚種を、和名・学名の検索、原産地域、泳層で絞り込み、魚種ごとの匹数を変更します。
- 「レイアウト」: 明るい水草景、自然な流木景、根張り流木景、開けた岩組景の4つの一枚絵水景から選びます。
- 「鑑賞設定」: 自然光・クール・夕景・夜景の手動照明、環境音、観賞モードを設定します。

60cm水槽の外形は固定です。魚数は魚種ごと最大12匹、水槽全体で最大30匹です。価格、通貨、餌やり、空腹、愛称、お気に入り、飼育ペナルティ、自由ドラッグ配置は持ちません。

水景はURLでも指定できます。

```text
http://127.0.0.1:5173/?theme=planted
http://127.0.0.1:5173/?theme=driftwood
http://127.0.0.1:5173/?theme=root-driftwood
http://127.0.0.1:5173/?theme=iwagumi
```

旧URLの `?preset=community|school|calm` は互換用に内部変換します。

## データとアセット

- `src/content/fish/<species-id>/species.json`: 学名、原産地、体長、泳層、動きと遊泳パラメーター
- `src/content/fish/<species-id>/side.png`: 画像生成した横向き魚画像
- `src/content/environment/scenes/<scene-id>/scene.json`: 水景名、標準照明、水の色、魚が寄る構造物の位置、泡の出る位置
- `src/content/environment/scenes/<scene-id>/plate.webp`: 画像生成した一枚絵の水景
- `src/content/environment/scenes/<scene-id>/foreground.webp`: 同じ一枚絵から最前面の水草・石だけを切り抜いた透過レイヤー
- `src/content/aquarium/customization.json`: 保存キー、魚数上限

魚種はフォルダへ `species.json` と `side.png` を置くだけで自動読込されます。泳ぎは `side.png` 1枚をメッシュとして変形し、尾の振りと方向転換を描きます。尾の振り方は `species.json` の `swim` で魚種ごとに調整できます。

水景は、背景、泡、奥の魚、前景切り抜き、手前の魚、浮遊物の順で合成し、最後に水の揺らぎ・コースティクス・光の筋・照明の色調を1パスのフィルターでかけます。水景を別々の部品から組み立てず、同じ一枚絵から前景を切り抜くことで、光や影の統一感を保ちます。

## 保存と移行

`localStorage` の `tropical-aquarium.state.v4` へ、魚種別匹数、水景、手動照明、環境音設定だけを保存します。魚の現在座標や速度は保存せず、再訪時に自然な位置から泳ぎ始めます。

v3からは魚種別匹数、照明、音設定と同名の水景を引き継ぎ、スロット配置は破棄します。v2からは魚種別匹数、音量、現在の照明、最も近い水景を引き継ぎます。v1からの移行も維持しています。旧水槽名、個体ID、愛称、お気に入り、空腹、迎えた日時は破棄します。壊れた保存データや未知の魚種は安全な初期値へ戻します。

## 検証

`bun run test` は魚種カタログ、水景カタログ、魚数上限、v1/v2/v3→v4移行、破損データ、境界・泳層・群泳・構造物への接近を確認します。

`bun run verify:webview` はWebKit backendの `Bun.WebView` を使い、検索・絞り込み・魚の追加、4水景の切り替え、再読込後の復元、照明、環境音、観賞モードを操作します。1440×960pxと420×912pxのスクリーンショットは `tmp/webview/` に保存します。

今後の方針は [開発方向性](docs/development-directions.md) にまとめています。
