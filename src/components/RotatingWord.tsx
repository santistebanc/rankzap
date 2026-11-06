import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** What Home suggests you could rank. The first one is the resting word. */
const WORDS = ["it", "pizza", "films", "songs", "names", "trips", "games", "ideas"];
const HOLD_MS = 2600;
/** The new word starts rising once the old one is mostly out of the way. */
const ENTER_AFTER_MS = 200;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The last word of Home's "Rank it." headline. Every few seconds the letters
 * of the current word lift out of view and the next word's letters rise in,
 * one after another. Long words shrink to fit the line. Stays on "it." when
 * the viewer prefers reduced motion or the tab is hidden.
 */
export function RotatingWord() {
  const [{ current, previous }, setWords] = useState({ current: 0, previous: -1 });
  const [scale, setScale] = useState(1);
  const boxRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (reducedMotion()) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setWords((w) => ({ current: (w.current + 1) % WORDS.length, previous: w.current }));
    }, HOLD_MS);
    return () => window.clearInterval(timer);
  }, []);

  // Shrink a word that's wider than the headline so it never breaks the layout.
  useLayoutEffect(() => {
    const box = boxRef.current;
    const measure = measureRef.current;
    const line = box?.parentElement;
    if (!box || !measure || !line) return;
    const fit = () => setScale(Math.min(1, line.clientWidth / Math.max(1, measure.offsetWidth)));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(line);
    return () => observer.disconnect();
  }, [current]);

  return (
    <span ref={boxRef} className="rotating-word" style={{ fontSize: `${scale}em` }} aria-hidden="true">
      <span ref={measureRef} className="rotating-word-measure" style={{ fontSize: `${1 / scale}em` }}>
        {WORDS[current]}.
      </span>
      {previous >= 0 ? <Letters key={`out-${previous}-${current}`} word={WORDS[previous]} leaving /> : null}
      <Letters key={`in-${current}`} word={WORDS[current]} entering={previous >= 0} />
    </span>
  );
}

function Letters({ word, entering = false, leaving = false }: { word: string; entering?: boolean; leaving?: boolean }) {
  return (
    <span className={`rotating-word-row${leaving ? " is-leaving" : ""}${entering ? " is-entering" : ""}`}>
      {[...`${word}.`].map((letter, i) => (
        <span key={i} className="rotating-word-letter" style={{ animationDelay: `${leaving ? i * 22 : ENTER_AFTER_MS + i * 38}ms` }}>
          {letter}
        </span>
      ))}
    </span>
  );
}
