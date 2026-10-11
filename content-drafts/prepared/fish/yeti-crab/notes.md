# キワ・ヒルスタの下書きメモ

## 材料と根拠

調査は `drafts/yeti-crab/adult-standard/research/request-r1/attempt-1/research.json` です。画像は採否を判断せず、画風に対応する既存種 `anemone-hermit-crab` の動きと表示寸法の比率を使いました。
出典2件（S1・S2）です。本文を取得できなかった出典や、使っていない出典は足していません。
図鑑の大きさは甲幅ではなく甲長（調査に甲幅なし）です。adultSize.holotypeCarapaceWithoutRostrumの51.5mmを5.15cmへ換算し、小数1桁の約5.2cmに丸めました。ホロタイプ1個体の値で代表値ではありません。
額角込み58.6mm、全長88.4mmは同じadultSize節の別の測り方です。甲幅や脚幅へ換算していません。
画面の幅は仮（anemone-hermit-crabの比率15÷4.5）です。調査の甲長5.15cm×(15÷4.5)=約17.17cmから、realBodyLengthCm=17としました。手本の15cmは殻・イソギンチャク・触角を含む幅で、本種の長いはさみ脚の比率としての根拠は弱く、Claude Codeが絵を見て直す前提です。sizeNoteにはこの仮の横幅を入れていません。
180cm水槽に対する仮の画面幅17cmは約9.4%です。幅3〜35%の範囲内ですが、実飼育の必要水槽寸法ではありません。
目は仮です。調査は異尾下目Anomuraを示し、目の行はありません。同じ科の館の種もいないため、館の異尾類の手本の十脚目を使いました。科の和名を含めClaude Codeが確認してください。
展示の根拠なし。研究観察の対象という記載はありますが、生体の水族館展示・長期飼育の記録は未確認です。手順書の既定に従いpublicAquariumとし、rarelyDisplayedにはしていません。
熱水噴出温度を、生物が接する混合水温や飼育推奨値にしていません。圧力・水温・pH・塩分濃度の推奨値は未確認なので数値を省略しました。
水景の制作設定は水深1500mですが、原記載の観察は2204〜2228mです。本種が1500mにいるという文は書かず、展示は各地の熱水域をまとめた演出として扱っています。
K. puravidaの腕を振る細菌栽培を、本種の実証済み行動にしていません。細菌を食べる割合や除毒の役割も未確定です。同じ水槽の生き物との実飼育上の相性は確認できていません。
grazingは手本の面上の採餌の動きだけを写した仮演出です。藻を削る生活や細菌摂食を実装した設定とはしていません。

## 水槽の説明に使えそうな見どころ

毛のような剛毛とその上の細菌を手がかりに、光の届かない熱水域で暮らす異尾類を紹介できます。

## 動きの仮値

`anemone-hermit-crab` の数値を写しています。activityPeriodの日周活動、単独の設定、速さ・旋回・休息・間隔・構造物への寄りやすさ・習性の頻度と時間は、すべて演出上の仮値です。本種の実測値や飼育推奨値ではありません。
depthRangeは手前（0）から奥（1）の範囲です。上下や野外水深と読み替えず、手本の値をそのまま使いました。面を歩く生き物なのでhomeShelterを付けず、夜行性の根拠がないのでhideByDayも付けていません。

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
    "minX": 0.12,
    "maxX": 0.88,
    "minY": 0.86,
    "maxY": 0.94
  },
  "ecology": {
    "activityPeriod": "nocturnal",
    "gait": "glide",
    "speedBodyLengthsPerSec": {
      "cruise": 0.04,
      "burst": 0.3
    },
    "turnRateRadPerSec": 1,
    "restFraction": 0.65,
    "depthRange": [
      0.3,
      0.9
    ],
    "social": {
      "grouping": "solitary",
      "spacingBodyLengths": 1.5,
      "cohesion": 0,
      "polarization": 0
    },
    "structureAffinity": 0.7,
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
          15,
          40
        ]
      }
    ]
  }
}
```
