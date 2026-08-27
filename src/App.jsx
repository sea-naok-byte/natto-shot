import { useState, useEffect, useLayoutEffect, useRef, useMemo, Fragment } from "react";
import { collection, getDocs, writeBatch } from "firebase/firestore";
import {
  Calendar as CalendarIcon, MessageCircle, LogOut, Plus, X, Send,
  ChevronLeft, ChevronRight, ChevronDown, Search, Smile, Sparkles, CheckCheck, Lock,
  Heart, BookOpen, MoreHorizontal, RefreshCw, Bell, Pencil, Phone, Trash2, ArrowDown, Star,
} from "lucide-react";

import { db, ensureSignedIn } from "./firebase";
import {
  WEEKDAY_JP, uid, todayKeyStr, isFutureDate, startOfWeek, addDays, toKey,
  buildMonthGrid, nthWeekdayLabel, generateRecurrenceDates, generateSpanDates, getHolidayName,
} from "./lib/dates";
import { TYPES, TYPE_ICON, STAMPS, EMOJIS } from "./lib/constants";
import {
  getSetup, createSetup,
  listenShifts, addShiftsBatch, deleteShiftSingle, deleteShiftGroupFuture, updateShiftFull, updateShiftGroupFields,
  listenChatRecent, fetchAllChatOnce, sendChatMessage, deleteChatMessage, deleteChatMessagesBefore, markMessagesRead,
  listenDiary, saveDiaryEntry, deleteDiaryEntry,
  listenCalls, addCallRecord, deleteCallRecord,
} from "./lib/store";

// デモ中は「切替」でどちらの名前も自由に見られるようにしている。
// 本番運用に切り替えるときは false にすると、切替ボタンと全データ削除ボタンが消える。
const DEMO_MODE = true;
const FIXED_NAMES = { a: "なおや", b: "ゆりか" };

