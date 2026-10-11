# 水槽の仕上げ（tank-finish）

水槽1つの種・地形・水景・水槽の文を仕上げる。この1枚と道具だけで進め、ほかの文書と `src/` のコードは読まない。

## 書いてよい場所

- 書く: `src/content/` の、担当の `tanks/<id>/tank.json`、`environment/scenes/<id>/` の `scene.json`・`terrain.json`、その水槽の種の `fish/<種>/species.json`。作業物は `tmp/tank-work/<id>/`。
- しない: ほかの水槽・種・`src/core`・`src/render`・`scripts`・保管庫の書き換え、commit、全体のテスト・ビルド・画面検証・開発サーバー、画像をコードで描いて足すこと。ほかの水槽の失敗は直さず報告する。
- 種の事実（大きさ・分布・保全・出典）は書き換えない。

## 進め方

見る画像は合わせて8枚以内。同じ確認を繰り返さず、大きな出力は `head` で切る。

1. `uv run scripts/species-brief.py --tank <id> --text --anchors`: 種の値と文、絵の中の位置の一覧1枚。種を直す。
2. `uv run scripts/draft-terrain.py <水景id> --occluders <塗り分け版> --shelters <印の版>`: 下書きと `notes.txt`（`tmp/terrain-drafts/<id>/`）。案内の絵は頼んだ側が渡す。面を歩く生き物だけの水槽は `--no-tops --connect-sand`。
3. `uv run scripts/tank-view.py <id> [--terrain <案>] [--zoom x0,y0,x1,y1]`: 地形を重ねた画像と「確かめ」。直して `terrain.json` に書く。
4. `bun run scripts/tank-probe.ts <id> [--lighting <照明>] [--stock max]`: 種ごとの表、「気をつける点」、合成画像（狭い画面は `tank-view.py` に `--positions <json> --width 420`）。直して流し直す。
5. `bun run test:tanks -- -t <id>` と `bun run test:fast`。

## terrain.json

座標は絵（`plate.webp`）に対する比率（左上が 0,0）。画面に映るのはその一部（`tank-view.py` が出す「見える範囲」）。depth は 0 = ガラス側、1 = 奥。

```json
{"structurePoints":[{"x":0.3,"y":0.6}],"bubbleSources":[],"terrain":{
 "surfaces":[{"id":"sand","material":"sand","points":[{"x":0.2,"y":0.85,"depth":0.1},{"x":0.8,"y":0.85,"depth":0.1}]}],
 "occluders":[{"id":"rock","depth":0.3,"polygon":[{"x":0.8,"y":0.5},{"x":1,"y":0.5},{"x":1,"y":0.8}]}],
 "obstacles":[{"id":"core","center":{"x":0.9,"y":0.6,"depth":0.5},"radius":{"x":0.08,"y":0.15},"depthRadius":0.12}],
 "shelters":[{"id":"den","x":0.8,"y":0.7,"depth":0.6,"kind":"crevice"}]}}
```

- 面: 底・石・流木の上の線。material は sand・stone・wood・leaf。魚は `bottomRest` で sand へ、`grazing` でそれ以外へ寄る。面を歩く生き物はここだけを歩く。
- 遮蔽: 絵のその部分を魚の上に描き直す多角形。depth がこれより大きい魚を隠す。魚に手前を泳がせる物体は 0.4〜0.5、いつも手前の物体は 0.2〜0.3。水草と、向こうが見える穴は遮蔽にしない。
- 回避領域: 魚が入れない楕円体。radius は絵の幅・高さに対する比率、depthRadius は奥行きの半径。
- 隠れ場所の kind は anemone・burrow・crevice・cave・holdfast（省ける）。structurePoints は魚が立ち寄る流木・水草、bubbleSources はエアストーン。
- 手本の水景: 泳ぐ魚だけ = `biwa-reed-shore-120`、面を歩く生き物 = `river-prawns-90`。

決まり:

