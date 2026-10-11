# シナイモツゴの下書きメモ

## 入力と範囲

- 入力は保管庫の `drafts/pseudorasbora-pumila/adult-standard/research/request-r1/attempt-1/research.json` です。
- 対象は `adult-standard`、横向きの魚画像（`fish-side-natural-photo.v1`）です。画像の採否は判断していません。
- 図鑑文は出典のある調査項目から要約しました。画像に依存する位置・色・輪郭の設定値は記入していません。
- 飼育区分の根拠: 調査に展示の根拠なし。JAZAの施設指針はありますが、具体的な館の展示記録は採用資料にないため、レーンの規則に従ってpublicAquariumとしました。

## 数字の根拠

- 全長8cm: adultSize.reportedApproximateMaximumTL（envDossier2024、aomori）。63.0/71.3mmSLはrevision2015の個別標本値です。
- IUCN評価年2017: conservation.iucnAsReportedByFishBaseの2017-12-07。国内RL2020と環境省資料2024は版・作成年です。
- 水温とpHの推奨値は記入していません。実験条件・野外観測・季節的な施設条件から通年の適温を作らないためです。

## 動きの仮値

- 近い暮らし方の既存種 `topmouth-gudgeon` を手本にしました。動きの数値は本種の実測値ではありません。
- `swim.tailBeatHz=3.0`、`gait=burstCoast`、速さ `cruise=0.6, burst=2.8`、旋回 `2.9`、休む割合 `0.1` は手本から写した仮値です。
- 横の範囲は `0.08〜0.92`、縦の範囲は `0.25〜0.7`、奥行きの範囲は `[0.1, 0.75]` とした演出上の仮値です。野外の水深ではありません。
- 社会性の設定は `{"grouping": "shoal", "spacingBodyLengths": 1.7, "cohesion": 0.5, "polarization": 0.5}`、構造物への寄りやすさは `0.3`。間隔・まとまり・向きのそろい方は仮値です。
- 習性の頻度と時間は `[{"type": "follow", "chancePerMin": 0.4, "durationSec": [1, 2.5]}]`。付けた習性の数値は演出上の仮値です。
- activityPeriod=diurnal、shoalはtopmouth-gudgeonに合わせた仮値です。向きをそろえるpolarizationだけ0.4から0.5へ調整し、中層の範囲にしました。

## 採用時に見直す点

- 恒常的な群泳と成魚の日周活動は未確認です。「本水槽では」と演出であることを本文に残しました。
- P. pumila subsp.はウシモツゴを指します。本種の別名として入れていません。P. parva pumilaは文献によって対象が異なるので省きました。
- uchidaiの帰属はCASと原著で不整合があります。分布・体形へ取り込んでいません。
- JAZAの冬〜夏の季節条件を通年の適温域にしていません。
- モツゴとの交雑・置換と魚食性魚の捕食が保全上の問題です。同槽候補の実混泳は未確認です。

## 水槽の説明に使えそうな見どころ

体の細い暗色帯を観察しながら、ため池を維持する人の作業も魚の保全に関わることを紹介できます。
