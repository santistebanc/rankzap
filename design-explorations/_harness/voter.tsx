import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "./harness.css";
import { VoterView } from "../../src/pages/poll/VoterView";
import { usePollColour } from "../../src/lib/pollColour";
import { DEFAULT_SETTINGS, pollColourOf, type Option, type Vote, type UserRecord } from "../../src/lib/types";
import type { PollData } from "../../src/pages/poll/shared";

const q = new URLSearchParams(location.search);
localStorage.clear();
const names = ["Morning walk", "Coffee first", "Write for 20 minutes", "Stretch for 10 minutes", "Big breakfast", "Clear messages"];
const options: Option[] = names.map((text, i) => ({ id: `o${i}`, text, addedBy: "admin", addedAt: i }));
const people: [string, UserRecord["mode"], boolean, boolean][] = [["Ava", "idle", true, true], ["Diego", "idle", true, false], ["Iris", "voting", false, true], ["Leo", "idle", true, true], ["Mia", "editing", true, true], ["Noah", "idle", false, false]];
const usersMap = new Map(people.map(([n, mode]) => [`users/${n}`, { id: n, name: n, mode }]));
const votesMap = new Map<string, Vote>(people.filter((p) => p[2]).map(([n], i) => [`votes/${n}`, { userId: n, ranking: options.map((o) => o.id).sort(() => (i % 2 ? 1 : -1)), submittedAt: 1 }]));
const screen = q.get("screen") ?? "ballot";
if (screen === "voted" || screen === "closed") votesMap.set("votes/me", { userId: "me", ranking: ["o0", "o2", "o1", "o3", "o4", "o5"], submittedAt: 2 });
usersMap.set("users/me", { id: "me", name: "Santi", mode: "idle" });
const online = [...people.filter((p) => p[3]).map((p) => p[0]), "me"];
(window as any).__fakeRoom = { "users/": usersMap, "votes/": votesMap, "presence/": new Map(online.map((u) => [`presence/${u}`, { userId: u }])) };
const poll: PollData = {
  roomId: "A3ZK",
  meta: { title: "", state: screen === "closed" ? "closed" : "open", createdAt: 0 },
  settings: { ...DEFAULT_SETTINGS(), ballotTitle: "Best morning ritual?", allowAdd: q.get("noadd") === null, showLiveResults: q.get("hidden") === null, showVoterVotes: true },
  pollHeading: "Best morning ritual?",
  options,
  optionById: new Map(options.map((o) => [o.id, o])),
  optionsMap: new Map(options.map((o) => [`options/${o.id}`, o])),
  votesMap,
  usersMap,
  presenceMap: new Map(),
  onlineUserIds: new Set(online),
  votedUserIds: new Set(votesMap.values().map((v) => v.userId)),
};
function App() {
  usePollColour(pollColourOf(q.get("colour")));
  return <MemoryRouter><VoterView poll={poll} identity={{ userId: "me", name: q.get("screen") === "arrive" ? "" : "Santi" }} /></MemoryRouter>;
}
createRoot(document.getElementById("root")!).render(<App />);
