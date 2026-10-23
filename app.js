import {
  STATS, KINDS, MINI_XP, BALANCE_BONUS, dayBalance, activityById, allActivities, setCustomActivities, xpForLog,
  dateKey, overall, levelFromXp,
} from "./game.js";
import { PROLOGUE, BOSSES, chapterOf, fragmentQuestion } from "./story.js";
import { floatText, pulse, burst, banner, countTo } from "./fx.js";

const STORE_KEY = "jibun-game-v1";
const AVATARS = ["🧑", "🧑‍🎓", "🏃", "🧙", "🦸"]; // レベルで見た目が変わる
const QUICK = { reading: [10, 20, 50], study: [1, 2, 3], running: [15, 30, 45], cooking: [1, 2, 3] };

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
if (!state.activities) state.activities = [];
setCustomActivities(state.activities);
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let busy = false;

function todayKey() {
  return dateKey(new Date());
}

function bossOf(o) {
  return BOSSES[o.bossesDefeated % BOSSES.length];
}

// ---- メッセージ欄（1文字ずつ表示） ----

async function say(text, { wait = 700 } = {}) {
  const el = $("msg");
  el.textContent = "";
  $("next").hidden = true;
  for (const ch of text) {
    el.textContent += ch;
    await sleep(22);
  }
  $("next").hidden = false;
  await sleep(wait);
}

function sayNow(text) {
  $("msg").textContent = text;
  $("next").hidden = true;
}

// ---- 画面の更新 ----

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
  $("xptext").textContent = shownLevel > lv.level ? "とりかえし中" : `つぎのLvまで ${lv.need - lv.into}`;

  const names = ["月", "火", "水", "木", "金", "土", "日"];
  $("week").innerHTML = names.map((n, i) => {
    const d = w.days[i];
    const cls = !d ? "future" : d.balanced ? "done balanced" : d.done ? "done" : d.missed ? "missed" : "pending";
    return `<span class="day ${cls}" title="${n}"></span>`;
  }).join("");

  const boss = bossOf(o);
  const hp = Math.max(0, w.bossHp - w.net);
  const ratio = hp / w.bossHp;
  // 持ち越して強くなったボスには★が付く
  $("bossname").textContent = boss.name + "★".repeat(Math.min(o.streak, 3));
  $("bosslv").textContent = o.bossesDefeated + 1;
  $("bossicon").textContent = boss.icon;
  $("bossicon").classList.toggle("fainted", hp === 0);
  const bar = $("bosshp");
  bar.style.width = Math.round(ratio * 100) + "%";
  bar.className = "hp-fill " + (ratio > 0.5 ? "high" : ratio > 0.2 ? "mid" : "low");

  const todayLogs = state.logs.filter((l) => l.date === today);
  const todayDone = todayLogs.length > 0;
  const bal = dayBalance(todayLogs);
  $("balance").innerHTML = STATS.map((x) => `<span class="bal${bal.done.has(x.id) ? " on" : ""}">${x.name}</span>`).join("");
  $("balance").classList.toggle("all", bal.balanced);
  // 取りもどした記憶のかけらの数（今週のボスを倒していれば、その分も入る）
  const fragments = o.bossesDefeated + (hp === 0 ? 1 : 0);
  return { level: shownLevel, hp, net: w.net, done: todayDone, bal, todayLogs, w, o, boss, fragments };
}

function idleText(s) {
  if (s.hp === 0) return `${s.boss.name}は たおした！ 今週は もう勝っている。`;
  if (s.w.debtLeft > 0) return `とりかえしチャンス！ 次の行動は 2倍。（あと${s.w.debtLeft}）`;
  if (!s.done) return `${state.name}は どうする？ （2分だけでも OK）`;
  if (!s.bal.balanced) return `${state.name}は どうする？ （まだ: ${s.bal.missing.map((x) => x.name).join("・")}）`;
  return `${state.name}は どうする？ 今日は ぜんぶ そろった！`;
}

// ---- コマンドメニュー ----

function menu(buttons) {
  const box = $("menu");
  box.innerHTML = "";
  box.className = "menu" + (buttons.length > 4 ? " many" : "");
  for (const b of buttons) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "cmd" + (b.cls ? " " + b.cls : "");
    el.innerHTML = b.sub ? `<span>${b.label}</span><small>${b.sub}</small>` : b.label;
    el.onclick = () => {
      if (!busy) b.onClick();
    };
    box.appendChild(el);
  }
}

