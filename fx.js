// 演出（アニメーション）だけを扱う。ゲームのルールには影響しない

const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function center(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function layer() {
  let el = document.getElementById("fx-layer");
  if (!el) {
    el = document.createElement("div");
    el.id = "fx-layer";
    document.body.appendChild(el);
  }
  return el;
}

// 要素から数字がふわっと浮かぶ
export function floatText(anchor, text, kind) {
  const p = center(anchor);
  const el = document.createElement("div");
  el.className = `fx-float ${kind}`;
  el.textContent = text;
  el.style.left = p.x + "px";
  el.style.top = p.y + "px";
  layer().appendChild(el);
  const anim = el.animate(
    [
      { transform: "translate(-50%, -50%) scale(.6)", opacity: 0 },
      { transform: "translate(-50%, -110%) scale(1.25)", opacity: 1, offset: 0.25 },
      { transform: "translate(-50%, -260%) scale(1)", opacity: 0 },
    ],
    { duration: reduced() ? 600 : 1100, easing: "cubic-bezier(.2,.8,.3,1)" }
  );
  anim.onfinish = () => el.remove();
}

// CSSのクラスを一度だけ付けて演出を再生する
export function pulse(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth; // 同じクラスでも再生し直す
  el.classList.add(cls);
  el.addEventListener("animationend", () => el.classList.remove(cls), { once: true });
}

// 相棒からボスへ攻撃が飛ぶ。着弾したら onHit を呼ぶ
export function attack(from, to, onHit) {
  if (reduced()) {
    onHit();
    return;
  }
  const a = center(from);
  const b = center(to);
  const el = document.createElement("div");
  el.className = "fx-shot";
  el.textContent = "✨";
  el.style.left = a.x + "px";
  el.style.top = a.y + "px";
  layer().appendChild(el);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const anim = el.animate(
    [
      { transform: "translate(-50%, -50%) scale(.5) rotate(0deg)" },
      { transform: `translate(calc(-50% + ${dx * 0.5 + 60}px), calc(-50% + ${dy * 0.5}px)) scale(1.4) rotate(180deg)`, offset: 0.5 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1) rotate(360deg)` },
    ],
    { duration: 650, easing: "ease-in" }
  );
  anim.onfinish = () => {
    el.remove();
    burst(b.x, b.y, ["💥", "⭐", "✦"], 8, 70);
    onHit();
  };
}

// 小さな粒を散らす
export function burst(x, y, chars, count, spread) {
  if (reduced()) return;
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "fx-particle";
    el.textContent = chars[i % chars.length];
    el.style.left = x + "px";
    el.style.top = y + "px";
    layer().appendChild(el);
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const dist = spread * (0.6 + Math.random() * 0.6);
    const anim = el.animate(
      [
        { transform: "translate(-50%, -50%) scale(.4)", opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist}px)) scale(1)`, opacity: 0 },
      ],
      { duration: 700 + Math.random() * 300, easing: "cubic-bezier(.1,.7,.3,1)" }
    );
    anim.onfinish = () => el.remove();
  }
}

// 紙吹雪
function confetti() {
  if (reduced()) return;
  const colors = ["#3b6cf6", "#f6c23b", "#1f9d55", "#d64545", "#a35cf6"];
  for (let i = 0; i < 60; i++) {
    const el = document.createElement("div");
    el.className = "fx-confetti";
    el.style.left = Math.random() * 100 + "vw";
    el.style.background = colors[i % colors.length];
    layer().appendChild(el);
    const drift = (Math.random() - 0.5) * 160;
    const anim = el.animate(
      [
        { transform: "translate(0, -10vh) rotate(0deg)", opacity: 1 },
        { transform: `translate(${drift}px, 105vh) rotate(${600 + Math.random() * 600}deg)`, opacity: 0.9 },
      ],
      { duration: 1800 + Math.random() * 1400, delay: Math.random() * 300, easing: "cubic-bezier(.3,.1,.6,1)" }
    );
    anim.onfinish = () => el.remove();
  }
}

// 画面中央の大きな演出。タップで閉じる
export function banner(title, sub, icon) {
  const el = document.createElement("div");
  el.className = "fx-banner";
  el.innerHTML = `<div class="fx-banner-box"><div class="fx-banner-icon">${icon}</div><div class="fx-banner-title">${title}</div><div class="fx-banner-sub">${sub}</div></div>`;
  layer().appendChild(el);
  confetti();
  const close = () => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 300);
  };
  el.onclick = close;
  setTimeout(close, 2600);
}

// 数字をカウントアップさせる
export function countTo(el, to) {
  const from = Number(el.dataset.value ?? to);
  el.dataset.value = to;
  if (from === to || reduced()) {
    el.textContent = to;
    return;
  }
  const start = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - start) / 600);
    el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
