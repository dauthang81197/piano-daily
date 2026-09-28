---
title: Review — Rubric + Reconcile — Architecture Spine Piano Daily
reviewed: ARCHITECTURE-SPINE.md (draft, 2026-09-27)
inputs: prd.md, addendum.md, EXPERIENCE.md, DESIGN.md
reviewer: independent (rubric + reconcile)
date: 2026-09-27
---

# Review: Rubric + Reconcile

## Verdict

The spine is strong. Module ownership, money handling, the Order state machine, the single download path, the storage split and the locale rule are the right divergence points, and most Rules can be enforced. It is **not yet ready to hand to epics**. Six gaps would let two units build incompatible behaviour: email-based re-download, previewing Drafts vs "Draft = 404", late captures on orders already CANCELLED, what the capture endpoint returns when the webhook got there first, client IP behind Cloudflare+Caddy, and who counts downloads. Several quiet requirements from EXPERIENCE/PRD are also missing. Everything below is additive. None of it asks for a paradigm change.

Accepted overrides (not flagged): integer cents instead of addendum's `decimal`, and SeaweedFS/R2 instead of MinIO. The spine also renames routes on purpose (`/downloads/:token/:fileType` instead of `/files/:id/download?token=`, and locale-prefixed public URLs). Neither contradicts a requirement.

---

## Part 1 — Rubric

### 1.1 Divergence points fixed (good)

| Point | AD | Assessment |
| --- | --- | --- |
| Table ownership / cross-module writes | AD-1 | Correct and well scoped. Enforceability: see R-9. |
| DTO contract | AD-2 | Good. Includes a test that shared enums match Prisma enums. |
| Money representation and server pricing | AD-3 | Good. Order snapshot plus no client prices. |
| Order state machine, idempotent fulfil/refund | AD-4 | Good core. Gaps in F-3 and F-4. |
| Payment provider port | AD-5 | Good. |
| Storage zones, signed URLs, key format | AD-6 | Good. |
| MIDI preview without exposing the `.mid` | AD-7 | Sensible trade-off, stated explicitly. |
| Single download path, atomic counter | AD-8 | Good. Gaps in F-1 and F-6. |
| Upload atomicity | AD-9 | Good. The publish gate is missing (F-8). |
| Cache/revalidation contract between api and web | AD-10 | Good. Conflicts with Draft preview (F-2). |
| View counting | AD-11 | Good. Depends on client IP (F-5). |
| Locale routing | AD-12 | Good. Fixes the crawler/IP problem well. |
| Admin auth | AD-13 | Good. Wording is ambiguous (R-8). |
| Email after commit | AD-14 | Good. |
| Single instance | AD-15 | Good. Makes the in-memory throttle/cron assumption explicit. |

### 1.2 Divergence points missed

These are covered as findings in Part 2 and the summary table:

- **Re-download by email** (F-1): no AD covers it, and web and commerce would each invent a mechanism.
- **Draft preview** (F-2): the admin needs it, AD-10 forbids it, and no mechanism is named.
- **Capture response contract / payment-success page** (F-4): what the web gets back after capture, and how the success page finds the token.
- **Client IP resolution behind the proxy** (F-5): throttling, view dedupe and DownloadLog all depend on it.
- **Download counting and free-download logging** (F-6): `Sheet.download_count` and `SheetFile.download_count` exist (addendum §3) and FR-17 needs downloads by Level, but no AD says who increments them or whether free downloads are logged.
- **Deleting a Sheet or catalog entity that Orders reference** (F-7): FR-12 allows delete, and `Order.sheet_id` is an FK owned by commerce.
- **Publish invariant** (F-8): which files must exist before PUBLISHED.
- **Payment error taxonomy** (F-9): EXPERIENCE needs specific failure reasons, and the spine only fixes the error envelope.

### 1.3 Are the Rules enforceable, and do they prevent their stated divergence?

