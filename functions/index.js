const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
const db = getFirestore();
const REGION = "asia-northeast1";

/**
 * chat コレクションに新しいメッセージが作成されたら、
 * 送信者ではない方に登録されているFCMトークンへプッシュ通知を送る。
 * これにより、アプリを閉じていても・スマホがロックされていても通知が届く。
 */
exports.sendChatNotification = onDocumentCreated({ document: "chat/{msgId}", region: REGION }, async (event) => {
  const msg = event.data?.data();
  if (!msg) return;

  const metaSnap = await db.doc("meta/setup").get();
  const names = metaSnap.exists ? metaSnap.data().names : { a: "A", b: "B" };
  const otherRole = msg.person === "a" ? "b" : "a";

  const tokensSnap = await db.collection("fcmTokens").where("person", "==", otherRole).get();
  if (tokensSnap.empty) return;

  const tokens = tokensSnap.docs.map((d) => d.id);
  const body = msg.type === "stamp" ? "スタンプが届きました" : (msg.content || "");
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "";
  const appUrl = `https://${projectId}.web.app/?tab=chat`;

  // notification フィールドではなく data のみで送る(ブラウザによって挙動が不安定になりやすいため)。
  // タイトル・本文・タップ時に開くURLをすべて自前で持たせ、Service Worker側で表示を組み立てる。
  //
  // 端末がスリープ中・圏外などでも確実に届くように、
  //  - priority を high にして「あとでまとめて配信」されないようにする
  //  - TTL(保持期間)を長めに設定し、オフラインでも復帰時に受け取れるようにする
  const message = {
    data: {
      title: `${names[msg.person] || "相手"}より`,
      body,
      url: appUrl,
    },
    android: { priority: "high" },
    webpush: {
      headers: {
        Urgency: "high",
        TTL: "86400", // 24時間は配信を試み続ける
      },
    },
    tokens,
  };

  try {
    const res = await getMessaging().sendEachForMulticast(message);
    // 「本当に無効になったトークン」だけを削除する。
    // 一時的な障害(internal-error や quota 超過など)で消してしまうと、
    // 以後その端末に二度と通知が届かなくなるため、エラーコードを見て判断する。
    const UNREGISTERED = new Set([
      "messaging/registration-token-not-registered",
      "messaging/invalid-registration-token",
      "messaging/invalid-argument",
    ]);
    const invalid = [];
    res.responses.forEach((r, i) => {
      if (r.success) return;
      const code = r.error && r.error.code;
      if (UNREGISTERED.has(code)) {
        invalid.push(tokens[i]);
      } else {
        console.warn("一時的な送信失敗(トークンは保持):", code, tokens[i]);
      }
    });
    await Promise.all(invalid.map((t) => db.doc(`fcmTokens/${t}`).delete().catch(() => {})));
  } catch (e) {
    console.error("notification error", e);
  }
});
