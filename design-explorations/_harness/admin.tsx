import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "./harness.css";
import { AdminView } from "../../src/pages/poll/AdminView";
import { usePollColour } from "../../src/lib/pollColour";
import { DEFAULT_SETTINGS, pollColourOf } from "../../src/lib/types";
import { useRoomList, useRoomValue } from "./fakeRoom";
const q = new URLSearchParams(location.search);
const names = ["Morning walk", "Coffee first", "Write for 20 minutes", "Stretch for 10 minutes", "Big breakfast", "Clear messages"];
const people = ["Ava", "Diego", "Iris", "Leo", "Mia", "Noah"];
(window as any).__fakeValues = {
  settings: { ...DEFAULT_SETTINGS(), ballotTitle: q.has("long") ? "Which morning ritual should we try together throughout November?" : "Best morning ritual?", colour: pollColourOf(q.get("colour")) },
  meta: { title: "", state: q.has("closed") ? "closed" : "open", createdAt: 0 },
};
(window as any).__fakeRoom = {
  "options/": new Map(q.has("empty") ? [] : names.map((text, i) => [`options/o${i}`, { id: `o${i}`, text: q.has("long") && i === 1 ? "A".repeat(200) : text, addedBy: "admin", addedAt: i }])),
  "users/": new Map(q.has("empty") ? [] : people.map((name) => [`users/${name}`, { id: name, name, mode: name === "Iris" ? "voting" : "idle" }])),
  "votes/": new Map(q.has("empty") ? [] : ["Ava", "Diego", "Leo", "Mia"].map((userId, i) => [`votes/${userId}`, { userId, ranking: [0,1,2,3,4,5].map((n) => `o${(n+i)%6}`), submittedAt: i }])),
  "presence/": new Map(q.has("empty") ? [] : people.filter((name) => name !== "Diego" && name !== "Noah").map((userId) => [`presence/${userId}`, { userId }])),
};
function App() {
  const { value: settings } = useRoomValue("settings");
  const { value: meta } = useRoomValue("meta");
  const optionsMap = useRoomList("options/");
  const usersMap = useRoomList("users/");
  const votesMap = useRoomList("votes/");
  const presenceMap = useRoomList("presence/");
  usePollColour(settings.colour);
  return <MemoryRouter><AdminView poll={{ roomId: "A3ZK", settings, meta, pollHeading: settings.ballotTitle,
    options: [...optionsMap.values()], optionById: new Map([...optionsMap.values()].map((o) => [o.id, o])),
    optionsMap, usersMap, votesMap, presenceMap,
    onlineUserIds: new Set([...presenceMap.values()].map((p) => p.userId)),
    votedUserIds: new Set([...votesMap.values()].filter((v) => v.ranking.length).map((v) => v.userId)),
  }} /></MemoryRouter>;
}
createRoot(document.getElementById("root")!).render(<App />);

