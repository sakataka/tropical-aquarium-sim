# 五つの水槽 — 2026年10月

## 構成

既存の3水槽は直前の構成調整と保存を維持する。水槽ID・保存キー・stockArrangementVersionは変えず、日本とマラウイ湖を追加する。全30種。地域を厳密に再現する飼育レシピではなく、地域や鑑賞テーマを手がかりにしたバーチャルな水景。

| 水槽 | 主役・配置 | 風景の違い | 初期構成 |
|---|---|---|---|
| 東南アジアの水草水槽 | 小型の群れ、グラミー、底層魚 | 緑の茂みと根張り | 8種27匹（既存） |
| アマゾンの大型水槽 | エンゼル、テトラ、ハチェット、コリドラス | 流木と落ち葉、上下の泳層 | 7種35匹（既存） |
| 小型魚のキューブ水槽 | 世界の色鮮やかな小型魚 | 近くで眺める小さな水草・川石景 | 7種14匹（既存） |
| 日本の湧水水槽 | 上層のメダカ、中層のタナゴ、底のドジョウとエビ | 淡い翡翠色、細い草と苔の川石 | メダカ12匹＋タナゴ6匹＋ドジョウ3匹＋エビ5匹＝26匹 |
| マラウイ湖の岩場水槽 | 黄・青紫・赤褐色・青い縞の4種 | 植物のない岩礁、青い水と白砂 | イエローラブ5匹＋アセイ5匹＋ラスティ4匹＋サウロシー4匹＝18匹 |

各2種だった先行表示を保存した端末には、fiveTankStockVersion の初回移行でタナゴ・ドジョウ・ラスティ・サウロシーだけを不足分として追加する。既存3水槽や、新水槽にすでにいる生き物の匹数は変えない。移行後は自動補充しない。

魚以外の追加はヤマトヌマエビを選んだ。カニの陸場や別の移動方式を新設せず、水中鑑賞のまま動きの違いが出せる。エビは既存の低速移動・ついばみ・休息を組み合わせ、尾の変形をゼロにする。脚ごとの歩行や繁殖・捕食・縄張り争いは再現しない。速度や停止頻度は視認性のための演出値であり、実測値ではない。

## 生態参照（2026-10-02確認）