- **R-1 AD-4:** `fulfil()` guarded by `WHERE status='PENDING'` prevents double fulfilment. It also silently drops a real payment when the Order is already `CANCELLED` or `FAILED` (see F-3), so the Rule enforces too narrowly.
- **R-2 AD-4:** "0 rows updated → do nothing" is correct for the webhook. For the capture endpoint it is wrong, because the caller still needs the token (F-4).
- **R-3 AD-8:** The atomic `used<max` update is enforceable. "Token path unaffected by `payments_enabled=false`" is implied but never stated. Say so explicitly so that already-paid customers can still download while payments are off.
- **R-4 AD-10:** "Draft 404 on every public route" is enforceable, but it contradicts UJ-3 step 5 in EXPERIENCE (F-2).
- **R-5 AD-11:** The Rule is sound, but `ip` is undefined behind Cloudflare→Caddy (F-5). The `SheetViewDedupe` table grows without bound, so add a retention purge to the cron list in AD-15.
- **R-6 AD-6:** "Only `media` talks to S3" is enforceable by lint.
- **R-7 AD-3:** "No endpoint accepts a price from the client" is enforceable. The stale-price case is not covered: the modal shows price X, create-order computes Y. Decide whether create-order returns the computed amount and the modal must show it before PayPal approval.
- **R-8 AD-13:** "Guard JWT is global for `/admin/*`; public routes must be explicitly marked `@Public()`" mixes two models. If the guard is path-scoped, `@Public()` is meaningless. If it is global, the rule should say "global `APP_GUARD` on all routes". Pick global `APP_GUARD` and add a test that lists every route and asserts that only an allowlist is `@Public()`. That is what actually prevents a forgotten guard. Also state that a password change revokes all refresh tokens (FR-11).
- **R-9 AD-1 / AD-5 / AD-6:** "Only X imports Y" and "only the owning module touches its tables" are enforced only by review. Add a mechanical check such as `dependency-cruiser` or eslint `no-restricted-imports`, covering Prisma model access outside the owning module's repository, `@aws-sdk/*` outside `media`, and `@paypal/*` outside the adapter. This is cheap and turns review-only rules into CI rules.

### 1.4 Deferred items that could let two units diverge

- **Ad rendering (`html_code` in a sandboxed iframe vs direct injection):** medium risk. Deferring the choice to the Ads epic is fine, but it affects the security posture of pages that host the PayPal SDK. Directly injected third-party script on the Sheet detail page can read the checkout email or tamper with the modal. Also, `STICKY_BOTTOM` and `IN_CONTENT` must "collapse with no space" (EXPERIENCE), which an iframe complicates. Recommendation: decide now that ads render in a sandboxed iframe and never on the payment-success page, or at minimum set a CSP baseline (see F-10) so the Ads epic cannot pick direct injection by accident.
- **Bulk pricing:** safe. It is bound to the catalog service and AD-3.
- **Queue:** safe.
- **Staging/CI/monitoring:** acceptable as a gate before `live`. The gate should be written as an explicit launch checklist item (F-11).
- **Test framework:** safe.
- **Local payment methods, copyright review, TS/Node upgrade:** safe.
- **Separate token config per purchase type (Q3):** safe, because the token snapshot absorbs it.

### 1.5 Dimensions this altitude owns