function mainMenu() {
  sayNow(idleText(render()));
  mainButtons();
}

function mainButtons() {
  menu([
    { label: "たたかう", cls: "fight", onClick: () => moveMenu(false) },
    { label: "2分だけ", cls: "mini", onClick: () => moveMenu(true) },
    { label: "ごほうび", cls: "reward", onClick: rewardSheet },
    { label: "ステータス", onClick: statusSheet },
  ]);
}

// 行動＝わざ
function moveMenu(mini) {
  const s = render();
  const used = new Set(s.todayLogs.filter((l) => !l.mini).map((l) => l.activity));
  sayNow(mini ? "どの行動を 2分だけ やった？" : s.bal.balanced ? "どの わざを つかう？" : `どの わざを つかう？ （まだ: ${s.bal.missing.map((x) => x.name).join("・")}）`);
  menu([
    ...allActivities().map((a) => ({
      label: (used.has(a.id) ? "✓ " : "") + escapeHtml(a.name),
      cls: used.has(a.id) ? "used" : s.bal.done.has(a.stat) ? "" : "need",
      sub: mini ? `+${MINI_XP}XP` : a.maxPerDay === 1 ? `1日 ${a.xpPerUnit}XP` : `1${a.unit} ${a.xpPerUnit}XP`,
      onClick: () => (mini ? act({ activity: a.id, amount: 0, mini: true }) : amountMenu(a)),
    })),
    ...(mini ? [] : [{ label: "＋ 行動を追加", cls: "add", onClick: activitySheet }]),
    { label: "もどる", cls: "back", onClick: mainMenu },
  ]);
}

function amountMenu(a) {
  if (a.maxPerDay === 1) {
    if (state.logs.some((l) => l.date === todayKey() && l.activity === a.id && !l.mini)) {
      sayNow(`${a.name}は 今日は もう つかった！`);
      return;
    }
    act({ activity: a.id, amount: 1 });
    return;
  }
  let multiplier = a.multipliers?.[0].id;
  const draw = () => {
    sayNow(`${a.name}： どれだけ やった？（${a.unit}）`);
    menu([
      ...(a.quick ?? QUICK[a.id]).map((n) => ({
        label: `${n}${a.unit}`,
        onClick: () => act({ activity: a.id, amount: n, multiplier }),
      })),
      { label: "数を入力", onClick: () => {
        const n = Number(prompt(`${a.name}は 何${a.unit}？`, ""));
        if (n > 0) act({ activity: a.id, amount: Math.round(n), multiplier });
      } },
      ...(a.multipliers ? [{
        label: a.multipliers.find((m) => m.id === multiplier).name,
        sub: "タップで切りかえ",
        onClick: () => {
          const i = a.multipliers.findIndex((m) => m.id === multiplier);
          multiplier = a.multipliers[(i + 1) % a.multipliers.length].id;
          draw();
        },
      }] : []),
      { label: "もどる", cls: "back", onClick: () => moveMenu(false) },
    ]);
  };
  draw();
}

// ---- わざを使う（記録して戦闘演出） ----