- [Oryzias latipes — Seriously Fish](https://www.seriouslyfish.com/species/oryzias-latipes/): メダカの浅い水辺と群れ、体長。
- [ヤマトヌマエビ — 東京都公園協会](https://www.tokyo-park.or.jp/park/hachijo/creature/detail/0985.html): 約4cm、体側の点状線、淡水の成体と海で育つ幼生。
- [Labidochromis caeruleus — Seriously Fish](https://www.seriouslyfish.com/species/labidochromis-caeruleus/): マラウイ湖の岩場と黄色の色彩型。
- [Pseudotropheus sp. acei — Seriously Fish](https://www.seriouslyfish.com/species/pseudotropheus-sp-acei/): 湖岸の砂地・岩場・沈木、中上層、群れ。
- [ニッポンバラタナゴ — 環境省](https://www.env.go.jp/content/000187000.pdf): 約5cm、体側の青い帯と雄の婚姻色。
- [シマドジョウ — 国立環境研究所](https://www.nies.go.jp/biodiversity/invasive/DB/detail/50740.html): 砂礫底、地域による体側斑紋の違い。種群として扱う。
- [Iodotropheus sprengerae — Seriously Fish](https://www.seriouslyfish.com/species/iodotropheus-sprengerae/): マラウイ湖南部の浅い岩場、小型のムブナ。
- [Chindongo saulosi — FishBase](https://www.fishbase.se/summary/Pseudotropheus-saulosi.html): 約8.6cm、岩礁上部。検索結果を確認（本文取得は失敗）。雄の青い色彩だけを描画する。

## アセット

全原画は内蔵 image_gen で生成。CLI/APIは使用していない。新しい生き物は各 src/content/fish/<id>/side.png に原画を保存し、透過を保った body.webp を描画に使う。追加8種: medaka、amano-shrimp、yellow-lab、yellow-tail-acei、japanese-bitterling、japanese-loach、rusty-cichlid、saulosi。切り出し範囲を species.json の sourceBodyBounds に記録。

新しい水景は src/content/environment/scenes/{japan-spring,malawi-rocks}/plate.webp。魚の見やすさを優先した開けた構図で、追加の前景レイヤーは使わない。部屋は src/content/room/room-five.webp。既存の room.webp は保持し、新しい5水槽の前面位置を room.json で定義する。部屋画像の前面部分を描画マスクで抜き、奥に実際の水景と魚を合成する。

最終画像は生成後にWebPへ圧縮。魚の画像は既存と同じ最大720px幅。既存アセットの再生成や一括再圧縮は行わない。

## 生成プロンプト

### japan

```text
Create a photorealistic 2D aquarium background plate, landscape 16:9, entire image underwater, no glass border, no fish or animals, no text. A tranquil Japanese spring-fed pond: crystal clear pale jade and turquoise water, warm morning sun shafts from upper left, delicate submerged native aquatic grasses along the back left and right edges, mossy rounded river stones low along the bottom, fine natural pale sand and tiny pebbles. Open luminous central and upper 70 percent for animated medaka to swim, substrate at bottom 15 percent, no large obstruction. Restrained photographic aquascape detail, peaceful sophisticated natural realism, front facing straight on underwater view. Not a landscape above water. Output saveable image file.
```

### malawi

```text
Photorealistic 2D freshwater aquarium background plate, landscape 16:9, front-on view entirely underwater. Lake Malawi inspired rocky shore: clear sapphire blue and turquoise water, pale granite boulders with fine algae patina arranged as low rugged islands at bottom left and bottom right, small crevices, warm white sand winding open in the bottom middle, faint distant submerged rocks in blue haze. Top 65 percent and center open water for swimming cichlids. Sun caustics from upper left, physically realistic textures, exquisite peaceful aquarium photography. No fish, no animals, no coral, no aquatic plants, no text, no glass frame. Match sophisticated realistic 2D aquarium game assets.
```

### medaka

```text
Create a single photorealistic aquarium game sprite: one adult Japanese medaka ricefish Oryzias latipes, natural silver olive body, fine translucent fins, subtle golden iridescent scales and dark eye. Strict perfect SIDE PROFILE facing LEFT, horizontal straight body, whole fish including tail and fins, centered with generous clear margin, fills 80 percent of landscape image width. Scientific natural history macro photography aesthetic, beautiful realistic delicate anatomy, softly lit from above left. Isolated on TRUE TRANSPARENT alpha background. No ground, no shadow, no water, no bubbles, no text, no other fish. Designed for a realistic 2D freshwater aquarium.
```

### shrimp

```text
Single photorealistic Amano shrimp Caridina multidentata aquarium game sprite, strict side profile facing LEFT, horizontal natural standing posture. Translucent pale olive gray segmented carapace, distinct fine brown dotted side stripe, black eyes, slender delicate walking legs below body, very fine long antennae pointing left, tail fan at right. Entire shrimp and antennae fully visible with generous padding, animal occupies middle 75 percent of wide image. Realistic freshwater dwarf shrimp anatomy, detailed macro natural history photography, soft overhead aquarium light. Isolated on true transparent alpha background, no surface, no shadows, no rock, no water, no text. Not lobster, not red shrimp. Match realistic 2D aquarium assets.
```

### yellow

```text
One photorealistic Labidochromis caeruleus electric yellow lab cichlid, whole fish strict SIDE PROFILE facing LEFT horizontal. Rich vivid lemon yellow compact freshwater cichlid body, clear black edging along long dorsal fin and dark ventral fins, detailed natural scales and round dark eye. Scientific natural history macro photograph aesthetic, soft overhead aquarium light. Centered whole fish with generous padding around fins, tail fully visible, landscape image. True transparent alpha background. No water no rocks no shadows no text no other animals. Realistic 2D aquarium game sprite.
```

### acei

```text
One photorealistic yellow-tail acei freshwater cichlid Pseudotropheus sp. acei, entire fish strict perfect SIDE PROFILE facing LEFT, straight horizontal. Natural elongated violet blue body with subtle indigo scales, yellow dorsal fin and bright golden yellow tail fin, dark round eye, realistic anatomy. Whole fish fully visible centered with generous transparent margin. Beautiful scientific natural history macro photographic aquarium asset, light from above left. Isolated on genuinely TRANSPARENT background alpha, clean cutout no glow or halo, no ground or cast shadow, no water, no rocks, no text, no other fish. Landscape format.
```

### room

```text
Create a photorealistic warm modern Japanese Scandinavian home fish room game background, panoramic landscape 16:9, straight-on architectural frontal view, no camera tilt. Exactly FIVE separate rectangular rimless aquariums arranged in one horizontal row on solid pale oak cabinets, with space between tanks. Each aquarium has simple thin dark overhead LED light. Left to right: medium planted tank, large wide tank, small cube tank, medium shallow tank, largest wide tank. Five front panes are rectangular, straight horizontal edges. All five aquarium INTERIORS must be empty TRUE TRANSPARENT alpha rectangular holes for a game to composite moving scenery into. Keep thin glass edges and cabinets fully opaque, remove only aquarium interior rectangles. No fish, no water or decor inside holes, no checkerboard rendered into image. Rest of entire room fully opaque: creamy walls, botanical framed prints above, houseplants only at far edges, warm sunlight from left window, natural oak floor and woven rug below. Beautiful high end aquarium living room photography with calm lived-in taste. Make aquariums generous in frame, occupying middle horizontal band from approximately 30% to 56% image height. Camera orthographic-like, glass fronts face straight at viewer. No text.
```

### bitterling

```text
One beautiful photorealistic Japanese rosy bitterling Rhodeus ocellatus kurumeus aquarium fish sprite. Adult male natural breeding colors, compact deep oval silver body about 5cm, subtle rose pink belly and orange red anal fin, narrow iridescent teal blue stripe along rear flank, olive gold back, realistic small mouth and dark eye. Strict side profile facing LEFT, whole fish centered horizontal with all fins intact and generous clear margin. True transparent alpha background, clean cutout with no surrounding glow. Natural history macro photography, soft upper-left light, realistic 2D freshwater aquarium game aesthetic. No water, shadows, text, other fish or objects.
```

### loach

```text
One photorealistic Japanese spined loach Cobitis biwae aquarium game sprite. Long very slender tan cream cylindrical body with a neat row of dark brown rounded rectangular blotches along the side, tiny barbels around downturned mouth, small translucent speckled fins, fan tail. Strict side profile facing LEFT, mostly straight gently relaxed horizontal body. Entire fish fully visible centered in a wide landscape image, generous clear margin, detailed realistic scales and anatomy, natural history macro photograph with soft overhead lighting. TRUE TRANSPARENT alpha background and clean cutout. No water, rocks, shadows, text, other animals. Not a kuhli loach: no alternating orange black bands around entire body.
```

### rusty

```text
One photorealistic rusty cichlid Iodotropheus sprengerae freshwater aquarium sprite. Strict SIDE PROFILE facing LEFT, horizontal whole fish. Natural warm rusty copper orange-brown head and fins, soft muted lavender sheen in central flank, cinnamon body edges, rounded compact mbuna shape with natural fine scales, round black eye, translucent warm rusty fins. Distinct from vivid yellow or striped blue species; NO vertical black bars. Centered with full fin and tail visible and generous margin. True transparent alpha background, no outer glow or shadow. Scientific natural history macro photograph, beautiful soft aquarium lighting, realistic 2D aquarium game asset. No text water rocks or additional fish.
```

### saulosi

```text
One photorealistic adult male Chindongo saulosi dwarf mbuna cichlid fish sprite, authentic natural colors: bright powder cobalt blue body with five strong dark navy black vertical bars down sides, blue tail with delicate dark rays, dark navy edges to dorsal and ventral fins. Compact small cichlid proportion, slightly rounded snout, natural scales and eye. STRICT side profile facing LEFT, horizontal, complete full fish and fins with generous margin. Scientific macro fish photography soft overhead light, true transparent alpha background and clean cutout, no shadow no water no rocks no text no additional fish. Do NOT add yellow tail or red colors. Realistic 2D freshwater aquarium game.
```

### 仕上げ

yellow-lab は同じ原画を参照し、魚の外のハローを除去し透過とひれを保持する編集を画像生成で実施。
yellow-tail-acei は青紫の無地の体になるよう、原画にあった縦縞を画像生成で除去。
room は生成した5水槽の構図を参照し、部屋を不透明に、5つの前面を濃い緑の均一面にする画像生成編集を実施。透過矩形はゲームの合成マスクが担当する。
最後に部屋の右上にあった色むらだけを画像生成で除去し、水槽位置と構図を維持。
