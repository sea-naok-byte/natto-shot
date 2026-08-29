# なっとう (Firebase版・プッシュ通知対応)

ふたりでスケジュール・チャット・「合流」の記録・日記・電話の記録を共有するWebアプリです。
React (Vite) + Firebase (Firestore / Authentication / Hosting / Cloud Functions / Cloud Messaging) で動きます。

**プッシュ通知(アプリを閉じていても届く)を使うため、Firebaseの Blaze プラン(従量課金)が必要です。**
ふたりだけの利用であれば、実際の課金額はほぼ0円〜数円程度に収まります。

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
  日付指定での一括削除・全履歴検索・最新へ戻るボタン・日付区切り表示に対応。
- **チャット・合流・日記タブの新着マーク**: 相手が書き込んだときだけ、タブに赤い印が付きます。
- **本当のプッシュ通知**: チャットで新しいメッセージが届くと、アプリを閉じていても・スマホをロックして
  いても通知が届きます(Cloud Functions + Firebase Cloud Messagingで実現)。

## 構成

```
futari-techo/
├── src/                  React アプリ本体
│   ├── App.jsx
│   ├── firebase.js
│   ├── styles.css
│   └── lib/
│       ├── dates.js
│       ├── constants.js
│       ├── store.js
│       └── notifications.js   プッシュ通知の登録
├── functions/            Cloud Functions(チャット通知の送信)
├── public/
│   ├── manifest.json
│   └── firebase-messaging-sw.js  通知用 Service Worker
├── firebase.json / firestore.rules / firestore.indexes.json
└── .env.example
```

## 1. Firebaseプロジェクトを作る

1. https://console.firebase.google.com/ で新規プロジェクトを作成
2. **Authentication** → 「Sign-in method」→ **匿名(Anonymous)** を有効化
3. **Firestore Database** を作成(本番モードでOK)
4. プロジェクトの設定 → 全般 → 「マイアプリ」→ ウェブアプリ(`</>`)を追加し、`firebaseConfig` の値を控える
5. **Cloud Messaging** タブを開き、「ウェブ構成」→「証明書」で **VAPIDキー** を生成しておく(あとで使います)
6. 左下の「アップグレード」から **Blazeプラン** に切り替える(クレジットカード登録が必要です。
   Cloud Functionsを使うために必須です)

## 2. ローカルに設置する

```bash
npm install
cp .env.example .env
```

`.env` に、手順1で控えた値を書き込みます(VAPIDキーも忘れずに)。

```
VITE_FIREBASE_API_KEY=xxxx
VITE_FIREBASE_AUTH_DOMAIN=xxxx.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=xxxx
VITE_FIREBASE_STORAGE_BUCKET=xxxx.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=xxxx
VITE_FIREBASE_APP_ID=xxxx
VITE_FIREBASE_VAPID_KEY=xxxx
```

`public/firebase-messaging-sw.js` の中にも、同じ`firebaseConfig`の値を直接書き写してください
(Service Workerは`.env`を読めないためです)。Firebaseのウェブ設定値は公開しても問題ない情報です。

## 3. Firebase CLIをセットアップ

```bash
npm install -g firebase-tools
firebase login
cp .firebaserc.example .firebaserc
```

`.firebaserc` の `your-firebase-project-id` を、実際のプロジェクトIDに書き換えます。

## 4. Cloud Functionsの部品をインストール

```bash
cd functions
npm install
cd ..
```

## 5. デプロイする

```bash
firebase deploy --only firestore:rules
firebase deploy --only functions
npm run deploy
```

(2回目以降のちょっとした修正では `npm run deploy` だけで、hosting・firestoreルール・functionsが
まとめてデプロイされます)

## 6. スマホで通知を有効にする

1. デプロイされたURL(`https://あなたのプロジェクトID.web.app`)をスマホで開く
2. 「チャット通知を有効にする」ボタンをタップして許可する
3. 「テスト通知を送る」ボタンでその場で動作確認できます
4. 相手からメッセージが届くと、アプリを閉じていても通知が届きます

**iPhoneの場合の注意**: Safariで直接開いているだけでは、iOSの制約で通知が届きません。
必ず一度「ホーム画面に追加」してから、ホーム画面のアイコンから開いた状態で通知を許可してください。

## GitHubに登録する

```bash
git init
git add .
git commit -m "初回コミット"
git branch -M main
git remote add origin https://github.com/あなたのアカウント/futari-techo.git
git push -u origin main
```

`.env`・`.firebaserc`・`functions/node_modules` は`.gitignore`に含まれているため、
リポジトリには含まれません。

## 本番運用に切り替えるとき

`src/App.jsx` の先頭にある `DEMO_MODE` を `false` にしてください(すでに false になっている場合は
そのままで構いません)。

```js
const DEMO_MODE = false;
```

これで、ヘッダーの「切替」ボタンと「全データを削除する」ボタンが両方非表示になります。

## セキュリティについての注意

このアプリは「合言葉を知っている人だけが使える」というシンプルな考え方を採用しています。

- 合言葉は Firestore の `meta/setup` ドキュメントにそのまま保存され、クライアント側(ブラウザ)で
  比較しています。匿名認証さえしていれば技術的には誰でもFirestoreから合言葉を直接読み取ることが
  可能ですが、`meta/setup`は一度作成されたら二度と上書き・削除できないルールにしてあります。
- `shifts` / `chat` / `diary` / `calls` / `fcmTokens` などのデータも「匿名認証さえしていれば
  読み書きできる」ルールです。家族・恋人など身近な二人だけで使う前提の、簡易的な保護であることを
  ご理解のうえご利用ください。

## データのバックアップ

Firestoreのデータは自動的にGoogleのクラウドに保存されます。追加でバックアップを取りたい場合は
Firebaseコンソールの「Firestore → バックアップ」または `gcloud firestore export` で
エクスポートできます。
