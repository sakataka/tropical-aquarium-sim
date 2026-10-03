# 日本の湧水水槽：地形と水景の拡張

この文書は日本水槽への初期導入を記録する。後続の全水槽展開・魚の回避と葉の接地点は [全水槽への地形展開](terrain-all-tanks-2026-10.md) を参照。

## 体験と範囲

日本の湧水水槽 `japan-60` に「苔石と砂の小径」 (`japan-moss-stones`) と「苔むす流木の浅瀬」 (`japan-moss-wood`) を追加。既存の「木漏れ日の湧水」 (`japan-spring`) を含めて3水景に地形を定義する。

ヤマトヌマエビが砂底、石、流木の表面をゆっくり歩き、休止とついばむ動きを挟む。砂と構造物の経路は、同じXYZを持つ端点で接続する。水景を切り替えたら、その水景の経路へ置き直す。水景切替による座標の再配置は背景のフェード中に行う。自由配置、飼育・餌やり・繁殖、魚の地形回避、葉の表面移動は今回の対象に含めない。

## 地形の表現

- `terrain.surfaces`: 表面経路。`id`、`material` (`sand` / `stone` / `wood`)、2点以上の `points` を持つ。
- 各点の `x/y` は背景原画内の0〜1。`depth` は0がガラス側、1が奥。同じXYでも奥行きは別に持てる。
- 経路の長さは、水槽実寸と奥行きを使った距離で計算する。接続は端点のXYZが一致する場合だけ認め、離れた石へ飛び移らない。
- `terrain.occluders`: 原画の遮蔽領域。`depth` と画像内の `polygon` を持ち、生き物と同じ奥行き順で描く。輪郭は生成背景を見て定義する。
- 遮蔽には背景 `plate.webp` の同じ画素をマスクで使う。画像を別の生成素材に置き換えたり、図形を石や流木として描いたりしない。地形つき水景では従来の単一 `foreground.webp` を使わない。
- 画像のcover表示・側面ガラスへの広がりを `SurfaceFrame` で座標変換する。部屋と拡大画面は同じ切取り倍率と砂底の下端合わせを使い、脚が砂底から浮かないようにする。
- 経路上の位置、奥行き、向き、休止は実行時だけ保持する。画像の大きさ・水槽サイズに合わせた描画と、表面上の脚の位置・体の傾きに使う。

これは画像に対応した2.5Dの表面経路であり、自由な視点の3D地形や、石全体の衝突形状ではない。通常の魚は従来の遊泳を続け、前後関係だけ地形の遮蔽に従う。経路と休止頻度は鑑賞用の調整値で、魚種の実測を再現したものではない。

## 生態の参考

[東京都公園協会のヤマトヌマエビ紹介](https://www.tokyo-park.or.jp/park/hachijo/creature/detail/0985.html) で河川の成体を確認。[FluvalのSpecies Spotlight](https://fluvalaquatics.com/uk/wp-content/uploads/2022/02/Species-Spotlight_Amano-Shrimp_EN.pdf) に水槽内の表面で藻類などを採る行動が記載されている。移動の様子の補助資料は [Aquarium Co-OpのAmano Shrimp紹介](https://www.aquariumcoop.com/blogs/aquarium/amano-shrimp)。今回は成体の鑑賞表現に限定する。

## アセット制作

Codexの組み込み画像生成を使用。スタイルとカメラの参照は既存 `src/content/environment/scenes/japan-spring/plate.webp`。新しい背景2枚を生成し、PillowでWebP (quality 92) に形式変換した。元の背景は差し替えない。2枚合わせて約811 KB、依存関係とlockfileの変更なし。

保存先:

- `src/content/environment/scenes/japan-moss-stones/plate.webp`
- `src/content/environment/scenes/japan-moss-wood/plate.webp`

使用した最終プロンプト（原文）:

### 苔石と砂の小径

```text
Use case: photorealistic-natural. Reference image is STYLE AND CAMERA reference, not an image to preserve. Generate ONE new full-bleed 16:9 underwater aquarium background plate for a Japanese clear springwater habitat, same realistic detailed photographic 2D style, camera looking horizontally through front glass slightly down at the bottom, gentle teal clear water and upper-left sunlight, rippled surface at top. NEW composition: low smooth mossy river stones arranged across the bottom, with a large rounded stone mound on the LEFT (x=10-35%, crest at y=69%) and a smaller RIGHT mound (x=70-90%, crest at y=76%), connected by an open pale gravel/sand path at y=88-94%. Slim Japanese aquatic weeds at far rear and edges. Foreground bottom 20% contains detailed gravel, rear fades naturally. Central upper 60% is open water for live animated fish; no fish, shrimp, animals, lettering, borders, frames or UI. Stone upper contours must be clearly readable and continuous for shrimp to walk over. Keep full underwater world, no exterior aquarium equipment. Output saveable asset.
```

### 苔むす流木の浅瀬

```text
Use case: photorealistic-natural. Image 1 is STYLE AND CAMERA reference only. Produce ONE new 16:9 full-bleed underwater background for the same Japanese springwater aquarium, same photographic realism, teal clear water with gentle warm light from upper left, rippled surface at the top. Entirely new composition: a single weathered dark-brown submerged driftwood log spans the lower half DIAGONALLY from its broad rooted base at x=18%, y=90% toward x=72%, y=62%, with a continuous climbable upward-facing mossy contour. Log is grounded on pale gravel and smooth small river stones, never floating. Smaller curved root returns to the gravel near right side. Dense delicate aquatic weeds only behind the wood, at far left/right edges. Central upper 55% remains open water. Fine wood grain, green moss patches, natural soft underwater shadows and hazy distant bank. Front glass viewpoint slightly looking down at ground, consistent perspective. No fish, shrimp or other animals, no lettering, frame, UI or exterior equipment. Distinct from the reference's low rocky shore; driftwood must be the main feature, but scene calm and credible.
```

## 保存と検証

水槽ID、保存キー、構成バージョン、匹数、選択済み水景、照明は維持。初期水景も `japan-spring` のまま。新水景は設定の水景タブから選ぶ。実行時の経路情報はlocalStorageへ保存しない。

標準チェックは `bun run test`、`bun run build`（TypeScriptチェックを含む）、`bun run verify:webview`。追加テストは、表面への追従・前後移動・登り・採餌と休止・経路の接続・水景切替・既存保存と通常遊泳の維持・不正な経路定義を確認する。画面検証は3水景の選択・画像読み込み・再読込復元・匹数の維持・横溢れ・console errorsをデスクトップと420×912で確認する。WebViewの画像は `tmp/webview/japan-*-{desktop,420x912}.png`。実機iPhoneでの確認は含まない。
