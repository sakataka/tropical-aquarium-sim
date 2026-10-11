# カマツカの下書きメモ

## 入力と根拠

- 調査: `drafts/pseudogobio-esocinus/adult-standard/research/request-r1/attempt-1/research.json`。
- variant: `adult-standard`。生成記録の画風: `fish-side-natural-photo.v1`。画像の採否や画像内の位置は判断していません。
- 使用した出典: cas, lberi, tominaga, original2019, aquatottoObservation, biwa2025, redlist2020。調査の本文未読・二次確認などの区別を保っています。
- 全長20cmはadultSize.lberiRepresentativeTotalLengthの200mm TLです。約30cmの別報告はauthorApproximateLargeTotalLengthに基づき、測り方を統合していません。
- keepingはbiwa2025とaquatottoObservationの展示記録に基づきます。水温・pHの種別推奨値は未確認なので省略しました。

## 動きの仮値

既存種 `rhinogobius-brunneus` を手本にしました。以下の動きの数値・区間はすべて画面上の仮値で、野外の水深、実測速度、推奨飼育数ではありません。
activityPeriod=diurnalは仮置きです。単独設定は恒常的な群泳の根拠がないためで、単独飼育を勧める意味ではありません。

```json
{
  "swim": {
    "tailBeatHz": 3
  },
  "preferredZone": {
    "minX": 0.08,
    "maxX": 0.92,
    "minY": 0.55,
    "maxY": 0.95
  },
  "ecology": {
    "activityPeriod": "diurnal",
    "gait": "burstCoast",
    "speedBodyLengthsPerSec": {
      "cruise": 0.25,
      "burst": 2.6
    },
    "turnRateRadPerSec": 3,
    "restFraction": 0.55,
    "depthRange": [
      0.35,
      0.95
    ],
    "social": {
      "grouping": "solitary",
      "spacingBodyLengths": 2.5,
      "cohesion": 0,
      "polarization": 0
    },
    "structureAffinity": 0.7,
    "habits": [
      {
        "type": "bottomRest",
        "chancePerMin": 2.5,
        "durationSec": [
          6,
          20
        ]
      },
      {
        "type": "bottomForage"
      }
    ]
  }
}
```

## Claude Codeへの引き継ぎ

- 特定の内湖での狭義種の常在は未確認です。ヨシ依存種、内湖固有種という説明にはしていません。
- 長い吻の下の口と短いひげの位置は採用画像で確認が必要です。
- 砂に潜る観察はありますが、この下書きでは底の休息・採餌だけを設定しました。
- 他種との安全混泳は未確認です。

## 水槽の説明に使えそうな見どころ

砂を口に取り込みながら餌を探す姿から、湖岸の砂底にも魚の暮らしがあることを紹介できます。

## 今回の未着手29件の確認結果と、依頼・手順の問題

ユーザーの追加指示に従い、Claude Codeに伝えるための問題をこのメモへ集約しました。13種は下書きを作成し、以下16種は要件を満たす定義を作れないため、species.jsonを作らず担当の印を外しました。キュー上では未着手のままです。再claimする前に以下の不足を解消してください。

完成したID: `snubnose-pompano`, `zebra-mantis-shrimp`, `yellow-coral-goby`, `carpenter-prawn`, `european-grayling`, `silurus-lithophilus`, `bluespine-unicornfish`, `pseudogobio-esocinus`, `brook-trout`, `abbottina-rivularis`, `bignose-unicornfish`, `japanese-spider-crab`, `australian-spotted-jellyfish`。

### 材料表示の問題