- 回避領域は魚の体長×0.2 だけ広げて判定される。楕円どうしのくぼみや、ガラス・底・水面との細いすき間を作らない（挟まって耐久テストで落ちる）。大きな魚の水槽は大きな楕円を少数置く。
- 隠れ場所は、ガラスの縁から2cmより内側で、広げた回避領域に入らない奥行きに置く。`homeShelter` の種がいれば同じ kind が要る。
- 遮蔽は絵の (0.5, 0.3) と (0.15, 0.99) を覆わない。面はどれも一部が画面に入る。
- 面を歩く生き物: 移れるのは端点（x・y・depth）がぴったり同じ面どうしだけ。少数の長い面を輪か1点でつなぎ、行き止まりの短い面を作らない。x の重なる面は奥行きの差を 0.35 より大きくする（それ以内だと互いをよけて引き返す）。
- 水面の上の空気まで見える絵は、`scene.json` に `waterLine`（絵に対する水面の高さ。`front` = ガラス側、`back` = 奥）を書く。
- 耐久テスト: 回避領域の中やガラスの縁2cmの外に出ない、位置が飛ばない、回り込みで1秒より長く止まらない。

## 種の定義

- 絵は頭が左。`realBodyLengthCm` が画面の体長。
- `ecology.depthRange`: 泳ぐ奥行き（0 = ガラス側）。
- `preferredZone`: 泳ぐ範囲。X は水槽の幅、Y は水の部分の高さに対する比率（0 = 水面、1 = 底。空気の見える水景でも、空気の分を避けて下げない）。
- `swim.mouthAnchor`: 口先（絵に対する比率。既定 0.025, 0.62）。面をついばむとき面に付く点。`footAnchor`: 面を歩く生き物の接地点（既定 0.42, 0.95）。`headStart`: 左端から触角（エビ）・腕（イカ）の付け根まで。ほかの体のつくりには書かない。
- `hideByDay` は付けない（活動 0.6 未満の照明で物陰に入ったままになる）。
- `homeShelter`: 住みかの kind と、離れる範囲 `rangeBodyLengths`（体長の倍数）。面を歩く生き物は住みかを見ない。
- `bottomRest`（砂の面へ降りて休む）は底に伏せる魚だけに付ける。
- 大きな魚がガラスの縁で切れるとき: `preferredZone` を内側へ（下端は `maxY`）、`bottomForage` を外す（底で頭を下げる）、`homeShelter` の範囲を縮める。面を歩く生き物は面の端をガラスから離す。

## 照明と水の色

`defaultLighting`（natural・cool / evening / night）ごとの活動の量は、diurnal 1 / 0.7 / 0.3、crepuscular 0.75 / 1.1 / 0.8、nocturnal 0.3 / 0.9 / 1.1。低いほど遅く、止まる時間が増える。夜行性の多い水槽は evening も考える。

`waterColor` は魚にかける色かぶりだけに使う（奥の魚ほど強い）。

## 名前と説明文

- 水槽の `displayName` は「〜水槽」、`category` は生息地の名前。文は「です・ます」。
- 事実は `species.json` にあることだけ。実際に一緒に飼えない組み合わせは「実際の飼育では一緒にしません」の趣旨を1文入れる。絵にあって置いていない生き物を「いる」と書かない。
- 匹数は見栄えで少なめに。展示室1室の既定の合計は180匹まで。
- 体長が水槽の幅の約3%未満で、底と同じ色・透明な生き物は、置いても見つけられないことが多い。外すかは頼んだ側が画面で決めるので、報告に書く。

## 未確認

- `tank-probe` の「隠れ」「切れ」と合成画像は描画の近似で、実際の画面とは突き合わせていない。
- 回避領域のくぼみ・すき間の注意が、2026年10月9日の岩の判定の修正後も要るかは確かめていない。

## 最後の報告

直したファイル / 種ごとに変えた値と理由 / 地形の手直し / `tank-probe` の表と気をつける点 / 見えにくい・縁で切れる生き物 / テストの結果（ほかの水槽の失敗は別に） / 決められなかったこと。
