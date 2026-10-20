import { durationTicks, measureTicks, voiceTicks, type Score } from "./score.ts";

export interface ScoreIssue {
  part: number;
  measure: number;
  voice?: number;
  message: string;
}

/**
 * Structural checks a well-formed score satisfies. Imported scores may fail
 * some (pickup measures, OMR mistakes); edits are expected to preserve them.
 */
export function validateScore(score: Score): ScoreIssue[] {
  const issues: ScoreIssue[] = [];
  const n = score.timeline.length;

  score.parts.forEach((part, pi) => {
    if (part.measures.length !== n) {
      issues.push({ part: pi, measure: -1, message: `part has ${part.measures.length} measures, timeline has ${n}` });
    }
    part.measures.forEach((pm, mi) => {
      const len = measureTicks(score, mi);
      const ids = new Set<number>();
      pm.voices.forEach((v, vi) => {
        if (ids.has(v.id)) issues.push({ part: pi, measure: mi, voice: vi, message: `duplicate voice id ${v.id}` });
        ids.add(v.id);
        if (v.staff < 1 || v.staff > part.staves) {
          issues.push({ part: pi, measure: mi, voice: vi, message: `voice on staff ${v.staff}, part has ${part.staves}` });
        }
        const total = voiceTicks(v);
        if (total !== len) {
          issues.push({ part: pi, measure: mi, voice: vi, message: `voice holds ${total} ticks, measure is ${len}` });
        }
        for (const e of v.events) {
          if (e.ticks <= 0) issues.push({ part: pi, measure: mi, voice: vi, message: "event with no length" });
          if (e.duration && !e.duration.tuplet && durationTicks(e.duration) !== e.ticks) {
            issues.push({ part: pi, measure: mi, voice: vi, message: "spelled duration disagrees with ticks" });
          }
          if (e.kind === "chord" && e.notes.length === 0) {
            issues.push({ part: pi, measure: mi, voice: vi, message: "chord without notes" });
          }
        }
      });
      for (let staff = 1; staff <= part.staves; staff++) {
        if (!pm.voices.some((v) => v.staff === staff)) {
          issues.push({ part: pi, measure: mi, message: `staff ${staff} has no voice` });
        }
      }
    });
  });
  return issues;
}
