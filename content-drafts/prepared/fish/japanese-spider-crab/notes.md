# タカアシガニの下書きメモ

## 入力と根拠

- 調査: `drafts/japanese-spider-crab/adult-standard/research/request-r1/attempt-1/research.json`。
- variant: `adult-standard`。生成記録の画風: `crab-oblique-natural-photo.v1`。画像の採否や画像内の位置は判断していません。
- 使用した出典: S1, S2, S3, S4, S6, S7。調査の本文未読・二次確認などの区別を保っています。
- 甲幅20cmはadultSize.adultMaleSampleCarapaceWidth/adultFemaleSampleCarapaceWidthの範囲内の表示目安です。脚幅300cmは3.8mという到達サイズ内で小さめにした演出寸法です。
- 体長・脚幅・甲幅を混同していません。脚幅300cm/甲幅20cmの組合せの実測個体や比例式はなく、採用時の確認事項です。
- keepingはS3/S4の飼育展示に基づきます。推奨水温・pHの普遍値は設定していません。

## 動きの仮値

既存種 `snow-crab` を手本にしました。以下の動きの数値・区間はすべて画面上の仮値で、野外の水深、実測速度、推奨飼育数ではありません。
activityPeriod=crepuscularを含む数値はsnow-crabからの仮値です。昼夜の習性を事実として記していません。

```json
{
  "swim": {
    "bodyPlan": "crab",
    "tailBeatHz": 0.6,
    "bodyWaveStart": 0.85,
    "tailSweepRad": 0,
    "verticalFlex": 0
  },
  "preferredZone": {
    "minX": 0.08,
    "maxX": 0.92,
    "minY": 0.55,
    "maxY": 0.95
  },
  "ecology": {
    "activityPeriod": "crepuscular",
    "gait": "glide",
    "speedBodyLengthsPerSec": {
      "cruise": 0.04,
      "burst": 0.3
    },
    "turnRateRadPerSec": 0.8,
    "restFraction": 0.6,
    "depthRange": [
      0.5,
      0.95
    ],
    "social": {
      "grouping": "solitary",
      "spacingBodyLengths": 1.5,
      "cohesion": 0,
      "polarization": 0
    },
    "structureAffinity": 0.25,
    "habits": [
      {
        "type": "grazing",
        "chancePerMin": 2.5,
        "durationSec": [
          8,
          25
        ]
      },
      {
        "type": "bottomRest",
        "chancePerMin": 1.5,
        "durationSec": [
          10,
          30
        ]
      }
    ]
  }
}
```

## Claude Codeへの引き継ぎ

- 生成記録に、明瞭な長い歩脚が6本しか確認できない疑いと、脚が太いという品質課題があります。絵の採否と脚の確認はClaude Codeに委ねます。
- 脚幅ははさみの広げ方に左右されます。表示300cmと甲幅20cmを画像の比率に合わせるか、別の個体目安へ変えるかは採用時に確認してください。
- 昼夜の活動は不明です。homeShelterを付けず、面を歩くcrabとして設定しました。
- 既存のgrazingは面上の採餌を見せる仮演出です。泥の藻類だけを食べる種とは説明していません。
- 旧generation.jsonのnormalizedJob欠落によりspecies-packet.pyが停止します。

## 水槽の説明に使えそうな見どころ

長い歩脚とはさみ脚を見比べながら、暗い海底を歩いて餌を拾うタカアシガニを紹介できます。
