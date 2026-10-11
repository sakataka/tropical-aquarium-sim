# ビワコオオナマズの下書きメモ

## 材料と数字の根拠

入力: `drafts/silurus-biwaensis/adult-standard/research/request-r1/attempt-1/research.json`。画像の採否・画像内の位置は判断していません。使用出典は cas, kahaku, lberi, lbmCatalog, tracking1997, spawning2001, ednaRelease, museumDisplay, newTank2026, tokaiMorph です。
大きさは範囲の中ほど（仮）です。adultSize.overview_total_length（lberi）の100〜120cm TLの中ほどを取り、adultSizeCmとrealBodyLengthCmを110にしました。400cm水槽の幅の27.5%なので35%を超えません。
1.3mの解説値と標本欄1015mm（lbmCatalog）は端点不明です。全長や標準体長へ換算せず、sizeNoteへ両方残しました。
目・科は同じSiluridaeの館のナマズ（amur-catfish）にそろえました。科学名の著者年はCASの1961と国科博の1962で差があるため、この下書きでは著者年を表示していません。
activityPeriod=nocturnalは手本と、tracking1997の1個体24時間の夜活動の観察を参考にしています。原著の全個体で固定的な夜行性を確認した値ではなく、速度と日周設定は展示の仮置きです。
夜の主役という計画ですが、日中に洞へ隠れる行動を種全体の必須動作とはせず、hideByDayとhomeShelterを手本から外しました。bottomRestだけで休息と遊泳を組み合わせます。
keepingはmuseumDisplay/newTank2026の生体展示記録に基づきます。新水槽が再現する水深10〜15mは野外のモデル環境で、実水槽の深さではありません。
追跡1個体の16.6〜19.5℃、野外産卵観察の15〜30℃は飼育推奨値ではありません。水温・pH・最低水槽寸法など、未知の長期飼育値を補っていません。
県2020の希少種（lbmCatalog）と主体不明のNT（ednaRelease）を区別しています。lberiListの県列の2026という見出しを2025評価と同じものとは判定していません。IUCNのstatusとassessedYearは省略しました。
魚食性なので、計画で併記されるハス・ニゴロブナや小魚との実飼育上の安全混泳は未確認です。産卵場の冠水と水位操作の話題はspawning2001の考察の範囲で扱います。
画像はfish-side-species-skin-photo.v1で、横向きの魚なのでbodyPlanを書いていません。口先・ひげ・尾の上下葉の比率はClaude Codeが画像採用時に確認してください。
材料のissuesには大きな眼、長いひげ、下顎突出の不足、尾形、幅と余白の留保が残っています。絵の採否は判断せず、その記録を引き継ぎます。

## 動きの設定と仮値

手本は `amur-catfish` です。以下の速さ・拍・旋回・休息・区間・個体間隔・凝集と向きのそろい方・構造物への寄りやすさ・習性の頻度と時間は、すべて演出上の仮値です。野外の実測値や推奨飼育数ではありません。
depthRangeは手前（0）から奥（1）の範囲で、上下の泳層や実際の水深へ読み替えていません。

```json
{
  "swim": {
    "tailBeatHz": 1.0,
    "bodyWaveStart": 0.3,
    "waveCount": 1.0,
    "tailSweepRad": 0.3,
    "verticalFlex": 0.025
  },
  "preferredZone": {
    "minX": 0.08,
    "maxX": 0.92,
    "minY": 0.66,
    "maxY": 0.95
  },
  "ecology": {
    "activityPeriod": "nocturnal",
    "gait": "undulate",
    "speedBodyLengthsPerSec": {
      "cruise": 0.12,
      "burst": 0.8
    },
    "turnRateRadPerSec": 1.3,
    "restFraction": 0.55,
    "depthRange": [
      0.35,
      0.95
    ],
    "social": {
      "grouping": "solitary",
      "spacingBodyLengths": 2.0,
      "cohesion": 0,
      "polarization": 0.03
    },
    "structureAffinity": 0.7,
    "habits": [
      {
        "type": "bottomRest",
        "chancePerMin": 1,
        "durationSec": [
          15,
          40
        ]
      }
    ]
  }
}
```

## 水槽の説明に使えそうな見どころ

低い頭、短いひげ、上側が長い尾びれを目印に、休息と遊泳を繰り返す琵琶湖の大型ナマズを紹介できます。
