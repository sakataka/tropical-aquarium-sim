# 第2の部屋：海と古代魚（2026年10月）

第2の部屋を最終的に5種類程度の水槽へ育てるため、最初は既存5水槽とテーマが重ならない2台を試作する。今回の対象は海水と西アフリカの古代魚。寒冷域や汽水などは今後の候補で、まだ追加しない。

| 水槽ID | サイズ | 初期構成 | 上限 | 水景 |
| --- | --- | --- | --- | --- |
| reef-120 | 120×45×45cm | カクレクマノミ2、ハタタテハゼ1、ニシキテグリ1 | 4匹 | reef-lagoon |
| ancient-180 | 180×55×60cm | セネガルス2、アミメウナギ2 | 6匹（各3） | african-backwater |

海水魚は青い水と白い砂、低いサンゴ礁で見せる。クマノミは左寄りの岩場、ハタタテハゼは中層、ニシキテグリは底近くを中心に配置する。古代魚は大きめの体を開けた砂底で見せ、くねる遊泳、底での休止、空気呼吸を既存の生態機構で表す。アミメウナギは昼間の休止と夜間の活動も使う。

これは鑑賞用の構成であり、実際の混泳・飼育条件を保証するガイドではない。表示体長は観賞サイズの代表値（8・8・7・30・35cm）。速度、休止時間、空気呼吸の頻度はゲームの鑑賞用調整値で、文献の実測値を意味しない。クマノミの宿主との共生・接触、サンゴの成長、海水の管理、餌やり、捕食判定は今回の対象外。

## 生態・種同定の出典