async function act(log) {
  busy = true;
  mainButtons();
  $("menu").classList.add("locked");
  const before = render();
  state.logs.push({ ...log, id: Date.now() + Math.random(), date: todayKey() });
  save();
  const a = activityById(log.activity);
  const what = log.mini ? `${a.name}を 2分だけ やった` : a.maxPerDay === 1 ? a.name : `${a.name} ${log.amount}${a.unit}`;
  await say(`${state.name}の ${what}！`, { wait: 200 });

  // 自分が前に出て、ボスが点滅する
  const avatar = $("avatar");
  const enemy = $("bossicon");
  pulse(avatar, "lunge");
  await sleep(280);
  const after = render();
  const dmg = before.hp - after.hp;
  const gain = after.net - before.net;
  if (dmg > 0) {
    pulse(enemy, "hit");
    const r = enemy.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, ["💥", "✦", "⭐"], 8, 60);
    floatText(enemy, `-${dmg}`, "dmg");
  }
  floatText(avatar, `+${gain}XP`, "xp");
  await sleep(500);
  const newlyBalanced = !before.bal.balanced && after.bal.balanced;
  if (gain - (newlyBalanced ? BALANCE_BONUS : 0) > xpForLog(log)) await say("とりかえしボーナス！ 経験値が 2倍！");
  if (dmg > 0) await say(`${before.boss.name}に ${dmg}の ダメージ！`);

  if (newlyBalanced) {
    burst(innerWidth / 2, innerHeight / 3, ["🌈", "✨", "⭐", "💫"], 24, 160);
    await say(`4つの能力が そろった！ バランスボーナス +${BALANCE_BONUS}XP！`, { wait: 400 });
    banner("パーフェクトデイ！", `4つの能力を ぜんぶ きたえた +${BALANCE_BONUS}XP`, "🌈");
    await sleep(2600);
  }
  if (before.hp > 0 && after.hp === 0) {
    pulse(enemy, "defeated");
    await say(`${before.boss.name}を たおした！`, { wait: 400 });
    banner("ボス撃破！", "今週のボスに勝ちました", "🏆");
    await sleep(2600);
    await say(`記憶のかけら #${after.fragments}を 取りもどした！`);
  }
  if (after.level > before.level) {
    pulse(avatar, "levelup");
    await say(`${state.name}は レベル${after.level}に あがった！`, { wait: 400 });
    banner("LEVEL UP!", `Lv.${before.level} → Lv.${after.level}`, avatar.textContent);
    await sleep(2600);
    const unlocked = rewards().filter((r) => !r.used && r.level > before.level && r.level <= after.level);
    for (const r of unlocked) await say(`ごほうび「${r.name}」が 解放された！`);
  }
  if (!before.done && after.done) await say("今日の 最低ラインを 達成した！");

  $("menu").classList.remove("locked");
  busy = false;
  mainMenu();
  if (before.hp > 0 && after.hp === 0) fragmentSheet(after.fragments - 1);
}

// ---- サブ画面 ----

function openSheet(html) {
  $("sheetbody").innerHTML = html;
  $("sheet").hidden = false;
}

$("sheetclose").onclick = () => {
  $("sheet").hidden = true;
  mainMenu();
};

function statusSheet() {
  const s = render();
  const today = todayKey();
  const maxStat = Math.max(50, ...STATS.map((x) => s.o.stats[x.id]));
  const logs = state.logs.filter((l) => l.date === today);
  openSheet(`
    <h2>${state.name}　Lv${s.level}</h2>
    ${STATS.map((x) => `
      <div class="stat">
        <span>${x.name}</span>
        <div class="hp-track"><div class="hp-fill stat-fill" style="width:${Math.round((s.o.stats[x.id] / maxStat) * 100)}%"></div></div>
        <span class="num">${s.o.stats[x.id]}</span>
      </div>`).join("")}
    <h2>今日の記録</h2>
    <ul class="logs">
      ${logs.length ? logs.map((l) => {
        const a = activityById(l.activity);
        return `<li><span>${escapeHtml(a.name)}${l.mini ? "（2分）" : a.maxPerDay === 1 ? "" : ` ${l.amount}${a.unit}`}</span><span>+${xpForLog(l)}</span><button type="button" class="link" data-del="${l.id}">取消</button></li>`;
      }).join("") : "<li>まだありません</li>"}
    </ul>
    <button type="button" class="cmd wide" id="openstory">ものがたり・記憶のかけら（${s.fragments}）</button>
    <button type="button" class="cmd wide" id="openreport">週報を見る・送る</button>
    <button type="button" class="cmd wide" id="openremind">⏰ 毎日の通知を入れる</button>
    <button type="button" class="link" id="rename">名前を変える</button>
  `);
  $("sheetbody").querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = () => {
      state.logs = state.logs.filter((l) => String(l.id) !== b.dataset.del);
      save();
      statusSheet();
    };
  });
  $("openstory").onclick = storySheet;
  $("openreport").onclick = reportSheet;
  $("openremind").onclick = reminderSheet;
  $("rename").onclick = () => {
    const n = prompt("分身の名前", state.name);
    if (n && n.trim()) {
      state.name = n.trim().slice(0, 12);
      save();
      statusSheet();
    }
  };
}

// ---- ごほうびショップ ----
// 自分で決めた現実のごほうびを、決めたレベルで解放する

function rewards() {
  if (!state.rewards) state.rewards = [];
  return state.rewards;
}

