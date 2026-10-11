# ウシモツゴの下書きメモ

## 入力と範囲

- 入力は保管庫の `drafts/pseudorasbora-pugnax/adult-standard/research/request-r1/attempt-1/research.json` です。
- 対象は `adult-standard`、横向きの魚画像（`fish-side-natural-photo.v1`）です。画像の採否は判断していません。
- 図鑑文は出典のある調査項目から要約しました。画像に依存する位置・色・輪郭の設定値は記入していません。
- 飼育区分の根拠: tobaの生きもの図鑑に本種の掲載があります。

## 数字の根拠

- 全長6cm: adultSize.gifuGeneralSizeTL。未定義体長5cm/8cm超はaichi2020、59.7mmSLはrevision2015、最大6.0cmSLはfishbaseです。
- IUCN評価年2017: conservation.iucnAsReportedByFishBaseの2017-12-07。国内RL2020と県資料2020は版年です。
- 水温とpHの推奨値は記入していません。実験条件・野外観測・季節的な施設条件から通年の適温を作らないためです。

## 動きの仮値

- 近い暮らし方の既存種 `topmouth-gudgeon` を手本にしました。動きの数値は本種の実測値ではありません。
- `swim.tailBeatHz=3.0`、`gait=burstCoast`、速さ `cruise=0.6, burst=2.8`、旋回 `2.9`、休む割合 `0.1` は手本から写した仮値です。
- 横の範囲は `0.08〜0.92`、縦の範囲は `0.25〜0.7`、奥行きの範囲は `[0.1, 0.75]` とした演出上の仮値です。野外の水深ではありません。
- 社会性の設定は `{"grouping": "shoal", "spacingBodyLengths": 1.7, "cohesion": 0.5, "polarization": 0.5}`、構造物への寄りやすさは `0.3`。間隔・まとまり・向きのそろい方は仮値です。
- 習性の頻度と時間は `[{"type": "follow", "chancePerMin": 0.4, "durationSec": [1, 2.5]}]`。付けた習性の数値は演出上の仮値です。
- activityPeriod=diurnal、shoalはtopmouth-gudgeonに合わせた仮値です。polarizationを0.5に調整し、中層を泳ぐ仮の範囲にしました。

## 採用時に見直す点

- 恒常的な群泳と日周活動は未確認です。まとまって泳ぐ設定は展示上の仮値です。
- シナイモツゴの別variantではなく独立した種です。2015年原著が旧未命名亜種との対応を示しています。
- 学名や地方名から、すべての時期・個体が攻撃的とは推測していません。
- JAZAの季節的室温、卵の実験水温、研究の換水判断pHを成魚の通年推奨値へ転用していません。
- 繁殖研究では卵の捕食もあります。同槽候補との安全混泳は未確認です。

## 水槽の説明に使えそうな見どころ

黒い帯の目立つシナイモツゴと見比べ、似た小魚にも種や地域集団の違いがあることを紹介できます。
