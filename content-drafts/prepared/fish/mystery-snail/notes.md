# スパイクトップアップルスネールの下書きメモ

## 材料と根拠

調査は `drafts/mystery-snail/wild-type/research/request-r1/attempt-1/research.json` です。画像は採否を判断せず、画風に対応する既存種 `chinese-mystery-snail` の動きと表示寸法の比率を使いました。
出典2件（S1・S2）です。本文を取得できなかった出典や、使っていない出典は足していません。
大きさは範囲の中ほど（仮）です。adultSize.shellHeightReportedの40〜60mmをcmへ換算し、中ほどの5cmを図鑑の目安にしました。
画面の幅は仮（chinese-mystery-snailの比率）です。手本の8.5÷5=1.7を殻高5cmに掛け、realBodyLengthCm=8.5としました。本種の画像の触角を含む幅はClaude Codeが採用時に直してください。sizeNoteには調査の殻高だけを記しました。
展示計画に置き場所が見つからないため、本水槽に触れる文は書いていません。水槽の幅に対する比率や同居種との相性も判定していません。
目は仮です。調査に目の行がなく、館に同じAmpullariidaeの種がいないため、館の淡水巻貝のArchitaenioglossaを仮に使いました。目の体系と科の和名はClaude Codeが確認してください。
展示の根拠なし。調査には流通名の記載がありますが、家庭飼育や生体展示の直接記録は明記されていないため、手順書の既定に従ってpublicAquariumにしました。採用時に確認してください。
水温26.8〜32.8℃とpH6.3〜7.3は移入地の観測値の二次引用です。推奨飼育値として水温・pHに入れていません。
Pomacea bridgesii diffusaは旧組合せです。現行P. bridgesiiやP. canaliculataと同じ種とは扱っていません。色と殻形だけでの同定にも限界があります。
水面上の卵塊はPomacea属を含む解説なので、本種固有の産卵数や産卵頻度を記していません。

## 水槽の説明に使えそうな見どころ

巻いた殻と、肺と鰓を持つリンゴガイの仲間の暮らしを紹介できます。

## 動きの仮値

`chinese-mystery-snail` の数値を写しています。activityPeriodの日周活動、単独の設定、速さ・旋回・休息・間隔・構造物への寄りやすさ・習性の頻度と時間は、すべて演出上の仮値です。本種の実測値や飼育推奨値ではありません。
depthRangeは手前（0）から奥（1）の範囲です。上下や野外水深と読み替えず、手本の値をそのまま使いました。面を歩く生き物なのでhomeShelterを付けず、夜行性の根拠がないのでhideByDayも付けていません。

```json
{
  "swim": {
    "bodyPlan": "gastropod",
    "tailBeatHz": 0.35,
    "waveCount": 1.5,
    "tailSweepRad": 0.16,
    "verticalFlex": 0.004
  },
  "preferredZone": {
    "minX": 0.08,
    "maxX": 0.92,
    "minY": 0.8,
    "maxY": 0.95
  },
  "ecology": {
    "activityPeriod": "diurnal",
    "gait": "glide",
    "speedBodyLengthsPerSec": {
      "cruise": 0.04,
      "burst": 0.06
    },
    "turnRateRadPerSec": 0.5,
    "restFraction": 0.5,
    "depthRange": [
      0.1,
      0.9
    ],
    "social": {
      "grouping": "solitary",
      "spacingBodyLengths": 1.5,
      "cohesion": 0,
      "polarization": 0
    },
    "structureAffinity": 0.6,
    "habits": [
      {
        "type": "grazing",
        "chancePerMin": 1.5,
        "durationSec": [
          20,
          60
        ]
      },
      {
        "type": "bottomRest",
        "chancePerMin": 0.5,
        "durationSec": [
          30,
          120
        ]
      }
    ]
  }
}
```
