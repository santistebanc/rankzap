import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** What Home suggests you could rank, each shown with a full stop. The first is the resting word. */
const WORDS = [
  "it",
  "pizza", "tacos", "sushi", "burgers", "snacks", "desserts", "toppings", "flavours", "recipes", "brunch",
  "cafés", "beers", "wines", "cocktails", "drinks",
  "films", "movies", "shows", "series", "books", "podcasts", "albums", "songs", "bands", "artists", "playlists",
  "games", "teams", "players", "heroes", "villains",
  "trips", "places", "cities", "beaches", "hikes", "holidays", "pubs",
  "names", "pets", "gifts", "outfits", "sneakers", "hobbies", "chores",
  "ideas", "plans", "goals", "dates", "slogans", "logos", "fonts", "colours", "themes",
  "memes", "emojis", "jokes", "puns", "poems",
  "apps", "features", "bugs", "tasks", "startups",
];
const HOLD_MS = 2600;
/** The new word starts rising once the old one is mostly out of the way. */
const ENTER_AFTER_MS = 200;

/** Every word once, in a random order, before any word repeats. */
function shuffledBag(avoidFirst: number): number[] {
  const bag = WORDS.map((_, i) => i);
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  // Don't show the same word twice in a row across two bags.
  if (bag[0] === avoidFirst) bag.push(bag.shift()!);
  return bag;
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The last word of Home's "Rank it." headline. Every few seconds the letters
 * of the current word lift out of view and the next word's letters rise in,
 * one after another, picked at random without repeats until every word has
 * been shown. Long words shrink to fit the line. Stays on "it." when the
 * viewer prefers reduced motion, and pauses while the tab is hidden.
 */
export function RotatingWord() {
  const [{ current, previous }, setWords] = useState({ current: 0, previous: -1 });
  const [scale, setScale] = useState(1);
  const boxRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const bag = useRef<number[]>([]);
  const shown = useRef(0);

  useEffect(() => {
    if (reducedMotion()) return;
    // "it." has just been shown, so it goes last in the first bag.
    bag.current = shuffledBag(0).filter((i) => i !== 0).concat(0);
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      if (bag.current.length === 0) bag.current = shuffledBag(shown.current);
      const next = bag.current.shift()!;
      shown.current = next;
      setWords((w) => ({ current: next, previous: w.current }));
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
