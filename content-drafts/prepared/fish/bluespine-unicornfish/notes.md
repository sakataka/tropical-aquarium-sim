# テングハギの下書きメモ

## 入力と根拠

- 調査: `drafts/bluespine-unicornfish/adult-standard/research/request-r1/attempt-1/research.json`。
- variant: `adult-standard`。生成記録の画風: `fish-side-natural-photo.v1`。画像の採否や画像内の位置は判断していません。
- 使用した出典: cas, fao2001, foa, australian-museum, meyer2005, hoey2009, fishbase。調査の本文未読・二次確認などの区別を保っています。
- 50cmはadultSize.commonTotalLength（fao2001）。最大70cmのTLとFLを保持しました。2010年はconservation.iucnCategoryの評価日です。
- keepingはarai2007の5年以上の展示飼育・産卵観察記録に基づきます。水温・pHの普遍推奨は未確認なので省略しました。

## 動きの仮値

既存種 `yellow-tang` を手本にしました。以下の動きの数値・区間はすべて画面上の仮値で、野外の水深、実測速度、推奨飼育数ではありません。
activityPeriod=diurnalはmeyer2005の傾向に基づき、夜活動の例外を本文に残しました。群れとgrazingの頻度・時間は仮値です。

```json
{
  "swim": {
    "tailBeatHz": 2.0
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
      "cruise": 0.4,
      "burst": 1.8
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
    "structureAffinity": 0.6,
    "habits": [
      {
        "type": "grazing",
        "chancePerMin": 4,
        "durationSec": [
          4,
          12
        ]
      }
    ]
  }
}
```

## Claude Codeへの引き継ぎ

- 最新生成記録はoperation=exact-channel-copyで、r2のRGBとr1のalphaを同座標で合成したderived.pngです。画像生成の原本ではないこと、画像位置の一致、継承した問題をClaude Codeが確認してください。採否は判断していません。
- species-packet.pyは新しい記録にnormalizedJobがないため停止しました。旧形式への対応と、生成原本・派生画像の区別が必要です。
- 昼の採餌を基本にしましたが、厳密に昼だけ活動する種とは説明していません。homeShelterとhideByDayは付けていません。
- 同居魚との安全性は未確認です。

## 水槽の説明に使えそうな見どころ

額の角と青い尾柄を目印に、藻を食べに浅い礁へ寄る大型のハギを紹介できます。
