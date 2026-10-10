# キタサンショウウオの下書きメモ

調査: `drafts/salamandrella-keyserlingii/adult-standard/research/request-r1/attempt-1/research.json`（保管庫）。
制作対象: `adult-standard`。絵の採否や位置の調整は行っていません。

## 仮の値と数字の根拠

- 全長12cmは `adultSize.typicalAdultTotalLength`、頭胴長6cmは `typicalAdultSnoutVentLength` の政府解説の概数です。画面の12cmは60cm槽幅の20%です。
- 頭胴長の雄57.63mm・雌61.7mmは `kushiroMaleSPVL` と `kushiroFemaleSPVL` です。本文はcmに換算して丸めています。母集団が異なる尾長の平均と足して全長の平均は作っていません。
- 横向きの両生類の手本に合わせ、`swim.bodyPlan: walker` としました。`tailBeatHz: 2`、`bodyWaveStart: 0.58`、`waveCount: 0.85`、`tailSweepRad: 0.4`、`verticalFlex: 0.012` はアカハライモリからの仮値で、脚や接地点は書いていません。
- `ecology` の夜行性、うねる歩き方、速度0.25/1.5、旋回1.5、休止率0.55、単独配置（間隔1.2、結束0、整列0）、地形への親和度0.6、`preferredZone`、`bottomRest`（毎分1.5、15〜60秒）はアカハライモリからの仮値です。本種の昼夜活動・群性・歩行速度の確定値ではありません。`depthRange: [0.7, 0.95]` は仮の低い配置範囲です。
- 手本の `airBreathing` と `grazing` は外しました。常時水没して定期的に浮上する生態や藻を削る食性は調査から確認できません。`homeShelter`・`hideByDay` も付けていません。
- 繁殖地の水温7.6〜19.3℃とpH5.6〜7.2は成体の通年の適温・適正水質ではないので、`water.temperatureC`・`pH` は書いていません。凍結実験の数値も飼育値に転用していません。

## 取り込み時に気をつける点

- 制作対象は非繁殖期に陸上で暮らす成体です。現在の `walker` は水底歩行を想定するため、この下書きのまま常時水中に取り込めるとは扱わないでください。陸岸への配置と動作の判断はClaude Codeに委ねます。本文の「本水槽では」は成体を紹介する方針として書き、常時水中を歩くとは記していません。
- 現在のpacketは `japan-salamanders-60` を返しました。水景に落ち葉・石・小枝はありますが、成体が上がれる陸場があるかはこの作業では判断していません。
- 水の区分は繁殖水域と配置先に合わせて淡水です。陸上成体を常時淡水中に置く意味ではありません。
- 展示の根拠なし。調査に種を特定した水族館・動物園の展示記録はありません。手順に従って `keeping: publicAquarium` としています。
- 2024年論文が引用するIUCNのLCは二次確認として記載しました。評価本文と年は未確認で、`assessedYear` は書いていません。国内ENと世界LCを混同していません。
- `Salamandrella tridactyla` は別種です。暫定異名や後続の誤綴りも別名の一覧には入れていません。

## 水槽の説明に使えそうな見どころ

キタサンショウウオは足先の指が前後とも4本で、春の繁殖には水辺を使い、幼生は夏に陸へ上がります。
