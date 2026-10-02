# 2026-10 リアリティの見直し

魚のリアリティはこのアプリの根幹なので、魚の画像・動き・匹数をまとめて見直した。

## 匹数（構成バージョン3）

全種類を最低1匹ずつ残したまま、実際の水槽で見かける偏りに寄せた。群れで泳ぐ主役は多く、目玉の魚は1〜2匹、底物は少数の群れにする。総数の上限は、小型魚中心の水槽として無理のない範囲で引き上げた。

| 水槽 | 構成 | 合計 / 上限 |
|---|---|---|
| 東南アジア | ヘテロモルファ11、ブリジッタエ9、ハナビ4、チェリーバルブ4、クーリーローチ3、サイアミーズ1、ドワーフグラミー1、ハニーグラミー1 | 34 / 36 |
| アマゾン | ネオン16、ラミーノーズ8、レモン6、ドワーフペンシル5、コリドラス6、ハチェット3、エンゼル2 | 46 / 50 |
| キューブ | エンバー8、ゼブラダニオ3、アカヒレ2、オトシンクルス2、グッピー2、クラウンキリー2、プラティ1 | 20 / 20 |
| 日本の湧水 | メダカ15、ヤマトヌマエビ7、タナゴ4、シマドジョウ2 | 28 / 32 |
| マラウイ湖 | イエローラブ8、アセイ6、サウロシー6、ラスティ3 | 23 / 26 |

水槽内の組み合わせと匹数は鑑賞用の構成で、実際の飼育適性を保証するものではない。

## 魚の画像

30種すべてを Codex CLI の画像生成で作り直し、旧画像と並べて良い方を採った。ネオンテトラだけは新しい画像のひれが不透明な白になったため旧画像を残し、29種を差し替えた。種として誤っていた点も直した（プラティが剣のあるソードテールになっていた、チェリーバルブに縦帯がなかった、など）。

生成後は `uv run scripts/install-fish-sprite.py <species-id> <PNG>` で、ほぼ不透明（alpha 240以上）を不透明に、ほぼ透明（3以下）を透明にそろえ、不透明部分の範囲から `sourceBodyBounds` を計算し直してから `uv run scripts/build-fish-sprites.py` で `body.webp` を作った。

参照画像として `harlequin-rasbora/side.png` と `neon-tetra/side.png`（いずれも旧画像）を添付した。

### 共通プロンプト

```text
Use the image generation tool to create ONE photorealistic aquarium fish cutout sprite, then save it as a PNG file.

Style: museum-grade natural history macro photograph of a live specimen in a narrow photo tank, softly lit from above by diffuse aquarium daylight with a gentle top highlight on the back and slightly darker belly shadow, true-to-life natural colours (not oversaturated, not neon, not plastic), crisp fine scale texture, realistic iridescence only where the species has it, delicate semi-translucent fin membranes with visible fin rays, wet glossy eye with a small catchlight. It must look like a real photograph of a real healthy adult, never an illustration, painting, 3D render or cartoon.

Composition: strict lateral side view (orthographic profile), HEAD POINTING LEFT, TAIL RIGHT, spine straight and horizontal, body relaxed and natural, all fins naturally spread and fully inside the frame, every feeler/barbel/antenna fully visible. Fish centred, occupying about 82% of the image width, generous empty padding on every side. Landscape 3:2 canvas (1536x1024).

Background: genuinely transparent alpha background (alpha 0 everywhere outside the animal, including gaps between fins and around barbels). No water, no plants, no gravel, no reflections, no cast shadow, no glow, no halo, no checkerboard pattern, no border, no text, no watermark. Keep natural translucency inside the fins only.

The attached reference images are STYLE references only (photographic quality, lighting direction, framing) — do not copy their species.

Subject:
```

