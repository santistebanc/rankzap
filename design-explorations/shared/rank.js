/* Rankzap design explorations: shared interaction layer (mockups only).
   [data-rank-list]  drag (pointer) or Arrow keys to rank, with FLIP reflow
   [data-results]    live tally built from real ballots; re-sorts with FLIP on every new vote
   [data-method]     buttons that switch the counting method of the screen's [data-results]
   ?only=<screen>    renders a single phone (used by the comparison index) */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cssVar = (el, name, fallback) => getComputedStyle(el).getPropertyValue(name).trim() || fallback;
  const ordinal = (n) => {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  const format = (list, i) => {
    const f = list.dataset.num;
    if (f === "ordinal") return ordinal(i + 1);
    if (f === "pad") return String(i + 1).padStart(2, "0");
    return String(i + 1);
  };
  const itemsOf = (list) => [...list.querySelectorAll(":scope > [data-item]")];

  function renumber(list) {
    itemsOf(list).forEach((it, i) => {
      it.style.setProperty("--i", i);
      it.querySelectorAll("[data-rank]").forEach((r) => (r.textContent = format(list, i)));
    });
    list.dispatchEvent(new CustomEvent("rank-change", { bubbles: true }));
  }

  // Run `mutate`, then animate `els` from where they were to where they are now.
  function flip(els, mutate, opts = { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" }) {
    const first = new Map(els.map((e) => [e, e.getBoundingClientRect().top]));
    mutate();
    if (reduce) return;
    els.forEach((e) => {
      const d = first.get(e) - e.getBoundingClientRect().top;
      if (Math.abs(d) > 0.5) e.animate([{ translate: `0 ${d}px` }, { translate: "0 0" }], opts);
    });
  }

  function sortable(list) {
    renumber(list);
    const swapOpts = () => ({
      duration: +cssVar(list, "--swap-ms", 180),
      easing: cssVar(list, "--swap-ease", "cubic-bezier(.2,.8,.2,1)"),
    });

    list.addEventListener("pointerdown", (e) => {
      const item = e.target.closest("[data-item]");
      if (!item || item.parentElement !== list || e.button !== 0) return;
      if (e.target.closest("button, a, input")) return;
      e.preventDefault();
      item.focus({ preventScroll: true });
      let startY = e.clientY;
      item.setPointerCapture(e.pointerId);
      item.classList.add("is-dragging");
      list.classList.add("is-sorting");

      const move = (ev) => {
        const y = ev.clientY - startY;
        item.style.translate = `0 ${y}px`;
        const mid = item.offsetTop + y + item.offsetHeight / 2;
        const next = item.nextElementSibling?.matches("[data-item]") ? item.nextElementSibling : null;
        const prev = item.previousElementSibling?.matches("[data-item]") ? item.previousElementSibling : null;
        let target = null;
        if (next && mid > next.offsetTop + next.offsetHeight / 2) target = next;
        else if (prev && mid < prev.offsetTop + prev.offsetHeight / 2) target = prev;
        if (!target) return;
        const before = item.offsetTop;
        const others = itemsOf(list).filter((o) => o !== item);
        const firsts = new Map(others.map((o) => [o, o.offsetTop]));
        if (target === next) list.insertBefore(next, item);
        else list.insertBefore(item, prev);
        renumber(list);
        startY += item.offsetTop - before;
        item.style.translate = `0 ${ev.clientY - startY}px`;
        if (!reduce) {
          others.forEach((o) => {
            const d = firsts.get(o) - o.offsetTop;
            if (d) o.animate([{ translate: `0 ${d}px` }, { translate: "0 0" }], swapOpts());
          });
        }
        navigator.vibrate?.(6);
      };
      const up = (ev) => {
        item.removeEventListener("pointermove", move);
        item.removeEventListener("pointerup", up);
        item.removeEventListener("pointercancel", up);
        const y = ev.clientY - startY;
        item.style.translate = "";
        item.classList.remove("is-dragging");
        list.classList.remove("is-sorting");
        if (!reduce && Math.abs(y) > 0.5) {
          item.animate([{ translate: `0 ${y}px` }, { translate: "0 0" }], {
            duration: +cssVar(list, "--drop-ms", 260),
            easing: cssVar(list, "--drop-ease", "cubic-bezier(.3,1.35,.5,1)"),
          });
        }
        list.dispatchEvent(new CustomEvent("rank-drop", { bubbles: true, detail: { item } }));
      };
      item.addEventListener("pointermove", move);
      item.addEventListener("pointerup", up);
      item.addEventListener("pointercancel", up);
    });

    list.addEventListener("keydown", (e) => {
      const item = e.target.closest("[data-item]");
      if (!item || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      e.preventDefault();
      const sib = e.key === "ArrowUp" ? item.previousElementSibling : item.nextElementSibling;
      if (!sib?.matches("[data-item]")) return;
      flip(itemsOf(list), () => {
        if (e.key === "ArrowUp") list.insertBefore(item, sib);
        else list.insertBefore(sib, item);
        renumber(list);
      }, swapOpts());
      item.focus({ preventScroll: true });
      list.dispatchEvent(new CustomEvent("rank-drop", { bubbles: true, detail: { item } }));
    });
  }

  /* ---------- Live tally from real ballots ---------- */
  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const TEMPLATES = [
    // Shared seed ballots so every direction shows the same count.
    [5, ["walk", "coffee", "write", "stretch", "breakfast", "messages"]],
    [4, ["coffee", "breakfast", "walk", "messages", "write", "stretch"]],
    [3, ["write", "walk", "stretch", "breakfast", "messages", "coffee"]],
    [2, ["coffee", "walk", "messages", "breakfast", "stretch", "write"]],
  ];

  function tally(ballots, ids, method) {
    const score = Object.fromEntries(ids.map((id) => [id, 0]));
    const n = ids.length;
    if (method === "copeland") {
      const pos = ballots.map((b) => Object.fromEntries(b.map((id, i) => [id, i])));
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
        let wa = 0, wb = 0;
        pos.forEach((p) => (p[ids[a]] < p[ids[b]] ? wa++ : wb++));
        if (wa > wb) score[ids[a]] += 1;
        else if (wb > wa) score[ids[b]] += 1;
        else { score[ids[a]] += 0.5; score[ids[b]] += 0.5; }
      }
    } else {
      ballots.forEach((b) => b.forEach((id, i) => {
        score[id] += method === "dowdall" ? 1 / (i + 1) : n - 1 - i;
      }));
    }
    return score;
  }

  const fmtScore = (v, method) =>
    method === "dowdall" ? v.toFixed(1) : Number.isInteger(v) ? String(v) : v.toFixed(1);

  function results(board) {
    const screen = board.closest(".screen") || document;
    const rows = () => [...board.querySelectorAll(":scope > [data-opt]")];
    const ids = rows().map((r) => r.dataset.opt);
    const bias = Object.fromEntries(rows().map((r) => [r.dataset.opt, +(r.dataset.bias || 1)]));
    const rand = rng(+(board.dataset.seed || 7));
    const ballots = [];
    TEMPLATES.forEach(([count, order]) => {
      for (let i = 0; i < count; i++) ballots.push(order.filter((id) => ids.includes(id)));
    });
    let method = board.dataset.method || "borda";
    let lastScores = null;

    const randomBallot = () => {
      const left = [...ids], out = [];
      while (left.length) {
        const total = left.reduce((s, id) => s + bias[id], 0);
        let r = rand() * total, k = 0;
        while ((r -= bias[left[k]]) > 0) k++;
        out.push(left.splice(k, 1)[0]);
      }
      return out;
    };

    function render(animate) {
      const score = tally(ballots, ids, method);
      const firsts = Object.fromEntries(ids.map((id) => [id, ballots.filter((b) => b[0] === id).length]));
      const max = Math.max(...Object.values(score), 1);
      const order = [...rows()].sort((a, b) => score[b.dataset.opt] - score[a.dataset.opt]);
      const apply = () => {
        order.forEach((row, i) => {
          const id = row.dataset.opt;
          board.appendChild(row);
          row.style.setProperty("--share", (score[id] / max).toFixed(3));
          row.style.setProperty("--first-share", (firsts[id] / ballots.length).toFixed(3));
          row.style.setProperty("--i", i);
          row.toggleAttribute("data-leading", i === 0);
          row.querySelectorAll("[data-score]").forEach((s) => (s.textContent = fmtScore(score[id], method)));
          row.querySelectorAll("[data-place]").forEach((s) => (s.textContent = board.dataset.num === "ordinal" ? ordinal(i + 1) : i + 1));
          row.querySelectorAll("[data-firsts]").forEach((s) => (s.textContent = firsts[id]));
          if (lastScores && score[id] > lastScores[id] && method !== "copeland") {
            const delta = score[id] - lastScores[id];
            row.querySelectorAll("[data-delta]").forEach((s) => (s.textContent = "+" + fmtScore(delta, method)));
            row.classList.remove("is-bumped"); void row.offsetWidth; row.classList.add("is-bumped");
          }
        });
      };
      if (animate) flip(rows(), apply, { duration: +cssVar(board, "--swap-ms", 420), easing: cssVar(board, "--swap-ease", "cubic-bezier(.2,.8,.2,1)") });
      else apply();
      lastScores = score;
      const lead = order[0];
      screen.querySelectorAll("[data-leader]").forEach((s) => (s.textContent = lead.dataset.name));
      screen.querySelectorAll("[data-leader-score]").forEach((s) => (s.textContent = fmtScore(score[lead.dataset.opt], method)));
      screen.querySelectorAll("[data-votes]").forEach((s) => (s.textContent = ballots.length));
      board.dispatchEvent(new CustomEvent("tally", { bubbles: true, detail: { score, order: order.map((r) => r.dataset.opt), ballots } }));
    }

    screen.querySelectorAll("[data-method]").forEach((btn) => {
      btn.setAttribute("aria-pressed", btn.dataset.method === method);
      btn.addEventListener("click", () => {
        method = btn.dataset.method;
        lastScores = null;
        screen.querySelectorAll("[data-method]").forEach((b) => b.setAttribute("aria-pressed", b === btn));
        screen.querySelectorAll("[data-method-name]").forEach((s) => (s.textContent = btn.dataset.label || btn.textContent));
        render(true);
      });
    });

    render(false);
    const every = +(board.dataset.every || 2600);
    if (board.dataset.live !== "off") {
      setInterval(() => {
        if (ballots.length > 40) ballots.splice(TEMPLATES.reduce((s, t) => s + t[0], 0));
        ballots.push(randomBallot());
        render(true);
      }, every + Math.round(rand() * 600));
    }
  }

  function only() {
    const want = new URLSearchParams(location.search).get("only");
    if (!want) return;
    document.documentElement.classList.add("only");
    document.querySelectorAll("[data-screen]").forEach((p) => {
      if (p.dataset.screen !== want) p.remove();
    });
  }

  window.Rankzap = { flip, renumber, ordinal, reduce };
  document.addEventListener("DOMContentLoaded", () => {
    only();
    document.querySelectorAll("[data-rank-list]").forEach(sortable);
    document.querySelectorAll("[data-results]").forEach(results);
  });
})();
