import { measureCount, type Score } from "../model/score.ts";
import { parseSearch } from "./parser.ts";

/** What a search found. Measure numbers here are 0-based indexes, like the rest of the API. */
export type SearchHit =
  | { kind: "measure"; measure: number }
  /** Inclusive; `to` is clamped to the last measure. */
  | { kind: "measureRange"; from: number; to: number }
  | { kind: "page"; page: number; firstMeasure: number }
  | { kind: "rehearsalMark"; measure: number; text: string };

export interface SearchContext {
  /** First measure of each page (see `pageStarts`). Without it, page searches find nothing. */
  pageStarts?: readonly number[];
}

/**
 * The "Find / Go to" box. Text is read as a command, first match wins:
 * `12` a measure, `5-9` a range, `p3` a page, `rA` or `A` a rehearsal mark by prefix.
 * Users type 1-based numbers; hits carry 0-based indexes. Empty when nothing matches.
 */
export function search(score: Score, text: string, context: SearchContext = {}): SearchHit[] {
  const command = parseSearch(text);
  if (!command) return [];
  const count = measureCount(score);

  switch (command.type) {
    case "measure": {
      const measure = command.index - 1;
      return measure >= 0 && measure < count ? [{ kind: "measure", measure }] : [];
    }
    case "measureRange": {
      const from = command.start - 1;
      if (from < 0 || from >= count) return [];
      return [{ kind: "measureRange", from, to: Math.min(command.end - 1, count - 1) }];
    }
    case "page": {
      const starts = context.pageStarts;
      const page = command.index - 1;
      if (!starts || page < 0 || page >= starts.length) return [];
      return [{ kind: "page", page, firstMeasure: starts[page] }];
    }
    case "rehearsalMark": {
      // Try without the optional "r" prefix first, then as typed, so "Ron" still finds "Rondo".
      for (const prefix of [command.name, command.raw]) {
        for (let i = 0; i < count; i++) {
          const mark = score.timeline[i].rehearsal;
          if (mark && mark.toLowerCase().startsWith(prefix)) return [{ kind: "rehearsalMark", measure: i, text: mark }];
        }
      }
      return [];
    }
  }
}
