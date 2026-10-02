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

// FCMのトークンは、ブラウザの更新やキャッシュ整理などで気づかないうちに作り直されることがある。
// その場合、Firestoreに残っている古いトークン宛に送信され続け「通知が来ない」状態になるため、
// アプリ起動時に毎回トークンを取り直し、変わっていれば静かに登録し直す。
export async function refreshPushToken(myRole) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  // 利用者が自分で通知をオフにしている端末では、何もしない
  if (!localStorage.getItem(`ft_fcm_token_${myRole}`)) return;

  const messaging = await getMessagingIfSupported();
  if (!messaging) return;

  try {
    const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
    if (!token) return;

    const saved = localStorage.getItem(`ft_fcm_token_${myRole}`);
    if (token === saved) {
      // 変わっていなくても、生きている印として更新日時だけ入れ直しておく
      await setDoc(doc(db, "fcmTokens", token), { person: myRole, updatedAt: Date.now() }, { merge: true });
      return;
    }

    // トークンが変わっていた場合は、同じ役割の古い登録を消してから登録し直す
    try {
      const q = query(collection(db, "fcmTokens"), where("person", "==", myRole));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map((d) => (d.id !== token ? deleteDoc(d.ref) : Promise.resolve())));
    } catch {}

    await setDoc(doc(db, "fcmTokens", token), { person: myRole, updatedAt: Date.now() });
    localStorage.setItem(`ft_fcm_token_${myRole}`, token);
  } catch (e) {
    console.warn("トークンの更新に失敗:", e);
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
