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

// 1日のうちに4つの能力すべてをきたえたら（2分だけは数えない）もらえるボーナス
export const BALANCE_BONUS = 30;

// その日にきたえた能力と、まだの能力
export function dayBalance(dayLogs) {
  const done = new Set(dayLogs.filter((l) => !l.mini).map((l) => activityById(l.activity).stat));
  const missing = STATS.filter((s) => !done.has(s.id));
  return { done, missing, balanced: missing.length === 0 };
}

export const MISSED_DAY_PENALTY = 20; // 記録ゼロの日1日あたり
export const PENALTY_CAP_RATE = 0.2; // 今週稼いだ経験値の最大20%まで
export const BOSS_HP = 300; // 週ボスの体力
export const BOSS_POWERUP = 0.1; // 倒せなかった週ごとに、次の週のボスHP +10%
export const BOSS_POWERUP_MAX = 3; // 強化は3段階（+30%）まで

// 倒せずに持ち越した回数から、今週のボスHPを決める
export function bossHp(streak) {
  return Math.round(BOSS_HP * (1 + BOSS_POWERUP * Math.min(streak, BOSS_POWERUP_MAX)));
}

// 自分で追加する行動は、経験値を自由に決めず「型」から選ぶ（点数の水増しを防ぐ）
export const KINDS = [
  { id: "time", name: "時間", unit: "分", xpPerUnit: 1, quick: [10, 20, 30], example: "例: 筋トレ、英語のリスニング" },
  { id: "count", name: "回数", unit: "回", xpPerUnit: 15, quick: [1, 2, 3], example: "例: 掃除、日記を書く" },
  { id: "daily", name: "1日1回", unit: "日", xpPerUnit: 10, maxPerDay: 1, example: "例: 早起き、お酒を飲まなかった" },
];

// 追加した行動（削除したものも、過去の記録のために hidden で残す）
let custom = [];

export function customActivity({ id, name, kind, stat, hidden = false }) {
  const k = KINDS.find((x) => x.id === kind);
  return { id, name, kind, stat, hidden, custom: true, unit: k.unit, xpPerUnit: k.xpPerUnit, maxPerDay: k.maxPerDay, quick: k.quick };
}

export function setCustomActivities(list) {
  custom = list.map(customActivity);
}

// 画面に出す行動（削除したものは出さない）
export function allActivities() {
  return [...ACTIVITIES, ...custom.filter((a) => !a.hidden)];
}

export function activityById(id) {
  return ACTIVITIES.find((a) => a.id === id) ?? custom.find((a) => a.id === id);
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
export function weekSummary(logs, startKey, todayKey, hp = BOSS_HP) {
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
      stats[activityById(log.activity).stat] += base;
    }
    const balanced = dayBalance(dayLogs).balanced;
    if (balanced) {
      gross += BALANCE_BONUS;
      dayXp += BALANCE_BONUS;
    }
    const finished = key < todayKey;
    const missed = finished && dayLogs.length === 0;
    if (missed) {
      rawPenalty += MISSED_DAY_PENALTY;
      debt += MISSED_DAY_PENALTY;
    }
    days.push({ key, xp: dayXp, missed, done: dayLogs.length > 0, balanced });
  }

  const penalty = Math.min(rawPenalty, Math.floor(gross * PENALTY_CAP_RATE));
  // 取り返しはペナルティ以上にはならない
  const bonus = Math.min(recovered, penalty);
  const net = gross + bonus - penalty;
  const debtLeft = Math.max(0, penalty - bonus);
  return { startKey, days, gross, penalty, bonus, net, debtLeft, stats, bossHp: hp, bossDefeated: net >= hp };
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
// 倒せなかったボスは次の週も残り、少しずつ強くなる（streak = 持ち越した回数）
export function overall(logs, todayKey) {
  const thisWeek = weekStart(todayKey);
  const first = logs.length ? logs.map((l) => l.date).sort()[0] : todayKey;
  let start = weekStart(first);
  let total = 0;
  const stats = Object.fromEntries(STATS.map((s) => [s.id, 0]));
  let bossesDefeated = 0;
  let streak = 0;
  let current = null;
  while (start <= thisWeek) {
    const end = start === thisWeek ? todayKey : addDays(start, 7);
    const w = weekSummary(logs, start, end, bossHp(streak));
    total += w.net;
    for (const s of STATS) stats[s.id] += w.stats[s.id];
    if (start === thisWeek) current = w;
    else if (w.bossDefeated) {
      bossesDefeated += 1;
      streak = 0;
    } else streak += 1;
    start = addDays(start, 7);
  }
  return { total, stats, bossesDefeated, streak, week: current };
}
