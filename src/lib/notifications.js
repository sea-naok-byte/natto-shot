import { getToken, onMessage } from "firebase/messaging";
import { doc, setDoc } from "firebase/firestore";
import { db, vapidKey, getMessagingIfSupported } from "../firebase";

export async function enablePushNotifications(myRole) {
  if (typeof Notification === "undefined") return { ok: false, reason: "unsupported" };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: perm };

  const messaging = await getMessagingIfSupported();
  if (!messaging) return { ok: false, reason: "unsupported" };

  try {
    const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
    if (!token) return { ok: false, reason: "no-token" };
    await setDoc(doc(db, "fcmTokens", token), { person: myRole, updatedAt: Date.now() });
    return { ok: true };
  } catch (e) {
    console.error("push registration failed", e);
    return { ok: false, reason: "error" };
  }
}

// アプリを開いて(フォアグラウンドで)いるときに届いた通知を受け取る
export function listenForegroundMessages(cb) {
  getMessagingIfSupported().then((messaging) => {
    if (!messaging) return;
    onMessage(messaging, cb);
  });
}
