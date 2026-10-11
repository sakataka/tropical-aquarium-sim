# ツチフキの下書きメモ

## 入力と根拠

- 調査: `drafts/abbottina-rivularis/adult-standard/research/request-r1/attempt-1/research.json`。
- variant: `adult-standard`。生成記録の画風: `fish-side-natural-photo.v1`。画像の採否や画像内の位置は判断していません。
- 使用した出典: cas, kahaku, biwaBreed2022, katada2007, aquatotto2019, nies, okada2023, national2020。調査の本文未読・二次確認などの区別を保っています。
- 全長10cmはadultSize.representativeTotalLengthの100mm TLです。4〜8cm、74/87mm SLは同じ節の別の測り方です。
- keepingはbiwaBreed2022とaquatotto2019の繁殖・育成記録に基づきます。水温・pHの推奨値は未確認なので省略しました。

## 動きの仮値

既存種 `rhinogobius-brunneus` を手本にしました。以下の動きの数値・区間はすべて画面上の仮値で、野外の水深、実測速度、推奨飼育数ではありません。
activityPeriod=diurnal、単独設定は仮置きです。浅い産卵巣をhomeShelterの穴として設定していません。

```json
{
  "swim": {
    "tailBeatHz": 3
  },
  "preferredZone": {
    "minX": 0.08,
    "maxX": 0.92,
    "minY": 0.55,
    "maxY": 0.95
  },
  "ecology": {
    "activityPeriod": "diurnal",
    "gait": "burstCoast",
    "speedBodyLengthsPerSec": {
      "cruise": 0.25,
      "burst": 2.6
    },
    "turnRateRadPerSec": 3,
    "restFraction": 0.55,
    "depthRange": [
      0.35,
      0.95
    ],
    "social": {
      "grouping": "solitary",
      "spacingBodyLengths": 2.5,
      "cohesion": 0,
      "polarization": 0
    },
    "structureAffinity": 0.7,
    "habits": [
      {
        "type": "bottomRest",
        "chancePerMin": 2.5,
        "durationSec": [
          6,
          20
        ]
      },
      {
        "type": "bottomForage"
      }
    ]
  }
}
```

## Claude Codeへの引き継ぎ

- 琵琶湖固有種、確実な在来種とは書いていません。日本系統と大陸系統の混同に注意してください。
- 恒常的な群泳、日周活動、同槽候補との安全性は未確認です。
- 巣と卵保護は解説だけに記し、繁殖や巣づくりの演出は追加していません。

## 水槽の説明に使えそうな見どころ

泥を口に含んで餌を探す小さな魚と、雄が卵を守る暮らしを紹介できます。
