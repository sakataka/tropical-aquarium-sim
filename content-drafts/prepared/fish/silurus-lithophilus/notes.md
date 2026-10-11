# イワトコナマズの下書きメモ

## 入力と根拠

- 調査: `drafts/silurus-lithophilus/adult-standard/research/request-r1/attempt-1/research.json`。
- variant: `adult-standard`。生成記録の画風: `fish-side-natural-photo.v1`。画像の採否や画像内の位置は判断していません。
- 使用した出典: cas, nies, lberi, hibino2017, tokai, museumGuide, museumCaptive2023, national2020。調査の本文未読・二次確認などの区別を保っています。
- 全長60cmはadultSize.reportedTotalLength（lberi）です。180cm水槽の幅の約33%で、縮小条件の35%を超えません。
- keepingはmuseumCaptive2023の飼育記録に基づきます。水温・pHは未確認なので省略しました。

## 動きの仮値

既存種 `gibachi-catfish` を手本にしました。以下の動きの数値・区間はすべて画面上の仮値で、野外の水深、実測速度、推奨飼育数ではありません。
activityPeriod=nocturnalはbehavior.nocturnalActivity（tokai）に基づきます。速さ・休息・隙間訪問・昼の隠れ時間は仮値です。

```json
{
  "swim": {
    "tailBeatHz": 1.8
  },
  "preferredZone": {
    "minX": 0.08,
    "maxX": 0.92,
    "minY": 0.55,
    "maxY": 0.95
  },
  "ecology": {
    "activityPeriod": "nocturnal",
    "gait": "burstCoast",
    "speedBodyLengthsPerSec": {
      "cruise": 0.25,
      "burst": 1.2
    },
    "turnRateRadPerSec": 1.9,
    "restFraction": 0.35,
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
    "structureAffinity": 0.75,
    "habits": [
      {
        "type": "hideByDay",
        "durationSec": [
          40,
          120
        ]
      },
      {
        "type": "homeShelter",
        "kind": "crevice",
        "rangeBodyLengths": 5,
        "visitChancePerMin": 0.3,
        "visitDurationSec": [
          20,
          60
        ]
      },
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

- 岩陰から出る主役で夜行性の記述があるためhideByDayを付けました。homeShelterには地形のcreviceが必要です。
- 小魚を食べるため、同槽候補との安全混泳を保証しません。
- 産卵水深には原著の5〜70cmと概説の2〜3mで差があります。通常の生息水深に合成していません。
- 腹面から眼が見えるかは角度依存です。成年のひげ4本と臀鰭・尾鰭の接続は採用画像で確認してください。

## 水槽の説明に使えそうな見どころ

昼の岩陰と夜の採餌を通して、琵琶湖の岩場に暮らすナマズを紹介できます。
