# レーン aquarium-census: 日本の水族館の飼育種を集める

日本の水族館で飼育・展示されている水の生き物を、館ごとに、出典つきで集める。入口と決まりは [Codex の作業リスト](../codex-queue.md)。

## 何に使うか

- **作る順番**: 多くの館で飼われている生き物から先に、画像と調査を作る（dots の作業リストの並べ替え）。
- **展示の根拠**: 図鑑の「水族館で展示される／展示はまれ」（`profile.keeping`）を、館の一覧で裏づける。
- **抜けの発見**: 展示計画（保管庫の `catalog/exhibit-plan.json`。約1,660種ぶんの器）にない生き物を見つける。重複を除いた合計が何種になるかも、この調査で初めて分かる。

## 作業の単位と、書いてよい場所

書いてよいのは `research/aquarium-census/` の中だけ。作業は `uv run scripts/agent-queue.py claim aquarium-census <件数> --by <名前>` が返したものを進める。

1. **`setup`（最初の1回）**: 出発点を確かめ、館の一覧を作る。
   - `research/aquarium-census/sources.md`: 使える情報源と使えない情報源、その理由。確かめるもの: 日本動物園水族館協会（JAZA）の飼育動物の検索（あるか、館ごとの種が引けるか、利用の条件）、各館の公式サイトの生き物図鑑・展示生物の一覧、年報・飼育動物一覧の PDF、自治体の公開資料。
   - `research/aquarium-census/facilities.json`: `{"schemaVersion": "aquarium-census-facilities/1", "updatedAt": "...", "facilities": [{"id": "<英小文字とハイフン>", "nameJa": "...", "prefecture": "...", "officialUrl": "...", "speciesListUrl": "<種の一覧のページ。なければ null>", "method": "official-zukan | jaza | annual-report | none", "jazaMember": true|false|null, "noteJa": "..."}]}`。水族館と、水の生き物を主に見せる施設（淡水魚館など）を、できるだけ漏れなく。動物園は、水族館を併設するものだけ。並びは、公式の種の一覧が充実している館を先に。
   - 続けて、公式の一覧が充実した館を3つ選んで下の「館ごと」をやり、方法が通ることを確かめる（この3つも印を置いてから）。
2. **館ごと（`facilities.json` の id）**: `research/aquarium-census/facilities/<id>/species.json` を書く。
   - `{"schemaVersion": "aquarium-census-facility/1", "facilityId": "...", "retrievedAt": "<日付>", "sourceUrls": ["..."], "method": "...", "coverageJa": "<この一覧が館の飼育種のどこまでを覆うか。例: 公式図鑑の全件 / 主な展示だけ / 2024年度の年報>", "species": [{"nameJa": "<館の表記のまま>", "scientificName": "<出典にあるときだけ。なければ null>", "groupJa": "<魚類・無脊椎・両生類・爬虫類・哺乳類・鳥類など、出典の区分>", "sourceUrl": "...", "noteJa": "<現在は展示していない、バックヤード、季節展示など、出典にあれば>"}]}`
   - 一覧の取れない館は、`species` を空にして `coverageJa` に理由を書く（済みとして扱う）。

## 決まり

- **公開されているページだけ**を使う。ログインや申請が要るもの、利用規約や `robots.txt` で機械的な取得を禁じているページは使わず、`sources.md` に書く。
- 取得はゆっくり（同じサイトへは1〜2秒あけ、並列にしない）。1館あたりの取得は、種の一覧に要るページに絞る。
- **保存するのは、種名・区分・出典の URL・取得日だけ。** ページの本文、解説文、写真は保存しない（解説文を写さない）。
- 名前は館の表記のまま書く。**学名を推測で足さない**（和名から学名への照合、表記ゆれの統合、重複の除去は、あとの工程で保管庫のカタログと突き合わせて行う）。
- 「◯◯の仲間」「サンゴ類」のように種まで分からない表記は、そのまま `nameJa` に書き、`noteJa` に「種までの記載なし」と書く。
- 分からないこと、確かめられなかったことは、推測で埋めずに `noteJa`・`coverageJa` に書く。

## 確かめる

- 書いた JSON が読めること（`python3 -c "import json,sys; json.load(open(sys.argv[1]))" <ファイル>`）。
- `species` の各項目に `nameJa` と `sourceUrl` があること。件数を報告に書く。
- `sources.md` と `facilities.json` に、情報源ごとの「使える／使えない」と理由があること（`setup`）。

## あとの工程（Claude Code と相談して決める。このレーンではやらない）

館ごとの一覧がある程度そろったら、和名と学名で保管庫のカタログ・展示計画と突き合わせ、(1) 重複を除いた種の数、(2) 種ごとの飼育館の数、(3) 展示計画にない種の一覧を出すスクリプトを足す。その結果で、dots の作業リストの順と、展示計画の候補を見直す。
