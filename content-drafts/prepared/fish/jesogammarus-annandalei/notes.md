# アナンデールヨコエビの下書きメモ

## 材料と数字の根拠

入力: `drafts/jesogammarus-annandalei/adult-male/research/request-r1/attempt-1/research.json`。画像の採否・画像内の位置は判断していません。使用出典は lberi, metabolism2007, ontogeny2005, acoustics1997, hypoxiaReport です。
体長1.5cmはadultSize.overview_body_length（lberi）の15mmの換算です。別の成体標本平均8.3mm（acoustics1997）を最大値や普遍的な平均へ置き換えていません。
180cm水槽では1.5÷180=約0.83%です。材料の大きめの説明値15mmを選んでも幅の3%より小さく、画面で見えにくいはずです。根拠のない巨大化はしていません。別の小さな水槽へ置くか、拡大して見せるかはClaude Codeが判断してください。
taxonomyの和名は材料の出典lberiの現行ページの冒頭を直接確認し、端脚目・キタヨコエビ科にしました。同じ科の既存種はありません。
activityPeriod=nocturnalは大きな個体の昼底・夜中層の観察（ontogeny2005）に合わせています。孵化直後の幼体は昼夜とも沖の水中にいて、成体の行動とは異なります。
画風はcrustacean-side-natural-photo.v1で、species-packet.pyが示すcrustaceanと手本akamon-mino-shrimpに従いました。ただし本種は十脚類のエビではなく端脚類です。頭胸甲・眼柄・幅広い尾扇を持つエビの形態や、画像内の位置を転用しないでください。
現行crustaceanは面を歩く仕組みです。夜に中層へ上がってプランクトンを食べる動きは、この下書きでは表現できません。grazingを除き、底の休息だけを付けています。採用時に泳ぐヨコエビの動作を検討してください。homeShelter・hideByDay・burrowは付けていません。
展示の根拠なし。低温暗条件の短期研究飼育はありますが、確立した長期展示の記録ではありません。keepingは手順書の既定に従いpublicAquariumにしています。
研究の8℃での短期維持、野外の7〜8℃、低酸素の呼吸指標は、通年の推奨水温や安全な最低酸素濃度にはしていません。水温・pHの欄は省略しました。
国のNTの評価年は不明です。県2025の希少種はconservation.shiga_2025_category（lberi）に基づき、IUCN区分へ転記していません。
同槽候補のイサザは本種の捕食者です。比較展示としての同居と、実飼育上の安全性を分けてください。
材料のissuesには、修正版の幅・余白・背景alpha・細部形態の留保が残っています。ここではその記録を伝えるだけとし、絵の良否は判断していません。

## 動きの設定と仮値

手本は `akamon-mino-shrimp` です。以下の速さ・拍・旋回・休息・区間・個体間隔・凝集と向きのそろい方・構造物への寄りやすさ・習性の頻度と時間は、すべて演出上の仮値です。野外の実測値や推奨飼育数ではありません。
depthRangeは手前（0）から奥（1）の範囲で、上下の泳層や実際の水深へ読み替えていません。

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
    "minX": 0.1,
    "maxX": 0.9,
    "minY": 0.82,
    "maxY": 0.93
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
    "structureAffinity": 0.3,
    "habits": [
      {
        "type": "bottomRest",
        "chancePerMin": 1.8,
        "durationSec": [
          10,
          30
        ]
      }
    ]
  }
}
```

## 水槽の説明に使えそうな見どころ

湖底と中層を昼夜で往復する小さなヨコエビを通して、深い湖の食物のつながりを紹介できます。
