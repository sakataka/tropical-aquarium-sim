# Codex の作業リスト

Codex が、Claude Code の動いていない間も単独で進められる作業をまとめた文書。Codex に「`docs/codex-queue.md` を進めて」と頼めば、この文書のとおりに進む（「species-prepare を10種」「aquarium-census を進めて」のように、レーンと件数を指定してもよい）。Claude Code のスレッドの入口は [これからの進め方](next-steps.md) で、この文書とは別。

## 考え方

- **レーンで分ける。** 作業の種類ごとに「レーン」を決め、レーンごとに、読むもの・書いてよい場所・合否の確かめ方を手順書に書く。レーンの成果物は、アプリが読む場所（`src/`）ともテストが読む場所（`content-drafts/fish/`）とも別のフォルダ（または非公開の保管庫）に置くので、書きかけのファイルが Claude Code の作業やテストを止めない。
- **作業の一覧は、ファイルの有無から組み立てる。** 一覧のファイルを手で書き換えない。`uv run scripts/agent-queue.py status` が、レーンごとの未着手・作業中・済みの数を出す。
- **担当の印を置いてから始める。** `uv run scripts/agent-queue.py claim <レーン> <件数> --by codex` が、先頭から未着手の作業に印（`claim.json`）を置いて id を返す。印のある作業は、ほかのエージェントは取らない。12時間たっても成果物のない印は無効になり、ほかのエージェントが引き取れる。
- **進められない作業は、保留にする。** 材料や仕組みが足りず、誰がやっても進められない作業は、`uv run scripts/agent-queue.py block <レーン> <id> --by codex --reason "<足りないもの>"` で保留にする。保留の作業は未着手に数えず、`claim` でも取らない。足りないものをそろえるのは Claude Code で、そろえたら `unblock` で未着手に戻す。
- **どのレーンも、Claude Code も同じ手順で進められる。** Codex が止まっていても作業は止まらない。逆に、Codex が先に済ませてあれば、Claude Code はその成果物を使う（例: 種の下書きがあれば、`install-vault-species.py` がそれを取り込む）。
- **判断の要ることは決めずに書き残す。** 絵の採否、水槽に置くかどうか、展示計画の変更、説明文の最終の言い回し、アプリのコードの変更は、このリストの作業ではやらない。気づいたことは、成果物の `notes.md` に書く。

## 決まり（どのレーンでも）

1. 始める前に `git pull`（このリポジトリ）と、`cd ~/Documents/aquarium-assets && git pull`（保管庫。読むだけ）。
2. `uv run scripts/agent-queue.py claim <レーン> <件数> --by codex` で印を置く。件数の指定がなければ10件。
3. レーンの手順書どおりに、印を置いた作業の成果物だけを書く。**書いてよいのは、手順書の「書いてよい場所」だけ。** `src/`、`content-drafts/fish/`、`docs/`、`scripts/`、Drive のフォルダは書き換えない。保管庫（`~/Documents/aquarium-assets`）は、手順書が保管庫の中の場所を指定しているレーンで、その場所だけを書く。**このリポジトリは GitHub で公開されているので、ほかのサイトから集めた一覧や本文を置かない。**
4. 手順書の「確かめる」を通す。通らない作業は成果物を消し、`uv run scripts/agent-queue.py release <レーン> <id>` で印を外して、理由を最後の報告に書く。材料や仕組みが足りなくて進められない作業は、`release` ではなく `block`（保留。手順書の「進められない種」）。
5. commit は、自分の成果物のパスだけを指定して行う（`git add -A` を使わない。同じ checkout で Claude Code が別の作業をしていることがある）。メッセージの末尾に `Assisted-by: Codex` を付け、push する。commit・push ができない環境（サンドボックスなど）では、ファイルを残して、その旨を報告に書く。
6. 最後に、進めた作業の id、保留にした作業と理由、通した確かめ、`notes.md` に書いた気になる点の要約、手順書や道具の問題を報告する。`bun run test`・`bun run build`・`bun run verify:webview`・開発サーバーは流さない（手順書にあるものだけ流す）。

## レーン

| レーン | 何をするか | 書いてよい場所 | 手順書 |
|---|---|---|---|
| `species-prepare` | dots の調査が保管庫に届いた種の、図鑑の文と動きの値の下書きを先に書いておく | `content-drafts/prepared/fish/<id>/` | [agent-lanes/species-prepare.md](agent-lanes/species-prepare.md) |
| `aquarium-census` | 日本の水族館で飼育・展示されている生き物を、館ごとに出典つきで集める | 保管庫の `research/aquarium-census/`（非公開。このリポジトリには置かない） | [agent-lanes/aquarium-census.md](agent-lanes/aquarium-census.md) |

指定がないときは、`species-prepare` を10件進める（未着手が10件より少なければ、あるだけ。0件ならその旨を報告して終わる）。`aquarium-census` は、名指しで頼まれたときだけ進める（2026年10月11日、ユーザーより。当面の目標は展示計画の約1,300種で、飼育種の調査はそのあとの広げ方を決めるための、急がない作業）。

`species-prepare` の未着手は、Claude Code が dots の配送を受領して保管庫に置いたときに増える（`uv run scripts/agent-queue.py status` で数が分かる）。

## レーンを足すとき（Claude Code がやる）

`scripts/agent-queue.py` の `LANES` に、作業の一覧の作り方・作業フォルダ・済みの印になるファイルを足し、`docs/agent-lanes/<レーン>.md` に手順書を書き、上の表に1行足す。レーンにできるのは、(1) 入力と出力の形が決まっていて、(2) 合否を機械で確かめられ、(3) 絵を見て決める判断が要らず、(4) 成果物をアプリやテストの読まない場所に置ける作業。候補: 調査の「仮」の値の補強（昼夜の活動、展示している館、保全状況の原典の確認）、古い種の別名の掃除、性能の計測の実行と記録。
