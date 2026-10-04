# 全水槽への地形展開

日本水槽の表面経路を土台に、東南アジア・アマゾン・小型キューブ・マラウイの既存水景にも地形を定義した。5水槽、30種の構成を維持し、すべての13水景が表面経路・遮蔽・回避領域・隠れ場所を持つ。

## 鑑賞時の変化

- 岩・流木と同じ奥行きへ来た魚は、その内部を避けて泳ぐ。手前・奥の通り道は開けておく。
- `grazing` の習性を持つ魚は、石・木・葉の表面へ近づいてついばむ。砂上で休む魚は `sand` の経路、昼に隠れる魚は水景の隠れ場所を使う。習性のない魚に新しい採餌・隠れ行動を追加しない。
- 習性行動では奥行きもゆっくり変え、終了後は元の奥行きへ戻る。水景切替で前の目的地を破棄し、画面外へ切り取られた接地点は選ばない。
- 既存のヤマトヌマエビは引き続き経路を歩く。通常の魚は泳いで接地点へ寄るため、エビ用の歩行・脚の傾きは適用しない。
- マラウイに「岩の回廊と白い砂」 (`malawi-crevices`) を追加。重なる岩の暗い隙間と中央の白い砂の道で、既存の岩礁とは異なる景観を用意した。

## データと処理

`terrain.surfaces` の素材に `leaf` を追加。葉も生成背景上にある実際の輪郭から接地点を定義する。

`terrain.obstacles` は画像内の中心XY・奥行き、XY半径、奥行き半径を持つ楕円体の内部領域。画像の `cover` 変換を通して水槽実寸に直し、魚の現在の奥行きで断面を求める。先行点を使った回避に加え、移動区間と断面の交差を確認し、慣性による突き抜けを防ぐ。切替・初期配置で内部から始まった場合は、ガラス内に収まる境界へ移す。

`terrain.shelters` は画像内のXYZとIDを持つ。`terrainGoal` は水景と経路・進捗または隠れ場所の参照を実行時だけ保持する。接地点は描画の切取りが変わるたびに再計算する。到達判定にはXYだけでなく奥行きの距離も使う。移動が長時間続いた目的地は選び直す。

回避領域は描画しない。遮蔽は既存の生成背景の同じ画素を切り抜いて合成する。従来の単一前景ではなく、生き物と遮蔽を奥行き順に並べる。魚全身の厳密な衝突や自由視点の3Dを再現する仕組みではなく、鑑賞向けに調整した2.5Dの動きである。

## アセット

新規画像は `malawi-crevices/plate.webp` だけ。既存の `malawi-rocks/plate.webp` をスタイルとカメラの参考に、組み込み画像生成を使用。1672×941のPNGからWebP quality 92へ形式変換した。ほかの水景の画像は維持し、生成済みの原画に地形情報を追加した。依存関係・lockfileの変更なし。

生成プロンプト:

```text
Use case: photorealistic-natural. Asset: one full-bleed 16:9 underwater aquarium background plate. Use reference solely for style, camera and color matching, not for preserving its composition. NEW Lake Malawi rocky shore composition with two low clusters of rounded weathered granite boulders, LEFT x=8-35%, crest y=55%, RIGHT x=68-93%, crest y=65%. Boulders grounded on clean white sand, several natural dark crevices under overlapping rocks visible near x=22%,y=79% and x=80%,y=82%. An open winding white sand corridor crosses the middle at y=84-94%. Rich clear blue freshwater, distant blue rocky lakeshore, sunlight rays from upper left and rippled surface at top. Foreground stone faces with subtle patchy olive biofilm, same photographic realistic detailed 2D aquarium world as reference. Upper central 60% open blue water for animated fish. No fish, animals, shells, coral, water plants, text, frames, UI, or aquarium equipment. Camera horizontal through front glass, slightly down towards sand. Calm freshwater setting.
```

## 保存と検証

水槽ID、魚の構成・匹数、保存キー・バージョン、更新前に保存した水景選択・照明を維持。マラウイの初期水景も従来どおり。新水景は設定の水景タブから選ぶ。水景を切り替えた際は、従来どおりその水景の標準照明を適用する。地形の目的地や一時的な奥行きは保存しない。

`bun run test` は全13水景で180秒分のシミュレーションを進め、魚が回避領域に入らずガラス内に留まること、地形上の採餌・隠れ・奥行き変化を確認する。移動区間の交差、奥行きの異なる通過、葉への接近、水景切替、不正な定義・画面外の目的地も検証する。

`bun run build` にTypeScriptチェックを含む。`bun run verify:webview` はWebKitで全13水景のデスクトップ1440×960／モバイル420×912表示・選択、画像、保存・再読込、魚の構成と照明、部屋への移動、エラーと横溢れを確認する。従来の912×420検証も維持。一時スクリーンショットは `tmp/webview/terrain-*.png`。物理iPhoneでの検証は含まない。
