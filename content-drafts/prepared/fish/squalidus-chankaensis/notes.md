# スゴモロコの下書きメモ

## 入力と範囲

- 入力は保管庫の `drafts/squalidus-chankaensis/biwae-adult/research/request-r1/attempt-1/research.json` です。
- 対象は `biwae-adult`、横向きの魚画像（`fish-side-natural-photo.v1`）です。画像の採否は判断していません。
- 図鑑文は出典のある調査項目から要約しました。画像に依存する位置・色・輪郭の設定値は記入していません。
- 飼育区分の根拠: museumBreedingに琵琶湖博物館の飼育繁殖と仔魚の展示導入の過去記録があります。

## 数字の根拠

- 全長12cm: adultSize.reportedGeneralTotalLengthの10〜12cm（lberi）とniesReportedTotalLength（nies）。190mm未定義体長はmuseumです。
- 約10暗点: identification.lateralPattern（nies、lberi）。全個体共通の厳密な計数にはしていません。
- 2020は国内RLと滋賀県RLの版年です。国内VUをIUCN statusに登録していません。
- 水温とpHの推奨値は記入していません。実験条件・野外観測・季節的な施設条件から通年の適温を作らないためです。

## 動きの仮値

- 近い暮らし方の既存種 `honmoroko` を手本にしました。動きの数値は本種の実測値ではありません。
- `swim.tailBeatHz=2.8`、`gait=burstCoast`、速さ `cruise=0.6, burst=2.8`、旋回 `2.8`、休む割合 `0.08` は手本から写した仮値です。
- 横の範囲は `0.08〜0.92`、縦の範囲は `0.55〜0.95`、奥行きの範囲は `[0.35, 0.95]` とした演出上の仮値です。野外の水深ではありません。
- 社会性の設定は `{"grouping": "school", "spacingBodyLengths": 1.5, "cohesion": 0.65, "polarization": 0.6}`、構造物への寄りやすさは `0.15`。間隔・まとまり・向きのそろい方は仮値です。
- 習性の頻度と時間は `[{"type": "bottomRest", "chancePerMin": 2.5, "durationSec": [6, 20]}, {"type": "bottomForage"}]`。付けた習性の数値は演出上の仮値です。
- 群泳はnies・lberiに根拠があります。activityPeriod=diurnalと群れの数値はhonmorokoに合わせた仮値です。底のハゼのbottomRestと底の採餌を加えました。

## 採用時に見直す点

- idは親種のまま、対象はbiwae-adultです。CASの種レベル集約と国内亜種名を区別しました。
- LBERI・博物館の内湖記録と大学教材の成魚不進入記述は未解決です。本文は湖側に開けた砂底での群泳に限定しました。成魚が内湖に常住・産卵する配置ならClaude Codeで見直してください。
- 190mmの最大体長欄を誤植とも確定した巨大成魚とも判断していません。
- 群泳に調査の根拠はありますが、日周活動、尾数、速度は未確認です。
- 産卵月の5〜6月と5〜8月は資料差があり、本文では固定していません。卵の温度・孵化日数を成魚推奨へ転用していません。
- 展示計画の同居種との実混泳は未確認です。

## 水槽の説明に使えそうな見どころ

ヨシ原の外側へ続く砂底で群れて泳ぐ細身の魚を通して、湖岸から深い湖底までの暮らしを紹介できます。