- [Aquarium of the Pacific: Amphiprion ocellaris](https://www.aquariumofpacific.org/onlinelearningcenter/species/clown_anemonefish)：分布、浅い礁・ラグーン、宿主、体色。
- [Australian Museum: Nemateleotris magnifica](https://australian.museum/learn/animals/fishes/nemateleotris-magnifica-fowler-1938/)：種同定、背びれ、海域・生息環境。
- [Aquarium of the Pacific: Synchiropus splendidus](https://www.aquariumofpacific.org/onlinelearningcenter/species/mandarin_goby)：底生のネズッポ科、分布、色彩。
- [FishBase: Polypterus senegalus](https://www.fishbase.se/summary/5024)：分布、緩流域、底生、空気呼吸、背びれの小離鰭。
- [FishBase: Erpetoichthys calabaricus](https://www.fishbase.se/summary/erpetoichthys-calabaricus.html)：西アフリカ、夜間活動、細長い体、空気呼吸、腹びれがないこと。

## 部屋・保存・読み込み

- room.json / room-five.webp は維持。追加部屋は room-special.json / room-special.webp に分け、実際の生成画像でガラス位置を測定した。
- 左上の部屋選択で切り替える。開いている部屋の水槽だけを描画・画像読込し、水槽の前後ボタンと [ / ] も同じ部屋の中で巡回する。
- 最後の activeTankId から所属部屋を復元する。保存キー tropical-aquarium.state.v5.r2 と構成バージョンを維持し、未保存の2水槽だけ初期値で補う。
- 追加魚を既存5水槽のカタログには入れない。既存の手動匹数・水景・照明を保持する。

## 生成素材

魚の原画は src/content/fish/<id>/side.png、描画用は同じ場所の body.webp。5種とも左向きの横姿、全身、透明背景、自然な光、写実寄りの既存世界観として画像生成した。セネガルスは離れた背びれ、アミメウナギはさらに細長い体と腹びれのない姿を指示した。原画の透過は install-fish-sprite.py、切り出しとWebP化は build-fish-sprites.py の既存手順を使用する。

| 生成原画ファイル | 保存先 |
| --- | --- |
| exec-91007096-5268-4c51-9074-8918b46c0783.png | fish/ocellaris-clownfish/side.png |
| exec-a0e8a9f3-b8b6-405d-8e29-23656bde3cce.png | fish/firefish/side.png |
| exec-8eee0e26-4407-4050-bc67-b34c60d9779c.png | fish/mandarinfish/side.png |
| exec-ab6c47e4-79dd-44ef-a05d-d7a6b994c4de.png | fish/senegal-bichir/side.png |
| exec-b4f2aa8e-028f-463d-966d-abad66691e4a.png | fish/ropefish/side.png |
| exec-1833de21-cfce-4e0c-9e4e-f66d1821f9c8.png | environment/scenes/reef-lagoon/plate.webp |
| exec-80c0c7b4-9a55-4e60-b1a3-70cedee8e465.png | environment/scenes/african-backwater/plate.webp |
| exec-f34769d8-67df-431a-b39c-867280c199c5.png | room/room-special.webp |

保存先は src/content/ からの相対パス。背景は生成した原画をWebP化し、同じ画像の地形輪郭を描画時にマスクして魚との前後関係を作る。

## 検証

- `bun run test`：94件通過。7水槽・35種・15水景の整合、旧5水槽保存の維持、追加2水槽の初期化、全水景の上限匹数で昼10分・夜10分の安定性を確認。
- `bun run build`：TypeScriptと本番ビルド通過。
- `bun run verify:webview`：WebKitで既存の画面検証に加え、第2の部屋を1440×960・420×912で検証。部屋の往復、2水槽内の巡回、5種の魚画像・増減・保存、部屋の復元、初回の画像読み込み、横溢れを確認。consoleErrors は空。
- 追加部屋だけの確認は `bun run verify:webview --special-only`。標準検証の対象から追加部屋を外すものではない。
- 長時間検証の初速に残っていた生成時の乱数を、検証用の性格パラメーターへ揃えた。実際の魚のシミュレーションは変更していない。
- iPhone Airの実機操作は未検証。420×912はWebKit上の画面サイズ検証。

### 背景・部屋の生成プロンプト

#### reef-scene

A realistic detailed 2D aquarium simulation environment plate, straight frontal underwater camera, wide landscape 3:2. Indo-Pacific shallow coral reef lagoon aquarium. White fine sandy bottom occupies lowest 15 percent, small low coral rock islands at far left and far right, gently colored branching and soft corals, a pale cream sea anemone on left low rock. Plenty of open clear turquoise-blue water in central 65 percent and upper area so fish sprites remain readable. Subtle surface light ripples overhead. Warm natural soft underwater photography look with carefully painted realism, no dramatic neon or fantasy. No fish, no other moving animals, no aquarium frame, no labels. Full underwater view edge to edge, nearly flat horizontal sand floor.

#### ancient-scene

A realistic detailed 2D aquarium simulation environment plate, straight frontal underwater camera, wide landscape 3:2. West African slow freshwater backwater aquarium for bichir and ropefish. Quiet olive-gold clear water, warm sandy bottom in lowest 15 percent. A low weathered root and reeds on far left, a small rounded rock and submerged roots on far right. Central 70 percent and lower swimming corridor open and unobstructed, understated vegetation and soft green background, calm earthy sunlight. Soft underwater photography with carefully painted realism matching a realistic 2D aquarium game. No fish, no animals, no frame, no text. Full underwater view edge to edge, flat sand floor.

#### special-room

Straight-on architectural illustration of a calm home aquarium room, landscape 16:9. Realistic softly painted photographic style, warm cream plaster walls and light natural oak cabinetry, wood floor, soft daylight, same level of detail as a realistic aquarium simulation. EXACTLY TWO large empty aquariums on wooden cabinets, frontal rectangular glass with no perspective distortion, black interior for later compositing. Left tank front glass approximately x=10.5% to42.5%, y=36% to61.5% of entire image. Right tank front glass x=53% to93.5%, y=36% to61.5%. Two tanks at same vertical height, right tank longer than left. Cabinet bases below each tank. Quiet wall art of shells above left, fern prints above right, no text. No other tanks, no fish, no aquarium scenery, no plants inside glass. Generous blank upper wall, subtle room decorations near outside margins. Beautiful cozy restrained aquarist room.
