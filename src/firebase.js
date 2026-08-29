import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { isSupported, getMessaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

// 実際の人物認証は行わず、匿名認証 + 合言葉チェックで「ふたりだけの部屋」を実現する
export function ensureSignedIn() {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        unsub();
        resolve(user);
      } else {
        signInAnonymously(auth).catch(reject);
      }
    });
  });
}

// 本当のプッシュ通知(アプリを閉じていても届く)に使う。非対応ブラウザではnullを返す
export async function getMessagingIfSupported() {
  try {
    if (await isSupported()) return getMessaging(app);
  } catch {
    // 非対応ブラウザ
  }
  return null;
}
