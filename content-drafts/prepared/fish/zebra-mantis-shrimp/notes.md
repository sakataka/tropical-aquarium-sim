# トラフシャコの下書きメモ

## 入力と根拠

- 調査: `drafts/zebra-mantis-shrimp/adult-male/research/request-r1/attempt-1/research.json`。
- variant: `adult-male`。生成記録の画風: `crustacean-side-natural-photo.v1`。画像の採否や画像内の位置は判断していません。
- 使用した出典: revision2022, revision2001, churaumi, wam, devries。調査の本文未読・二次確認などの区別を保っています。
- 27cm TLはadultSize.maleSpecimenSeriesの上端270mmです。38.5cm TLはliteratureMaximum、40cmはaquariumRoundedMaximumです。雄variantに雌の標本値を強制していません。
- keepingはchuraumiの種紹介に基づきます。捕脚ピーク速度を遊泳速度へ転用せず、水温・pHの通年推奨値は省略しました。

## 動きの仮値

既存種 `macrobrachium-australe` を手本にしました。以下の動きの数値・区間はすべて画面上の仮値で、野外の水深、実測速度、推奨飼育数ではありません。
activityPeriod=crepuscularは局所的な夕刻攻撃の観察を参考にした仮設定です。速さ等は面歩きのエビを手本にし、休息割合0.8、休息頻度2.5/分・20〜60秒へ仮調整しました。

```json
{
  "swim": {
    "bodyPlan": "crustacean",
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
      "cruise": 0.06,
      "burst": 0.4
    },
    "turnRateRadPerSec": 1.1,
    "restFraction": 0.8,
    "depthRange": [
      0.3,
      0.85
    ],
    "social": {
      "grouping": "solitary",
      "spacingBodyLengths": 2.5,
      "cohesion": 0,
      "polarization": 0
    },
    "structureAffinity": 0.85,
    "habits": [
      {
        "type": "bottomRest",
        "chancePerMin": 2.5,
        "durationSec": [
          20,
          60
        ]
      }
    ]
  }
}
```

## Claude Codeへの引き継ぎ

- 現行crustaceanはエビの面歩きで、本種の深い巣穴での出入り、捕脚による突進を再現できません。動きは仮の底面休息にとどめています。採用前にClaude Codeが巣穴専用動作を検討してください。
- レーンの「面を歩く生き物にhomeShelterなし」「エビにburrowなし」を守り、穴の設定を足していません。水景に穴が描かれていても、本下書きだけで巣穴を利用する保証はありません。
- crustaceanの触角付け根と足裏の位置は画像採用後に必要です。シャコはエビと脚構成が異なるため、画像位置をエビから写さないでください。
- 2009年Lizard Islandの夕刻の攻撃時刻は場所・季節限定です。固定的な全世界の夜行性とはしていません。
- 旧generation.jsonのnormalizedJob欠落によりspecies-packet.pyが停止します。

## 水槽の説明に使えそうな見どころ

縞の体とT字形の眼を目印に、砂の巣穴で獲物を待つ刺突型シャコの暮らしを紹介できます。