### 魚種別の指定
- `amano-shrimp`: Amano shrimp (Caridina multidentata), freshwater shrimp in strict side view facing LEFT: semi-transparent greyish-glass body with fine rows of small reddish-brown dots and short dashes along the sides, a faint pale dorsal stripe, segmented abdomen gently curved, fan tail (uropods and telson) on the right, long thin antennae sweeping forward-left, small pointed rostrum, dark eyes on short stalks, thin walking legs and feathery swimmerets underneath, all appendages fully visible. Realistic macro shrimp photograph. IMPORTANT: a NON-berried adult with NO eggs and NO white mass under the abdomen; the underside shows only thin translucent legs and feathery swimmerets. Clean, slender, fully transparent-grey body. Antennae and every leg must be crisp and separated by transparent background.
- `angelfish`: Freshwater angelfish (Pterophyllum scalare), wild-type silver: tall disc-shaped laterally compressed silver body with four bold black vertical bands (one through the eye), very tall swept-back triangular dorsal fin and equally long anal fin forming a large arrowhead silhouette, long thin trailing filament pelvic fins hanging below, delicate translucent tail with streamer tips, faint red upper iris. Full tall fins must be included; whole fish height fits in frame (the fish is taller than it is long, so let it occupy about 70% of the height).
- `celestial-pearl-danio`: Celestial pearl danio / galaxy rasbora (Danio margaritatus), tiny slender danio: dark steel-blue to greenish-grey body densely covered with pearly pale gold spots, orange belly flush, fins orange-red with two dark black bars on dorsal, anal and pelvic fins and transparent edges, small forked tail with orange and dark bars.
- `cherry-barb`: Cherry barb (Puntius titteya), adult male: slender torpedo-shaped barb, deep cherry red body with fine metallic sheen on the scales, a distinct dark brown-black horizontal lateral stripe from snout through eye to tail base with a thin metallic gold-blue line just above it, translucent red fins, small pair of barbels, forked tail. Natural, not plastic-looking.
- `chili-rasbora`: Chili rasbora (Boraras brigittae), tiny slender cyprinid: translucent warm red-orange body with a bold dark black-brown lateral stripe that widens across mid body, bright scarlet above the stripe, small red-and-black marks on dorsal and anal fin, red spots at tail base, delicate forked transparent reddish tail.
- `clown-killifish`: Clown killifish (Epiplatys annulatus), adult male: small slender surface killifish, pale cream-yellow body with four bold black vertical bands, upturned mouth, flat head with bright iridescent blue spot on top of the head/eye, dorsal fin set far back, elegant lance-shaped tail with elongated central rays coloured orange-red in the centre bordered by pale electric blue, pelvic fins with blue edges.
- `corydoras`: Bronze corydoras (Corydoras aeneus), armoured catfish: stocky body covered with overlapping bony plates, metallic bronze-green iridescent flank on a beige-pinkish base, pale belly, two pairs of short whisker barbels at the downturned mouth, high triangular first dorsal fin with a stiff spine, small adipose fin, translucent forked tail, large eye high on the head. Real photograph.
- `dwarf-gourami`: Dwarf gourami (Trichogaster lalius), adult male: deep oval laterally compressed body with alternating diagonal vertical bands of turquoise-blue and red-orange, turquoise throat, long dorsal and anal fins with red-orange spots and blue edges, a pair of long threadlike orange pelvic feelers, rounded tail with blue-red pattern.
- `dwarf-pencilfish`: Dwarf pencilfish (Nannostomus marginatus), very small slender pencil-shaped fish: cream-gold body with three crisp dark chocolate horizontal stripes, the middle one running from snout through the eye to the tail base, a red stripe between the dark stripes along the lower flank, small red patches on dorsal, anal and pelvic fins, tiny pointed mouth, no adipose fin, small rounded-forked transparent tail.
- `ember-tetra`: Ember tetra (Hyphessobrycon amandae), very small tetra: translucent glowing amber-orange body, faint darker internal organ shadow visible through the belly, large eye with orange-red iris, orange dorsal fin with a darker leading edge, orange anal fin, small adipose fin, delicate forked translucent orange tail.
- `guppy`: Fancy guppy (Poecilia reticulata), adult male: small slender silver-blue body with iridescent turquoise and orange patches, large flowing delta (fan-shaped) tail with a blue mosaic pattern and orange edging, matching fluttering dorsal fin, small gonopodium under the belly. Realistic photograph, fine translucent tail membrane.
- `harlequin-rasbora`: Harlequin rasbora (Trigonostigma heteromorpha): deep-bodied laterally compressed copper-pink to orange rasbora with a bold black triangular wedge patch on the rear half of the body pointing toward the tail, orange-red tinted dorsal fin and tail lobes, translucent fins, slightly forked tail, silvery belly.
- `honey-gourami`: Honey gourami (Trichogaster chuna), adult male in colour: warm honey golden-orange body, modest oval compressed body, dark blue-black throat and lower head, yellow-edged dorsal fin, long thin threadlike pelvic feelers, translucent amber rounded tail. NOT blue/red striped dwarf gourami.
- `japanese-bitterling`: Rosy bitterling / Nippon bara tanago (Rhodeus ocellatus kurumeus), adult male in breeding colours: deep laterally compressed small carp-like body, iridescent silvery-blue back, pinkish-rose to red flush on the throat, belly and lower flanks, a thin turquoise iridescent stripe on the rear flank toward the tail, red-tinged dorsal and anal fins, forked translucent tail.
- `japanese-loach`: Japanese striped spined loach / shima-dojo (Cobitis biwae): long slender cylindrical pale beige-cream body with a row of large dark brown rounded blotches along the mid flank and finer mottled brown spots on the back, small head with 3 pairs of short barbels, small eye, small rounded dorsal fin at mid body, rounded tail with fine dark bars.
- `kuhli-loach`: Kuhli loach (Pangio kuhlii), eel-like loach: very long slender worm-shaped body, salmon-pink to yellow-orange base colour with about 12-15 broad dark brown-black saddle bands that wrap down the sides, darker head, tiny eye, small barbels at the mouth, small dorsal fin set far back, small rounded tail. Natural photograph, realistic soft skin texture, NOT cartoon bands.
- `lemon-tetra`: Lemon tetra (Hyphessobrycon pulchripinnis): translucent pale lemon-yellow laterally compressed tetra body, eye with bright red upper iris, dorsal fin with black and bright yellow front portion, anal fin with a bright yellow leading edge and black margin, small adipose fin, clear forked tail.
- `marbled-hatchetfish`: Marbled hatchetfish (Carnegiella strigata): small hatchet-shaped fish with straight flat back and deeply keeled rounded belly, silvery translucent body with a dark brown marbled zigzag pattern on the keel, a thin dark line along the flank, long wing-like pectoral fins, small dorsal far back, forked transparent tail, upturned mouth.
- `medaka`: Japanese rice fish / wild medaka (Oryzias latipes): small slender fish with flat straight back, large eye set high on the head, upturned mouth, translucent olive-brown body with a faint iridescent line, small dorsal fin set far back, long-based anal fin, square-cut translucent tail. Natural wild colour, subtle and delicate.
- `neon-tetra`: Neon tetra (Paracheirodon innesi): small slender tetra with a brilliant iridescent electric blue-green stripe from the eye to the adipose fin, and a vivid red stripe on the rear lower half of the body to the tail base, silvery-white belly in front, translucent fins, small adipose fin, forked clear tail. IMPORTANT: the blue stripe is reflective iridescent skin pigment photographed under soft light, NOT a light source: absolutely no glow, bloom, aura or coloured haze outside the fish outline. Background pixels outside the silhouette must be fully transparent.
- `otocinclus`: Otocinclus (Otocinclus vittatus), dwarf sucker-mouth catfish: small slender armoured body, cream-beige belly, light brown back, a bold dark brown-black horizontal stripe from snout through eye to the tail base ending in a dark spot, small dorsal fin with spine, small sucker mouth, translucent tail with dark marks.
- `platy`: Southern platy (Xiphophorus maculatus), adult female-sized deep-bodied compact livebearer, red/orange "red wagtail" colour form: warm orange-red body with lighter belly, black dorsal fin and black rounded/fan-shaped caudal fin (black wagtail fins), short rounded tail with NO sword extension and NO elongated lower tail rays, upturned small mouth, fairly short stocky body, rounded dorsal fin. NOT a swordtail.
- `rummy-nose-tetra`: Rummy-nose tetra (Hemigrammus rhodostomus): slender silvery translucent tetra with a bright red head and snout (red extends just past the eye), tail fin with three bold horizontal black stripes separated by white stripes, clear dorsal and anal fins, small adipose fin.
- `rusty-cichlid`: Rusty cichlid (Iodotropheus sprengerae), Lake Malawi mbuna: compact cichlid with rusty orange-brown body overlaid with a lavender-purple sheen especially on the flanks and fins, rounded head, thick lips, long dorsal fin, rounded tail, natural photographic scale texture.
- `saulosi`: Pseudotropheus saulosi, adult male mbuna: elongated cichlid body, deep sky-blue body with 6-7 bold black vertical bars, black pelvic fin edges, light blue dorsal fin with black band, a few yellow egg spots on the anal fin, rounded tail. Real photograph, natural colours.
- `siamese-algae-eater`: Siamese algae eater (Crossocheilus oblongus / siamensis): slender torpedo-shaped silvery-gold body with a bold black horizontal stripe from the snout to the END of the tail fin (stripe continues onto the tail), fine dark scale edges giving a net pattern above the stripe, clear unpatterned fins, small barbels, forked tail.
- `white-cloud-minnow`: White cloud mountain minnow (Tanichthys albonubes): small slender minnow, olive-bronze back, iridescent gold-silver horizontal line with a dark line below it, pale belly, dorsal and anal fins with red and white edges, red base of the forked tail.
- `yellow-lab`: Yellow lab cichlid (Labidochromis caeruleus), Lake Malawi: elongated cichlid with bright natural lemon-yellow body, long black-edged dorsal fin with a black stripe, black pelvic and anal fins with yellow-white margins, yellowish tail, real photograph with fine scale texture (not cartoon flat yellow).
- `yellow-tail-acei`: Yellow-tail acei (Pseudotropheus sp. 'acei' Ngara), Lake Malawi: elongated cichlid with a blue-violet to purple body, yellow tail fin and yellow edge to the dorsal fin, some yellow egg spots on the anal fin, natural photographic scale texture and subtle iridescence.
- `zebra-danio`: Zebra danio (Danio rerio): slender torpedo-shaped minnow with alternating horizontal dark blue and pale silver-gold stripes running from the gill cover through the anal fin and tail, translucent fins, two pairs of small barbels, forked tail with stripes.

## 動き

- エビ（`swim.bodyPlan: "crustacean"`）: 尾を振らず、脚を前から順に運ぶ歩行、触角のゆらぎ、ついばむときの頭の上下、遊泳肢で泳ぐときの腹のしなりを、1枚の画像のメッシュ変形で描く。
- 光: 魚は泳ぐ高さと前後の位置で明るさが変わり、水面近くは明るく、底や奥は暗く水の色に寄る。
