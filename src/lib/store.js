import {
  collection,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  getDocs,
  writeBatch,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  limitToLast,
  arrayUnion,
} from "firebase/firestore";
import { db } from "../firebase";

/* ---------------- setup (password + names) ---------------- */
// Cloud Functionsを使わないため、合言葉はFirestoreに直接保存し、クライアント側で比較する。
// firestore.rules で「一度作成されたら二度と書き換えられない」ようにしている。

export async function getSetup() {
  const snap = await getDoc(doc(db, "meta", "setup"));
  return snap.exists() ? snap.data() : null;
}

export async function createSetup(password, nameA, nameB) {
  await setDoc(doc(db, "meta", "setup"), { password, names: { a: nameA, b: nameB } });
}

/* ---------------- shifts (schedule) ---------------- */

export function listenShifts(callback) {
  return onSnapshot(collection(db, "shifts"), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function addShiftsBatch(entries, by) {
  const batch = writeBatch(db);
  const now = Date.now();
  entries.forEach((entry) => batch.set(doc(collection(db, "shifts")), { ...entry, createdAt: now, updatedAt: now, updatedBy: by }));
  await batch.commit();
}

export async function deleteShiftSingle(id) {
  await deleteDoc(doc(db, "shifts", id));
}

export async function deleteShiftGroupFuture(groupId, fromDate) {
  const q = query(collection(db, "shifts"), where("groupId", "==", groupId));
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.docs.forEach((d) => { if (d.data().date >= fromDate) batch.delete(d.ref); });
  await batch.commit();
}

export async function updateShiftFull(id, patch, by) {
  await updateDoc(doc(db, "shifts", id), { ...patch, updatedAt: Date.now(), updatedBy: by });
}

export async function updateShiftGroupFields(groupId, patch, by) {
  const q = query(collection(db, "shifts"), where("groupId", "==", groupId));
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.update(d.ref, { ...patch, updatedAt: Date.now(), updatedBy: by }));
  await batch.commit();
}

/* ---------------- chat ---------------- */

export function listenChatRecent(limitCount, callback) {
  // 注意: orderBy(asc) + limit() だと「古い方から」limitCount件になってしまうため、
  // limitToLast を使って「新しい方から」limitCount件を取得する(結果は引き続き昇順で返る)
  const q = query(collection(db, "chat"), orderBy("ts", "asc"), limitToLast(limitCount));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export async function fetchAllChatOnce() {
  const snap = await getDocs(query(collection(db, "chat"), orderBy("ts", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function sendChatMessage({ person, type, content }) {
  await addDoc(collection(db, "chat"), { person, type, content, ts: Date.now(), readBy: [person] });
}

export async function deleteChatMessage(id) {
  await deleteDoc(doc(db, "chat", id));
}

export async function deleteChatMessagesBefore(cutoffMs) {
  const q = query(collection(db, "chat"), where("ts", "<=", cutoffMs));
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

export async function markMessagesRead(messageIds, myRole) {
  await Promise.all(
    messageIds.map((id) => updateDoc(doc(db, "chat", id), { readBy: arrayUnion(myRole) }).catch(() => {}))
  );
}

/* ---------------- diary ---------------- */

export function listenDiary(callback) {
  return onSnapshot(collection(db, "diary"), (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export async function saveDiaryEntry(person, date, text) {
  await setDoc(doc(db, "diary", `${date}_${person}`), { date, person, text, updatedAt: Date.now() }, { merge: true });
}

export async function deleteDiaryEntry(person, date) {
  await deleteDoc(doc(db, "diary", `${date}_${person}`));
}

/* ---------------- calls (電話の記録) ---------------- */

export function listenCalls(callback) {
  return onSnapshot(collection(db, "calls"), (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export async function addCallRecord(date, person) {
  await addDoc(collection(db, "calls"), { date, person });
}

export async function deleteCallRecord(id) {
  await deleteDoc(doc(db, "calls", id));
}
