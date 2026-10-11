# ネコギギの下書きメモ

## 入力と範囲

- 入力は保管庫の `drafts/tachysurus-ichikawai/adult-standard/research/request-r1/attempt-1/research.json` です。
- 対象は `adult-standard`、横向きの魚画像（`fish-side-natural-photo.v1`）です。画像の採否は判断していません。
- 図鑑文は出典のある調査項目から要約しました。画像に依存する位置・色・輪郭の設定値は記入していません。
- 飼育区分の根拠: aquatotto2025に保護増殖事業での繁殖・仔魚育成の記録があります。

## 数字の根拠

- 全長10cm: adultSize.usualAdultTotalLength（bunka）。150mmはreportedMaximumUndefinedBodyLength（mieDesignation）、108.0/93.5mmSLはgrowth1994の局所標本値です。
- 口ひげ4対: identification.barbelPairs（original1957）。
- 2020年は国内RL版、2026年は論文公表年、2022-2は引用IUCN版です。いずれも本種のIUCN評価年にはしていません。
- 水温とpHの推奨値は記入していません。実験条件・野外観測・季節的な施設条件から通年の適温を作らないためです。

## 動きの仮値

- 近い暮らし方の既存種 `gibachi-catfish` を手本にしました。動きの数値は本種の実測値ではありません。
- `swim.tailBeatHz=1.8`、`gait=burstCoast`、速さ `cruise=0.25, burst=1.2`、旋回 `1.9`、休む割合 `0.35` は手本から写した仮値です。
- 横の範囲は `0.08〜0.92`、縦の範囲は `0.55〜0.95`、奥行きの範囲は `[0.35, 0.95]` とした演出上の仮値です。野外の水深ではありません。
- 社会性の設定は `{"grouping": "solitary", "spacingBodyLengths": 2.0, "cohesion": 0, "polarization": 0.03}`、構造物への寄りやすさは `0.75`。間隔・まとまり・向きのそろい方は仮値です。
- 習性の頻度と時間は `[{"type": "hideByDay", "durationSec": [40, 120]}, {"type": "homeShelter", "kind": "crevice", "rangeBodyLengths": 5, "visitChancePerMin": 0.3, "visitDurationSec": [20, 60]}, {"type": "bottomForage"}, {"type": "bottomRest", "chancePerMin": 2.5, "durationSec": [6, 20]}]`。付けた習性の数値は演出上の仮値です。
- activityPeriod=nocturnalはgrowth1994の野外観察に基づきます。単独の設定は群泳の根拠がないための仮置きで、bottomRestを底のハゼの手本から加えました。

## 採用時に見直す点

- 夜行性はgrowth1994に根拠があります。主役の役割が「物陰・夜」であるためhideByDayを付けました。
- homeShelterのため地形にcreviceが必要です。明るい昼に観覧しにくくなる点を採用時に確認してください。
- 尾びれの切れ込みは原記載と岐阜県の解説に相反する表現があります。絵の採否はClaude Codeに委ねます。
- JAZAの室内成魚・屋外越冬・仔稚魚の水温は別条件です。通年設定へ統合していません。
- 繁殖雄の攻撃や仔稚魚の捕食が記録されています。同槽の希少小魚との安全性は未確認です。

## 水槽の説明に使えそうな見どころ

昼に隠れ、夜に餌を探すネコギギを通して、石の隙間や川岸も魚の大切なすみかであることを紹介できます。
