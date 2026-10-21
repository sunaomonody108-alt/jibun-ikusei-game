import {
  ACTIVITIES, STATS, MINI_XP, BOSS_HP, activityById, xpForLog,
  dateKey, overall, levelFromXp,
} from "./game.js";
import { floatText, pulse, attack, banner, countTo } from "./fx.js";

const STORE_KEY = "jibun-game-v1";
const AVATARS = ["🧑", "🧑‍🎓", "🏃", "🧙", "🦸"]; // レベルで見た目が変わる
const BOSSES = ["👾", "🐉", "🦑", "🤖", "👹"];

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { name: "あなたの分身", logs: [], maxLevel: 1 };
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {}
}

const state = load();
let selected = ACTIVITIES[0].id;
const $ = (id) => document.getElementById(id);

function todayKey() {
  return dateKey(new Date());
}

function addLog(log) {
  const before = render();
  state.logs.push({ ...log, id: Date.now() + Math.random(), date: todayKey() });
  save();
  const after = render();
  celebrate(before, after);
}

// 記録したときの演出
function celebrate(before, after) {
  const gain = after.net - before.net;
  const avatar = $("avatar");
  pulse(avatar, "jump");
  floatText(avatar, `+${gain}XP`, "xp");
  const dmg = before.hp - after.hp;
  if (dmg > 0) {
    attack(avatar, $("bossicon"), () => {
      pulse($("bossicon"), after.hp === 0 ? "defeated" : "hit");
      floatText($("bossicon"), `-${dmg}`, "dmg");
    });
  }
  // 重なったときは順番に見せる
  const queue = [];
  if (!before.done && after.done) queue.push(["今日の最低ライン達成", "この調子でいこう", "🔥"]);
  if (after.level > before.level) queue.push(["LEVEL UP!", `Lv.${before.level} → Lv.${after.level}`, avatar.textContent]);
  if (before.hp > 0 && after.hp === 0) queue.push(["ボス撃破！", "今週のボスに勝ちました", "🏆"]);
  queue.forEach((args, i) => setTimeout(() => banner(...args), 900 + i * 2900));
}

function removeLog(id) {
  state.logs = state.logs.filter((l) => l.id !== id);
  save();
  render();
}

function toast(text) {
  const t = $("toast");
  t.textContent = text;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.textContent = ""), 2500);
}

function renderActivities() {
  const box = $("activities");
  box.innerHTML = "";
  for (const a of ACTIVITIES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (a.id === selected ? " on" : "");
    b.textContent = a.name;
    b.onclick = () => {
      selected = a.id;
      renderActivities();
      renderForm();
    };
    box.appendChild(b);
  }
}

function renderForm() {
  const a = activityById(selected);
  $("unit").textContent = `${a.unit}（1${a.unit}=${a.xpPerUnit}XP）`;
  const once = a.maxPerDay === 1;
  $("amount").hidden = once;
  $("amount").value = once ? "1" : "";
  const sel = $("multiplier");
  sel.hidden = !a.multipliers;
  sel.innerHTML = (a.multipliers || [])
    .map((m) => `<option value="${m.id}">${m.name} ×${m.value}</option>`)
    .join("");
}

