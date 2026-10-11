# サザナミトサカハギの下書きメモ

## 入力と根拠

- 調査: `drafts/bignose-unicornfish/adult-standard/research/request-r1/attempt-1/research.json`。
- variant: `adult-standard`。生成記録の画風: `fish-side-species-skin-photo.v1`。画像の採否や画像内の位置は判断していません。
- 使用した出典: cas, record2019, record2021, foa, maldives, georgia, movement2005。調査の本文未読・二次確認などの区別を保っています。
- 55cm TLと60cm TLはadultSize.maximum2019/maximumMuseumの別報告です。2012年はconservation.catalogIUCNの評価年表記です。
- keepingはGeorgia Aquariumの種解説・展示資料に基づきます。水温・pHの定量推奨は未確認なので省略しました。

## 動きの仮値

既存種 `blue-tang` を手本にしました。以下の動きの数値・区間はすべて画面上の仮値で、野外の水深、実測速度、推奨飼育数ではありません。
昼の採餌はgeorgiaに基づきます。社会性の数値はblue-tangから写し、向きのそろい方を0.5へ調整しました。

```json
{
  "swim": {
    "tailBeatHz": 1.8
  },
  "preferredZone": {
    "minX": 0.08,
    "maxX": 0.92,
    "minY": 0.25,
    "maxY": 0.7
  },
  "ecology": {
    "activityPeriod": "diurnal",
    "gait": "burstCoast",
    "speedBodyLengthsPerSec": {
      "cruise": 0.45,
      "burst": 2.0
    },
    "turnRateRadPerSec": 2.2,
    "restFraction": 0.15,
    "depthRange": [
      0.15,
      0.85
    ],
    "social": {
      "grouping": "shoal",
      "spacingBodyLengths": 1.6,
      "cohesion": 0.45,
      "polarization": 0.5
    },
    "structureAffinity": 0.5,
    "habits": []
  }
}
```

## Claude Codeへの引き継ぎ

- 展示計画のねらいは藻類食のハギをまとめていますが、本種成魚の主な食性はプランクトン食です。計画を変えず、個体説明に食性差を残しました。
- 群れは採餌時などの一形態です。常時群泳や非攻撃性を保証しません。
- 尾柄の片側2枚の骨質板と額の丸い隆起を採用時に確認してください。
- 旧generation.jsonはnormalizedJobを持たずspecies-packet.pyがKeyErrorで停止しました。今回は読み取り時だけ旧形式styleIdとpromptを補って材料を確認しました。スクリプト側の旧形式対応が必要です。

## 水槽の説明に使えそうな見どころ

藻を食べるハギの展示の中で、水中のプランクトンを食べるサザナミトサカハギの暮らしの違いを紹介できます。