| Dimension | Status | Note |
| --- | --- | --- |
| Paradigm / module boundaries | Decided | — |
| Data / ownership / IDs | Decided | Delete semantics missing (F-7). |
| API contract / errors | Decided | Payment error codes missing (F-9). |
| Deployment topology | Decided | VPS + Compose + Caddy + Cloudflare + R2. |
| Environments | Decided | local + prod; staging is `[ASSUMPTION]` none. With no staging, the first real PayPal-live transaction happens in prod. Note that local webhook testing needs a public tunnel (e.g. cloudflared). |
| Infra / provider | Decided | R2, Resend, PayPal, Cloudflare. VPS provider/size is unnamed, which is acceptable. |
| DB migrations in prod | **Missing** | Nothing says who runs `prisma migrate deploy` (API container entrypoint vs a one-off job) or in what order relative to the deploy. Two epics (infra, api) will each assume the other does it. |
| Backup | Partial | Nightly `pg_dump` to R2 private is decided. Retention, a restore drill, and where `pg_dump` runs are not. AD-15 puts it in the Nest cron, so the API image must ship a `pg_dump` matching PG 18. Say so, or move it to a sidecar/host cron. Uploaded media in R2 has no backup/versioning decision. |
| Operations: logging | Decided | pino with redaction. Caddy/Cloudflare access logs will contain download tokens in the path (`/downloads/:token/...`), which contradicts "never log tokens". Either accept this or redact in Caddy. |
| Operations: monitoring/alerting | Deferred (gated) | OK. |
| Operations: secrets | **Open** | Env file on the VPS is implied but not stated, and nothing covers rotating `VIEW_SALT`, the JWT secret or the revalidate secret. Low. |
| Security: auth | Decided | See R-8. |
| Security: CORS / helmet / CSP | **Missing** | Addendum §6 explicitly requires CORS, helmet and input validation. Input validation is covered by AD-2. CORS (credentialed, allowlist `admin.` + `web`) and helmet/CSP are not mentioned (F-10). |
| Security: trusted proxy / client IP | **Missing** | F-5. |
| Security: PII | Partial | Log redaction is decided. There is no retention decision for `Order.email`, `DownloadLog.ip` and `payer_*`. The spine hashes IPs for views but stores raw IPs in DownloadLog (FR-9 requires the IP, so this is fine, but state the retention). Low. |
| Performance / SEO | Decided | SSR/ISR + tags. |
| i18n | Decided | — |

---

## Part 2 — Reconcile (requirements dropped or contradicted)

### F-1 — Re-download "same email" dropped — **High**

- **Source:** PRD FR-9 ("Dùng lại cùng email/token còn hiệu lực thì tải luôn"), UJ-1 edge case ("quay lại trang này sau (cùng email) và bấm Download lại … tải luôn, không bắt trả tiền lần hai"), and addendum 8.1 ("Repeat downloads (same email/token) skip payment").
- **Spine:** Only token-in-URL (`/downloads/:token/:fileType`) exists. Nothing handles a buyer who returns to the Sheet page, clicks Download and enters the same email.
- **Risk:** The web epic might build "enter email → lookup". Commerce might not expose it, or might expose an enumeration oracle ("does this email own this sheet?").
- **Fix:** Add a rule to AD-8. `create-order` first checks for a PAID Order for `(email, sheetId)` whose token is still valid and covers the requested file types. If one exists, it does **not** reveal or return the token in the response. It re-sends the download email (AD-14 path, rate-limited per email) and returns `ALREADY_PURCHASED`. The modal shows "Link tải đã được gửi lại tới email của bạn." This satisfies the requirement without leaking ownership or tokens to someone who merely knows an email.

### F-2 — Draft preview contradicts "Draft 404 on every public route" — **High**

- **Source:** EXPERIENCE UJ-3 step 5 ("Xem như người dùng" opens a new tab to the detail page in preview mode) and PRD UJ-3 ("lưu ở trạng thái Draft, xem trước, rồi chuyển Published").
- **Spine:** AD-10 says "Draft trả 404 ở mọi route public". No preview mechanism is given, and admin auth lives in memory on `admin.` with a refresh cookie on `Path=/auth` for `api.`, so the web app has no admin session.
- **Fix:** Add a preview rule to AD-10. The admin requests a short-lived signed preview token from the API (`POST /admin/sheets/:id/preview-token`, TTL about 10 minutes). The web route `/[locale]/sheet/[slug]?preview=<token>` (or a Next Draft Mode route handler `/api/preview`) calls `GET /sheets/:slug?preview=<token>`. The API returns the Draft only with a valid token, and the response uses `no-store`, `noindex` and no view counting. Without a token, the 404 stays.