function render() {
  const today = todayKey();
  const o = overall(state.logs, today);
  const w = o.week;

  // レベルは絶対に下がらない
  const lv = levelFromXp(Math.max(0, o.total));
  state.maxLevel = Math.max(state.maxLevel || 1, lv.level);
  save();
  const shownLevel = state.maxLevel;
  countTo($("level"), shownLevel);
  $("name").textContent = state.name;
  $("avatar").textContent = AVATARS[Math.min(AVATARS.length - 1, Math.floor((shownLevel - 1) / 5))];
  const pct = shownLevel > lv.level ? 0 : Math.round((lv.into / lv.need) * 100);
  $("xpbar").style.width = pct + "%";
  $("xptext").textContent = shownLevel > lv.level
    ? "今週の取り返し中（レベルは下がりません）"
    : `次のレベルまで ${lv.need - lv.into} XP`;

  // 今日と今週
  const todayDone = state.logs.some((l) => l.date === today);
  $("today").innerHTML = todayDone
    ? `<span class="ok">✔ 今日の最低ラインは達成</span>`
    : `<span class="warn">まだ0件です。2分だけでもOK</span>`;
  const names = ["月", "火", "水", "木", "金", "土", "日"];
  $("week").innerHTML = names.map((n, i) => {
    const d = w.days[i];
    const cls = !d ? "future" : d.done ? "done" : d.missed ? "missed" : "pending";
    return `<div class="day ${cls}"><div>${n}</div><div class="dot"></div></div>`;
  }).join("");

  // ボス
  const hp = Math.max(0, BOSS_HP - w.net);
  const weekIndex = o.bossesDefeated;
  $("bossicon").textContent = BOSSES[weekIndex % BOSSES.length];
  $("bossbar").style.width = Math.round((hp / BOSS_HP) * 100) + "%";
  let bossText = hp === 0 ? "撃破！ 今週はもう勝っています" : `残りHP ${hp} / ${BOSS_HP}（今週の経験値でダメージ）`;
  if (w.penalty > 0) bossText += w.debtLeft > 0 ? `｜ペナルティ -${w.penalty}` : `｜ペナルティ -${w.penalty}（取り返し済み）`;
  if (w.debtLeft > 0) bossText += `｜取り返し中: 次の行動は2倍（あと${w.debtLeft}）`;
  $("bosstext").textContent = bossText;

  // 能力
  const maxStat = Math.max(50, ...STATS.map((s) => o.stats[s.id]));
  if (!$("stats").children.length) {
    $("stats").innerHTML = STATS.map((s) => `
      <div class="stat" id="stat-${s.id}">
        <span>${s.name}</span>
        <div class="bar"><div class="fill"></div></div>
        <span class="num"></span>
      </div>`).join("");
  }
  // 要素を作り直さずに値だけ変え、バーが伸びるようにする
  for (const s of STATS) {
    const row = $(`stat-${s.id}`);
    row.querySelector(".fill").style.width = Math.round((o.stats[s.id] / maxStat) * 100) + "%";
    countTo(row.querySelector(".num"), o.stats[s.id]);
  }

  // 今日の記録
  const todayLogs = state.logs.filter((l) => l.date === today);
  $("logs").innerHTML = todayLogs.length ? "" : `<li class="small">まだありません</li>`;
  for (const l of todayLogs) {
    const a = activityById(l.activity);
    const li = document.createElement("li");
    li.innerHTML = `<span>${a.name}${l.mini ? "（2分）" : ` ${l.amount}${a.unit}`}</span><span>+${xpForLog(l)}XP</span>`;
    const del = document.createElement("button");
    del.className = "link";
    del.textContent = "取消";
    del.onclick = () => removeLog(l.id);
    li.appendChild(del);
    $("logs").appendChild(li);
  }

  // 週のまとめ（彼女への報告用）
  const doneDays = w.days.filter((d) => d.done).length;
  const byAct = ACTIVITIES.map((a) => {
    const n = state.logs.filter((l) => l.date >= w.startKey && l.date <= today && l.activity === a.id && !l.mini)
      .reduce((s, l) => s + l.amount, 0);
    return n ? `・${a.name} ${n}${a.unit}` : null;
  }).filter(Boolean);
  $("summary").textContent = [
    `【${state.name}の週報】${w.startKey}〜`,
    `Lv.${shownLevel}｜今週 ${w.net}XP｜記録した日 ${doneDays}/${w.days.length}日`,
    ...byAct,
    hp === 0 ? "ボス撃破！" : `ボス残りHP ${hp}`,
  ].join("\n");

  return { level: shownLevel, hp, net: w.net, done: todayDone };
}

$("logform").onsubmit = (e) => {
  e.preventDefault();
  const a = activityById(selected);
  const amount = Number($("amount").value);
  if (!amount || amount <= 0) {
    toast("量を入れてください");
    return;
  }
  if (a.maxPerDay === 1 && state.logs.some((l) => l.date === todayKey() && l.activity === a.id && !l.mini)) {
    toast("今日はもう記録済みです");
    return;
  }
  const log = { activity: a.id, amount };
  if (a.multipliers) log.multiplier = $("multiplier").value;
  addLog(log);
  toast(`${a.name} +${xpForLog(log)}XP`);
  if (a.maxPerDay !== 1) $("amount").value = "";
};

$("mini").onclick = () => {
  addLog({ activity: selected, amount: 0, mini: true });
  toast(`${activityById(selected).name}（2分）+${MINI_XP}XP`);
};

$("share").onclick = async () => {
  const text = $("summary").textContent;
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
  } catch {}
  try {
    await navigator.clipboard.writeText(text);
    toast("コピーしました");
  } catch {
    toast("コピーできませんでした");
  }
};

$("rename").onclick = () => {
  const n = prompt("分身の名前", state.name);
  if (n) {
    state.name = n.trim().slice(0, 20) || state.name;
    save();
    render();
  }
};

renderActivities();
renderForm();
render();

// 日付が変わったら描き直す
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) render();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