function escapeHtml(t) {
  return t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function rewardSheet() {
  const s = render();
  const list = [...rewards()].sort((a, b) => a.used - b.used || a.level - b.level);
  const row = (r) => {
    const open = s.level >= r.level;
    const status = r.used ? `<span class="tag used">使った</span>`
      : open ? `<button type="button" class="cmd use" data-use="${r.id}">つかう</button>`
      : `<span class="tag lock">🔒 あと${r.level - s.level}Lv</span>`;
    return `<li class="${r.used ? "is-used" : open ? "is-open" : ""}"><span class="rlv">Lv${r.level}</span><span class="rname">${escapeHtml(r.name)}</span>${status}<button type="button" class="link" data-rm="${r.id}">削除</button></li>`;
  };
  openSheet(`
    <h2>ごほうびショップ　（いま Lv${s.level}）</h2>
    <p class="small">現実のごほうびと、解放するレベルを自分で決めます。レベルが届いたら使えます。</p>
    <ul class="logs rewards">${list.length ? list.map(row).join("") : "<li>まだありません。下から追加してください。</li>"}</ul>
    <h2>ごほうびを追加</h2>
    <div class="addrow">
      <input id="rname" maxlength="30" placeholder="例: 欲しかった本を買う">
      <input id="rlevel" type="number" inputmode="numeric" min="2" value="${s.level + 2}">
      <button type="button" class="cmd" id="radd">追加</button>
    </div>
    <p class="small" id="rmsg"></p>
  `);
  const body = $("sheetbody");
  body.querySelectorAll("[data-use]").forEach((b) => {
    b.onclick = () => {
      const r = rewards().find((x) => x.id === b.dataset.use);
      if (!confirm(`「${r.name}」を使いますか？`)) return;
      r.used = true;
      r.usedAt = todayKey();
      save();
      banner("ごほうび！", r.name, "🎁");
      rewardSheet();
    };
  });
  body.querySelectorAll("[data-rm]").forEach((b) => {
    b.onclick = () => {
      state.rewards = rewards().filter((x) => x.id !== b.dataset.rm);
      save();
      rewardSheet();
    };
  });
  $("radd").onclick = () => {
    const name = $("rname").value.trim();
    const level = Math.round(Number($("rlevel").value));
    if (!name) return ($("rmsg").textContent = "ごほうびの名前を入れてください");
    if (!(level > s.level)) return ($("rmsg").textContent = `今のレベル（Lv${s.level}）より上にしてください`);
    rewards().push({ id: String(Date.now()), name, level, used: false });
    save();
    rewardSheet();
  };
}

// ---- 行動（わざ）の追加・削除 ----
// 経験値は自由に決めず「時間・回数・1日1回」の型から選ぶ

function activitySheet() {
  let kind = KINDS[0].id;
  let stat = STATS[0].id;
  const mine = state.activities.filter((a) => !a.hidden);
  const draw = () => {
    const k = KINDS.find((x) => x.id === kind);
    openSheet(`
      <h2>行動（わざ）を追加</h2>
      <div class="addrow"><input id="aname" maxlength="12" placeholder="${k.example.split("、")[0]}"></div>
      <p class="small">記録のしかた</p>
      <div class="choices">${KINDS.map((x) => `<button type="button" class="chip${x.id === kind ? " on" : ""}" data-kind="${x.id}">${x.name}<small>${x.maxPerDay ? `1日 ${x.xpPerUnit}XP` : `1${x.unit} ${x.xpPerUnit}XP`}</small></button>`).join("")}</div>
      <p class="small">${k.example}</p>
      <p class="small">きたえる能力</p>
      <div class="choices">${STATS.map((x) => `<button type="button" class="chip${x.id === stat ? " on" : ""}" data-stat="${x.id}">${x.name}</button>`).join("")}</div>
      <button type="button" class="cmd wide" id="aadd">この わざを おぼえる</button>
      <p class="small" id="amsg"></p>
      <h2>追加した行動</h2>
      <ul class="logs">${mine.length ? mine.map((a) => {
        const x = KINDS.find((y) => y.id === a.kind);
        return `<li><span>${escapeHtml(a.name)}</span><span class="small">${x.name}・${STATS.find((y) => y.id === a.stat).name}</span><button type="button" class="link" data-forget="${a.id}">削除</button></li>`;
      }).join("") : "<li>まだありません</li>"}</ul>
      <p class="small">削除しても、これまでの記録と経験値は消えません。</p>
    `);
    const body = $("sheetbody");
    const name = $("aname");
    const keep = () => name.value;
    body.querySelectorAll("[data-kind]").forEach((b) => {
      b.onclick = () => { const v = keep(); kind = b.dataset.kind; draw(); $("aname").value = v; };
    });
    body.querySelectorAll("[data-stat]").forEach((b) => {
      b.onclick = () => { const v = keep(); stat = b.dataset.stat; draw(); $("aname").value = v; };
    });
    body.querySelectorAll("[data-forget]").forEach((b) => {
      b.onclick = () => {
        const a = state.activities.find((x) => x.id === b.dataset.forget);
        if (!confirm(`「${a.name}」を わざから 外しますか？`)) return;
        a.hidden = true;
        setCustomActivities(state.activities);
        save();
        activitySheet();
      };
    });
    $("aadd").onclick = () => {
      const n = name.value.trim();
      if (!n) return ($("amsg").textContent = "行動の名前を入れてください");
      if (allActivities().some((a) => a.name === n)) return ($("amsg").textContent = "同じ名前の行動が もうあります");
      state.activities.push({ id: "c" + Date.now(), name: n, kind, stat });
      setCustomActivities(state.activities);
      save();
      $("sheet").hidden = true;
      moveMenu(false);
      sayNow(`${state.name}は あたらしい わざ「${n}」を おぼえた！`);
    };
  };
  draw();
}

// ---- やり忘れ防止の通知 ----
// サーバーがないので、毎日くり返す予定（.ics）をスマホのカレンダーに入れて通知してもらう

function reminderIcs(time) {
  const [h, m] = time.split(":");
  const d = new Date();
  const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const url = location.href.split("#")[0].split("?")[0];
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//jibun-ikusei-game//JA", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:jibun-game-reminder-${h}${m}@jibun-ikusei-game`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${day}T${h}${m}00`,
    "DURATION:PT5M",
    "RRULE:FREQ=DAILY",
    "SUMMARY:⚔️ 今日の1手（自分育成ゲーム）",
    `DESCRIPTION:ボスが待っている。2分だけでもOK。\\n${url}`,
    `URL:${url}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:今日の1手", "TRIGGER:PT0M", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].map(foldLine).join("\r\n");
}

// .ics は1行75バイトまでなので、長い行は折り返す（続きの行は空白で始める）
function foldLine(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = "";
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
    }
    cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

function reminderSheet() {
  openSheet(`
    <h2>⏰ 毎日の通知</h2>
    <p class="small">毎日くり返す予定を、スマホのカレンダーに入れます。その時間になると、カレンダーが通知してくれます。</p>
    <div class="addrow"><input id="rtime" type="time" value="${state.reminderTime ?? "21:00"}"><button type="button" class="cmd" id="rmake">カレンダーに入れる</button></div>
    <p class="small" id="rremsg"></p>
    <p class="small">・やった日にも通知は来ます。<br>・やめたいときは、カレンダーから予定を削除してください。<br>・時間を変えたいときは、古い予定を削除してから入れなおしてください。</p>
  `);
  $("rmake").onclick = async () => {
    const time = $("rtime").value || "21:00";
    state.reminderTime = time;
    save();
    const file = new File([reminderIcs(time)], "jibun-game-reminder.ics", { type: "text/calendar" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "毎日の通知" });
        $("rremsg").textContent = "カレンダーを選んで追加してください";
        return;
      }
    } catch {}
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    $("rremsg").textContent = "ファイルを開いて、カレンダーに追加してください";
  };
}

// ---- ものがたり ----
// ボスを倒すと「未来の自分」の記憶のかけらが1つもどる。中身は自分への問い

function answers() {
  if (!state.answers) state.answers = {};
  return state.answers;
}

function fragmentSheet(i) {
  openSheet(`
    <h2>記憶のかけら #${i + 1}</h2>
    <p class="question">${fragmentQuestion(i)}</p>
    <textarea id="answer" rows="4" maxlength="300" placeholder="思いついたことを ひとことでOK">${escapeHtml(answers()[i] ?? "")}</textarea>
    <button type="button" class="cmd wide" id="saveanswer">記憶に きざむ</button>
    <p class="small">答えは あとから 書いても、書きかえても かまいません。</p>
  `);
  $("saveanswer").onclick = () => {
    const t = $("answer").value.trim();
    if (t) answers()[i] = t;
    else delete answers()[i];
    save();
    storySheet();
  };
}

function storySheet() {
  const s = render();
  const c = chapterOf(s.o.bossesDefeated);
  const items = Array.from({ length: s.fragments }, (_, i) => {
    const a = answers()[i];
    return `<li><span>#${i + 1} ${fragmentQuestion(i)}<br><span class="${a ? "ans" : "small"}">${a ? escapeHtml(a) : "（まだ答えていない）"}</span></span><button type="button" class="link" data-frag="${i}">書く</button></li>`;
  });
  openSheet(`
    <h2>第${c.no}章「${c.title}」</h2>
    <p class="small">${c.text}</p>
    <p class="small">いまの敵: ${s.boss.name}（${s.boss.line}）</p>
    <h2>記憶のかけら（${s.fragments}）</h2>
    <ul class="logs story">${items.length ? items.join("") : "<li>まだありません。今週のボスを たおすと 1つ もどります。</li>"}</ul>
    <button type="button" class="link" id="prologue">はじまりの話を 読む</button>
    <p class="small" id="prologuetext" hidden>${PROLOGUE.join("<br>")}</p>
  `);
  $("sheetbody").querySelectorAll("[data-frag]").forEach((b) => {
    b.onclick = () => fragmentSheet(Number(b.dataset.frag));
  });
  $("prologue").onclick = () => ($("prologuetext").hidden = false);
}

