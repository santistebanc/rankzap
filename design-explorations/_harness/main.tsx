import { useState } from "react";
import { createRoot } from "react-dom/client";
import "./harness.css";
import { ArrangeOptions } from "../../src/components/ArrangeOptions";
import { LiveOptions } from "../../src/components/LiveOptions";
import { UserPill, type PillState } from "../../src/components/UserPill";
import { ColourPicker } from "../../src/components/ColourPicker";
import { usePollColour } from "../../src/lib/pollColour";
import { pollColourOf, type Option, type Vote, type UserRecord, type TallyMode } from "../../src/lib/types";

const names = ["Tacos", "Ramen", "Pizza", "Thai curry", "Falafel wraps from the place on 5th street", "Sushi"];
const options: Option[] = names.map((text, i) => ({ id: `o${i}`, text, addedBy: "admin", addedAt: i }));
const orders = [[0,1,2,3,4,5],[1,0,3,2,5,4],[0,2,1,4,3,5],[2,0,1,3,5,4],[0,1,3,2,4,5],[1,2,0,5,3,4],[0,3,1,2,4,5]];
const votes = new Map<string, Vote>(orders.map((o, i) => [`u${i}`, { userId: `u${i}`, ranking: o.map((n) => `o${n}`), submittedAt: i }]));
const optionsMap = new Map(options.map((o) => [o.id, o]));
const usersMap = new Map<string, UserRecord>();
const pills: [string, PillState, boolean?][] = [["Santi", "voted", true], ["Maya", "voting"], ["Jon", "changing"], ["Priya", "online"], ["Ade", "offline"], ["Lou", "voted-offline"]];

function App() {
  const [colour, setColour] = useState(pollColourOf(new URLSearchParams(location.search).get("colour")));
  usePollColour(colour);
  const [ranking, setRanking] = useState(options.map((o) => o.id));
  const [mode, setMode] = useState<TallyMode>("borda");
  const winner = new URLSearchParams(location.search).has("winner");
  return (
    <main className="mx-auto grid max-w-[390px] gap-5 px-3 py-6 text-ink">
      <h1 className="display text-[52px]">Where do we eat Friday?</h1>
      <section className="grid gap-2"><h2 className="font-bold">Poll colour</h2>
        <ColourPicker value={colour} onChange={(c) => new Promise((r) => setTimeout(() => { setColour(c); r(null); }, 300))} />
      </section>
      <section className="grid gap-2"><h2 className="font-bold">Ballot</h2>
        <ArrangeOptions options={options} ranking={ranking} onChange={setRanking} />
      </section>
      <section className="grid gap-2"><h2 className="font-bold">Results</h2>
        <div className="flex gap-1">{(["borda","dowdall","copeland"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={`flex-1 py-2 font-extrabold ${m === mode ? "bg-hi text-hi-ink" : "bg-step text-step-ink"}`}>{m}</button>))}</div>
        <LiveOptions removable editable showResults highlightWinner={winner} tallyMode={mode} optionsMap={optionsMap} votesMap={votes} usersMap={usersMap} />
      </section>
      <section className="grid gap-2"><h2 className="font-bold">Results hidden</h2>
        <LiveOptions removable={false} showResults={false} tallyMode={mode} optionsMap={optionsMap} votesMap={votes} usersMap={usersMap} />
      </section>
      <section className="grid gap-2"><h2 className="font-bold">Voters</h2>
        <div className="flex flex-wrap gap-1.5">{pills.map(([n, s, you]) => <UserPill key={n} user={{ id: n, name: n, mode: "idle" }} state={s} isYou={you} />)}</div>
      </section>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