### F-3 — Late or pending capture on an Order already CANCELLED/FAILED loses money — **High**

- **Source:** PRD FR-8/FR-10 (PAID after COMPLETED) and EXPERIENCE (PENDING auto-expires).
- **Spine:** The cron cancels PENDING orders after 24h, and `fulfil()` only matches `status='PENDING'`. PayPal can return a capture with status `PENDING` (eCheck, payment review), and `PAYMENT.CAPTURE.COMPLETED` then arrives later, possibly after 24h. The update matches 0 rows, is treated as "already processed", and the customer has been charged with no token.
- **Fix:**
  1. The capture endpoint must record a capture that is `PENDING` at PayPal (store `paypal_capture_id`). The cron must not cancel Orders that have a `paypal_capture_id`.
  2. Allow `CANCELLED|FAILED → PAID` in `fulfil()` when a verified COMPLETED capture matches amount and currency. Alternatively, auto-refund and alert. Pick one and write it in AD-4.
  3. When 0 rows are updated, distinguish "already PAID" (no-op) from "wrong state" (log at error level and alert).

### F-4 — Capture response / success page contract undefined — **Medium-High**

- **Source:** PRD FR-9 (download buttons shown immediately on the success page), EXPERIENCE UJ-1 step 6 (success page "hiện 3 nút tải sẵn sàng ngay — không cần chờ tải trang mới"), and the IA row "Thanh toán thành công".
- **Spine:** With "0 rows → do nothing", a capture that loses the race to the webhook returns nothing useful. The success route, and how it gets the token, are also unspecified.
- **Fix:** In AD-4/AD-8, `capture` always returns `{orderCode, status, downloadToken, files[]}` for a PAID order, whether it fulfilled the order itself or found it already PAID. If the order is still PENDING at PayPal, it returns `PAYMENT_PENDING`. Define the web success route (for example `/[locale]/checkout/success?token=…`, `noindex`, `no-store`, and the same page the email link opens) plus `GET /downloads/:token` returning order summary and remaining quota. That page also renders the EXPERIENCE state "Link tải đã hết hiệu lực + nút liên hệ" when the token is expired or used up. The contact target, whether a `mailto` from SiteSetting or something else, also needs deciding.

### F-5 — Client IP behind Cloudflare → Caddy is undefined — **High**

- **Affected:** AD-11 (`visitor_hash = sha256(ip + …)`), AD-15 / NFR (login and download throttling), FR-9 (DownloadLog IP).
- **Risk:** Without a trusted-proxy rule, every request looks like it comes from Caddy's container IP. Throttling becomes global, so one abuser locks out all logins and downloads, and view dedupe collapses to one visitor per UA. Blindly trusting `X-Forwarded-For` lets clients spoof the IP.
- **Fix:** Add a convention. The API derives the client IP only from `CF-Connecting-IP`, and only when the request came through Caddy. Caddy trusts Cloudflare IP ranges (`trusted_proxies`) and overwrites the header; the origin firewall accepts only Cloudflare IPs. Express `trust proxy` is set to match. One `getClientIp()` helper is used by the throttler, views and DownloadLog. SSR fetches from web to api must not be throttled as a single client (use an internal network hostname, an allowlist, or a server-side secret header).

### F-6 — Download counting and free-download logging unassigned — **Medium**

- **Source:** Addendum §3/§6 (`Sheet.download_count`, `SheetFile.download_count`, "increments download_count then redirects", "logs every download attempt") and PRD FR-17 ("tổng lượt xem/tải theo Level", "top Sheet bán chạy").
- **Spine:** AD-8 writes DownloadLog only on the paid path, and `DownloadLog.token_id` would be null for free downloads. No rule says who increments the counters.
- **Fix:** In AD-8, every successful 302 on either path runs in one transaction: DownloadLog is written with `token_id` nullable plus `sheet_file_id`, and `SheetFile.download_count` and `Sheet.download_count` are incremented. commerce calls a `catalog.incrementDownload()` service to respect AD-1, or commerce owns the counters. Also decide whether failed or denied attempts are logged: the addendum says "every attempt".

