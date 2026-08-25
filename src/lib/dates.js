export const WEEKDAY_JP = ["日", "月", "火", "水", "木", "金", "土"];

export function pad(n) {
  return String(n).padStart(2, "0");
}
export function dateKey(y, m, d) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}
export function monthKeyOf(dateStr) {
  return dateStr.slice(0, 7);
}
export function uid() {
  return Math.random().toString(36).slice(2, 10);
}
export function todayKeyStr() {
  const t = new Date();
  return dateKey(t.getFullYear(), t.getMonth(), t.getDate());
}
export function isFutureDate(dateStr) {
  return dateStr > todayKeyStr();
}
export function startOfWeek(d) {
  const nd = new Date(d);
  nd.setHours(0, 0, 0, 0);
  nd.setDate(nd.getDate() - nd.getDay());
  return nd;
}
export function addDays(d, n) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
}
export function toKey(d) {
  return dateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

export function buildMonthGrid(y, m) {
  const first = new Date(y, m, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(dateKey(y, m, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function nthWeekdayInMonth(year, monthIdx, weekday, n) {
  const first = new Date(year, monthIdx, 1);
  const firstWeekday = first.getDay();
  const day = 1 + ((7 + weekday - firstWeekday) % 7) + (n - 1) * 7;
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  if (day > daysInMonth) return null;
  return new Date(year, monthIdx, day);
}

export function nthWeekdayLabel(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  const n = Math.ceil(d.getDate() / 7);
  return `毎月第${n}${WEEKDAY_JP[d.getDay()]}曜日`;
}

export function generateRecurrenceDates(startStr, endStr, mode) {
  if (!startStr || !endStr) return [startStr];
  const start = new Date(startStr + "T00:00:00");
  const end = new Date(endStr + "T00:00:00");
  const MAX = 60;
  const dates = [];
  if (end < start) return [];
  if (mode === "weekly" || mode === "biweekly") {
    const step = mode === "weekly" ? 7 : 14;
    let cur = new Date(start);
    while (cur <= end && dates.length < MAX) {
      dates.push(new Date(cur));
      cur = addDays(cur, step);
    }
  } else if (mode === "monthly-date") {
    let y = start.getFullYear(), m = start.getMonth();
    const d0 = start.getDate();
    while (dates.length < MAX) {
      const daysInM = new Date(y, m + 1, 0).getDate();
      const cand = new Date(y, m, Math.min(d0, daysInM));
      if (cand > end) break;
      if (cand >= start) dates.push(cand);
      m += 1;
      if (m > 11) { m = 0; y += 1; }
    }
  } else if (mode === "monthly-nth-weekday") {
    const weekday = start.getDay();
    const n = Math.ceil(start.getDate() / 7);
    let y = start.getFullYear(), m = start.getMonth();
    let guard = 0;
    while (dates.length < MAX && guard < 120) {
      guard++;
      const cand = nthWeekdayInMonth(y, m, weekday, n);
      if (cand) {
        if (cand > end) break;
        if (cand >= start) dates.push(cand);
      }
      m += 1;
      if (m > 11) { m = 0; y += 1; }
    }
  }
  return dates.map(toKey);
}

export function generateSpanDates(startStr, endStr) {
  const start = new Date(startStr + "T00:00:00");
  const end = new Date(endStr + "T00:00:00");
  if (end < start) return [startStr];
  const dates = [];
  let cur = new Date(start);
  let guard = 0;
  while (cur <= end && guard < 60) {
    dates.push(toKey(cur));
    cur = addDays(cur, 1);
    guard++;
  }
  return dates;
}

/* ---- 日本の祝日(固定日・ハッピーマンデー・春分秋分・振替休日・国民の休日) ---- */
function vernalEquinoxDay(year) {
  return Math.floor(20.8431 + 0.242194 * (year - 1980)) - Math.floor((year - 1980) / 4);
}
function autumnalEquinoxDay(year) {
  return Math.floor(23.2488 + 0.242194 * (year - 1980)) - Math.floor((year - 1980) / 4);
}
function buildHolidayMap(year) {
  const map = {};
  const add = (m, d, name) => { map[dateKey(year, m, d)] = name; };
  let d;
  add(0, 1, "元日");
  d = nthWeekdayInMonth(year, 0, 1, 2); if (d) add(d.getMonth(), d.getDate(), "成人の日");
  add(1, 11, "建国記念の日");
  if (year >= 2020) add(1, 23, "天皇誕生日");
  add(2, vernalEquinoxDay(year), "春分の日");
  add(3, 29, year >= 2007 ? "昭和の日" : "みどりの日");
  add(4, 3, "憲法記念日");
  if (year >= 2007) add(4, 4, "みどりの日");
  add(4, 5, "こどもの日");
  d = nthWeekdayInMonth(year, 6, 1, 3); if (d) add(d.getMonth(), d.getDate(), "海の日");
  if (year >= 2016) add(7, 11, "山の日");
  d = nthWeekdayInMonth(year, 8, 1, 3); if (d) add(d.getMonth(), d.getDate(), "敬老の日");
  add(8, autumnalEquinoxDay(year), "秋分の日");
  d = nthWeekdayInMonth(year, 9, 1, 2); if (d) add(d.getMonth(), d.getDate(), year >= 2020 ? "スポーツの日" : "体育の日");
  add(10, 3, "文化の日");
  add(10, 23, "勤労感謝の日");

  Object.keys(map).sort().forEach((dateStr) => {
    const d0 = new Date(dateStr + "T00:00:00");
    const next = toKey(addDays(d0, 1));
    const nextNext = toKey(addDays(d0, 2));
    if (map[dateStr] && map[nextNext] && !map[next]) {
      const nd = new Date(next + "T00:00:00");
      if (nd.getDay() !== 0) map[next] = "国民の休日";
    }
  });
  Object.keys(map).slice().forEach((dateStr) => {
    const d0 = new Date(dateStr + "T00:00:00");
    if (d0.getDay() === 0) {
      let cur = addDays(d0, 1);
      while (map[toKey(cur)]) cur = addDays(cur, 1);
      map[toKey(cur)] = "振替休日";
    }
  });
  return map;
}
const holidayMapCache = {};
export function getHolidayName(dateStr) {
  const year = parseInt(dateStr.slice(0, 4), 10);
  if (!holidayMapCache[year]) holidayMapCache[year] = buildHolidayMap(year);
  return holidayMapCache[year][dateStr] || null;
}
