# ふたり手帳 (Firebase版・Cloud Functionsなし)

ふたりでスケジュール・チャット・「合流」の記録・日記・電話の記録を共有するWebアプリです。
React (Vite) + Firebase (Firestore / Authentication / Hosting) だけで動きます。
**Cloud Functionsは使っていない**ので、無料の Spark プランのままで運用できます。

## 主な機能

- **スケジュール**: 日ごとの予定を種類別(合流・当直・半日・休み・飲み会・勉強会・その他・特別)に登録。
  時間指定・複数日にまたがる連続登録・毎週/隔週/毎月などの繰り返し登録に対応。1人1日3件まで(合流を除く)。
- **合流**: ふたり共通の特別な予定。回数・行ったお店・備考・思い出の記録を残せます。連続した日程は
  ♡タブで1件にまとめて表示。カレンダーでは日付をハートの線で囲んで表示されます。
- **特別**: 合流に似た、渋い色合いの特別な予定枠。コメントだけ残せます。
- **電話の記録** / **日記**: 「電話した」を1タップで記録。日記は自分の分だけ確定ボタンを押して投稿でき、
  相手の分は閲覧のみ。どちらも未来の日付には記録できません。
- **日本の祝日**をカレンダー上で自動判定して赤色表示(振替休日・国民の休日にも対応)。
- **チャット**: 既読(既読が付いたメッセージは取り消し不可)・スタンプ・絵文字・URL自動リンク化・
  日付指定での一括削除・全履歴検索・最新へ戻るボタンに対応。
- 文中のURLはどの画面でもクリックできるリンクになります。

## 構成

```
futari-techo/
├── src/                  React アプリ本体
│   ├── App.jsx           画面・ロジック全体
│   ├── firebase.js       Firebase 初期化
│   ├── styles.css         スタイル一式
│   └── lib/
│       ├── dates.js       日付・繰り返し・祝日の計算
│       ├── constants.js   予定の種類・スタンプ・絵文字
│       └── store.js       Firestore の読み書き(合言葉の保存/確認も含む)
├── public/manifest.json
├── firebase.json / firestore.rules / firestore.indexes.json
└── .env.example
```

## 1. Firebaseプロジェクトを作る

1. https://console.firebase.google.com/ で新規プロジェクトを作成(**無料のSparkプランのままでOK**)
2. **Authentication** → 「Sign-in method」→ **匿名(Anonymous)** を有効化
3. **Firestore Database** を作成(本番モードでOK。ルールは後で `firestore.rules` をデプロイします)
4. プロジェクトの設定 → 全般 → 「マイアプリ」→ ウェブアプリ(`</>`)を追加し、表示された `firebaseConfig` の値を控える

## 2. ローカルに設置する

```bash
npm install
cp .env.example .env
```

`.env` に、手順1で控えた `firebaseConfig` の値を書き込みます。

```
VITE_FIREBASE_API_KEY=xxxx
VITE_FIREBASE_AUTH_DOMAIN=xxxx.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=xxxx
VITE_FIREBASE_STORAGE_BUCKET=xxxx.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=xxxx
VITE_FIREBASE_APP_ID=xxxx
```

## 3. Firebase CLIをセットアップ

```bash
npm install -g firebase-tools
firebase login
cp .firebaserc.example .firebaserc
```

`.firebaserc` の `your-firebase-project-id` を、実際のプロジェクトIDに書き換えます。

## 4. Firestoreのルールをデプロイ

```bash
firebase deploy --only firestore:rules
```

## 5. ローカルで動作確認

```bash
npm run dev
```

表示されたURL(通常 http://localhost:5173)を開き、最初にひとり目が合言葉(パスワード)だけを設定します。
その後「あなたはどちら？」で名前(なおや/ゆりか)を選びます。名前は `src/App.jsx` 冒頭の
`FIXED_NAMES` で変更できます。もうひとりは同じURLを開き、合言葉を入力→自分の名前を選ぶだけで使えます。

## 6. GitHubに登録する

```bash
git init
git add .
git commit -m "初回コミット"
git branch -M main
git remote add origin https://github.com/あなたのアカウント/futari-techo.git
git push -u origin main
```

`.env` や `.firebaserc` は `.gitignore` に含まれているため、リポジトリには含まれません。

## 7. Firebase Hostingへデプロイ(スマホから使えるURLを発行)

```bash
npm run deploy
```

`npm run build` → `firebase deploy` が実行され、`https://あなたのプロジェクトID.web.app` で公開されます。
このURLをスマホのホーム画面に追加すると、アプリのように使えます(PWA)。

## 本番運用に切り替えるとき

`src/App.jsx` の先頭にある `DEMO_MODE` を `false` にしてください。

```js
const DEMO_MODE = false;
```

これだけで、ヘッダーの「切替(なおや⇔ゆりかを自由に行き来できる)」ボタンと、
「全データを削除する」ボタンが両方非表示になります。

## 通知について(重要な制約)

Cloud Functionsを使わないため、**アプリを開いていない/ブラウザを完全に閉じている状態には通知は届きません**。

- アプリ内の「チャット通知を有効にする」ボタンを押すと、そのタブ(ブラウザ)を開いている間、
  相手からの新着メッセージをOSの通知として表示します(自分がチャットタブを見ていないときのみ)。
- タブを閉じる、スマホの画面をロックしてブラウザごと終了する、といった状態では通知は届きません。
- 「本当に閉じていても届く」プッシュ通知にするには、Cloud Functions + Firebase Cloud Messaging
  のような何らかのサーバー側の仕組みがどうしても必要です。もし後で追加したくなった場合は、
  そのときにあらためてご相談ください。

## セキュリティについての注意

このアプリは「合言葉を知っている人だけが使える」というシンプルな考え方を採用しています。

- 合言葉は Firestore の `meta/setup` ドキュメントにそのまま保存され、クライアント側(ブラウザ)で
  比較しています。Cloud Functionsを使わない都合上、**匿名認証さえしていれば技術的には誰でも
  Firestoreから合言葉を直接読み取ることが可能**です(このアプリのURLとソースコードの構造を
  知っている人に限られますが、ゼロではありません)。
- `meta/setup` は一度作成されたら二度と上書き・削除できないルールにしてあるので、第三者が後から
  合言葉を書き換えることはできません(アプリ内の「全データを削除する」ボタンも、合言葉自体は
  削除できない仕様です)。
- `shifts` / `chat` / `diary` / `calls` などのデータも「匿名認証さえしていれば読み書きできる」
  ルールです。
- 家族・恋人など身近な二人だけで使う前提の、簡易的な保護であることをご理解のうえご利用ください。
  より強固にしたい場合は、Firebase App Check の導入や、合言葉チェックをサーバー側
  (Cloud Functions等)に戻すといった改善が可能です。

## データのバックアップ

Firestoreのデータは自動的にGoogleのクラウドに保存されます。追加でバックアップを取りたい場合は
Firebaseコンソールの「Firestore → バックアップ」または `gcloud firestore export` で
エクスポートできます。