function reportText(s) {
  const today = todayKey();
  const doneDays = s.w.days.filter((d) => d.done).length;
  const weekLogs = state.logs.filter((l) => l.date >= s.w.startKey && l.date <= today && !l.mini);
  const byAct = [...new Set(weekLogs.map((l) => l.activity))].map(activityById).map((a) => {
    const n = weekLogs.filter((l) => l.activity === a.id).reduce((sum, l) => sum + l.amount, 0);
    return n ? `・${a.name} ${n}${a.unit}` : null;
  }).filter(Boolean);
  return [
    `【${state.name}の週報】${s.w.startKey}〜`,
    `Lv.${s.level}｜今週 ${s.w.net}XP｜記録した日 ${doneDays}/${s.w.days.length}日`,
    ...byAct,
    s.hp === 0 ? `${s.boss.name}を撃破！` : `${s.boss.name} 残りHP ${s.hp}`,
    `第${chapterOf(s.o.bossesDefeated).no}章｜記憶のかけら ${s.fragments}個`,
  ].join("\n");
}

function reportSheet() {
  const text = reportText(render());
  openSheet(`<h2>週報</h2><pre class="summary">${escapeHtml(text)}</pre><button type="button" class="cmd wide" id="share">送る・コピー</button><p class="small" id="sharemsg"></p>`);
  $("share").onclick = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch {}
    try {
      await navigator.clipboard.writeText(text);
      $("sharemsg").textContent = "コピーしました";
    } catch {
      $("sharemsg").textContent = "コピーできませんでした";
    }
  };
}

