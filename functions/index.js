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
  const message = {
    data: {
      title: `${names[msg.person] || "相手"}より`,
      body,
      url: appUrl,
    },
    tokens,
  };

  try {
    const res = await getMessaging().sendEachForMulticast(message);
    // 無効になった(削除・失効した)トークンは掃除しておく
    const invalid = [];
    res.responses.forEach((r, i) => {
      if (!r.success) invalid.push(tokens[i]);
    });
    await Promise.all(invalid.map((t) => db.doc(`fcmTokens/${t}`).delete().catch(() => {})));
  } catch (e) {
    console.error("notification error", e);
  }
});
