/* このファイルはVite/npmのビルドを通らない「そのまま配信される」ファイルなので、
   .env の値を手作業で書き写す必要があります。
   Firebaseのウェブ設定値(apiKeyなど)は公開情報なので、ここに書いても問題ありません。
   詳しくは README.md の「プッシュ通知を有効にする」を参照してください。 */

importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
});

const messaging = firebase.messaging();

// アプリが閉じている・バックグラウンドのときはここが呼ばれる。
// data専用のメッセージとして送っているので、payload.data から読み取る
// (payload.notification だとブラウザによって挙動が不安定なため)
messaging.onBackgroundMessage((payload) => {
  const title = (payload.data && payload.data.title) || "なっとう";
  const body = (payload.data && payload.data.body) || "";
  const url = (payload.data && payload.data.url) || "/";
  self.registration.showNotification(title, {
    body,
    icon: "/icon-192.png",
    data: { url },
  });
});

// 通知をタップしたときに、アプリを開く(すでに開いていればそこにフォーカスする)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          if ("navigate" in client) client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
