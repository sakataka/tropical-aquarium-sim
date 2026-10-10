# レーン species-prepare: 種の下書きを先に書いておく

dots が保管庫（`~/Documents/aquarium-assets`。読むだけ）に届けた調査から、種の定義（図鑑の文と動きの値）の下書きを書く。入口と決まりは [Codex の作業リスト](../codex-queue.md)。

## 作業の単位と、書いてよい場所

- 1つの作業 = 1種。`uv run scripts/agent-queue.py claim species-prepare <件数> --by <名前>` が返した id だけを進める。
- 書いてよいのは `content-drafts/prepared/fish/<id>/` の中だけ。
  - `species.json`: 下書き（下の「入れない項目」を除いた、種の定義）
  - `notes.md`: 仮にした値、気になる点、水槽の説明文に使えそうな見どころ1文
  - `claim.json`: 担当の印（スクリプトが置く。消さない）

## 材料

- **`uv run scripts/species-packet.py <id>`** が、名前、絵の説明（どの姿・性別・成長段階で描いたか）、置く水槽（大きさ・ねらい・水景・同じ水槽の種）、調査の各項目（1行ずつ）、出典をまとめて出す。まずこれを読む。調査の全文（`research.json`）は、足りないときだけ開く。
  - 行の頭が `?` の項目は、根拠の強さが `unverified`・`unknown`。**事実として書かない。**
  - 「展示計画に置き場所が見つからない」と出た種は、水槽に触れる文（「本水槽では…」）を書かず、`notes.md` にそう書く。
- 手本（形と文体をこれに合わせる。読むだけ）:
  - 魚: `src/content/fish/kuhlia-marginata/species.json`、底のハゼ `rhinogobius-brunneus`、サケ `chum-salmon`、トゲウオ `threespine-stickleback`、ウナギ `japanese-eel`（`gait: undulate`）
  - エビ（面を歩く）: `macrobrachium-australe`、小さなヌマエビ `minami-numa-shrimp`。カニ: `japanese-mud-crab`。巻貝: `dusky-nerite`
  - 両生類: `japanese-fire-bellied-newt`（`walker`）、カエル `african-dwarf-frog`（`frog`）
- 形の定義は `src/core/schema.ts`。体のつくりは `docs/museum-architecture.md` の「3. 体のつくり」。画風（`styleId`）と `swim.bodyPlan` の対応は、同じ画風の手本の種に合わせる（魚の横向きの絵は `bodyPlan` を書かない）。

## 入れない項目（絵が決まってから入る）

`sourceBodyBounds`、`visual`、`swim` のうち絵の中の位置を書く項目（`mouthAnchor`・`footAnchor`・`headStart`・`shell`・`feelers`・`bell`・`fins`・`tailStartY`・`wings`・`legs`・`spine`・`limbs`・`radial`）。絵の採否と取り込みは Claude Code が行い、取り込みのスクリプトがこの下書きを使う。

## 書き方の決まり

