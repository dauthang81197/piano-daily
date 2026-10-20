import { test } from "node:test";
import assert from "node:assert/strict";

import { renderSvg } from "./render.ts";
import { twinkleScore } from "../fixtures.ts";

/** Length of the first staff line in the last system of the page. */
function lastSystemStaffWidth(svg: string): number {
  const last = svg.split('class="system"').at(-1)!;
  const m = last.match(/class="staff"[^>]*>\s*<path d="M(\d+) \d+ L(\d+) \d+"/);
  return Number(m![2]) - Number(m![1]);
}

test("the final line is stretched to the page width unless justifyLastSystem is false", async () => {
  const [stretched] = await renderSvg(twinkleScore());
  const [natural] = await renderSvg(twinkleScore(), { justifyLastSystem: false });
  const full = lastSystemStaffWidth(stretched);
  const short = lastSystemStaffWidth(natural);
  assert.ok(full > short * 2, `stretched ${full} vs natural ${short}`);
});
