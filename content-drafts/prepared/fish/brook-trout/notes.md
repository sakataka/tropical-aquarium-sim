# カワマスの下書きメモ

## 入力と根拠

- 調査: `drafts/brook-trout/adult-standard/research/request-r1/attempt-1/research.json`。
- variant: `adult-standard`。生成記録の画風: `fish-side-natural-photo.v1`。画像の採否や画像内の位置は判断していません。
- 使用した出典: cas, fws, mass, massId, neotype2014, nies, field2025。調査の本文未読・二次確認などの区別を保っています。
- 約20cmはadultSize.massachusettsTypicalAdultLengthの6〜8インチ内の目安です。20cm TLが直接測定されたとの説明にはしていません。表示全長と研究資料の測長端点の照合が必要です。
- 展示の根拠なし。keepingは手順書の既定に従ってpublicAquariumとしました。実験飼育や魚類解説を生体展示記録に読み替えていません。

## 動きの仮値

既存種 `white-spotted-char` を手本にしました。以下の動きの数値・区間はすべて画面上の仮値で、野外の水深、実測速度、推奨飼育数ではありません。
activityPeriod=crepuscularはwhite-spotted-charからの仮値です。単独設定も恒常的な群泳の根拠がないための演出上の仮置きです。

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
    "activityPeriod": "crepuscular",
    "gait": "burstCoast",
    "speedBodyLengthsPerSec": {
      "cruise": 0.38,
      "burst": 1.7
    },
    "turnRateRadPerSec": 2.0,
    "restFraction": 0.3,
    "depthRange": [
      0.3,
      0.9
    ],
    "social": {
      "grouping": "solitary",
      "spacingBodyLengths": 2.4,
      "cohesion": 0,
      "polarization": 0.04
    },
    "structureAffinity": 0.7,
    "habits": []
  }
}
```

## Claude Codeへの引き継ぎ

- 図鑑の成魚長の端点は不明です。画面の全長約20cmは表示上の仮置きで、確実なTL資料を得たら更新してください。
- 基準標本の本文と表の標準体長に不一致があります。原記載の基準標本の値を最大成魚長にしていません。
- 活動時刻は未知なので仮設定です。小魚を食べるため混泳安全を断定しません。
- 幼魚の短期温度実験と野外の選好水温、古い生息地適性モデルは、成魚の長期推奨水温・pHに使っていません。
- 旧generation.jsonのnormalizedJob欠落によりspecies-packet.pyが停止します。

## 水槽の説明に使えそうな見どころ

虫食い模様と青い輪の赤斑を目印に、冷たい森の渓流に暮らすイワナの仲間を紹介できます。
