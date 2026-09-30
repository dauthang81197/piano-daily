---
title: 'Story 1.8 — Publish, Archive, đánh dấu HOT và dọn file'
type: 'feature'
created: '2026-09-30'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'ab49bf7d1d193c0b901f2e3785975bfb038bceab'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
---

## Intent

Implement Sheet lifecycle actions for admins and delayed cleanup for superseded files. Accepted choices: superseded file groups are retained for 24 hours; status may transition freely among DRAFT, PUBLISHED, and ARCHIVED, with publish requirements rechecked every time status becomes PUBLISHED.

## Acceptance Criteria

- DRAFT Sheet can be published only when it has processed PDF, Composer, and Level; missing requirements return a clear validation error. First publish records `firstPublishedAt`; title changes after first publish do not change slug.
- Admin can toggle HOT and change status from the list or editor. Lifecycle fields are not accepted by metadata PATCH.
- Deleting a Sheet with historical Orders archives it and retains files; without Orders, delete the Sheet and its file objects. Before Epic 3 the Order hook returns false.
- Catalog GC processes superseded source/derived file groups only after 24 hours, retains any object referenced by a current row or live DownloadToken, and deletes database rows only after S3 succeeds. S3 group failure retains rows for retry and does not stop other groups. Before Epic 3 the DownloadToken hook returns false.
- Upload, GC, and removal paths lock per Sheet and preserve PDF/THUMBNAIL/PAGE_IMAGE and MIDI/MIDI_JSON groups.

## Tasks & Acceptance

- [x] Add shared lifecycle input schemas while keeping status/HOT outside `updateSheetSchema`.
- [x] Add publish/status/HOT/delete API operations, publish validation, slug locking, Order-aware archive, and hard delete.
- [x] Add hourly catalog GC with 24-hour retention, reference/token hooks, per-Sheet locking, object-first deletion, and retries.
- [x] Add admin list/editor lifecycle controls, confirmation for deletion, and stop row navigation for row actions.
- [x] Add shared/API/admin tests for lifecycle validation, slug freeze, delete behavior, grouped GC and retry.

## Verification

- `pnpm typecheck` and `pnpm lint` passed.
- Shared tests passed (122); admin sheet tests passed (18); API unit lock tests passed (2).
- API integration suites passed independently: catalog sheets (39) and sheet files (43).
- `pnpm build` and `pnpm test` were attempted; both stop at Next.js Turbopack CSS processing with `creating new process / binding to a port / Operation not permitted`, including an escalated build attempt.

## Review Triage Log

- **medium | patch — Table status filter and sort became stale:** Changing status updated the visible row in place, so it could remain under a status filter it no longer matched. The table now refetches the active query after lifecycle actions; the UI test verifies the row leaves the Draft filter.
- **medium | patch — Delete failure lost the confirmation context:** Rejected deletes previously closed the dialog and the editor lacked an error callback. The dialog now stays open on rejection; table/editor render the returned error. The admin test verifies the failed delete remains confirmable and reports an alert.
- **medium | patch — Deleting the last row left an invalid page:** Local row removal did not rerun the existing out-of-range page correction. Successful delete now refetches, which invokes that correction.
- **medium | patch — Concurrent Draft title updates could persist a stale slug:** A title equal to the outer snapshot skipped slug candidate generation even if another update changed the locked row first. Draft title patches now always generate a candidate; the row-locked state decides whether to apply it. A deterministic integration test covers the interleaving.
- **medium | patch — Concurrent row actions could re-enable an in-flight row:** One scalar busy ID was cleared when any request finished. A set now tracks each pending row independently.
- **medium | patch — Cron scheduling had no invocation test:** GC tests called `run()` directly and would not detect a missing scheduler registration. An integration test now checks hourly cron metadata, registry registration, and invocation of the scheduled entry point.
- **low | patch — Per-Sheet lock behavior lacked a regression test:** Added unit tests showing same-Sheet work queues serially, releases after completion, and does not block another Sheet.
- **low | patch — GC cleanup coverage omitted non-PDF groups and incomplete derived groups:** Added integration coverage for MIDI/MIDI_JSON, MP3, and retention when PDF or MIDI derived rows are missing.
- **medium | patch — DownloadToken hook missed rows in another group sharing an object key:** GC now passes all rows referencing candidate keys to the hook. Tests assert duplicate groups share a key and verify a token on the second group prevents deletion.
- **false — DeleteConfirm callers without `onError` had no visible failure:** Checked the call sites: taxonomy forms and MIDI/MP3 uploaders render their own errors; table and editor render lifecycle errors.
- **false — Publish tests omitted missing Composer/Level separately:** Both are required by the shared request schema and database model, so persisted Sheets cannot reach those states through supported APIs; the publish service still reports each missing field defensively.
- **false — Hard-delete tests did not verify object deletion or S3 failure:** The SeaweedFS integration test verifies successful object removal and verifies Sheet/file rows remain after a storage failure.
- **false — Order branch lacked a real Order-row test:** The Order model is introduced in Epic 3; Story 1.8's hook is intentionally false before then. Integration tests exercise the false hard-delete path and stub the hook true to verify archival and file retention.
- **false — GC lacked a shared-key retention test:** Integration tests assert that repeated identical uploads share storage keys and check grace-period and live-token references across groups.
- **false — Metadata PATCH rejection was not tested at the API:** Catalog integration tests submit `status` and `isHot` through metadata PATCH and assert validation errors.
- **low (rejected) — S3 deletion can succeed before a later database transaction failure:** This can temporarily leave rows pointing at missing objects if the DB transaction fails after S3 succeeds. Such post-side-effect transaction failure is uncommon, and repeating DELETE is safe because missing S3 objects count as deleted; a durable outbox/state machine would add disproportionate machinery for this failure window.
