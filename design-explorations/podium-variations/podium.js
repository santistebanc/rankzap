/* Podium family behaviour on top of shared/rank.js:
   - rank numerals punch when their place changes
   - .winner gets .lead-changed for a moment whenever the leader changes */
(() => {
  const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
  document.addEventListener("rank-change", (e) => {
    if (window.Rankzap?.reduce) return;
    e.target.querySelectorAll?.(".n").forEach((n) => {
      if (n.dataset.last && n.dataset.last !== n.textContent) restart(n, "punch");
      n.dataset.last = n.textContent;
    });
  });
  let leader = null;
  document.addEventListener("tally", (e) => {
    const top = e.detail.order[0];
    if (leader && top !== leader) {
      document.querySelectorAll(".winner").forEach((w) => restart(w, "lead-changed"));
    }
    leader = top;
  });
})();