- 文章は日本語の「です・ます」。図鑑として読める平易な文にする。**事実は調査に出典のあることだけ。** 調査にないこと・確かめられていないことは書かない（推測で埋めない）。大きさなどが出典で食い違うときは、`sizeNote` に両方を書く。
- `realBodyLengthCm` は画面での体の長さ。魚は全長。エビは体長（額角から尾の先。触角は含まない）。カニは脚を広げた幅。巻貝は触角を含む絵の横幅。体長が水槽の幅の約35%を超えるときは、調査の範囲で小さめの個体にして、`sizeNote` に「◯cm水槽に合わせ、画面では全長約◯cmの個体で描いています」と書く。逆に、水槽の幅の3%より小さくなる種は、調査の範囲で大きめの個体にし、それでも小さければ `notes.md` に「画面で見えにくいはず」と書く。`profile.adultSizeCm` は図鑑に出す成体の大きさ（調査の代表値。カニは甲幅）。
- `catalog.movement` と `catalog.habitat` の後半に、「本水槽では…」と、置く水槽での見え方を1文添える（材料の「置く水槽」のねらいと水景から。絵に描かれていない種名や地名を言い切らない）。
- `catalog.originRegionId`・`originRegionName` は既存の値から選ぶ（`grep -h originRegion src/content/fish/*/species.json | sort | uniq -c`）。
- `profile.taxonomy` の目・科の和名は、館の既存の種にそろえる（`grep -h -A4 '"taxonomy"' src/content/fish/*/species.json` で探す）。館では、ハゼの仲間の科は「オクスデルクス科」か調査の科、スズキの仲間の目は「スズキ目」にそろえている。調査と違うときは `sizeNote` の末尾に一言書く。
- `profile.water.salinity` は、置く水槽の水（淡水 `freshwater`・汽水 `brackish`・海水 `marine`）に合わせる。調査の生息域と食い違うときは `notes.md` に書く。
- `profile.keeping` は、調査に水族館での展示の記録があれば `publicAquarium`、家庭で飼われる種は `home`。展示の記録が調査にないだけの種は `publicAquarium` にして、`notes.md` に「展示の根拠なし」と書く（`rarelyDisplayed` は、展示がまれだという根拠があるときだけ）。
- `profile.conservation` は、調査に IUCN の区分があるときだけ `status` と `assessedYear` を書く。本文を確かめていない値は `note` にそう書く。国内のレッドリストは `note` に書く。
- `profile.highlights` は3〜4個。見た目・動き・暮らしで、水槽の前で「へえ」と思えること。
- `ecology` の動きの数値（速さ、休む割合、群れ）は、調査に値がなければ、暮らし方の近い既存種の値を写す（底のハゼ、群れる銀色の小魚、待ち伏せ型、夜行性の大型魚、など）。`activityPeriod` は、調査に根拠があればそれ、なければ近い種に合わせた仮の値。**仮にした値は `notes.md` に書く。**
  - 底にいる魚は `preferredZone.minY` を高め（0.55〜0.9）、`ecology.depthRange` を底寄りにし、`bottomRest` を付ける。中層の魚は 0.25〜0.7。
  - 群れる魚は `social.grouping` を `shoal` か `school`、`polarization` 0.5 以上で向きをそろえる。群れの根拠が調査にないときは、説明文で「群れで泳ぐ魚」と言い切らず、「本水槽では数匹でまとまって泳ぐ姿で描いています」と書く。
  - `homeShelter`・`hideByDay` は、その水槽の地形に隠れ場所が要るので、付けたら `notes.md` に書く。昼に姿が見えなくなるので、`hideByDay` は夜行性の根拠がはっきりした主役の種だけ。面を歩く生き物（エビ・カニ・巻貝）には `homeShelter` を付けない。エビに `burrow` は付けない。
- 実際の飼育で同じ水槽にできるかどうか（食う・食われる）は、説明文で断定しない。調査に注意があれば `notes.md` に書く。
- `ecology.sources` は、材料の出典から、実際に使った主なものを title と url で5〜10件。

## 確かめる

- `bun run scripts/check-prepared.ts <id>...` が、進めた種すべてで `✓` になること（アプリと同じスキーマで読める、入れない項目が入っていない、`notes.md` がある）。
- 書いた数字（大きさ、水温、年）が、材料の `?` でない行にあること。

## Claude Code がこの下書きを使うとき

絵を採用して `install-vault-species.py <id>` を流すと、`content-drafts/fish/<id>/species.json` がこの下書きから作られ、`sourceBodyBounds`・`visual.fallbackColor`・魚の `mouthAnchor` が入る。Claude Code は、`notes.md` を読んで文と値を見直し、絵を見て入れる項目（魚以外の体のつくりの位置、ひげの長い魚の口先）を足す。下書きのない種は、Claude Code が同じ手順書で直接 `content-drafts/fish/<id>/species.json` を書く（そのときも先に印を置く）。
