# Spine Pair Review — Piano Daily

*Run inline (hobby/solo, user opted for the quick rubric-only pass rather than dispatched subagent lenses). Findings below were fixed directly in `DESIGN.md`/`EXPERIENCE.md` during this pass — this file records what was checked and changed.*

## Overall verdict
Strong flow/state/inheritance coverage; the frontmatter token set initially carried unused Material-3-style boilerplate (bloat) and three components used in EXPERIENCE.md had no matching DESIGN.md visual spec. Both classes of gap were fixed in place before this review closed — no open findings remain.

## 1. Flow coverage — strong
UJ-1, UJ-2, UJ-3 all present as Key Flows, names/IDs verbatim from `prd.md` §2.3, each with a named protagonist, numbered steps, a climax beat, and a failure path.

## 2. Token completeness — strong (after fix)
### Findings (fixed)
- **medium** ~~18 M3-style color tokens (`surface-dim`, `inverse-*`, `*-container` variants, `background`/`on-background`, `surface-variant`) were defined in frontmatter but never referenced in prose or Components~~ — trimmed to the 21 tokens actually used; `error-container`/`on-error-container` kept and given a real usage (form-error component).
All remaining tokens resolve; color tokens carry hex values.

## 3. Component coverage — strong (after fix)
### Findings (fixed)
- **high** ~~"Modal thanh toán", "Tag Genre", and form-level error messaging were behavioral rows in EXPERIENCE.md with no matching DESIGN.md.Components visual spec~~ — added `payment-modal`, `tag-genre`, `form-error` to DESIGN.md with matching prose, and cross-referenced the component names back into EXPERIENCE.md's rows.
- **low** ~~Admin uploader/data table had no visual spec~~ — resolved by an explicit inheritance note: Admin chrome inherits whichever UI kit Architecture picks (shadcn/ui or Ant Design), Piano Daily overrides only brand-critical elements (primary actions, money-related actions, error messages). Documented in both spines rather than left implicit.

## 4. State coverage — strong
Walked every IA surface against expected states (cold-load, empty, error, permission-denied where applicable). EXPERIENCE.md's State Patterns table covers: list loading, empty search, missing-format sheets, payment processing/failure, expired token, draft-sheet 404, admin upload failure, disabled ad slot. No missing state found for the surfaces this spine covers.

## 5. Visual reference coverage — adequate
4 PianoSnap screenshots live in `imports/` (referenced narratively in EXPERIENCE.md's Inspiration & Anti-patterns and IA layout notes) but are not yet linked inline at each specific IA row. `mockups/` is empty — key-screen mocks not yet rendered at this point in Finalize (next step).

## 6. Bloat & overspecification — strong (after fix)
Token bloat (see §2) was the only real instance found and was trimmed. No pixel-level over-specification, no source restatement (FRs/personas live in PRD, not repeated here), no decorative narrative untied to a decision — every DESIGN.md paragraph either explains a color/type choice or states a Do/Don't with a reason.

## 7. Inheritance discipline — strong
`sources:` frontmatter resolves to real files. UJ names/IDs match `prd.md` verbatim. Component names now identical across both files after the §3 fix (`payment-modal`, `tag-genre`, `form-error`, `card-sheet`, `button-download`, `ad-slot` all appear the same way in both spines). EXPERIENCE.md token references (`{colors.*}`) all resolve to DESIGN.md frontmatter keys post-trim.

## 8. Shape fit — strong
DESIGN.md sections in canonical order (Brand & Style → Colors → Typography → Layout & Spacing → Elevation & Depth → Shapes → Components → Do's and Don'ts). EXPERIENCE.md has all required defaults (Foundation, IA, Voice and Tone, Component Patterns, State Patterns, Interaction Primitives, Accessibility Floor, Key Flows) plus both triggered sections earned by context: Inspiration & Anti-patterns (PianoSnap is an explicit named reference) and Responsive & Platform (multi-breakpoint, two distinct surfaces).

## Mechanical notes
- No name drift found between spines after the component-coverage fix.
- One `[NOTE FOR UX]` remains open (formal WCAG AA contrast measurement on the Ivory & Walnut palette) — deferred to when real mocks/mockups exist, logged in memlog.
- No broken cross-references found.
