/**
 * Turns the text typed into the search box into a typed command.
 *
 * Grammar, tried in this order (first match wins):
 *   "12"      measure 12
 *   "5-9"     measure range 5..9
 *   "p3"      page 3
 *   "rA"/"A"  rehearsal mark starting with "A" (the "r" prefix is optional)
 */

export type SearchCommand =
  | { type: "measure"; index: number }
  | { type: "measureRange"; start: number; end: number }
  | { type: "page"; index: number }
  /** `name` has the optional "r" prefix stripped; `raw` is the lowercased input, kept so "Ron" still finds "Rondo". */
  | { type: "rehearsalMark"; name: string; raw: string };

const REHEARSAL_MARK_CODE = "r";
const PAGE_CODE = "p";

const UINT = /^\d+$/;

export function parseSearch(input: string): SearchCommand | undefined {
  if (input === "") {
    return undefined;
  }
  return parseMeasure(input) ?? parsePage(input) ?? parseRehearsalMark(input);
}

function parseMeasure(input: string): SearchCommand | undefined {
  const parts = input.split("-").filter((p) => p !== "");

  if (parts.length === 2) {
    const [a, b] = parts;
    if (UINT.test(a) && UINT.test(b) && Number(a) <= Number(b)) {
      return { type: "measureRange", start: Number(a), end: Number(b) };
    }
    return undefined;
  }

  return UINT.test(input) ? { type: "measure", index: Number(input) } : undefined;
}

function parsePage(input: string): SearchCommand | undefined {
  const s = input.toLowerCase();
  // Needs a digit right after the "p", so a rehearsal mark named "Pre" is not a page.
  if (!s.startsWith(PAGE_CODE) || !/^\d/.test(s.slice(PAGE_CODE.length))) {
    return undefined;
  }
  const rest = s.slice(PAGE_CODE.length);
  return UINT.test(rest) ? { type: "page", index: Number(rest) } : undefined;
}

function parseRehearsalMark(input: string): SearchCommand {
  const s = input.toLowerCase();
  const name =
    s.startsWith(REHEARSAL_MARK_CODE) && s.length > REHEARSAL_MARK_CODE.length
      ? s.slice(REHEARSAL_MARK_CODE.length)
      : s;
  return { type: "rehearsalMark", name, raw: s };
}