- `scripts/species-packet.py` は `generation["normalizedJob"]["image"]` を必須にしています。旧配送はトップレベルの `styleId`、`arguments.prompt`、`promptPath` などで記録するため、今回の29種のうち26種がKeyErrorで停止しました。正式スクリプトは変更せず、読み取り時だけ互換の形で表示し、全種の調査のevidenceStatusを維持して確認しました。
- ナンヨウタコクラゲはstyleId自体がなく、promptPathの真横・傘上の指定を読みました。テングハギの最新生成記録はexact-channel-copyの派生画像です。画像の生成原本と派生物を区別して表示する必要があります。
- `swim.bodyPlan` に未知の名前を足せばスキーマ検査に落ちます。省略や似た既存体型で検査だけを通すと、install-vault-species.pyが誤った体型で取り込むため、専用体型待ちの12種は保留しました。アプリ側の変更はClaude Codeの担当です。
- 目の和名について、レーンの「スズキの仲間はスズキ目」と既存種のニザダイ目・アジ目・ハゼ目は、そのままでは一律に対応しません。今回は近縁の既存種に合わせ、体系差をsizeNoteへ記しました。必要なら分類表記の基準を明確にしてください。
- `check-prepared.ts` は出典5〜10件、実寸の測定端点、未知値の扱い、bodyPlanと画風の適合までは検査しません。形の合格だけで生物学的根拠が揃ったとみなさないでください。
- 未完了を表すblocked区分はキューにありません。releaseすると未着手に戻るため、原因が残ったまま再びclaimされます。今回は手順を守ってreleaseし、その理由をこのメモに保存しました。

### 専用体型待ちの12種

#### `crocea-clam`

画風: `bivalve-oblique-natural-photo.v1`。調査: `drafts/crocea-clam/adult-standard/research/request-r1/attempt-1/research.json`。
二枚貝の固着・外套膜・水管に対応する体型がありません。殻長15cmという到達値を、外套膜込みの画像横幅へそのまま転用しないでください。
bivalveの動き・描画と横幅の寸法基準を先に用意し、その後に再claimしてください。

#### `giant-isopod`

画風: `isopod-oblique-natural-photo.v1`。調査: `drafts/giant-isopod/adult-standard/research/request-r1/attempt-1/research.json`。
等脚類の7対の歩脚・腹肢に対応する体型がありません。研究者によるLC判定をIUCN公式区分にしないでください。
isopodの面歩きと腹肢遊泳を追加し、調査の成体TLを使って下書きしてください。

#### `japanese-giant-isopod`

画風: `isopod-oblique-natural-photo.v1`。調査: `drafts/japanese-giant-isopod/adult-standard/research/request-r1/attempt-1/research.json`。
等脚類の体型がありません。依頼名Bathynomus doederleiniiに対しBISMaLの有効名はB. doederleiniです。2.8〜13.8cmは幼体を含む採集幅です。
専用体型を追加し、有効名の綴りと成体の寸法を確認してください。

#### `giant-plumose-anemone`

画風: `anemone-oblique-natural-photo.v1`。調査: `drafts/giant-plumose-anemone/adult-white-expanded/research/request-r1/attempt-1/research.json`。
付着ポリプの展開・収縮に対応する体型がありません。最大伸長高1m、冠径、足盤径、収縮保存長を混同できません。
anemoneの固定位置と触手・柱体の描画、画面の実寸基準を用意してください。

#### `magnificent-sea-anemone`

画風: `anemone-oblique-natural-photo.v1`。調査: `drafts/magnificent-sea-anemone/adult-standard/research/request-r1/attempt-1/research.json`。
付着ポリプの体型がありません。現行Radianthus magnificaと旧Heteractis magnifica、口盤最大径100cmを区別する必要があります。
付着ポリプの体型を追加し、口盤径と画像横幅の扱いを定義してください。

#### `giant-water-bug`

画風: `aquatic-insect-dorsal-natural-photo.v1`。調査: `drafts/giant-water-bug/adult-standard/research/request-r1/attempt-1/research.json`。
真上から見た水生昆虫の遊泳・捕獲脚・呼吸管に対応する体型がありません。成虫体長4.8〜6.5cmはあります。
aquatic-insectの視点と動きを追加してください。水草につかまる待ち伏せと水面呼吸も検討が必要です。

#### `japanese-diving-beetle`

画風: `aquatic-insect-dorsal-natural-photo.v1`。調査: `drafts/japanese-diving-beetle/adult-standard/research/request-r1/attempt-1/research.json`。
真上から見た昆虫の後脚の同時ストロークに対応する体型がありません。成虫TL3.5〜4cmはあります。
昆虫の専用描画・後脚遊泳・空気補給を用意してください。frogの脚骨格やrayの形で代用しないでください。

#### `japanese-pond-mussel`

画風: `bivalve-oblique-natural-photo.v1`。調査: `drafts/japanese-pond-mussel/adult-standard/research/request-r1/attempt-1/research.json`。
二枚貝の体型がなく、2025分類改訂以前の20cm超という殻長・生態を狭義Sinanodonta lautaへ確実に対応付けられません。
専用体型と、現行種概念に対応する成体殻長・飼育・生態を補ってください。

