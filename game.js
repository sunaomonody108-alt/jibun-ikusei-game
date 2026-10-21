// ゲームのルール（画面に依存しない計算だけをここに置く）

export const ACTIVITIES = [
  { id: "reading", name: "読書", unit: "ページ", stat: "int", xpPerUnit: 1, multipliers: [
      { id: "general", name: "一般書", value: 1 },
      { id: "expert", name: "専門書", value: 1.5 },
    ] },
  { id: "study", name: "勉強", unit: "セッション", stat: "int", xpPerUnit: 20 },
  { id: "running", name: "ランニング", unit: "分", stat: "vit", xpPerUnit: 1 },
  { id: "cooking", name: "料理", unit: "回", stat: "life", xpPerUnit: 15 },
  { id: "nosnack", name: "間食しなかった", unit: "日", stat: "will", xpPerUnit: 10, maxPerDay: 1 },
];

// どの行動でも使える「2分だけ」のミニタスク
export const MINI_XP = 5;

export const STATS = [
  { id: "int", name: "知力" },
  { id: "vit", name: "体力" },
  { id: "life", name: "生活力" },
  { id: "will", name: "意志力" },
];

export const MISSED_DAY_PENALTY = 20; // 記録ゼロの日1日あたり
export const PENALTY_CAP_RATE = 0.2; // 今週稼いだ経験値の最大20%まで
export const BOSS_HP = 300; // 週ボスの体力

export function activityById(id) {
  return ACTIVITIES.find((a) => a.id === id);
}

export function xpForLog(log) {
  if (log.mini) return MINI_XP;
  const a = activityById(log.activity);
  const mult = a.multipliers?.find((m) => m.id === log.multiplier)?.value ?? 1;
  return Math.round(log.amount * a.xpPerUnit * mult);
}

// 日付はすべて端末の現地時間の "YYYY-MM-DD"
export function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

// 週は月曜はじまり
export function weekStart(key) {
  const d = parseKey(key);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return dateKey(d);
}

// 1週間分の結果を計算する。
// - 記録ゼロで終わった日はペナルティ（ただし今週稼いだ分の20%まで）
// - ペナルティを受けた後の行動は、受けた分を取り戻すまで経験値2倍
export function weekSummary(logs, startKey, todayKey) {
  const days = [];
  let gross = 0;
  let rawPenalty = 0;
  let recovered = 0;
  let debt = 0;
  const stats = Object.fromEntries(STATS.map((s) => [s.id, 0]));

  for (let i = 0; i < 7; i++) {
    const key = addDays(startKey, i);
    if (key > todayKey) break;
    const dayLogs = logs.filter((l) => l.date === key);
    let dayXp = 0;
    for (const log of dayLogs) {
      const base = xpForLog(log);
      const bonus = Math.min(base, debt);
      debt -= bonus;
      recovered += bonus;
      gross += base;
      dayXp += base + bonus;
      stats[activityById(log.activity).stat] += base + bonus;
    }
    const finished = key < todayKey;
    const missed = finished && dayLogs.length === 0;
    if (missed) {
      rawPenalty += MISSED_DAY_PENALTY;
      debt += MISSED_DAY_PENALTY;
    }
    days.push({ key, xp: dayXp, missed, done: dayLogs.length > 0 });
  }

  const penalty = Math.min(rawPenalty, Math.floor(gross * PENALTY_CAP_RATE));
  // 取り返しはペナルティ以上にはならない
  const bonus = Math.min(recovered, penalty);
  const net = gross + bonus - penalty;
  const debtLeft = Math.max(0, penalty - bonus);
  return { startKey, days, gross, penalty, bonus, net, debtLeft, stats, bossDefeated: net >= BOSS_HP };
}

// レベルn→n+1 に必要な経験値は 50×n
export function levelFromXp(xp) {
  let level = 1;
  let need = 50;
  let rest = xp;
  while (rest >= need) {
    rest -= need;
    level += 1;
    need = 50 * level;
  }
  return { level, into: rest, need };
}

// 全期間の集計。過去の週の結果は確定し、レベルは絶対に下がらない
export function overall(logs, todayKey) {
  const thisWeek = weekStart(todayKey);
  const first = logs.length ? logs.map((l) => l.date).sort()[0] : todayKey;
  let start = weekStart(first);
  let total = 0;
  const stats = Object.fromEntries(STATS.map((s) => [s.id, 0]));
  let bossesDefeated = 0;
  let current = null;
  while (start <= thisWeek) {
    const end = start === thisWeek ? todayKey : addDays(start, 7);
    const w = weekSummary(logs, start, end);
    total += w.net;
    for (const s of STATS) stats[s.id] += w.stats[s.id];
    if (start !== thisWeek && w.bossDefeated) bossesDefeated += 1;
    if (start === thisWeek) current = w;
    start = addDays(start, 7);
  }
  return { total, stats, bossesDefeated, week: current };
}
