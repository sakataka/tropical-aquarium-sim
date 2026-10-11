# ナンヨウタコクラゲの下書きメモ

## 入力と根拠

- 調査: `drafts/australian-spotted-jellyfish/adult-standard/research/request-r1/attempt-1/research.json`。
- variant: `adult-standard`。生成記録の画風: `None`。画像の採否や画像内の位置は判断していません。
- 使用した出典: worms, smithsonian, japan, enosui2019, enosui2025, flow。調査の本文未読・二次確認などの区別を保っています。
- 傘径50cmはadultSize.compiledMaximumBellDiameter、11cmはjapanMeasuredMedusaeの鹿児島個体です。50cmでは水槽幅の35%を超えるため、実測された小さい傘径を表示に使いました。
- prompt.txtは傘が上・口腕が下の真横像を指定しています。spotted-jellyfishと同じjellyで扱えます。
- keepingはenosui2019の実展示記録に基づきます。種別の通年水温・pHは未確認なので省略しました。

## 動きの仮値

既存種 `spotted-jellyfish` を手本にしました。以下の動きの数値・区間はすべて画面上の仮値で、野外の水深、実測速度、推奨飼育数ではありません。
activityPeriod=diurnalは共生藻を持つクラゲの既存手本からの仮値で、実測した日周行動ではありません。群れのまとまりは0で、個体間隔だけを設けています。

```json
{
  "swim": {
    "bodyPlan": "jelly",
    "tailBeatHz": 0.9,
    "tailSweepRad": 0.13,
    "waveCount": 1
  },
  "preferredZone": {
    "minX": 0.08,
    "maxX": 0.92,
    "minY": 0.25,
    "maxY": 0.7
  },
  "ecology": {
    "activityPeriod": "diurnal",
    "gait": "glide",
    "speedBodyLengthsPerSec": {
      "cruise": 0.12,
      "burst": 0.3
    },
    "turnRateRadPerSec": 0.5,
    "restFraction": 0.1,
    "depthRange": [
      0.15,
      0.85
    ],
    "social": {
      "grouping": "group",
      "spacingBodyLengths": 1.5,
      "cohesion": 0,
      "polarization": 0
    },
    "structureAffinity": 0,
    "habits": []
  }
}
```

## Claude Codeへの引き継ぎ

- generation.jsonにnormalizedJobもstyleIdもなくspecies-packet.pyが停止しました。prompt.txtの向き指定を読んでjellyと対応付けました。スクリプトは旧記録とpromptPath参照に対応する必要があります。
- 生成記録には傘周辺の不透明さ、余白不足、規則的に見える白点、口腕の重なりで8本を認証できない点が残っています。ここでは記録の転記にとどめ、絵の採否は判断していません。
- 日本で採集された11cm個体の成熟段階は未確認です。生成指示のadult-formと、表示する傘径の根拠を採用時に照合してください。
- 共生藻の有無や色は集団差があります。無給餌飼育や同槽のクラゲとの安全性は保証しません。

## 水槽の説明に使えそうな見どころ

白い水玉の傘と白い先端の口腕を目印に、泳ぐ流れで餌を捕らえるクラゲを紹介できます。
