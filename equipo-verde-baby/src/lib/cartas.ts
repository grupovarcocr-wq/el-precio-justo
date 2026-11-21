import raw from "./cartas.json";

export type CardType =
  | "completaLaFrase"
  | "loPrimeroQueViene"
  | "estoOAquello";

export type Card = {
  id: string;
  type: CardType;
  prompt: string;
  optionA?: string;
  optionB?: string;
};

/** 0 = sin cronómetro (host cierra / avanza a mano). */
export const TIMER_CHOICES = [0, 15, 20, 25, 30] as const;
export const DEFAULT_TIMER_SECONDS = 25;
/** Grace after timer hits 0 so late POSTs still land. */
export const ANSWER_GRACE_MS = 2000;
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;
export const ROUNDS = 15;
export const CARDS_PER_TYPE = 5;

const TYPE_LABELS: Record<CardType, string> = {
  completaLaFrase: "Completa la frase",
  loPrimeroQueViene: "Lo primero que viene a la mente",
  estoOAquello: "Esto o Aquello",
};

function catalog(): Card[] {
  const out: Card[] = [];
  for (const item of raw.completaLaFrase) {
    out.push({
      id: item.id,
      type: "completaLaFrase",
      prompt: item.prompt,
    });
  }
  for (const item of raw.loPrimeroQueViene) {
    out.push({
      id: item.id,
      type: "loPrimeroQueViene",
      prompt: item.prompt,
    });
  }
  for (const item of raw.estoOAquello) {
    out.push({
      id: item.id,
      type: "estoOAquello",
      prompt: item.prompt,
      optionA: item.optionA,
      optionB: item.optionB,
    });
  }
  return out;
}

const ALL = catalog();
const BY_ID = new Map(ALL.map((c) => [c.id, c]));

export function getCardById(id: string): Card | undefined {
  return BY_ID.get(id);
}

export function typeLabel(type: CardType): string {
  return TYPE_LABELS[type];
}

export function isChoiceCard(card: Card): boolean {
  return card.type === "estoOAquello";
}

/** Trim, lowercase, strip accents for free-text grouping. */
export function normalizeAnswer(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

function pickN<T>(items: T[], n: number): T[] {
  const copy = [...items];
  shuffleInPlace(copy);
  return copy.slice(0, Math.min(n, copy.length));
}

/** 5 random cards per type → 15, then shuffle the deck. */
export function buildDeck(): string[] {
  const byType: Record<CardType, Card[]> = {
    completaLaFrase: [],
    loPrimeroQueViene: [],
    estoOAquello: [],
  };
  for (const card of ALL) {
    byType[card.type].push(card);
  }
  const deck: Card[] = [
    ...pickN(byType.completaLaFrase, CARDS_PER_TYPE),
    ...pickN(byType.loPrimeroQueViene, CARDS_PER_TYPE),
    ...pickN(byType.estoOAquello, CARDS_PER_TYPE),
  ];
  shuffleInPlace(deck);
  return deck.map((c) => c.id);
}

export type PublicCard = {
  id: string;
  type: CardType;
  typeLabel: string;
  prompt: string;
  optionA?: string;
  optionB?: string;
};

export function toPublicCard(card: Card): PublicCard {
  return {
    id: card.id,
    type: card.type,
    typeLabel: typeLabel(card.type),
    prompt: card.prompt,
    optionA: card.optionA,
    optionB: card.optionB,
  };
}
