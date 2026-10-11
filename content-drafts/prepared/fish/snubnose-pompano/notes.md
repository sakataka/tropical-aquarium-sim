# マルコバンの下書きメモ

## 入力と根拠

- 調査: `drafts/snubnose-pompano/adult-standard/research/request-r1/attempt-1/research.json`。
- variant: `adult-standard`。生成記録の画風: `fish-side-species-skin-photo.v1`。画像の採否や画像内の位置は判断していません。
- 使用した出典: cas, fao, foa, japan2025, churaumi, toba, aggregation2018。調査の本文未読・二次確認などの区別を保っています。
- 65cm TL/55.5cm FLはadultSize.sameExaminedTL/largestExaminedFLの同一標本値です。110cm FL、50cm「体長」は別資料の値です。2017年はconservation.catalogIUCNです。
- keepingはchuraumiの種紹介・繁殖賞表示とtobaの種解説に基づきます。

## 動きの仮値

既存種 `japanese-amberjack` を手本にしました。以下の動きの数値・区間はすべて画面上の仮値で、野外の水深、実測速度、推奨飼育数ではありません。
昼夜の活動は種別の根拠が足りず、activityPeriod=diurnalはjapanese-amberjackからの仮値です。群れの定性的根拠はchuraumi/foaにあります。

```json
{
  "swim": {
    "tailBeatHz": 1.2,
    "bodyWaveStart": 0.45,
    "tailSweepRad": 0.42
  },
  "preferredZone": {
    "minX": 0.08,
    "maxX": 0.92,
    "minY": 0.25,
    "maxY": 0.7
  },
  "ecology": {
    "activityPeriod": "diurnal",
    "gait": "steady",
    "speedBodyLengthsPerSec": {
      "cruise": 0.45,
      "burst": 1.4
    },
    "turnRateRadPerSec": 1.4,
    "restFraction": 0.04,
    "depthRange": [
      0.15,
      0.85
    ],
    "social": {
      "grouping": "school",
      "spacingBodyLengths": 1.3,
      "cohesion": 0.75,
      "polarization": 0.78
    },
    "structureAffinity": 0.05,
    "habits": []
  }
}
```

## Claude Codeへの引き継ぎ

- 生成プロンプトは55cmの大型成魚を指定していますが、これは調査の65cm TL標本と別の制作寸法です。画面は出典のある65cm TLにしました。画像の成魚比率はClaude Codeが確認してください。
- CASの科がTrachinotidae、館の既存分類とFAOはCarangidaeです。分類体系の決定が必要ならClaude Codeが判断してください。
- 旧generation.jsonのnormalizedJob欠落によりspecies-packet.pyが停止します。
- 貝類などを食べるため、同槽の小型無脊椎動物との安全混泳は保証しません。

## 水槽の説明に使えそうな見どころ

銀色の群れの中に、貝の殻を砕いて食べるマルコバンの丸い鼻先と鎌状のひれを探せます。
