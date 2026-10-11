# オヤニラミの下書きメモ

## 入力と範囲

- 入力は保管庫の `drafts/coreoperca-kawamebari/adult-standard/research/request-r1/attempt-1/research.json` です。
- 対象は `adult-standard`、横向きの魚画像（`fish-side-natural-photo.v1`）です。画像の採否は判断していません。
- 図鑑文は出典のある調査項目から要約しました。画像に依存する位置・色・輪郭の設定値は記入していません。
- 飼育区分の根拠: tobaの生きもの図鑑とkaiyukan2020の展示設備報告に記録があります。

## 数字の根拠

- 全長10cm: adultSize.generalTypicalTLの80〜100mm（gifu1997）の上端。13cmTLはgeneralMaximumTL（nies）、11.0cmSLはfishbaseです。
- 2020は国内RL版です。世界未評価の二次表示に評価年は付けていません。
- 水温とpHの推奨値は記入していません。実験条件・野外観測・季節的な施設条件から通年の適温を作らないためです。

## 動きの仮値

- 近い暮らし方の既存種 `japanese-dark-sleeper` を手本にしました。動きの数値は本種の実測値ではありません。
- `swim.tailBeatHz=1.6`、`gait=burstCoast`、速さ `cruise=0.12, burst=1.4`、旋回 `1.8`、休む割合 `0.65` は手本から写した仮値です。
- 横の範囲は `0.08〜0.92`、縦の範囲は `0.55〜0.95`、奥行きの範囲は `[0.3, 0.9]` とした演出上の仮値です。野外の水深ではありません。
- 社会性の設定は `{"grouping": "solitary", "spacingBodyLengths": 2.5, "cohesion": 0, "polarization": 0}`、構造物への寄りやすさは `0.85`。間隔・まとまり・向きのそろい方は仮値です。
- 習性の頻度と時間は `[{"type": "bottomRest", "chancePerMin": 1.5, "durationSec": [10, 30]}]`。付けた習性の数値は演出上の仮値です。
- 単独・なわばり性と待ち伏せ行動は調査に根拠があります。activityPeriod=diurnalは仮値で、速度・休息などはjapanese-dark-sleeperから写しました。

## 採用時に見直す点

- activityPeriodは未確認です。待ち伏せ型の手本から夜行性を借りず、昼行性の仮値にしました。hideByDayは付けていません。
- homeShelterは付けていません。物陰への寄りやすさで表現しているため、隠れ家位置の指定は採用後の判断です。
- 小魚捕食と強いなわばり性が資料にあります。希少小魚を並べた展示計画は安全混泳の承認ではありません。
- 琵琶湖流入河川の記録は移入として扱い、在来の琵琶湖産と説明していません。
- 実験卵や展示循環設備の水温を成魚の適温として使っていません。

## 水槽の説明に使えそうな見どころ

えらぶたの模様と本物の目を見比べ、物陰で待つ小さな捕食者の暮らしを紹介できます。