// ---- 起動 ----

async function intro() {
  busy = true;
  const s = render();
  // はじめて開いたときだけ、はじまりの話
  if (!state.seenPrologue) {
    for (const line of PROLOGUE) await say(line, { wait: 900 });
    state.seenPrologue = true;
    save();
  }
  // 新しい章に入ったら、章の話を1回だけ
  const c = chapterOf(s.o.bossesDefeated);
  if ((state.seenChapter ?? 1) < c.no) {
    await say(`第${c.no}章「${c.title}」`, { wait: 500 });
    await say(c.text);
    state.seenChapter = c.no;
    save();
  }
  await say(`あ！ やせいの ${s.boss.name}が あらわれた！`, { wait: 500 });
  if (s.o.streak > 0 && s.hp > 0) {
    await say(`${s.boss.name}は 先週から 居すわり、パワーアップした！（HP ${s.w.bossHp}）`);
  } else if (s.hp > 0) {
    await say(`${s.boss.name}は ${s.boss.line}`);
  }
  if (s.w.penalty > 0 && s.w.debtLeft > 0) {
    await say(`記録のない日が あった… 経験値が ${s.w.penalty} へった！`);
  }
  busy = false;
  mainMenu();
}

intro();

// 日付が変わったら描き直す
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !busy && $("sheet").hidden) mainMenu();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