### F-7 — Delete semantics for Sheets and taxonomy that Orders reference — **Medium**

- **Source:** FR-12 (delete Sheet/Composer/Genre/Series) and FR-15/FR-17 (order history and revenue must stay intact).
- **Fix:** Add a convention. A Sheet that has Orders cannot be hard-deleted. Use soft delete or archive (`status=ARCHIVED` or `deleted_at`, treated as a 404 publicly like a Draft) and keep the files that valid tokens still reference. Composer/Series deletion is `RESTRICT` when Sheets reference them. Deleting objects in R2 happens after the DB commit, and re-uploading a file deletes the previous object (AD-9 covers failure only, not replacement).

### F-8 — Publish invariant not stated — **Medium**

- **Source:** PRD UJ-3 edge case ("không cho lưu ở trạng thái Published thiếu file bắt buộc") and FR-13.
- **Fix:** Add a rule in catalog: the `DRAFT→PUBLISHED` transition requires a PDF with page images and a thumbnail, plus either `is_free` or a non-null price for every file type present and a bundle price when the bundle is offered. The API enforces this with `PUBLISH_REQUIREMENTS_UNMET` and `details[]`. Also define bundle semantics when a Sheet lacks MIDI or MP3 (bundle = all present files, or bundle offered only when all 3 exist).

### F-9 — Specific payment failure messages need a stable code set — **Medium-Low**

- **Source:** EXPERIENCE state "Thanh toán thất bại" (specific reason: card declined / PayPal session expired / network error; keep the selection; retry without reopening), plus the Voice & Tone rule against generic "Có lỗi xảy ra".
- **Spine:** Only the envelope `{error:{code…}}` is fixed.
- **Fix:** Enumerate payment error codes in `packages/shared`: `PAYMENT_DECLINED` (mapped from PayPal `INSTRUMENT_DECLINED`, which also triggers `actions.restart()`), `PAYMENT_SESSION_EXPIRED`, `PAYMENT_AMOUNT_MISMATCH`, `PAYMENTS_DISABLED`, `PAYMENT_PENDING`, `ALREADY_PURCHASED`, `TOKEN_EXPIRED`, `TOKEN_EXHAUSTED`. Web maps each code to vi/en microcopy. This also covers FR-9 ("trả lỗi rõ ràng … không lộ lỗi hệ thống") for token errors.

### F-10 — CORS, helmet, CSP not decided — **Medium**

- **Source:** Addendum §6 ("rate limiting on login and download, CORS, input validation, helmet").
- **Fix:** Add a Security convention row. `helmet` on the API. CORS is an allowlist of `WEB_URL` and `ADMIN_URL` with `credentials:true`, needed only for `admin.` because of the refresh cookie. A CSP baseline on web allows the PayPal SDK, YouTube-nocookie frames and the CDN, and constrains ad frames. Webhook and revalidate endpoints are excluded from CORS and require their own secret or signature. Since `SameSite=Strict` is the only CSRF defence for `/auth/refresh`, also check `Origin` there.

### F-11 — Launch gate for going live — **Low-Medium**

- **Source:** PRD NOTE FOR PM and Q1 (copyright review before `PAYPAL_MODE=live`) plus the spine's own Deferred note (staging/CI/monitoring must be reviewed before live).
- **Fix:** Collect these into one explicit "Go-live gate" list in the spine: CI green, uptime check, webhook registered in the live PayPal app, one real low-value transaction plus refund in prod, a backup restore tested, and the copyright review done. Without this, it is scattered across two Deferred bullets and will be missed.

### F-12 — Minor / quiet items