// 文中のURLをクリックできるリンクに変換する
function linkify(text) {
  if (!text) return text;
  const re = /(https?:\/\/[^\s]+)/g;
  const out = [];
  let lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) out.push(text.slice(lastIndex, m.index));
    let url = m[0];
    let trail = "";
    const trailMatch = url.match(/[).,!?、。」』]+$/);
    if (trailMatch) { trail = trailMatch[0]; url = url.slice(0, url.length - trail.length); }
    out.push(<a key={m.index} href={url} target="_blank" rel="noopener noreferrer" className="ft-link">{url}</a>);
    if (trail) out.push(trail);
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  return out;
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [metaExists, setMetaExists] = useState(null);
  const [names, setNames] = useState(null);
  const [storedPassword, setStoredPassword] = useState(null);
  const [authed, setAuthed] = useState(localStorage.getItem("ft_authed") === "true");
  const [myRole, setMyRole] = useState(localStorage.getItem("ft_role") || null);

  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [suPassword, setSuPassword] = useState("");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [tab, setTab] = useState("schedule");
  const [viewMode, setViewMode] = useState("5week");
  const [cursor, setCursor] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });
  const [weekOffset, setWeekOffset] = useState(0);

  const [shifts, setShifts] = useState([]);
  const [diary, setDiary] = useState([]);
  const [calls, setCalls] = useState([]);

  const [selectedDate, setSelectedDate] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [diaryCardOpen, setDiaryCardOpen] = useState(false);

  const [formPerson, setFormPerson] = useState("a");
  const [formType, setFormType] = useState("当直");
  const [formHasTime, setFormHasTime] = useState(false);
  const [formStart, setFormStart] = useState("09:00");
  const [formEnd, setFormEnd] = useState("18:00");
  const [formSpanEnd, setFormSpanEnd] = useState("");
  const [formComment, setFormComment] = useState("");
  const [formMeetPlan, setFormMeetPlan] = useState("");
  const [formMeetMemory, setFormMeetMemory] = useState("");
  const [formMeetCount, setFormMeetCount] = useState("");
  const [formMeetPlace, setFormMeetPlace] = useState("");
  const [formRecurMode, setFormRecurMode] = useState("none");
  const [formRecurEnd, setFormRecurEnd] = useState("");
  const [formError, setFormError] = useState("");

  const [meetSearchQuery, setMeetSearchQuery] = useState("");
  const [expandedMeetId, setExpandedMeetId] = useState(null);
  const meetActivityRef = useRef(0);

  const [diarySearchQuery, setDiarySearchQuery] = useState("");
  const [expandedDiaryDate, setExpandedDiaryDate] = useState(null);
  const diaryActivityRef = useRef(0);

  const [messages, setMessages] = useState([]);
  const [chatText, setChatText] = useState("");
  const [chatSearching, setChatSearching] = useState(false);
  const [chatQuery, setChatQuery] = useState("");
  const [chatSearchResults, setChatSearchResults] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showStamps, setShowStamps] = useState(false);
  const [chatVisibleCount, setChatVisibleCount] = useState(200);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [showChatCleanup, setShowChatCleanup] = useState(false);
  const [chatCutoffDate, setChatCutoffDate] = useState("");
  const [notifPermission, setNotifPermission] = useState(() =>
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );

  const chatEndRef = useRef(null);
  const chatBodyRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const prevScrollHeightRef = useRef(0);
  const tabRef = useRef(tab);
  const lastMsgIdRef = useRef(null);
  const [seenVersion, setSeenVersion] = useState(0);

  useEffect(() => { tabRef.current = tab; }, [tab]);
  useEffect(() => { setDiaryCardOpen(false); }, [selectedDate]);

  function getLastSeen(tabName) {
    return parseInt(localStorage.getItem(`ft_lastseen_${tabName}_${myRole}`) || "0", 10);
  }
  function markSeen(tabName) {
    if (!myRole) return;
    localStorage.setItem(`ft_lastseen_${tabName}_${myRole}`, String(Date.now()));
    setSeenVersion((v) => v + 1);
  }
  function handleTabChange(t) {
    setTab(t);
    if (t === "chat" || t === "meet" || t === "diary") markSeen(t);
    if (t === "chat") isNearBottomRef.current = true;
  }
  // 初めて使う端末では、それ以前の内容をすべて「未読」扱いにしないよう、初回だけ現在時刻で初期化する
  useEffect(() => {
    if (!myRole) return;
    ["chat", "meet", "diary"].forEach((t) => {
      const key = `ft_lastseen_${t}_${myRole}`;
      if (!localStorage.getItem(key)) localStorage.setItem(key, String(Date.now()));
    });
  }, [myRole]);

  /* ---- boot ---- */
  useEffect(() => {
    (async () => {
      try {
        await ensureSignedIn();
        const setup = await getSetup();
        if (setup) { setNames(setup.names); setStoredPassword(setup.password); setMetaExists(true); }
        else setMetaExists(false);
      } catch (e) {
        console.error(e);
        setMetaExists(false);
      }
      setBooting(false);
    })();
  }, []);

  /* ---- live data (Firestoreがリアルタイムに同期してくれるので、手動更新やキャッシュ管理は不要) ---- */
  useEffect(() => {
    if (!authed || !myRole) return;
    const u1 = listenShifts(setShifts);
    const u2 = listenDiary(setDiary);
    const u3 = listenCalls(setCalls);
    return () => { u1(); u2(); u3(); };
  }, [authed, myRole]);

  useEffect(() => {
    if (!authed || !myRole) return;
    const unsub = listenChatRecent(chatVisibleCount, setMessages);
    return () => unsub();
  }, [authed, myRole, chatVisibleCount]);

  // チャット検索は保存されている全履歴を対象にする
  useEffect(() => {
    if (!chatSearching || !chatQuery.trim()) { setChatSearchResults(null); return; }
    let cancelled = false;
    fetchAllChatOnce().then((all) => {
      if (cancelled) return;
      const q = chatQuery.trim().toLowerCase();
      setChatSearchResults(all.filter((m) => m.type === "text" && m.content.toLowerCase().includes(q)));
    });
    return () => { cancelled = true; };
  }, [chatSearching, chatQuery]);

  /* ---- チャットの自動スクロール ---- */
  useEffect(() => {
    if (tab !== "chat") return;
    if (isNearBottomRef.current) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setShowScrollToBottom(false);
    } else {
      setShowScrollToBottom(true);
    }
  }, [messages, tab]);

  useLayoutEffect(() => {
    const el = chatBodyRef.current;
    if (el && prevScrollHeightRef.current) {
      el.scrollTop += el.scrollHeight - prevScrollHeightRef.current;
      prevScrollHeightRef.current = 0;
    }
  }, [chatVisibleCount]);

  function handleChatScroll() {
    const el = chatBodyRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    isNearBottomRef.current = nearBottom;
    if (nearBottom) setShowScrollToBottom(false);
    if (el.scrollTop < 40 && !chatSearching) {
      prevScrollHeightRef.current = el.scrollHeight;
      setChatVisibleCount((c) => c + 200);
    }
  }

  function scrollChatToBottom() {
    isNearBottomRef.current = true;
    setShowScrollToBottom(false);
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  /* ---- 既読 ---- */
  useEffect(() => {
    if (tab !== "chat" || !myRole || messages.length === 0) return;
    const unread = messages.filter((m) => m.person !== myRole && !(m.readBy || []).includes(myRole)).map((m) => m.id);
    if (unread.length > 0) markMessagesRead(unread, myRole);
  }, [tab, messages, myRole]);

  /* ---- 通知(フォアグラウンド。タブを開いている間のみ) ---- */
  useEffect(() => {
    if (!myRole || messages.length === 0) return;
    const newest = messages[messages.length - 1];
    if (lastMsgIdRef.current && newest.id !== lastMsgIdRef.current && newest.person !== myRole) {
      const showIt = tabRef.current !== "chat" || (typeof document !== "undefined" && document.hidden);
      if (showIt && typeof Notification !== "undefined" && Notification.permission === "granted") {
        const senderName = names ? names[newest.person] : "相手";
        const body = newest.type === "stamp" ? "スタンプが届きました" : newest.content;
        try { new Notification(`${senderName}より`, { body }); } catch {}
      }
    }
    lastMsgIdRef.current = newest.id;
  }, [messages, myRole, names]);

  async function requestNotifPermission() {
    if (typeof Notification === "undefined") return;
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
  }

  /* ---- auth ---- */
  async function handleSetupSubmit() {
    if (!suPassword.trim()) return;
    setPwBusy(true); setPwError("");
    try {
      await createSetup(suPassword.trim(), FIXED_NAMES.a, FIXED_NAMES.b);
      setNames(FIXED_NAMES);
      setStoredPassword(suPassword.trim());
      setMetaExists(true);
      localStorage.setItem("ft_authed", "true");
      setAuthed(true);
    } catch (e) {
      setPwError(e.message || "設定に失敗しました");
    }
    setPwBusy(false);
  }

  function handleLoginSubmit() {
    setPwError("");
    if (storedPassword !== null && pwInput === storedPassword) {
      localStorage.setItem("ft_authed", "true");
      setAuthed(true); setPwInput("");
    } else {
      setPwError("パスワードが違います");
    }
  }

  function handleLogout() {
    localStorage.removeItem("ft_authed");
    setAuthed(false);
  }
  function chooseRole(role) { localStorage.setItem("ft_role", role); setMyRole(role); }
  function switchRole() { localStorage.removeItem("ft_role"); setMyRole(null); }

  async function resetAllData() {
    setResetting(true);
    try {
      for (const colName of ["shifts", "diary", "calls", "chat"]) {
        const snap = await getDocs(collection(db, colName));
        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (e) {
      console.error("reset failed", e);
    }
    setSelectedDate(null);
    setShowForm(false);
    setDeleteTarget(null);
    setEditTarget(null);
    setShowResetConfirm(false);
    setResetting(false);
  }

  /* ---- entries ---- */
  function resetForm() {
    setFormPerson(myRole || "a");
    setFormType("当直");
    setFormHasTime(false);
    setFormStart("09:00"); setFormEnd("18:00");
    setFormSpanEnd(selectedDate || "");
    setFormComment(""); setFormMeetPlan(""); setFormMeetMemory("");
    setFormMeetCount(""); setFormMeetPlace("");
    setFormRecurMode("none"); setFormRecurEnd("");
    setFormError("");
  }

  async function handleSaveEntry() {
    if (!selectedDate) return;
    const isMeet = formType === "合流";
    if (!isMeet) {
      const existingCount = (byDate[selectedDate] || []).filter((e) => e.person === formPerson && e.type !== "合流").length;
      if (existingCount >= 3) {
        setFormError(`${nameOf(formPerson)}さんは、この日すでに合流以外の予定を3件登録しています。これ以上は追加できません。`);
        return;
      }
    }
    setFormError("");
    const base = {
      person: isMeet ? "both" : formPerson,
      type: formType,
      hasTime: formHasTime,
      start: formHasTime ? formStart : "",
      end: formHasTime ? formEnd : "",
      comment: formComment,
      meetPlan: isMeet ? formMeetPlan : "",
      meetMemory: isMeet && !isFutureDate(selectedDate) ? formMeetMemory : "",
      meetCount: isMeet ? formMeetCount : "",
      meetPlace: isMeet ? formMeetPlace : "",
    };
    let dates = [selectedDate];
    let groupId = null;
    if (formRecurMode !== "none" && formRecurEnd) {
      const gen = generateRecurrenceDates(selectedDate, formRecurEnd, formRecurMode);
      if (gen.length > 0) { dates = gen; groupId = uid(); }
    } else if (formHasTime && formSpanEnd && formSpanEnd > selectedDate) {
      dates = generateSpanDates(selectedDate, formSpanEnd);
      if (dates.length > 1) groupId = uid();
    }
    const newEntries = dates.map((dt) => ({ date: dt, groupId, ...base }));
    await addShiftsBatch(newEntries);
    if (isMeet) markSeen("meet");
    setShowForm(false);
    resetForm();
  }

  async function handleDelete(entry, mode) {
    if (entry.groupId && mode === "future") await deleteShiftGroupFuture(entry.groupId, entry.date);
    else await deleteShiftSingle(entry.id);
    if (entry.type === "合流") markSeen("meet");
  }

  function handleMeetupChange(entry, field, value) {
    meetActivityRef.current = Date.now();
    markSeen("meet");
    if (entry.isGroup) updateShiftGroupFields(entry.groupId, { [field]: value });
    else updateShiftFull(entry.id, { [field]: value });
  }

  /* ---- derived ---- */
  const byDate = useMemo(() => {
    const map = {};
    shifts.forEach((e) => { (map[e.date] = map[e.date] || []).push(e); });
    return map;
  }, [shifts]);

  const diaryByDate = useMemo(() => {
    const map = {};
    diary.forEach((e) => { if (e.text && e.text.trim()) (map[e.date] = map[e.date] || []).push(e); });
    return map;
  }, [diary]);

  const otherRole = myRole === "a" ? "b" : "a";
  const myDiaryTextForSelected = selectedDate ? diary.find((e) => e.date === selectedDate && e.person === myRole)?.text || "" : "";
  const otherDiaryTextForSelected = selectedDate ? diary.find((e) => e.date === selectedDate && e.person === otherRole)?.text || "" : "";

  function hasPhoneCall(key) { return calls.some((c) => c.date === key); }
  const callsForDay = selectedDate ? calls.filter((c) => c.date === selectedDate) : [];

  const meetups = useMemo(() => {
    const all = shifts.filter((e) => e.type === "合流");
    const groups = {};
    const merged = [];
    all.forEach((e) => {
      if (e.groupId) (groups[e.groupId] = groups[e.groupId] || []).push(e);
      else merged.push({ ...e, isGroup: false, dateStart: e.date, dateEnd: e.date });
    });
    Object.keys(groups).forEach((gid) => {
      const members = groups[gid].sort((a, b) => a.date.localeCompare(b.date));
      merged.push({ ...members[0], id: gid, groupId: gid, isGroup: true, dateStart: members[0].date, dateEnd: members[members.length - 1].date });
    });
    const tk = todayKeyStr();
    return {
      future: merged.filter((e) => e.dateEnd >= tk).sort((a, b) => a.dateStart.localeCompare(b.dateStart)),
      past: merged.filter((e) => e.dateEnd < tk).sort((a, b) => b.dateStart.localeCompare(a.dateStart)),
    };
  }, [shifts]);

  const diaryListData = useMemo(() => {
    const byDateMap = {};
    diary.forEach((e) => {
      if (!e.text || !e.text.trim()) return;
      byDateMap[e.date] = byDateMap[e.date] || { date: e.date };
      byDateMap[e.date][e.person] = e.text;
    });
    return Object.values(byDateMap).sort((a, b) => b.date.localeCompare(a.date));
  }, [diary]);

  // 展開した合流・日記の記事は、1時間さわらないと自動的に閉じる
  useEffect(() => {
    const HOUR = 60 * 60 * 1000;
    const id = setInterval(() => {
      if (expandedMeetId && Date.now() - meetActivityRef.current > HOUR) setExpandedMeetId(null);
      if (expandedDiaryDate && Date.now() - diaryActivityRef.current > HOUR) setExpandedDiaryDate(null);
    }, 60000);
    return () => clearInterval(id);
  }, [expandedMeetId, expandedDiaryDate]);

  const monthGrid = useMemo(() => buildMonthGrid(cursor.y, cursor.m), [cursor]);
  const weekGrid = useMemo(() => {
    const start = addDays(startOfWeek(new Date()), weekOffset * 7);
    return Array.from({ length: 35 }, (_, i) => toKey(addDays(start, i)));
  }, [weekOffset]);
  const weekGridStartLabel = useMemo(() => {
    const d = new Date(weekGrid[0] + "T00:00:00");
    return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  }, [weekGrid]);
  const weekGridEndLabel = useMemo(() => {
    const d = new Date(weekGrid[weekGrid.length - 1] + "T00:00:00");
    return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  }, [weekGrid]);

  function jumpToToday() {
    const t = new Date();
    setCursor({ y: t.getFullYear(), m: t.getMonth() });
    setWeekOffset(0);
    setSelectedDate(todayKeyStr());
  }

  function goToScheduleDate(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    setViewMode("month");
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
    setSelectedDate(dateStr);
    setTab("schedule");
  }

  const todayKey = todayKeyStr();
  const dayList = selectedDate ? (byDate[selectedDate] || []) : [];
  const dayLabel = selectedDate
    ? new Date(selectedDate + "T00:00:00").toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" })
    : "";

  const filteredMessages = chatSearching && chatQuery.trim() ? (chatSearchResults || []) : messages;

  const hasNewChat = useMemo(() => {
    if (messages.length === 0) return false;
    return messages[messages.length - 1].ts > getLastSeen("chat");
  }, [messages, seenVersion, myRole]);

  const hasNewMeet = useMemo(() => {
    const meetEntries = shifts.filter((e) => e.type === "合流");
    if (meetEntries.length === 0) return false;
    const latest = Math.max(...meetEntries.map((e) => e.updatedAt || e.createdAt || 0));
    return latest > getLastSeen("meet");
  }, [shifts, seenVersion, myRole]);

  const hasNewDiary = useMemo(() => {
    if (diary.length === 0) return false;
    const latest = Math.max(...diary.map((e) => e.updatedAt || 0));
    return latest > getLastSeen("diary");
  }, [diary, seenVersion, myRole]);

  const nameOf = (p) => { if (p === "both") return "ふたり"; return names ? names[p] : p === "a" ? "A" : "B"; };
  const colorOf = (p) => (p === "a" ? "var(--gold)" : "var(--teal)");
  const softOf = (p) => (p === "a" ? "var(--gold-soft)" : "var(--teal-soft)");

  /* ---------------- screens ---------------- */

  if (booting || metaExists === null) {
    return (<div className="ft-root"><div className="ft-shell"><div className="ft-loading ft-mono"><RefreshCw size={14} /> 読み込み中…</div></div></div>);
  }

  if (!metaExists) {
    return (
      <div className="ft-root"><div className="ft-shell"><div className="ft-auth-wrap">
        <div className="ft-auth-icon"><Lock size={26} /></div>
        <h1 className="ft-title ft-display">なっとう</h1>
        <div className="ft-auth-card">
          <div><label className="ft-label">パスワード</label><input className="ft-input" type="password" value={suPassword} onChange={(e) => setSuPassword(e.target.value)} placeholder="パスワード" /></div>
          {pwError && <div className="ft-error">{pwError}</div>}
          <button className="ft-btn-primary" style={{ width: "100%", padding: "11px 0" }} disabled={pwBusy || !suPassword.trim()} onClick={handleSetupSubmit}>はじめる</button>
        </div>
      </div></div></div>
    );
  }

  if (!authed) {
    return (
      <div className="ft-root"><div className="ft-shell"><div className="ft-auth-wrap">
        <div className="ft-auth-icon"><Lock size={26} /></div>
        <h1 className="ft-title ft-display">なっとう</h1>
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: 0 }}>パスワードを入力してください</p>
        <div className="ft-auth-card">
          <input className="ft-input" type="password" value={pwInput} onChange={(e) => setPwInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleLoginSubmit(); }} placeholder="パスワード" autoFocus />
          {pwError && <div className="ft-error">{pwError}</div>}
          <button className="ft-btn-primary" style={{ width: "100%", padding: "11px 0" }} disabled={pwBusy} onClick={handleLoginSubmit}>ログイン</button>
        </div>
      </div></div></div>
    );
  }

  if (!myRole) {
    return (
      <div className="ft-root"><div className="ft-shell"><div className="ft-auth-wrap">
        <h1 className="ft-title ft-display">なっとう</h1>
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: 0 }}>あなたはどちらですか？</p>
        <div className="ft-auth-card">
          <button className="ft-role-btn" onClick={() => chooseRole("a")}><span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--gold)" }} />{names.a}</button>
          <button className="ft-role-btn" onClick={() => chooseRole("b")}><span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--teal)" }} />{names.b}</button>
        </div>
      </div></div></div>
    );
  }

  /* ---------------- main app ---------------- */

  const nthLabel = selectedDate ? nthWeekdayLabel(selectedDate) : "";
  const previewCount = formRecurMode !== "none" && formRecurEnd && selectedDate
    ? generateRecurrenceDates(selectedDate, formRecurEnd, formRecurMode).length : 0;
  const gridCells = viewMode === "month" ? monthGrid : weekGrid;

  return (
    <div className="ft-root">
      <div className={`ft-shell ${(tab === "chat" || tab === "meet" || tab === "diary") ? "no-scroll" : ""}`}>
        <div className="ft-header">
          <h1 className="ft-title ft-display">なっとう</h1>
          <div style={{ display: "flex", gap: 6 }}>
            {DEMO_MODE && <button className="ft-logout" title="テスト用：全データを消す" onClick={() => setShowResetConfirm(true)}><Trash2 size={16} /></button>}
            <button className="ft-logout" title="ログアウト" onClick={handleLogout}><LogOut size={16} /></button>
          </div>
        </div>
        <div className="ft-rolebar">
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: colorOf(myRole) }} />
          {nameOf(myRole)} として表示中
          {DEMO_MODE && <button onClick={switchRole}>切替（デモ中のみ）</button>}
        </div>
        {notifPermission === "default" && (
          <button className="ft-notifbtn" onClick={requestNotifPermission}><Bell size={12} /> チャット通知を有効にする</button>
        )}

        {tab === "schedule" && (
          <>
            <div className="ft-card">
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <div className="ft-viewswitch" style={{ flex: 1 }}>
                  <button className={viewMode === "5week" ? "active" : ""} onClick={() => setViewMode("5week")}>5週間</button>
                  <button className={viewMode === "month" ? "active" : ""} onClick={() => setViewMode("month")}>月表示</button>
                </div>
                <button className="ft-today-jump" onClick={jumpToToday}><CalendarIcon size={12} /> 本日</button>
              </div>
              {viewMode === "month" ? (
                <div className="ft-cal-nav">
                  <button className="ft-navbtn" onClick={() => setCursor((c) => c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 })}><ChevronLeft size={15} /></button>
                  <div className="ft-cal-month">{cursor.y}年 {cursor.m + 1}月</div>
                  <button className="ft-navbtn" onClick={() => setCursor((c) => c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 })}><ChevronRight size={15} /></button>
                </div>
              ) : (
                <div className="ft-cal-nav">
                  <button className="ft-navbtn" onClick={() => setWeekOffset((w) => w - 1)}><ChevronLeft size={15} /></button>
                  <span className="ft-cal-week-month">{weekGridStartLabel}</span>
                  <button className="ft-cal-today" onClick={() => setWeekOffset(0)}>今日を含む週から表示</button>
                  <span className="ft-cal-week-month">{weekGridEndLabel}</span>
                  <button className="ft-navbtn" onClick={() => setWeekOffset((w) => w + 1)}><ChevronRight size={15} /></button>
                </div>
              )}
              <div className="ft-weekdays">{WEEKDAY_JP.map((w) => <div key={w}>{w}</div>)}</div>
              <div className="ft-grid">
                {gridCells.map((key, i) => {
                  if (key === null) return <div key={i} className="ft-cell empty" />;
                  const list = byDate[key] || [];
                  const entriesA = list.filter((e) => e.person === "a");
                  const entriesB = list.filter((e) => e.person === "b");
                  const hasMeet = list.some((e) => e.type === "合流");
                  const hasSpecial = list.some((e) => e.type === "特別");
                  const hasDiary = !!diaryByDate[key];
                  const hasPhone = hasPhoneCall(key);
                  const isToday = key === todayKey;
                  const isSelected = key === selectedDate;
                  const d = new Date(key + "T00:00:00");
                  const dow = d.getDay();
                  const isHoliday = !!getHolidayName(key);
                  const wknd = (dow === 0 || isHoliday) ? "sun" : dow === 6 ? "sat" : "";
                  const showMonthTag = viewMode === "5week" && d.getDate() === 1;
                  return (
                    <div key={i} className={`ft-cell ${wknd} ${isToday ? "today" : ""} ${isSelected ? "selected" : ""} ${hasSpecial && !hasMeet ? "special" : ""} ${hasMeet ? "meet" : ""}`}
                      title={isHoliday ? getHolidayName(key) : undefined}
                      onClick={() => { setSelectedDate(key); setShowForm(false); }}>
                      <div className="ft-cell-daterow">
                        {hasPhone && <Phone size={9} color="var(--record)" title="電話をした日" />}
                        <span className="ft-cell-num-wrap">
                          {hasMeet && <Heart size={19} className="ft-cell-heart" fill="none" color="var(--meet)" strokeWidth={3} />}
                          {!hasMeet && hasSpecial && <Star size={19} className="ft-cell-heart" fill="none" color="var(--special)" strokeWidth={3} />}
                          <span className={`ft-cell-num ${hasMeet ? "in-heart" : ""}`}>{showMonthTag ? `${d.getMonth() + 1}/${d.getDate()}` : d.getDate()}</span>
                        </span>
                        {hasDiary && <BookOpen size={9} color="var(--record)" title="日記あり" />}
                      </div>
                      <div className="ft-cell-row">
                        {entriesA.slice(0, 3).map((e) => { const Icon = TYPE_ICON[e.type] || MoreHorizontal; return <span key={e.id} className="ft-chip" style={{ background: softOf("a"), border: `1px solid ${colorOf("a")}` }}><Icon size={8} color={colorOf("a")} /></span>; })}
                      </div>
                      <div className="ft-cell-row">
                        {entriesB.slice(0, 3).map((e) => { const Icon = TYPE_ICON[e.type] || MoreHorizontal; return <span key={e.id} className="ft-chip" style={{ background: softOf("b"), border: `1px solid ${colorOf("b")}` }}><Icon size={8} color={colorOf("b")} /></span>; })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {selectedDate && (
              <div className="ft-card">
                <div className="ft-day-header">
                  <div className="ft-day-title">{dayLabel}</div>
                  <button className="ft-add-btn" onClick={() => { setShowForm((v) => !v); resetForm(); }}><Plus size={13} /> 追加</button>
                </div>

                {showForm && (
                  <div className="ft-form">
                    {formType !== "合流" && (
                      <div>
                        <label className="ft-label">誰の予定？</label>
                        <div className="ft-seg">
                          <button className={formPerson === "a" ? "active" : ""} onClick={() => setFormPerson("a")}>{names.a}</button>
                          <button className={formPerson === "b" ? "active" : ""} onClick={() => setFormPerson("b")}>{names.b}</button>
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="ft-label">種類</label>
                      <div className="ft-type-grid">
                        {TYPES.map((t) => { const Icon = t.icon; const isMeetTile = t.key === "合流"; const cls = [isMeetTile ? "meet-tile" : "", formType === t.key ? "active" : ""].filter(Boolean).join(" "); return (<button key={t.key} className={cls} onClick={() => setFormType(t.key)}><Icon size={isMeetTile ? 18 : 15} /> {t.key}</button>); })}
                      </div>
                      {formType === "合流" && <div className="ft-hint" style={{ marginTop: 4 }}>合流はふたり共通の予定として登録され、どちらからでも編集できます</div>}
                      {formType !== "合流" && <div className="ft-hint" style={{ marginTop: 4 }}>合流以外の予定は、1人1日3件までです</div>}
                    </div>
                    <label className="ft-checkrow"><input type="checkbox" checked={formHasTime} onChange={(e) => setFormHasTime(e.target.checked)} />時間を指定する</label>
                    {formHasTime && (
                      <>
                        <div className="ft-form-row">
                          <input type="time" className="ft-input" value={formStart} onChange={(e) => setFormStart(e.target.value)} />
                          <input type="time" className="ft-input" value={formEnd} onChange={(e) => setFormEnd(e.target.value)} />
                        </div>
                        {formRecurMode === "none" && (
                          <div>
                            <label className="ft-label">最終日(数日間続く場合)</label>
                            <input type="date" className="ft-input" min={selectedDate} value={formSpanEnd} onChange={(e) => setFormSpanEnd(e.target.value)} />
                            {formSpanEnd > selectedDate && <div className="ft-hint">{selectedDate} 〜 {formSpanEnd} を連続してカレンダーに表示します</div>}
                          </div>
                        )}
                      </>
                    )}
                    <div><label className="ft-label">コメント</label><textarea className="ft-input" rows={2} value={formComment} onChange={(e) => setFormComment(e.target.value)} placeholder="任意のメモ" /></div>
                    {formType === "合流" && (
                      <>
                        <div className="ft-form-row">
                          <div style={{ flex: 1 }}><label className="ft-label">回数</label><input className="ft-input" value={formMeetCount} onChange={(e) => setFormMeetCount(e.target.value)} placeholder="例）12回目" /></div>
                          <div style={{ flex: 1 }}><label className="ft-label">行ったお店</label><input className="ft-input" value={formMeetPlace} onChange={(e) => setFormMeetPlace(e.target.value)} placeholder="例）〇〇食堂" /></div>
                        </div>
                        <div><label className="ft-label">備考（相談・段取りメモ）</label><textarea className="ft-input" rows={2} value={formMeetPlan} onChange={(e) => setFormMeetPlan(e.target.value)} placeholder="待ち合わせ場所や持ち物など" /></div>
                        {!isFutureDate(selectedDate) && (
                          <div><label className="ft-label">思い出の記録</label><textarea className="ft-input" rows={2} value={formMeetMemory} onChange={(e) => setFormMeetMemory(e.target.value)} placeholder="当日〜事後に残す記録" /></div>
                        )}
                        {isFutureDate(selectedDate) && <div className="ft-hint">思い出の記録は、当日以降に書けるようになります</div>}
                      </>
                    )}
                    <div>
                      <label className="ft-label">繰り返し</label>
                      <select className="ft-select" value={formRecurMode} onChange={(e) => {
                        const v = e.target.value; setFormRecurMode(v);
                        if (v !== "none" && !formRecurEnd) { const d = new Date(selectedDate + "T00:00:00"); d.setMonth(d.getMonth() + 3); setFormRecurEnd(toKey(d)); }
                      }}>
                        <option value="none">繰り返しなし</option>
                        <option value="weekly">毎週(同じ曜日)</option>
                        <option value="biweekly">隔週</option>
                        <option value="monthly-date">毎月(同じ日付)</option>
                        <option value="monthly-nth-weekday">{nthLabel}</option>
                      </select>
                    </div>
                    {formRecurMode !== "none" && (
                      <div>
                        <label className="ft-label">繰り返しの終了日</label>
                        <input type="date" className="ft-input" value={formRecurEnd} onChange={(e) => setFormRecurEnd(e.target.value)} />
                        {previewCount > 0 && <div className="ft-hint">この内容で {previewCount} 件の予定を作成します</div>}
                      </div>
                    )}
                    {formError && <div className="ft-error">{formError}</div>}
                    <div className="ft-form-actions">
                      <button className="ft-btn-ghost" onClick={() => setShowForm(false)}>キャンセル</button>
                      <button className="ft-btn-primary" onClick={handleSaveEntry}>保存</button>
                    </div>
                  </div>
                )}

                <div className="ft-entry-list" style={{ marginTop: showForm ? 14 : 0 }}>
                  {dayList.length === 0 && <div className="ft-empty">この日の予定はまだありません</div>}
                  {dayList.map((e) => {
                    const Icon = TYPE_ICON[e.type] || MoreHorizontal;
                    const isMeet = e.type === "合流";
                    const c = isMeet ? "var(--meet)" : colorOf(e.person);
                    const s = isMeet ? "var(--meet-soft)" : softOf(e.person);
                    return (
                      <div className={`ft-entry ${isMeet ? "meet" : ""}`} key={e.id}>
                        <div className="ft-entry-top">
                          <span className="ft-entry-icon" style={{ background: s, border: `1px solid ${c}` }}><Icon size={13} color={c} /></span>
                          <div className="ft-entry-main">
                            <span className="ft-entry-label">{nameOf(e.person)}・{e.type}</span>
                            {e.hasTime && <span className="ft-entry-time">{e.start}〜{e.end}</span>}
                            {!isMeet && e.comment && <div className="ft-entry-comment">{linkify(e.comment)}</div>}
                          </div>
                          <button className="ft-entry-edit" onClick={() => setEditTarget(e)}><Pencil size={13} /></button>
                          <button className="ft-entry-del" onClick={() => (e.groupId ? setDeleteTarget(e) : handleDelete(e, "single"))}><X size={14} /></button>
                        </div>
                        {isMeet && <MeetupEditor entry={e} onChange={handleMeetupChange} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedDate && !isFutureDate(selectedDate) && (
              <div className="ft-card ft-call-card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--record)", fontWeight: 700, fontSize: 13 }}>
                    <Phone size={14} /> 電話
                  </div>
                  <button className="ft-add-btn" style={{ background: "var(--record)" }} onClick={() => addCallRecord(selectedDate, myRole)}>
                    <Plus size={13} /> 電話した
                  </button>
                </div>
                {callsForDay.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                    {callsForDay.map((c) => (
                      <span className="ft-call-chip" key={c.id}>
                        <Phone size={11} /> {nameOf(c.person)}
                        <button onClick={() => deleteCallRecord(c.id)}><X size={11} /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {selectedDate && !isFutureDate(selectedDate) && (
              <div className="ft-card ft-diary-inline-card" style={{ padding: diaryCardOpen ? undefined : "10px 14px" }}>
                <div className={`ft-slim-tile ${diaryCardOpen ? "open" : ""}`} style={{ background: "none", border: "none", padding: 0 }}
                  onClick={() => setDiaryCardOpen((v) => !v)}>
                  <BookOpen size={14} color="var(--record)" />
                  <span className="ft-slim-tile-date" style={{ color: "var(--record)" }}>日記</span>
                  <ChevronDown size={15} className="ft-slim-chevron" />
                </div>
                {diaryCardOpen && (
                  <div style={{ marginTop: 12 }}>
                    <div className="ft-diary-box">
                      <div className="ft-diary-name"><span style={{ width: 8, height: 8, borderRadius: "50%", background: colorOf(myRole) }} />{nameOf(myRole)}の日記</div>
                      <DiaryEditor key={`sched-${selectedDate}-${myRole}`} initialText={myDiaryTextForSelected} onSubmit={(val) => { saveDiaryEntry(myRole, selectedDate, val); markSeen("diary"); }} onDelete={() => { deleteDiaryEntry(myRole, selectedDate); markSeen("diary"); }} />
                    </div>
                    <div className="ft-diary-box" style={{ marginBottom: 0 }}>
                      <div className="ft-diary-name"><span style={{ width: 8, height: 8, borderRadius: "50%", background: colorOf(otherRole) }} />{nameOf(otherRole)}の日記<Lock size={11} color="var(--muted)" title="他の人の日記は編集できません" /></div>
                      <div className="ft-diary-readonly">{otherDiaryTextForSelected ? linkify(otherDiaryTextForSelected) : <span style={{ color: "var(--muted)" }}>まだ書かれていません</span>}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {tab === "chat" && (
          <div className="ft-card ft-chat">
            <div className="ft-chat-head">
              {chatSearching ? (
                <>
                  <input className="ft-input ft-chat-search" autoFocus placeholder="メッセージを検索" value={chatQuery} onChange={(e) => setChatQuery(e.target.value)} />
                  <button className="ft-iconbtn" onClick={() => { setChatSearching(false); setChatQuery(""); }}><X size={15} /></button>
                </>
              ) : (
                <>
                  <div style={{ flex: 1, fontSize: 12.5, color: "var(--muted)" }}>{names.a} & {names.b}</div>
                  <button className="ft-iconbtn" onClick={() => setShowChatCleanup(true)} title="過去の会話を削除"><Trash2 size={15} /></button>
                  <button className="ft-iconbtn" onClick={() => setChatSearching(true)}><Search size={15} /></button>
                </>
              )}
            </div>
            {chatSearching && <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>検索結果: {filteredMessages.length}件（すべての会話から検索）</div>}
            <div className="ft-chat-body-wrap">
              <div className="ft-chat-body" ref={chatBodyRef} onScroll={handleChatScroll}>
                {!chatSearching && messages.length >= chatVisibleCount && (
                  <button className="ft-chat-loadmore" onClick={() => {
                    const el = chatBodyRef.current;
                    if (el) prevScrollHeightRef.current = el.scrollHeight;
                    setChatVisibleCount((c) => c + 200);
                  }}>
                    ↑ さらに過去のメッセージを読み込む
                  </button>
                )}
                {filteredMessages.length === 0 && <div className="ft-empty">{chatSearching ? "見つかりませんでした" : "まだメッセージがありません"}</div>}
                {filteredMessages.map((m, idx) => {
                  const mine = m.person === myRole;
                  const otherR = myRole === "a" ? "b" : "a";
                  const read = mine && (m.readBy || []).includes(otherR);
                  const prev = filteredMessages[idx - 1];
                  const curDay = new Date(m.ts).toDateString();
                  const showDateSep = !prev || new Date(prev.ts).toDateString() !== curDay;
                  const dateLabel = (() => {
                    const d = new Date(m.ts);
                    const today = new Date();
                    const yest = new Date(); yest.setDate(today.getDate() - 1);
                    if (d.toDateString() === today.toDateString()) return "今日";
                    if (d.toDateString() === yest.toDateString()) return "昨日";
                    return d.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
                  })();
                  return (
                    <Fragment key={m.id}>
                      {showDateSep && <div className="ft-chat-date-sep">{dateLabel}</div>}
                      <div className={`ft-bubble-row ${mine ? "mine" : "theirs"}`}>
                        {m.type === "stamp" ? <div className="ft-stamp">{m.content}</div> : <div className="ft-bubble" style={{ background: softOf(m.person), border: `1px solid ${colorOf(m.person)}` }}>{linkify(m.content)}</div>}
                        <div className="ft-bubble-meta">
                          {!mine && nameOf(m.person)}
                          {new Date(m.ts).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                          {read && <span className="ft-read"><CheckCheck size={11} /> 既読</span>}
                          {mine && !read && <button className="ft-msg-delete" onClick={() => deleteChatMessage(m.id)} title="取り消す"><X size={10} /> 取り消し</button>}
                        </div>
                      </div>
                    </Fragment>
                  );
                })}
                <div ref={chatEndRef} />
              </div>
              {showScrollToBottom && (
                <button className="ft-scroll-bottom-btn" onClick={scrollChatToBottom}><ArrowDown size={14} /> 最新の会話へ</button>
              )}
            </div>
            {showEmoji && <div className="ft-picker">{EMOJIS.map((em) => <button key={em} onClick={() => setChatText((t) => t + em)}>{em}</button>)}</div>}
            {showStamps && <div className="ft-picker">{STAMPS.map((st) => <button key={st} onClick={() => { sendChatMessage({ person: myRole, type: "stamp", content: st }); setShowStamps(false); }}>{st}</button>)}</div>}
            <div className="ft-chat-input-row">
              <button className={`ft-iconbtn ${showEmoji ? "active" : ""}`} onClick={() => { setShowEmoji((v) => !v); setShowStamps(false); }}><Smile size={16} /></button>
              <button className={`ft-iconbtn ${showStamps ? "active" : ""}`} onClick={() => { setShowStamps((v) => !v); setShowEmoji(false); }}><Sparkles size={16} /></button>
              <textarea className="ft-chat-input" rows={1} placeholder="メッセージ（Enterで改行）" value={chatText} onChange={(e) => setChatText(e.target.value)} />
              <button className="ft-send" disabled={!chatText.trim()} onClick={() => { sendChatMessage({ person: myRole, type: "text", content: chatText }); setChatText(""); isNearBottomRef.current = true; }}><Send size={16} /></button>
            </div>
          </div>
        )}

        {tab === "meet" && (
          <div className="ft-card ft-chat">
            <div className="ft-modal-title" style={{ color: "var(--meet)", marginBottom: 12 }}><Heart size={17} style={{ verticalAlign: "-3px", marginRight: 5 }} />合流の記録</div>
            <div className="ft-search-row">
              <Search size={14} color="var(--muted)" />
              <input className="ft-search-input" placeholder="お店・回数・メモを検索" value={meetSearchQuery} onChange={(e) => setMeetSearchQuery(e.target.value)} />
              {meetSearchQuery && <button onClick={() => setMeetSearchQuery("")}><X size={14} /></button>}
            </div>
            <div className="ft-chat-body-wrap">
              <div className="ft-chat-body">
                {(() => {
                  const q = meetSearchQuery.trim().toLowerCase();
                  const matches = (e) => {
                    if (!q) return true;
                    const hay = [e.comment, e.meetPlan, e.meetMemory, e.meetCount, e.meetPlace].filter(Boolean).join(" ").toLowerCase();
                    return hay.includes(q);
                  };
                  const future = meetups.future.filter(matches);
                  const past = meetups.past.filter(matches);
                  const fmtDate = (ds) => new Date(ds + "T00:00:00").toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
                  const renderTile = (e) => {
                    const dateLabel = e.isGroup ? `${fmtDate(e.dateStart)} 〜 ${fmtDate(e.dateEnd)}` : fmtDate(e.date);
                    const isOpen = q ? true : expandedMeetId === e.id;
                    return (
                      <div className="ft-slim-wrap" key={e.id}>
                        <div className={`ft-slim-tile ${isOpen ? "open" : ""}`} onClick={() => { meetActivityRef.current = Date.now(); setExpandedMeetId(isOpen ? null : e.id); }}>
                          <Heart size={13} color="var(--meet)" fill={isOpen ? "var(--meet)" : "none"} />
                          <span className="ft-slim-tile-date">{dateLabel}</span>
                          <button className="ft-slim-tile-edit" onClick={(ev) => { ev.stopPropagation(); meetActivityRef.current = Date.now(); setEditTarget(e); }}><Pencil size={13} color="var(--meet)" /></button>
                          <ChevronDown size={15} className="ft-slim-chevron" />
                        </div>
                        {isOpen && <div className="ft-slim-detail"><MeetupItem entry={e} onChange={handleMeetupChange} hideHeader /></div>}
                      </div>
                    );
                  };
                  return (
                    <>
                      <div className="ft-meet-section-title" style={{ marginTop: 0 }}>これからの予定（{future.length}）</div>
                      {future.length === 0 && <div className="ft-empty">{q ? "見つかりませんでした" : "予定はまだありません"}</div>}
                      {future.map(renderTile)}
                      <div className="ft-meet-section-title">思い出（{past.length}）</div>
                      {past.length === 0 && <div className="ft-empty">{q ? "見つかりませんでした" : "まだ記録がありません"}</div>}
                      {past.map(renderTile)}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {tab === "diary" && (
          <div className="ft-card ft-chat">
            <div className="ft-modal-title" style={{ color: "var(--record)", marginBottom: 12 }}><BookOpen size={17} style={{ verticalAlign: "-3px", marginRight: 5 }} />日記</div>
            <div className="ft-search-row">
              <Search size={14} color="var(--muted)" />
              <input className="ft-search-input" placeholder="日記の内容を検索" value={diarySearchQuery} onChange={(e) => setDiarySearchQuery(e.target.value)} />
              {diarySearchQuery && <button onClick={() => setDiarySearchQuery("")}><X size={14} /></button>}
            </div>
            <div className="ft-chat-body-wrap">
              <div className="ft-chat-body">
                {(() => {
                  const q = diarySearchQuery.trim().toLowerCase();
                  const filtered = diaryListData.filter((item) => {
                    if (!q) return true;
                    const hay = [item.a, item.b].filter(Boolean).join(" ").toLowerCase();
                    return hay.includes(q);
                  });
                  if (filtered.length === 0) return <div className="ft-empty">{q ? "見つかりませんでした" : "まだ日記がありません"}</div>;
                  return filtered.map((item) => {
                    const accent = item.a && item.b ? "var(--both)" : item.a ? "var(--gold)" : "var(--teal)";
                    const accentSoft = item.a && item.b ? "var(--both-soft)" : item.a ? "var(--gold-soft)" : "var(--teal-soft)";
                    const isOpen = q ? true : expandedDiaryDate === item.date;
                    const dateLabel = new Date(item.date + "T00:00:00").toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
                    return (
                      <div className="ft-slim-wrap" key={item.date}>
                        <div className={`ft-slim-tile ${isOpen ? "open" : ""}`} style={{ borderColor: accent }}
                          onClick={() => { diaryActivityRef.current = Date.now(); setExpandedDiaryDate(isOpen ? null : item.date); }}>
                          <span className="ft-slim-tile-date" style={{ color: accent }}>{dateLabel}</span>
                          <button className="ft-slim-tile-edit" onClick={(ev) => { ev.stopPropagation(); goToScheduleDate(item.date); }} title="この日を開いて編集"><Pencil size={13} color={accent} /></button>
                          <ChevronDown size={15} className="ft-slim-chevron" />
                        </div>
                        {isOpen && (
                          <div className="ft-slim-detail ft-meet-item" style={{ background: accentSoft, borderColor: accent }}>
                            {item.a && (<><div className="ft-meet-field-label">{names.a}</div><div style={{ fontSize: 12.5, whiteSpace: "pre-wrap" }}>{linkify(item.a)}</div></>)}
                            {item.b && (<><div className="ft-meet-field-label">{names.b}</div><div style={{ fontSize: 12.5, whiteSpace: "pre-wrap" }}>{linkify(item.b)}</div></>)}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="ft-bottomnav">
        <button className={`ft-navitem ${tab === "schedule" ? "active" : ""}`} onClick={() => handleTabChange("schedule")}><CalendarIcon size={18} />スケジュール</button>
        <button className={`ft-navitem ${tab === "chat" ? "active" : ""}`} onClick={() => handleTabChange("chat")}>
          <MessageCircle size={18} />チャット{hasNewChat && <span className="ft-nav-dot" />}
        </button>
        <button className={`ft-navitem ft-navitem-meet ${tab === "meet" ? "active" : ""}`} onClick={() => handleTabChange("meet")}>
          <Heart size={18} fill={tab === "meet" ? "var(--meet)" : "none"} />合流{hasNewMeet && <span className="ft-nav-dot" />}
        </button>
        <button className={`ft-navitem ${tab === "diary" ? "active" : ""}`} onClick={() => handleTabChange("diary")}>
          <BookOpen size={18} />日記{hasNewDiary && <span className="ft-nav-dot" />}
        </button>
      </div>

      {deleteTarget && (
        <div className="ft-modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="ft-modal" onClick={(ev) => ev.stopPropagation()}>
            <div className="ft-modal-head">
              <div className="ft-modal-title">予定の削除</div>
              <button className="ft-modal-close" onClick={() => setDeleteTarget(null)}><X size={16} /></button>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 0 }}>これは繰り返し・連続した予定です。どちらを削除しますか？</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button className="ft-btn-primary" onClick={async () => { await handleDelete(deleteTarget, "single"); setDeleteTarget(null); }}>この予定だけ削除</button>
              <button className="ft-btn-ghost" style={{ color: "var(--danger)", borderColor: "var(--danger)" }} onClick={async () => { await handleDelete(deleteTarget, "future"); setDeleteTarget(null); }}>今後の同じ予定をまとめて削除</button>
              <button className="ft-btn-ghost" onClick={() => setDeleteTarget(null)}>キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {editTarget && (
        <EditEntryModal
          entry={editTarget}
          names={names}
          onClose={() => setEditTarget(null)}
          onSave={async (patch) => {
            if (editTarget.isGroup) await updateShiftGroupFields(editTarget.groupId, patch);
            else await updateShiftFull(editTarget.id, patch);
            if (editTarget.type === "合流" || patch.type === "合流") markSeen("meet");
            setEditTarget(null);
          }}
        />
      )}

      {showChatCleanup && (
        <div className="ft-modal-backdrop" onClick={() => setShowChatCleanup(false)}>
          <div className="ft-modal" onClick={(ev) => ev.stopPropagation()}>
            <div className="ft-modal-head">
              <div className="ft-modal-title" style={{ color: "var(--danger)" }}>会話の削除</div>
              <button className="ft-modal-close" onClick={() => setShowChatCleanup(false)}><X size={16} /></button>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 0 }}>指定した日付以前のメッセージを、すべて削除します。この操作は元に戻せません。</p>
            <label className="ft-label">この日付以前を削除</label>
            <input type="date" className="ft-input" value={chatCutoffDate} onChange={(e) => setChatCutoffDate(e.target.value)} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
              <button className="ft-btn-primary" style={{ background: "var(--danger)" }} disabled={!chatCutoffDate}
                onClick={async () => {
                  const cutoffMs = new Date(chatCutoffDate + "T23:59:59.999").getTime();
                  await deleteChatMessagesBefore(cutoffMs);
                  setShowChatCleanup(false); setChatCutoffDate("");
                }}>
                削除する
              </button>
              <button className="ft-btn-ghost" onClick={() => setShowChatCleanup(false)}>キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {showResetConfirm && (
        <div className="ft-modal-backdrop" onClick={() => !resetting && setShowResetConfirm(false)}>
          <div className="ft-modal" onClick={(ev) => ev.stopPropagation()}>
            <div className="ft-modal-head">
              <div className="ft-modal-title" style={{ color: "var(--danger)" }}>全データを削除しますか？</div>
              {!resetting && <button className="ft-modal-close" onClick={() => setShowResetConfirm(false)}><X size={16} /></button>}
            </div>
            <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 0 }}>
              スケジュール・チャット・合流の記録・日記・電話の記録を、すべて削除します。この操作は元に戻せません。<br /><br />
              合言葉やメンバーの名前は変更されません。
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button className="ft-btn-primary" style={{ background: "var(--danger)" }} disabled={resetting} onClick={resetAllData}>
                {resetting ? "削除しています…" : "すべて削除する"}
              </button>
              <button className="ft-btn-ghost" disabled={resetting} onClick={() => setShowResetConfirm(false)}>キャンセル</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MeetupItem({ entry, onChange, onEdit, hideHeader }) {
  const [plan, setPlan] = useState(entry.meetPlan || "");
  const [memory, setMemory] = useState(entry.meetMemory || "");
  const [count, setCount] = useState(entry.meetCount || "");
  const [place, setPlace] = useState(entry.meetPlace || "");
  // entryは同じコンポーネントのまま(key/idが変わらない)更新されることがあるため、
  // 保存された値が変わったらローカルの入力欄も追従させる(そうしないと編集モーダルでの
  // 保存がFirestore上には反映されているのに、この画面では反映されていないように見えてしまう)
  useEffect(() => { setPlan(entry.meetPlan || ""); }, [entry.meetPlan]);
  useEffect(() => { setMemory(entry.meetMemory || ""); }, [entry.meetMemory]);
  useEffect(() => { setCount(entry.meetCount || ""); }, [entry.meetCount]);
  useEffect(() => { setPlace(entry.meetPlace || ""); }, [entry.meetPlace]);
  const fmtDate = (ds) => new Date(ds + "T00:00:00").toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
  const dateLabel = entry.isGroup ? `${fmtDate(entry.dateStart)} 〜 ${fmtDate(entry.dateEnd)}` : fmtDate(entry.date);
  const targetDate = entry.isGroup ? entry.dateStart : entry.date;
  return (
    <div className="ft-meet-item">
      {!hideHeader && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="ft-meet-date">{dateLabel}{entry.hasTime && ` ・ ${entry.start}〜${entry.end}`}</div>
          {onEdit && <button className="ft-entry-edit" onClick={() => onEdit(entry)}><Pencil size={13} /></button>}
        </div>
      )}
      {entry.isGroup && <div className="ft-hint" style={{ marginTop: 2 }}>連続した{Math.round((new Date(entry.dateEnd) - new Date(entry.dateStart)) / 86400000) + 1}日間の合流をまとめて表示しています</div>}
      {entry.comment && <div style={{ fontSize: 12, marginTop: 4 }}>{linkify(entry.comment)}</div>}
      <div className="ft-form-row" style={{ marginTop: 8 }}>
        <div style={{ flex: 1 }}>
          <div className="ft-meet-field-label">回数</div>
          <input className="ft-meet-textarea" style={{ minHeight: "auto" }} value={count} onChange={(e) => setCount(e.target.value)} onBlur={() => onChange(entry, "meetCount", count)} placeholder="例）12回目" />
        </div>
        <div style={{ flex: 1 }}>
          <div className="ft-meet-field-label">行ったお店</div>
          <input className="ft-meet-textarea" style={{ minHeight: "auto" }} value={place} onChange={(e) => setPlace(e.target.value)} onBlur={() => onChange(entry, "meetPlace", place)} placeholder="例）〇〇食堂" />
        </div>
      </div>
      <div className="ft-meet-field-label">備考（相談・段取りメモ）</div>
      <textarea className="ft-meet-textarea" value={plan} onChange={(e) => setPlan(e.target.value)} onBlur={() => onChange(entry, "meetPlan", plan)} />
      {!isFutureDate(targetDate) && (
        <>
          <div className="ft-meet-field-label">思い出の記録</div>
          <textarea className="ft-meet-textarea" value={memory} onChange={(e) => setMemory(e.target.value)} onBlur={() => onChange(entry, "meetMemory", memory)} />
        </>
      )}
      {isFutureDate(targetDate) && <div className="ft-hint" style={{ marginTop: 4 }}>思い出の記録は、当日以降に書けるようになります</div>}
    </div>
  );
}

function MeetupEditor({ entry, onChange }) {
  const [comment, setComment] = useState(entry.comment || "");
  const [plan, setPlan] = useState(entry.meetPlan || "");
  const [memory, setMemory] = useState(entry.meetMemory || "");
  const [count, setCount] = useState(entry.meetCount || "");
  const [place, setPlace] = useState(entry.meetPlace || "");
  // 編集モーダルなど別の場所での保存も、ここの表示に反映されるようにする
  useEffect(() => { setComment(entry.comment || ""); }, [entry.comment]);
  useEffect(() => { setPlan(entry.meetPlan || ""); }, [entry.meetPlan]);
  useEffect(() => { setMemory(entry.meetMemory || ""); }, [entry.meetMemory]);
  useEffect(() => { setCount(entry.meetCount || ""); }, [entry.meetCount]);
  useEffect(() => { setPlace(entry.meetPlace || ""); }, [entry.meetPlace]);
  return (
    <div style={{ width: "100%" }}>
      <div className="ft-meet-field-label">コメント</div>
      <textarea className="ft-meet-textarea" value={comment} onChange={(e) => setComment(e.target.value)} onBlur={() => onChange(entry, "comment", comment)} />
      <div className="ft-form-row" style={{ marginTop: 6 }}>
        <div style={{ flex: 1 }}>
          <div className="ft-meet-field-label">回数</div>
          <input className="ft-meet-textarea" style={{ minHeight: "auto" }} value={count} onChange={(e) => setCount(e.target.value)} onBlur={() => onChange(entry, "meetCount", count)} placeholder="例）12回目" />
        </div>
        <div style={{ flex: 1 }}>
          <div className="ft-meet-field-label">行ったお店</div>
          <input className="ft-meet-textarea" style={{ minHeight: "auto" }} value={place} onChange={(e) => setPlace(e.target.value)} onBlur={() => onChange(entry, "meetPlace", place)} placeholder="例）〇〇食堂" />
        </div>
      </div>
      <div className="ft-meet-field-label">備考（相談・段取りメモ）</div>
      <textarea className="ft-meet-textarea" value={plan} onChange={(e) => setPlan(e.target.value)} onBlur={() => onChange(entry, "meetPlan", plan)} />
      {!isFutureDate(entry.date) && (
        <>
          <div className="ft-meet-field-label">思い出の記録</div>
          <textarea className="ft-meet-textarea" value={memory} onChange={(e) => setMemory(e.target.value)} onBlur={() => onChange(entry, "meetMemory", memory)} />
        </>
      )}
      {isFutureDate(entry.date) && <div className="ft-hint" style={{ marginTop: 4 }}>思い出の記録は、当日以降に書けるようになります</div>}
    </div>
  );
}

function EditEntryModal({ entry, names, onSave, onClose }) {
  const [type, setType] = useState(entry.type);
  const [person, setPerson] = useState(entry.person === "both" ? "a" : entry.person);
  const [hasTime, setHasTime] = useState(entry.hasTime);
  const [start, setStart] = useState(entry.start || "09:00");
  const [end, setEnd] = useState(entry.end || "18:00");
  const [comment, setComment] = useState(entry.comment || "");
  const [meetPlan, setMeetPlan] = useState(entry.meetPlan || "");
  const [meetMemory, setMeetMemory] = useState(entry.meetMemory || "");
  const [meetCount, setMeetCount] = useState(entry.meetCount || "");
  const [meetPlace, setMeetPlace] = useState(entry.meetPlace || "");
  const isMeet = type === "合流";
  const targetDate = entry.isGroup ? entry.dateStart : entry.date;

  function save() {
    onSave({
      type,
      person: isMeet ? "both" : person,
      hasTime,
      start: hasTime ? start : "",
      end: hasTime ? end : "",
      comment,
      meetPlan: isMeet ? meetPlan : "",
      meetMemory: isMeet && !isFutureDate(targetDate) ? meetMemory : "",
      meetCount: isMeet ? meetCount : "",
      meetPlace: isMeet ? meetPlace : "",
    });
  }

  return (
    <div className="ft-modal-backdrop" onClick={onClose}>
      <div className="ft-modal" onClick={(ev) => ev.stopPropagation()}>
        <div className="ft-modal-head">
          <div className="ft-modal-title">予定を編集</div>
          <button className="ft-modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="ft-form" style={{ borderTop: "none", paddingTop: 0, marginTop: 0 }}>
          {!isMeet && (
            <div>
              <label className="ft-label">誰の予定？</label>
              <div className="ft-seg">
                <button className={person === "a" ? "active" : ""} onClick={() => setPerson("a")}>{names.a}</button>
                <button className={person === "b" ? "active" : ""} onClick={() => setPerson("b")}>{names.b}</button>
              </div>
            </div>
          )}
          <div>
            <label className="ft-label">種類</label>
            <div className="ft-type-grid">
              {TYPES.map((t) => { const Icon = t.icon; const isMeetTile = t.key === "合流"; const cls = [isMeetTile ? "meet-tile" : "", type === t.key ? "active" : ""].filter(Boolean).join(" "); return (<button key={t.key} className={cls} onClick={() => setType(t.key)}><Icon size={isMeetTile ? 18 : 15} /> {t.key}</button>); })}
            </div>
          </div>
          <label className="ft-checkrow"><input type="checkbox" checked={hasTime} onChange={(e) => setHasTime(e.target.checked)} />時間を指定する</label>
          {hasTime && (
            <div className="ft-form-row">
              <input type="time" className="ft-input" value={start} onChange={(e) => setStart(e.target.value)} />
              <input type="time" className="ft-input" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          )}
          <div><label className="ft-label">コメント</label><textarea className="ft-input" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} /></div>
          {isMeet && (
            <>
              <div className="ft-form-row">
                <div style={{ flex: 1 }}><label className="ft-label">回数</label><input className="ft-input" value={meetCount} onChange={(e) => setMeetCount(e.target.value)} placeholder="例）12回目" /></div>
                <div style={{ flex: 1 }}><label className="ft-label">行ったお店</label><input className="ft-input" value={meetPlace} onChange={(e) => setMeetPlace(e.target.value)} placeholder="例）〇〇食堂" /></div>
              </div>
              <div><label className="ft-label">備考（相談・段取りメモ）</label><textarea className="ft-input" rows={2} value={meetPlan} onChange={(e) => setMeetPlan(e.target.value)} /></div>
              {!isFutureDate(targetDate) && (
                <div><label className="ft-label">思い出の記録</label><textarea className="ft-input" rows={2} value={meetMemory} onChange={(e) => setMeetMemory(e.target.value)} /></div>
              )}
              {isFutureDate(targetDate) && <div className="ft-hint">思い出の記録は、当日以降に書けるようになります</div>}
            </>
          )}
          <div className="ft-hint">{entry.isGroup ? "連続するすべての日にまとめて反映されます" : "この予定だけが変更されます（連続・繰り返しの他の日には影響しません）"}</div>
          <div className="ft-form-actions">
            <button className="ft-btn-ghost" onClick={onClose}>キャンセル</button>
            <button className="ft-btn-primary" onClick={save}>保存する</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DiaryEditor({ initialText, onSubmit, onDelete }) {
  const [value, setValue] = useState(initialText);
  const [saved, setSaved] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const dirty = value !== initialText;
  function handleSubmit() {
    onSubmit(value);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }
  function handleDelete() {
    onDelete();
    setValue("");
    setConfirmingDelete(false);
  }
  return (
    <>
      <textarea className="ft-input" rows={4} value={value}
        onChange={(e) => { setValue(e.target.value); setSaved(false); }}
        placeholder="今日のことを書く" />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
        <button className="ft-btn-primary" style={{ background: "var(--record)" }} disabled={!dirty} onClick={handleSubmit}>確定して投稿</button>
        {initialText && !confirmingDelete && (
          <button className="ft-btn-ghost" style={{ color: "var(--danger)", borderColor: "var(--danger)" }} onClick={() => setConfirmingDelete(true)}>投稿を削除</button>
        )}
        {confirmingDelete && (
          <>
            <span style={{ fontSize: 11, color: "var(--danger)" }}>本当に削除しますか？</span>
            <button className="ft-btn-primary" style={{ background: "var(--danger)" }} onClick={handleDelete}>削除する</button>
            <button className="ft-btn-ghost" onClick={() => setConfirmingDelete(false)}>キャンセル</button>
          </>
        )}
        {saved && <span style={{ fontSize: 11, color: "var(--record)", fontWeight: 700 }}>✓ 投稿しました</span>}
      </div>
    </>
  );
}
