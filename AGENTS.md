# AGENTS.md

・回答は日本語で行うこと

## Web画面検証

- このプロジェクトでヘッドレスのWeb画面検証を行う場合、Chrome/Chromium headless ではなく `Bun.WebView` を使うこと。
- 標準コマンドは `bun run verify:webview`。
- 検証スクリプトは macOS では `Bun.WebView` の WebKit backend を使い、Chrome/Chromium に依存しない。
- スクリーンショットなどの一時成果物は `tmp/` 以下に出力し、Git管理しない。
