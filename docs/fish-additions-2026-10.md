# 2026-10 魚種追加

各水槽に2種類ずつ、計6種類。画像は組み込み image_gen ツールで1魚種ずつ生成し、既存の `harlequin-rasbora/side.png` を質感の参照に使用。出力は各 `src/content/fish/<id>/side.png`、描画用は同じフォルダの `body.webp`。

生態の資料は各 species.json の ecology.sources に記録。泳層・群れ方・空気呼吸は資料を参考にし、速度、旋回、休止率、呼吸頻度などの数値は実測値ではなく鑑賞用の調整値。水槽内の組み合わせと匹数もゲーム上の構成であり、実際の飼育適性を表すものではない。

既存のv5.r2保存は維持し、新魚種を勝手に投入しない。新規利用時のみ新しい defaultStock を使う。

## 生成プロンプト

仕上げでは同じツールへ各生成画像を戻し、次の編集指定を適用しました。

> Preserve the fish, fine scales, left-facing side view and fins. Remove all blurry colored glow outside the actual fish silhouette. Background alpha must be zero outside the fish, including between fins and below feelers. Keep natural translucency inside fins only. No haze, shadow, cloud or gradient. Keep the entire fish within the frame with padding.

クラウンキリーには追加で `Correct the caudal fin: rounded/spade-shaped with central rays extending furthest, not a forked swallowtail; preserve blue/orange color pattern.` と指定しました。透過領域にRGB色が残っていても、alphaが0の画素は描画されません。切り出し範囲はalphaを基準に確認しています。

共通指定（下記の魚種別指定を末尾に追加）：

Use case: photorealistic-natural. Create ONE new individual aquarium fish sprite, not a sheet. The attached harlequin rasbora is STYLE REFERENCE ONLY: match its photographic natural fine scale detail, delicate translucent fin rays and soft overhead aquarium light, but create the different species described. True strict lateral orthographic profile, HEAD LEFT and TAIL RIGHT, straight horizontal spine, entire fish and every fin and feeler fully visible, generous clear padding all sides. Centered fish occupying about 85% width. Realistic 2D tropical aquarium game cutout on genuinely transparent alpha background. No water, plants, floor, shadows, labels, bubbles, checkerboard pattern or border. No cartoon or painted outline. Subject:

### honey-gourami

Honey gourami (Trichogaster chuna), warm honey golden orange body, modest deep oval compressed body, fine yellow-edged dorsal fin, long delicate paired threadlike pelvic feelers, translucent amber rounded tail. Natural adult male, subtle dark throat, NOT blue/red striped dwarf gourami.

### chili-rasbora

Chili rasbora (Boraras brigittae), tiny slender ruby red cyprinid, distinct long dark black lateral stripe broadened across mid-body, bright scarlet above stripe, small transparent reddish fins with dark marks, forked tail. NOT deep-bodied harlequin rasbora, no triangular wedge.

### lemon-tetra

Lemon tetra (Hyphessobrycon pulchripinnis), translucent pale lemon yellow laterally compressed tetra body, eye with orange-red upper iris, black and lemon yellow dorsal and anal fin accents, small adipose fin, delicate clear forked tail.

### dwarf-pencilfish

Dwarf pencilfish (Nannostomus marginatus), short slender pencil shaped warm cream-gold body, three crisp longitudinal dark chocolate stripes including prominent stripe through eye to tail, tiny translucent fins with red accents, small mouth, natural horizontal posture, no broad tetra body.

### ember-tetra

Ember tetra (Hyphessobrycon amandae), very small warm glowing amber-orange tetra, fine translucent copper orange scales, large dark eye with copper iris, translucent orange dorsal and forked caudal fins, small adipose fin, subtle darker internal abdominal detail, no stripe or spots.

### clown-killifish

Clown killifish (Epiplatys annulatus), small slender surface dwelling fish, cream body with four bold black vertical bands, bright electric blue eye highlight, upward mouth, dorsal fin far back, male elongated pointed central tail rays with orange-red central stripe framed by pale blue. Accurate elegant rocket-shaped colored tail, not fan guppy tail.
