import { getToken, onMessage } from "firebase/messaging";
import { doc, setDoc, deleteDoc, collection, query, where, getDocs } from "firebase/firestore";
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

    // 同じ役割(なおや/ゆりか)に対して古い登録が残っていると、同じ端末なのに
    // (Safariのタブ / ホーム画面アプリ、など)複数の宛先に二重に届いてしまうことがあるため、
    // 新しく登録するときは、その役割の古い登録を先に消してから登録し直す
    try {
      const q = query(collection(db, "fcmTokens"), where("person", "==", myRole));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map((d) => (d.id !== token ? deleteDoc(d.ref) : Promise.resolve())));
    } catch {}

    await setDoc(doc(db, "fcmTokens", token), { person: myRole, updatedAt: Date.now() });
    localStorage.setItem(`ft_fcm_token_${myRole}`, token);
    return { ok: true, token };
  } catch (e) {
    console.error("push registration failed", e);
    return { ok: false, reason: "error" };
  }
}

// ブラウザの通知許可自体は変えず、「この端末には送らないでね」という状態にする
// (fcmTokensから自分のトークンを消すだけなので、Cloud Functionsが送り先として使わなくなる)
export async function disablePushNotifications(myRole) {
  const token = localStorage.getItem(`ft_fcm_token_${myRole}`);
  if (token) {
    try { await deleteDoc(doc(db, "fcmTokens", token)); } catch {}
    localStorage.removeItem(`ft_fcm_token_${myRole}`);
  }
}

export function isPushRegistered(myRole) {
  return !!localStorage.getItem(`ft_fcm_token_${myRole}`);
}

// アプリを開いて(フォアグラウンドで)いるときに届いた通知を受け取る
export function listenForegroundMessages(cb) {
  getMessagingIfSupported().then((messaging) => {
    if (!messaging) return;
    onMessage(messaging, cb);
  });
}

// new Notification(...) はiPhoneのSafari(ホーム画面追加含む)では動かないため、
// できるだけService Worker経由(showNotification)で表示する。
// タップしたときにチャット画面へ飛べるよう、開くURLをdataに含めておく。
export async function showLocalNotification(title, body, url = "/?tab=chat") {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    if (navigator.serviceWorker) {
      let reg = await navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js");
      if (!reg) reg = await navigator.serviceWorker.ready.catch(() => null);
      if (reg && reg.showNotification) {
        await reg.showNotification(title, { body, icon: "/icon-192.png", data: { url } });
        return;
      }
    }
  } catch (e) {
    console.warn("showNotification failed, falling back", e);
  }
  try { new Notification(title, { body }); } catch {}
}
