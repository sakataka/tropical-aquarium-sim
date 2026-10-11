# アユモドキの下書きメモ

## 入力と範囲

- 入力は保管庫の `drafts/parabotia-curtus/adult-standard/research/request-r1/attempt-1/research.json` です。
- 対象は `adult-standard`、横向きの魚画像（`fish-side-natural-photo.v1`）です。画像の採否は判断していません。
- 図鑑文は出典のある調査項目から要約しました。画像に依存する位置・色・輪郭の設定値は記入していません。
- 飼育区分の根拠: kyotoAquariumの受精卵受入れ・ふ化・継続飼育の記録があります。期間限定展示が今も開催中とはしていません。

## 数字の根拠

- 全長20cm: adultSize.ministryOverviewTLの15〜20cm（envOverview、envDossier）の上端です。成魚の平均値とはしていません。
- 口ひげ3対: identification.barbelPairs（envDossier、kyotoLegacy）。
- 2020年は国内レッドリストの版年です（conservation.japanRedList）。2024-2は水族館が引用したIUCNの版で、評価年ではありません。
- 水温とpHの推奨値は記入していません。実験条件・野外観測・季節的な施設条件から通年の適温を作らないためです。

## 動きの仮値

- 近い暮らし方の既存種 `clown-loach` を手本にしました。動きの数値は本種の実測値ではありません。
- `swim.tailBeatHz=2.2`、`gait=burstCoast`、速さ `cruise=0.35, burst=1.8`、旋回 `2.3`、休む割合 `0.3` は手本から写した仮値です。
- 横の範囲は `0.08〜0.92`、縦の範囲は `0.55〜0.95`、奥行きの範囲は `[0.35, 0.95]` とした演出上の仮値です。野外の水深ではありません。
- 社会性の設定は `{"grouping": "solitary", "spacingBodyLengths": 2.5, "cohesion": 0, "polarization": 0}`、構造物への寄りやすさは `0.7`。間隔・まとまり・向きのそろい方は仮値です。
- 習性の頻度と時間は `[{"type": "bottomRest", "chancePerMin": 2.5, "durationSec": [6, 20]}, {"type": "bottomForage"}, {"type": "homeShelter", "kind": "crevice", "rangeBodyLengths": 5, "visitChancePerMin": 0.3, "visitDurationSec": [20, 60]}]`。付けた習性の数値は演出上の仮値です。
- activityPeriod=diurnalはclown-loachに合わせた仮値です。単独の設定とbottomRestの数値は `rhinogobius-brunneus` から写した仮値です。底の休息と採餌、隙間への帰還を演出します。

## 採用時に見直す点

- 成魚の日周活動と恒常的な群泳性は未確認です。昼行性や単独の設定を生態の事実として説明していません。
- homeShelterを付けたため、採用先の地形にcreviceの隠れ場所が必要です。hideByDayは付けていません。
- 展示室の区分はlake-biwaですが、水槽のテーマは日本各地の希少魚です。現在の琵琶湖在来集団を表示する文にはしていません。
- 同槽候補との実飼育上の安全混泳は未確認です。

## 水槽の説明に使えそうな見どころ

石積みの隙間に暮らす成魚と、増水した水辺で育つ仔魚を通して、川と水路のつながりを紹介できます。
