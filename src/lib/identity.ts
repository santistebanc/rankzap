import { nanoid } from "nanoid";
import { clampName } from "./types";
import { getVoterName, getVoterUserId, setVoterName, setVoterUserId } from "./storage";

const ANIMAL_NAMES = [
  "Otter",
  "Fox",
  "Heron",
  "Owl",
  "Bear",
  "Wolf",
  "Hare",
  "Lynx",
  "Stag",
  "Pike",
  "Robin",
  "Quail",
  "Mole",
  "Newt",
  "Shrike",
];

function defaultDisplayName(): string {
  const animal = ANIMAL_NAMES[Math.floor(Math.random() * ANIMAL_NAMES.length)];
  const num = Math.floor(Math.random() * 900) + 100;
  return `${animal} ${num}`;
}

export interface VoterIdentity {
  userId: string;
  name: string;
}

export function getOrCreateVoterIdentity(): VoterIdentity {
  let userId = getVoterUserId();
  if (!userId) {
    userId = nanoid(12);
    setVoterUserId(userId);
  }
  let name = getVoterName();
  if (!name) {
    name = defaultDisplayName();
    setVoterName(name);
  }
  return { userId, name: clampName(name) };
}

export function persistVoterName(name: string): string {
  const clamped = clampName(name);
  if (clamped) setVoterName(clamped);
  return clamped;
}
