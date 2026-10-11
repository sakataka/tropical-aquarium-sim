# キイロサンゴハゼの下書きメモ

## 入力と根拠

- 調査: `drafts/yellow-coral-goby/adult-standard/research/request-r1/attempt-1/research.json`。
- variant: `adult-standard`。生成記録の画風: `fish-side-natural-photo.v1`。画像の採否や画像内の位置は判断していません。
- 使用した出典: cas, original1972, cole2001Abstract, trade2021, hypoxia2007。調査の本文未読・二次確認などの区別を保っています。
- 3.52cmはadultSize.typeSeriesTLの上端35.2mm TLです。成体代表値未確認なので、sizeNoteに資料の対象範囲を明記しました。45cm幅の約7.8%です。
- keepingはtrade2021の観賞用流通・飼育関連記録に基づきhomeとしました。短期呼吸実験の27〜29℃は通年推奨温度にしません。

## 動きの仮値

既存種 `rhinogobius-brunneus` を手本にしました。以下の動きの数値・区間はすべて画面上の仮値で、野外の水深、実測速度、推奨飼育数ではありません。
activityPeriod=diurnalと頻度・数値は手本からの仮置きです。定性的なサンゴ利用は調査にあります。

```json
{
  "swim": {
    "tailBeatHz": 3
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
      "cruise": 0.25,
      "burst": 2.6
    },
    "turnRateRadPerSec": 3,
    "restFraction": 0.55,
    "depthRange": [
      0.2,
      0.8
    ],
    "social": {
      "grouping": "shoal",
      "spacingBodyLengths": 1.6,
      "cohesion": 0.45,
      "polarization": 0.5
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
        "type": "homeShelter",
        "kind": "crevice",
        "rangeBodyLengths": 4,
        "visitChancePerMin": 0.5,
        "visitDurationSec": [
          5,
          15
        ]
      }
    ]
  }
}
```

## Claude Codeへの引き継ぎ

- 枝間利用をhomeShelterのcreviceで仮置きしたため、サンゴの枝間に地形のcreviceが必要です。低い砂底専用の魚としては設定していません。
- movementの集まりは地域の観察に基づき、常に群れるという意味ではありません。
- 成体の典型的な全長、飼育推奨水温・pHは未確認です。
- 性転換は実験要旨の「示唆」の強さを保持しました。ほかのGobiodon種の胃内容割合やオニヒトデを追い払う行動を本種へ転用していません。
- 旧generation.jsonのnormalizedJob欠落によりspecies-packet.pyが停止します。

## 水槽の説明に使えそうな見どころ

枝サンゴの上部や隙間を行き来する、小さな黄色いハゼの暮らしを間近に紹介できます。
