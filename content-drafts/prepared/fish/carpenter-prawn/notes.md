# スジエビモドキの下書きメモ

## 入力と根拠

- 調査: `drafts/carpenter-prawn/adult-standard/research/request-r1/attempt-1/research.json`。
- variant: `adult-standard`。生成記録の画風: `crustacean-side-natural-photo.v1`。画像の採否や画像内の位置は判断していません。
- 使用した出典: itis, li2004, ito1991, hazu2016, ows, kim2008Abstract。調査の本文未読・二次確認などの区別を保っています。
- 4cmはadultSize.fieldGuideBodyLengthApproximate（hazu2016）の独立した体長説明です。甲長7.6/11.35mmから換算していません。
- 展示の根拠なし。研究飼育の実績はありますが、publicAquariumは手順書の既定です。温度とpHは成体の通年推奨として裏付けられないため省略しました。

## 動きの仮値

既存種 `macrobrachium-australe` を手本にしました。以下の動きの数値・区間はすべて画面上の仮値で、野外の水深、実測速度、推奨飼育数ではありません。
activityPeriod=nocturnalはmacrobrachium-australeからの仮値です。元の手本自身でも日周活動は未知です。遅い歩行と底の休息だけを仮演出に使います。

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
    "activityPeriod": "nocturnal",
    "gait": "glide",
    "speedBodyLengthsPerSec": {
      "cruise": 0.06,
      "burst": 0.4
    },
    "turnRateRadPerSec": 1.1,
    "restFraction": 0.55,
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
        "chancePerMin": 1.5,
        "durationSec": [
          8,
          20
        ]
      }
    ]
  }
}
```

## Claude Codeへの引き継ぎ

- 画面4cmは端点未指定の体長説明を目安にした仮置きです。額角を含む正確なTL資料を得たら照合してください。
- 面を歩く種なのでhomeShelterを除き、夜行性の根拠がないのでhideByDayを除きました。エビのburrowも付けていません。
- 幼生の仔ダコとの攻撃・被食は特定飼育条件です。成体の一般的攻撃性、混泳安全性へ拡張していません。
- 韓国の野外水温、幼生処理温度、飼育期間全体の温度を成体の適温として合成していません。
- 旧generation.jsonのnormalizedJob欠落によりspecies-packet.pyが停止します。

## 水槽の説明に使えそうな見どころ

透明な体の細い縞と長い触角を手がかりに、磯の潮だまりの小さな住人を紹介できます。
