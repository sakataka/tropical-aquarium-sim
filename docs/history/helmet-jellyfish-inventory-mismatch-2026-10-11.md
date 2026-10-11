# helmet-jellyfish の成果一覧の不一致

2026年10月11日、Codexによる調査。Claude Codeへの引き継ぎ用です。

## 結論

クロカムリクラゲ（`helmet-jellyfish`）の不一致は、PNGのハッシュが変わったことではなく、PNG本体が保管庫に未保存であることによります。生成・再利用の記録だけを先に保存した途中チェックポイントが、成果一覧にも載っています。

まず必要なのは、dots側に残る生成原本の所在確認と、同じ原本のDrive配送です。記録を削除したり、別の画像を既存のハッシュに対応付けたりして不一致を消す対応は不要です。原本が現在もdots側に残っているか、当時の保存待ちがその後どこで止まったかは、このMacの資料では確認できません。

## 確認した範囲

- 保管庫: `~/Documents/aquarium-assets`、調査時のHEADは `fa9154481125259a02f4a701e2c4892da76f618a`。
- アプリrepo: 調査時のHEADは `ef2e79fb8547a151eada66cb3b06e18d9908cc38`。
- Driveの最新成果一覧: `from-claude-code/aquarium-vault-inventory-20261011-fa915448.json`。`missingOrChanged` は下記のPNGの1件です。
- 受領記録211件には `helmet-jellyfish` のファイルがありません。未受領配送 `20261010-212`〜`20261010-229` の18個のZIPも、`manifest.json` にこの種のファイルを含みません。配送の外部JSONは種名を含まないため、外部JSONの文字検索だけではなくZIP内のmanifestを確認しました。

今回調べた配送は受領していません。画像生成、採否、ジョブ状態、成果記録、アプリのコードも変更していません。

## 証拠と原因

### PNG本体がなく、付随する3ファイルは一致しています

成果記録は `queue/results/helmet-jellyfish.adult-standard.image/r1/output-1.json` です。同記録が参照する `drafts/helmet-jellyfish/adult-standard/image/request-r1/attempt-2/` の4ファイルを、ファイルの存在、Git管理、バイト数、SHA-256で照合しました。

| ファイル | 記録のバイト数 | 結果 |
|---|---:|---|
| `side.png` | 2,023,331 | ファイルなし。Git管理にもありません。ハッシュの比較対象がありません。 |
| `prompt.txt` | 5,874 | 存在し、バイト数・SHA-256が一致しています。 |
| `image-qa.json` | 2,733 | 存在し、バイト数・SHA-256が一致しています。 |
| `reuse.json` | 1,424 | 存在し、バイト数・SHA-256が一致しています。 |

`git log --all` で取得済み履歴を調べても、この種のPNGの追加・削除は見つかりませんでした。保管庫の種フォルダ内にもPNGはありません。candidate-2の生成記録にあるGit blob `dddf94ef84a25a2acc33e14eba25514868ddd887` も、このcloneのオブジェクトには存在しません。現在の保管庫から原画を取り出せる根拠はありません。

### 当時の記録は、PNG未公開を明記しています

2026年10月8日のcommit `ab4cb11ba22564ef73c69fcb5534350b16a3f8c2` は、PNG待ちの再開用チェックポイントです。変更した7ファイルはメタデータで、PNGを含みません。

`reuse.json` は、attempt-1のcandidate-2をattempt-2へ同じバイト列のまま再利用した記録です。`newGenerationPerformed=false`、`completionNotClaimed=true` で、状態は `existing-exact-native-bytes-reused-locally-png-publication-pending` です。`output-1.json` も `isCurrent=false` で、PNGの公開待ちと明記しています。

保管庫の `notes/to-claude-code/20261008-1847-bounded-image-save-buffer.md` には、当時、PNGアップロードの承認待ち中に生成由来・QA・原本のサイズとハッシュを先に保存する運用が記されています。同じ文書は、この中間output-1を保持し、PNG保存確認後に別のoutput revisionで完了する方針を示しています。これは当時の作り手の説明であり、現在のアップロード承認状況やクラウド側の原本の生存を確認したものではありません。

`species/helmet-jellyfish/meta.json` の画像欄も `status=generated` で、`path`・`sha256`・`outputRevision` はnull、採用欄もnullです。未配送のPNGを、取り込み可能な完成画像として扱っていません。

### 成果一覧に「1件」と出る理由

アプリrepoの `scripts/publish-vault-to-dots.py` は、86行目で、指定commitにファイルがあり、記録のハッシュと一致するかを `inVault` にします。103〜116行目では、`isCurrent=false` の記録も含めて `queue/results` の全outputを読みます。存在しないPNGは `inVault=false` になり、`missingOrChanged` に入ります。

したがって、この表示は未保存の参照を検出した結果です。別のPNGへの差し替えや、今回の配送207〜211の受領失敗を示すものではありません。

また「1件」は成果一覧に載る参照パスの数です。generation/reuseの記録には、attempt-1のcandidate-1、candidate-2、attempt-2の計3つのPNGパスがあり、いずれも保管庫にありません。candidate-2とattempt-2は同じ原本なので、原本は2枚分です。成果一覧はgenerationの全PNG参照を数えず、output-1にあるattempt-2の1パスを数えています。

## Claude Code側で必要な対応

1. **既存の配送依頼の状況を確認する。** `consumer/replies/20261010-images-not-yet-in-vault.md` で、Claude Codeは既にdotsへ原本の配送を依頼しています。新たな制作依頼を出す前に、原本の所在とこの依頼への対応状況を確認してください。このメモ作成では、新しい連絡は送っていません。
2. **原本が残っていれば、まず同じPNGを受け取る。** 選択されたcandidate-2とattempt-2の期待値は下記です。できれば成果記録が参照するattempt-2の `side.png` を、そのパスで配送してもらいます。別の保存名で届いた場合は、原本の同一性と記録との対応を確認し、単なるリネームで履歴の意味を変えないようにしてください。

   ```text
   jobId: helmet-jellyfish.adult-standard.image
   requestRevision: 1
   path: drafts/helmet-jellyfish/adult-standard/image/request-r1/attempt-2/side.png
   bytes: 2023331
   sha256: 595312ac20b82ecfd15f223ffc01222234532565fa4bc3d73f9c9f38ea842958
   ```

3. **正式の受領手順で保存を確定する。** `receive-vault-delivery.py` でZIPとmanifest、原本のサイズ・ハッシュを照合し、受領記録とともに保管庫へcommit・pushします。その後 `publish-vault-to-dots.py --apply` で保存済みの写しを更新します。期待するパスと同じハッシュが保管庫に入れば、この参照の `inVault` はtrueになります。
4. **保存・完了・採用を分けて扱う。** ジョブ管理側で、元のoutput-1を保持したまま保存確認後の完了記録を作る必要があるか確認します。消費側から `queue/state` や旧outputを代わりに書き換えないでください。傘の透過、余白、形態のQA留保は別途Claude Codeが画像を見て判断する事項で、保存できたことだけでは採用済みになりません。
5. **原本が失われていた場合は、別の制作として判断する。** 原本不在をdots側でも確認してから、Claude Codeが再制作の要否と順番を判断します。新しい画像のハッシュを古い原本と同じものとして記録しないでください。

一覧の見せ方を改善するなら、「ファイル未保存」「内容のハッシュ不一致」「現在の出力ではない途中記録」を区別すると原因が伝わりやすくなります。今回の解消にスクリプトの変更は必須ではありません。途中記録を一律に除外して件数だけを消すと、PNGが未保存という確認事項も隠れるため、元データを保持して表示を分ける案が適切です。