#### `longtail-tadpole-shrimp`

画風: `notostracan-dorsal-natural-photo.v1`。調査: `drafts/longtail-tadpole-shrimp/adult-standard/research/request-r1/attempt-1/research.json`。
真上から見た背甲・多数の脚・2本の尾鞭に対応する体型がありません。確認された6〜7mmは幼体の背甲長で、成体全長ではありません。
notostracanの体型と成体全長を補ってください。カブトガニやエビの体型へ置換しないでください。

#### `olive-flounder`

画風: `flatfish-eyed-side-natural-photo.v1`。調査: `drafts/olive-flounder/adult-standard/research/request-r1/attempt-1/research.json`。
有眼側を上に伏せるヒラメの体型がありません。通常魚やrayでは体の面とひれの動きが異なります。成魚TL資料はあります。
flatfishの底面休息・離底・滑空・潜砂と描画を先に用意してください。

#### `reticulated-hillstream-loach`

画風: `hillstream-dorsal-natural-photo.v1`。調査: `drafts/reticulated-hillstream-loach/adult-standard/research/request-r1/attempt-1/research.json`。
真上像の広い対鰭と石面利用に対応する体型がありません。43.1mmは雄標本SL、55〜65mmは二次引用の端点未指定長です。
hillstreamの体型・石面移動を追加し、成魚TLと画面の実寸の関係を確認してください。

#### `sea-lily`

画風: `crinoid-side-natural-photo.v1`。調査: `drafts/sea-lily/adult-standard/research/request-r1/attempt-1/research.json`。
有柄ウミユリの固定茎・冠部・腕に対応する体型がありません。底から10〜50cmは摂食位置で、体の全長や画像横幅ではありません。
crinoidの付着・冠の展開と実寸基準を追加し、成体の実寸を再調査してください。

### 必須寸法・出典の補完待ちの4種

#### `axolotl`

調査: `drafts/axolotl/wild-type/research/request-r1/attempt-1/research.json`。
walkerは使えますが、adultSizeの成体長がすべてunknownです。公式解説のインチ/cm不整合と測長端点の欠落が記されています。
dotsに長さの定義がある成体資料の補完を頼んでください。研究施設の温度・pHは成体長の代わりになりません。

#### `banded-antennae-squat-shrimp`

調査: `drafts/banded-antennae-squat-shrimp/adult-standard/research/request-r1/attempt-1/research.json`。
crustaceanは使えますが、成体標本の1.3〜3.5mmなどはpocl（甲長）だけです。調査は全長への読み替えを禁じています。
額角から尾までの成体長を補ってください。30cm水槽で表示幅が0.9cm未満なら「画面で見えにくいはず」です。甲長だけから見え方を確定しないでください。

#### `yeti-crab`

調査: `drafts/yeti-crab/adult-standard/research/request-r1/attempt-1/research.json`。
crabは使えますが、8.84cmは雄タイプのTL、5.86/5.15cmはCLで、必要な甲幅と脚を広げた幅がありません。出典も2件で、レーンの5〜10件を満たせません。
甲幅・脚幅の寸法基準と実際に使える追加出典を補ってください。計画水景の1500mと原記載2204〜2228mの差、細菌を育てて食べる断定の根拠も見直してください。

#### `mystery-snail`

調査: `drafts/mystery-snail/wild-type/research/request-r1/attempt-1/research.json`。
gastropodは使えますが、確認された4〜6cmは殻高で、触角を含む画像横幅がありません。材料の出典は4件で、レーンの5〜10件を満たせません。
画像横幅の実寸をどう決めるかと、5件未満しか使える出典がない場合の扱いを決めてください。未知の寸法や使わない出典で数を埋めないでください。

### 既存体型で作成した種の、採用時の注意

カワマス、グレイリング、スジエビモドキは端点未指定の出典長を表示上の仮寸法にしました。タカアシガニの脚幅は到達サイズから小さめの表示目安を選び、甲幅との比例換算ではないと明記しました。これらは正確な全長・画像横幅が直接測定されたという主張ではありません。成体の典型寸法が未指定でも実測標本を使える場合は、キイロサンゴハゼのように標本群の範囲と限界をsizeNoteへ明記しています。
