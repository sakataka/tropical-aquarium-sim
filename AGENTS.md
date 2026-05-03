# AGENTS.md

・回答は日本語で行うこと

## Git運用

- このプロジェクトで機能追加、機能修正、ドキュメント更新など意味のある変更を行った場合は、必要な検証を通したうえで、原則として commit と push まで完了させること。
- 既存の未コミット変更がある場合は、変更内容を確認し、今回の作業に関係するものだけを stage すること。
- ユーザーが明示的に「commitしない」「pushしない」と指示した場合は、その指示を優先すること。

## Web画面検証

- このプロジェクトでヘッドレスのWeb画面検証を行う場合、Chrome/Chromium headless ではなく `Bun.WebView` を使うこと。
- 標準コマンドは `bun run verify:webview`。
- 検証スクリプトは macOS では `Bun.WebView` の WebKit backend を使い、Chrome/Chromium に依存しない。
- スクリーンショットなどの一時成果物は `tmp/` 以下に出力し、Git管理しない。
