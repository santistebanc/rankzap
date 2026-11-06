import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** What Home suggests you could rank, each shown with a full stop. */
const WORDS = [
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
 * The last word of Home's "Rank …" headline. It opens on a random word; every
 * few seconds the letters of the current word lift out of view and the next
 * word's letters rise in, one after another, picked at random without repeats
 * until every word has been shown. Each word has its own size, measured up
 * front, so a long word rises in already shrunk to fit and nothing resizes
 * mid-transition. Holds the first word when the viewer prefers reduced motion,
 * and pauses while the tab is hidden.
 */
export function RotatingWord() {
  const bag = useRef<number[]>([]);
  /** The next word from the bag, refilling it (without repeating `last`) when empty. */
  const draw = (last: number) => {
    if (bag.current.length === 0) bag.current = shuffledBag(last);
    return bag.current.shift()!;
  };
  const [{ current, previous }, setWords] = useState(() => ({ current: draw(-1), previous: -1 }));
  // Scale per word (1 = full headline size), so each one fits the line.
  const [scales, setScales] = useState<number[]>(() => WORDS.map(() => 1));
  const boxRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const shown = useRef(current);

  useEffect(() => {
    if (reducedMotion()) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      const next = draw(shown.current);
      shown.current = next;
      setWords((w) => ({ current: next, previous: w.current }));
    }, HOLD_MS);
    return () => window.clearInterval(timer);
  }, []);

  // Measure every word at full size; any wider than the headline gets shrunk.
  // Again when the headline resizes, and once the display font has loaded.
  useLayoutEffect(() => {
    const measure = measureRef.current;
    const line = boxRef.current?.parentElement;
    if (!measure || !line) return;
    const fit = () => {
      // A little slack for the tilt as letters rise in.
      const room = line.clientWidth * 0.96;
      const next = WORDS.map((word) => {
        measure.textContent = `${word}.`;
        return Math.min(1, room / Math.max(1, measure.offsetWidth));
      });
      // Empty again, so the hidden full-size word can't widen the page.
      measure.textContent = "";
      setScales((prev) => (prev.every((v, i) => v === next[i]) ? prev : next));
    };
    fit();
    void document.fonts.ready.then(fit);
    const observer = new ResizeObserver(fit);
    observer.observe(line);
    return () => observer.disconnect();
  }, []);

  return (
    <span ref={boxRef} className="rotating-word" aria-hidden="true">
      <span ref={measureRef} className="rotating-word-measure" />
      {previous >= 0 ? (
        <Letters key={`out-${previous}-${current}`} word={WORDS[previous]} scale={scales[previous]} leaving />
      ) : null}
      <Letters key={`in-${current}`} word={WORDS[current]} scale={scales[current]} entering={previous >= 0} />
    </span>
  );
}

interface LettersProps {
  word: string;
  scale: number;
  entering?: boolean;
  leaving?: boolean;
}

function Letters({ word, scale, entering = false, leaving = false }: LettersProps) {
  return (
    <span
      className={`rotating-word-row${leaving ? " is-leaving" : ""}${entering ? " is-entering" : ""}`}
      style={{ fontSize: `${scale}em` }}
    >
      {[...`${word}.`].map((letter, i) => (
        <span key={i} className="rotating-word-letter" style={{ animationDelay: `${leaving ? i * 22 : ENTER_AFTER_MS + i * 38}ms` }}>
          {letter}
        </span>
      ))}
    </span>
  );
}
