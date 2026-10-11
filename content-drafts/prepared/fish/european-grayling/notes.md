# ヨーロピアン・グレイリングの下書きメモ

## 入力と根拠

- 調査: `drafts/european-grayling/adult-standard/research/request-r1/attempt-1/research.json`。
- variant: `adult-standard`。生成記録の画風: `fish-side-species-skin-photo.v1`。画像の採否や画像内の位置は判断していません。
- 使用した出典: cas, doris, ofb, weiss, nutrition2021。調査の本文未読・二次確認などの区別を保っています。
- 35cmはadultSize.regionalTypicalLength、50cmはregionalReportedLargeSize（doris）です。端点未指定なので、画面全長35cmは演出上の仮置きとして明記しました。
- 展示の根拠なし。nutrition2021は幼魚の飼育実験であり展示記録ではありません。keepingは手順書の既定に従ってpublicAquariumとしました。

## 動きの仮値

既存種 `chum-salmon` を手本にしました。以下の動きの数値・区間はすべて画面上の仮値で、野外の水深、実測速度、推奨飼育数ではありません。
日周活動は未確認で、activityPeriod=crepuscularはchum-salmonからの仮値です。群れの定性的根拠はdoris/ofbで、群れの数値と速さは仮値です。

```json
{
  "swim": {
    "tailBeatHz": 1.1
  },
  "preferredZone": {
    "minX": 0.08,
    "maxX": 0.92,
    "minY": 0.25,
    "maxY": 0.7
  },
  "ecology": {
    "activityPeriod": "crepuscular",
    "gait": "steady",
    "speedBodyLengthsPerSec": {
      "cruise": 0.26,
      "burst": 0.8
    },
    "turnRateRadPerSec": 1.3,
    "restFraction": 0.22,
    "depthRange": [
      0.15,
      0.8
    ],
    "social": {
      "grouping": "shoal",
      "spacingBodyLengths": 1.6,
      "cohesion": 0.45,
      "polarization": 0.5
    },
    "structureAffinity": 0.2,
    "habits": []
  }
}
```

## Claude Codeへの引き継ぎ

- 全長の端点が明示された成魚資料を得たら表示寸法を照合してください。幼魚の栄養・温度実験値は成魚の通年推奨へ転用していません。
- 上部ロワールのT. ligericusやアドリア海側のT. aelianiの生態・分布を本種へ無条件に統合していません。
- 群れる魚でも繁殖縄張りや小魚捕食があり、安全混泳を保証しません。
- 旧generation.jsonのnormalizedJob欠落によりspecies-packet.pyが停止します。

## 水槽の説明に使えそうな見どころ

旗のような背びれを広げるグレイリングから、冷たい川の流れと礫の産卵場を紹介できます。
