/* このファイルはVite/npmのビルドを通らない「そのまま配信される」ファイルなので、
   .env の値を手作業で書き写す必要があります。
   Firebaseのウェブ設定値(apiKeyなど)は公開情報なので、ここに書いても問題ありません。
   詳しくは README.md の「プッシュ通知を有効にする」を参照してください。 */

importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCJOML-vutj0thNROWoZa8HbjWlo4SVcP8",
  authDomain: "natto-bfaf1.firebaseapp.com",
  projectId: "natto-bfaf1",
  storageBucket: "natto-bfaf1.firebasestorage.app",
  messagingSenderId: "208606157548",
  appId: "1:208606157548:web:a4d4dfb8ccd8cd1e73e3c9",
});

const messaging = firebase.messaging();

// アプリが閉じている・バックグラウンドのときはここが呼ばれる
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || "なっとう", {
    body: body || "",
    icon: "/icon-192.png",
  });
});