- **Mini-preview on cards** (EXPERIENCE: 10–15 s play icon on grid cards). The list DTO must carry the public note-JSON URL, or a truncated preview JSON to save bandwidth on the grid. Add it to the `catalog` list response in the shared contract.
- **Hero count and "Sheet database updated on dd/mm/yyyy"** (addendum 4.2 and SiteSetting "DB last-updated date"). Decide whether this is computed (`max(updated_at)` of PUBLISHED) or a setting, and revalidate the `level:*` tags on publish. It is currently implicit.
- **Pagination vs infinite scroll.** EXPERIENCE decides numbered, crawlable pagination. The spine's `{items,page,pageSize,total}` matches, but add "page in URL query, SSR per page" to the AD-10 rule so web doesn't build client-only paging.
- **Genre tag filters "tại chỗ"** (EXPERIENCE). This must still produce a crawlable URL (`?genre=`) to keep SSR/SEO. Add it to the same note.
- **`payments_enabled=false` shows a disabled download button** (AD-8). EXPERIENCE forbids disabled buttons only for *missing formats*, so there is no conflict, but copy for this state is needed (F-9 code `PAYMENTS_DISABLED`). Also state explicitly that existing tokens keep working (R-3).
- **Refund timestamp.** FR-17 revenue "PAID minus REFUNDED in the same period" needs `refunded_at` on Order. Add it, and decide whether revenue is bucketed by `paid_at` or `refunded_at`.
- **Admin account management** (addendum §5 "add/disable accounts") is excluded by PRD §5/§6.2 with a single SUPER_ADMIN, so the spine is correct to skip it. FR-11 "change password" should revoke refresh tokens (R-8).
- **`SheetViewDedupe` retention.** Add a purge of rows older than 48h to the AD-15 cron list.
- **Token in URL path is logged by Caddy/Cloudflare.** Accept this or redact it (see 1.5).
- **Tone / DESIGN.** No architectural conflict. `packages/tokens` is shared by web and admin, which matches DESIGN "Admin inherits kit, overrides 3 points". shadcn/ui is chosen, which resolves the EXPERIENCE "UI kit not yet chosen" note.
- **Locale URL change.** PRD/EXPERIENCE routes (`/level/beginner`, `/sheet/[slug]`) become `/vi|en/...`. This is compatible because unprefixed URLs redirect. Make sure that redirect is 307/302 (not 301 cached) since it depends on cookie/IP, and that `x-default` hreflang points to `/en`.

---

## Summary of findings

| # | Severity | Finding | Fix (short) |
| --- | --- | --- | --- |
| F-1 | High | Re-download by same email dropped | `create-order` detects an existing valid purchase, re-sends email, returns `ALREADY_PURCHASED` |
| F-2 | High | Draft preview contradicts Draft=404 | Signed short-TTL preview token; `no-store`, `noindex` |
| F-3 | High | Late/pending capture on a CANCELLED order loses money | Don't auto-cancel when a capture exists; allow `CANCELLED→PAID` or auto-refund; alert |
| F-5 | High | Client IP behind CF+Caddy undefined | `CF-Connecting-IP` via trusted proxies, one helper, origin locked to CF |
| F-4 | Med-High | Capture response and success page undefined | Capture always returns the token for PAID; define success route and `GET /downloads/:token` |
| F-6 | Medium | Download counters and free-download logs unassigned | One transaction on every 302; nullable `token_id` |
| F-7 | Medium | Delete semantics with Orders | Soft delete/archive, RESTRICT on FKs |
| F-8 | Medium | Publish invariant missing | Server-side publish gate + bundle semantics |
| F-10 | Medium | CORS/helmet/CSP missing | Security convention row |
| F-9 | Med-Low | Payment error codes | Shared enum of codes mapped to microcopy |
| R-8 | Med-Low | AD-13 guard wording ambiguous | Global `APP_GUARD` + route-allowlist test |
| R-9 | Low | Import/ownership rules only enforced by review | dependency-cruiser / no-restricted-imports in CI |
| 1.5 | Medium | Prod migrations and backup runtime unassigned | Decide who runs `migrate deploy`; ship `pg_dump` 18 or use a sidecar |
| F-11 | Low-Med | Go-live gate scattered | One checklist |
