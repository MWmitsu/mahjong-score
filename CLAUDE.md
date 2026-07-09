# 麻雀スコア（MahjongScoreWeb）

> 個人共通の方針は `~/.claude/CLAUDE.md` を参照（このファイルはアプリ固有のみ）。

## 何か
麻雀のスコア・成績管理Webアプリ（元SwiftUI版をWeb化）。素のJavaScript・ビルド不要・PWA。Firebaseでクラウド同期（Googleログイン）。

## 技術・動かし方
- 素のJS（npm／ビルドなし）。PWA（`manifest.webmanifest` + `sw.js`）。保存: `localStorage` ＋ Firebase（Auth/Firestore）。
- ローカル確認: `./serve.ps1`（http://localhost:8765/ ）。**Firebase同期を試すときは必ず serve 経由**（`file://` 直開きは auth が動かない。既存の無効化挙動を壊さない）。
- 公開: commit → `git push origin main` → GitHub Pages（origin: github.com/MWmitsu/mahjong-score）。

## モジュール地図（js/）
- `app.js` 制御 ／ `domain.js` **点数計算・確定判断（正確性が命）** ／ `store.js` 保存 ／ `cloud.js` Firebase同期
- `stats.js` 成績集計 ／ `sheets.js` 成績表 ／ `screens/` 画面 ／ `components.js`・`ui.js` UI ／ `selftest.js` 自己テスト

## 守ってほしいこと（品質）
- `domain.js` の点数計算を変えたら、`selftest.js` を実行して結果を提示する。
- `sw.js` 変更時は `const CACHE = "mahjong-vNN"` の版番号を上げる。
- **Firebaseの管理者鍵・サービスアカウントJSONは絶対にコミットしない**（Web用APIキーは公開前提でOK）。

## Don't
- npm／ビルド／外部CDN導入禁止。個人データを想定外に外部送信しない。指示外の大規模改修はまず提案。
