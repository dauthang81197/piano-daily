# Review: Tech Currency & Fit (ARCHITECTURE-SPINE.md)

- **Reviewed:** 2026-09-27
- **Lens:** Was each committed technology decision checked against the web (live registry, docs, release notes), or was it asserted from memory? Does each named technology still exist and fit the others?
- **Method:** Pulled live data from `registry.npmjs.org` (latest dist-tags, peerDependencies, engines, publish times). Read the official docs for Next.js 16.3.6, next-intl, Prisma 7, NestJS 12 and Cloudflare. Unpacked `@paypal/paypal-server-sdk@2.5.0` to see which controllers it ships. Checked Docker Hub and `nodejs/docker-node` for the Node 24 image variants.

## Verdict

The version numbers are current. Every pinned version matches today's npm `latest`, except for one dist-tag trap in Prisma. The problems are fit problems that a version check cannot catch. Three decisions are wrong or incomplete as written, because the underlying APIs have changed:

- `revalidateTag` semantics (AD-10)
- PayPal webhook verification (AD-5)
- the next-intl detection order and cookie (AD-12)

A further package, nestjs-zod, has not declared support for Nest 12. Fix all four before stories are written.

## Registry snapshot (2026-09-27)

| Package | Spine | npm `latest` | Status |
| --- | --- | --- | --- |
| next | 16.3 | 16.3.6 | OK |
| react | 19.3 | 19.3.0 | OK |
| next-intl | 4.14 | 4.14.7 (peer `next ^16`) | OK version; see F3 |
| @nestjs/core | 12.1 | 12.1.0 | OK |
| @nestjs/cli | — | 12.0.7 (dep `typescript ~6.0.2`) | Confirms the TS 6.0.3 pin |
| @nestjs/throttler | — (unversioned) | 6.7.1 (peer includes `^12.0.0`) | OK; add to the Stack table |
| @nestjs/schedule | — (unversioned) | 12.0.2 (peer `^11 \|\| ^12`) | OK; add to the Stack table |
| @nestjs/config | — | 12.0.1 | OK |
| nestjs-pino (implied by the pino convention) | — | 5.2.1 (peer `^11.0.8 \|\| ^12.0.2`, `pino ^10`) | OK; add to the Stack table |
| **nestjs-zod** | 5.5 | 5.5.0, **peer `@nestjs/common ^10 \|\| ^11` only** | **Fit issue (F4)** |
| zod | 4.6 | 4.6.5 | OK |
| **prisma (CLI)** | 7.10 | **`latest` = 8.0.0-rc.17**; `prev` = 7.10.0 | **Trap (F5)** |
| @prisma/client / @prisma/adapter-pg | 7.10 | 7.10.0 / 7.10.0 | OK; the adapter is missing from the Stack |
| @paypal/paypal-server-sdk | 2.5 | 2.5.0 | Version OK; see F2 |
| @paypal/react-paypal-js | 10.5 | 10.5.1 (peer react ^19) | OK |
| tailwindcss | 4.3 | 4.3.3 | OK |
| shadcn | 4.21 | 4.21.0 (Tailwind v4 + React 19 is the default) | OK |
| @aws-sdk/client-s3 | 3.x | 3.1141.0 | See F7 |
| sharp | 0.35 | 0.35.4 (engines node >=20.9) | OK |
| tone | 15.1 | 15.1.22 (published 2025-04; `next` 15.5.42 active 2026-09) | OK, see F8 |
| @tonejs/midi | 2.0 | 2.0.28 (**last publish 2022-02-04**) | Stale, see F8 |
| resend | 6.30 | 6.30.0 | OK |
| pino | 10.3 | 10.3.1 | OK |
| turbo / pnpm | 2.11 / 12.6 | 2.11.4 / 12.6.0 | OK |

## Findings

### F1: HIGH. AD-10: in Next 16, `revalidateTag` serves stale content by default, which defeats the "no stale ads, no stale prices" goal

**Source:** nextjs.org/docs/app/api-reference/functions/revalidateTag (v16.3.6)

- In Next 16 the signature is `revalidateTag(tag, profile: string | { expire?: number })`.
- The single-argument form is deprecated and may be removed.
- The recommended `'max'` profile uses stale-while-revalidate: the next visitor still gets the old page.
- `updateTag` exists only in Server Actions. It is not available in a Route Handler called by an external service, which is exactly what `/api/revalidate` is.

AD-10's stated goal is "tắt quảng cáo hoặc publish mà vẫn hiển thị nội dung cũ" must not happen. That goal requires the following in `app/api/revalidate/route.ts`:

- `revalidateTag(tag, { expire: 0 })` for `ads`, `settings` and `sheet:{id}` (status, price, draft→404).
- `'max'` only where brief staleness is acceptable, such as `sitemap` and `level:*`.

**Also:**

- **Cache Components.** With `cacheComponents` off, which is the default, tags only attach to data that is explicitly cached. Every tagged fetch must use `fetch(url, { cache: 'force-cache', next: { tags: [...] } })`.
- **Do not enable `cacheComponents: true`.** next-intl still does not fully support it: `getTranslations`/`Link` read `headers()` inside `use cache` (next-intl issues #1493, #2074, #2229). Keep the `setRequestLocale` + `generateStaticParams` static-rendering pattern.

Record all of this in AD-10.

### F2: HIGH. AD-5: `@paypal/paypal-server-sdk` has no webhook-verification API

I unpacked v2.5.0. It ships these controllers only:

- `Orders`
- `Payments`
- `Vault`
- `Subscriptions`
- `TransactionSearch`
- `OAuthAuthorization`

The mapping to the port:

- `createOrder` and `captureOrder` are in `OrdersController`.
- Refund is `PaymentsController.refundCapturedPayment`.
- **Nothing covers `POST /v1/notifications/verify-webhook-signature`.**

The port's `verifyWebhook` must therefore be implemented as follows:

- **Transport:** a raw HTTPS call from the `paypal` adapter.
- **Auth:** reuse the SDK's OAuth token (`OAuthAuthorizationController`) or call `/v1/oauth2/token` directly.
- **Request fields:** `auth_algo`, `cert_url`, `transmission_id`, `transmission_sig`, `transmission_time`, `webhook_id` and the raw `webhook_event`.
- **Raw body:** the endpoint needs the unmodified request body. Enable `rawBody: true` in `NestFactory.create`, and do not let the zod pipe reshape the body before verification.

Add `PAYPAL_WEBHOOK_ID` to the config schema. Amend AD-5 to read "adapter uses SDK for Orders/Payments and direct REST for verify-webhook-signature".

### F3: HIGH. AD-12: next-intl does not implement the spine's detection order, and its cookie is session-only

**Source:** next-intl.dev routing/middleware and routing/configuration

1. **Middleware is now `proxy.ts`.** Next 16 renamed `middleware.ts` to `proxy.ts`, and next-intl's docs follow suit. The Capability Map line "FR-19 … web middleware" should say `apps/web/src/proxy.ts`. Proxy runs on the Node runtime.

2. **Detection order.** next-intl's built-in order is: prefix → `NEXT_LOCALE` cookie → **Accept-Language** → default. It never reads `CF-IPCountry`. AD-12 requires cookie → `CF-IPCountry == VN` → `en`, and ignores Accept-Language. Setting `localeDetection: false` does not help, because it disables both the cookie and Accept-Language. The fix is to wrap `createMiddleware(routing)` in `proxy.ts`:
   - For an unprefixed path, compute the locale yourself: cookie, then `request.headers.get('cf-ipcountry')`, then `en`.
   - Redirect to it.
   - Delegate prefixed paths to next-intl.

3. **Cookie lifetime.** In v4, `NEXT_LOCALE` is a **session cookie** by default, with no `max-age`. "IP chỉ quyết định lần đầu" therefore resets every browser session. If persistence is intended, set `localeCookie: { maxAge: 60*60*24*365 }`. That makes it a non-essential preference cookie, which has consent implications.

4. **`CF-IPCountry` availability.** The header is on all plans, including Free, but only when **Network → IP Geolocation** is enabled and the request is actually proxied. Caddy forwards it by default. Two operational items to add:
   - Treat the header as trusted only if the origin firewall accepts Cloudflare IP ranges only.
   - Add to the runbook that IP Geolocation must be switched on.

### F4: MEDIUM. AD-2: `nestjs-zod@5.5.0` does not declare support for Nest 12; Nest 12 now does this natively

- **Peer range.** nestjs-zod 5.5.0 (published 2025-07) declares `@nestjs/common ^10 || ^11`. PR #478 (Nest 12 support) is still open.
- **Runtime.** Downstream reports show it works at runtime on Nest 12.1.0 with an override (pigulla/skill-matrix#14, 2026-09-24).
- **Native alternative.** NestJS 12 (released 2026-08-28) ships **Standard Schema support**: `@Body({ schema })` / `@Query` / `@Param`, plus `StandardSchemaValidationPipe` and `StandardSchemaSerializerInterceptor`. zod 4 implements Standard Schema.

**Fix, preferred.** Drop `nestjs-zod`. Validate with Nest 12's native Standard Schema support, using the same `packages/shared` zod schemas. Map zod errors to `{error:{code,message,details}}` in one exception filter.

**Alternative.** Keep nestjs-zod 5.5.0 with `pnpm.peerDependencyRules.allowedVersions: { "nestjs-zod>@nestjs/common": "12" }`, and track PR #478.

Update the Stack row either way.

### F5: MEDIUM. Prisma: the CLI's `latest` dist-tag is 8.0.0-rc.17, and Prisma 7 needs specific wiring for Nest

**The trap.** `pnpm add -D prisma` installs **8.0.0-rc.17** today, while `@prisma/client` `latest` is 7.10.0. The CLI and client would then be out of lockstep.

**Pin.** Use exact versions: `"prisma": "7.10.0"`, `"@prisma/client": "7.10.0"`, `"@prisma/adapter-pg": "7.10.0"`.

**Prisma 7 facts the spine should record**, since it names none of them:

- **Generator.** `provider = "prisma-client"` (not `prisma-client-js`), with a required `output` (e.g. `apps/api/src/generated/prisma`) and generated code gitignored.
- **Driver adapter.** Mandatory: `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`.
- **Config file.** `apps/api/prisma.config.ts` holds the schema path, migrations and seed.
- **Env loading.** `.env` is no longer auto-loaded. The zod `ConfigModule` must own `DATABASE_URL` for the CLI as well, via `dotenv` in `prisma.config.ts`.
- **Module format.** If `apps/api` stays CommonJS, set `moduleFormat = "cjs"` explicitly. Releases before 7.10 guessed wrong under `module: nodenext`. Nest 12's own packages are ESM-only but load from CJS via `require(esm)` on Node 24.
- **Decide explicitly.** `nest new` in v12 now asks whether to generate ESM or CJS. Record the choice in the spine, because it sets:
  - Prisma's `moduleFormat`
  - Jest vs Vitest as the default runner
  - tsconfig `module`

Search remains fine: the `tsvector` generated column is `Unsupported("tsvector")`, created with hand-written migration SQL, as the spine already says.

### F6: MEDIUM. AD-9: `pdftoppm` is not in any `node:24` image

- **Image contents.** `node:24.21-*` images do not include `poppler-utils`. The Debian default for Node 24 is **bookworm** (Node 26 moves to trixie); Alpine 3.23 and 3.24 variants also exist.
- **Fix.** Make the API Dockerfile base explicit, e.g. `node:24.21-bookworm-slim`, and add `apt-get install -y --no-install-recommends poppler-utils`.
- **Stack table.** "distro" should name the base image and resulting poppler version: 22.12 on bookworm, 25.x on trixie.
- **sharp.** 0.35.4 ships prebuilt binaries for glibc and musl.
- **pnpm build scripts.** pnpm ≥10 blocks dependency lifecycle scripts unless they are allowlisted. Check the build-script allowlist for `@prisma/engines`, `sharp`, `@swc/core` and `@parcel/watcher`; the last two come in through next-intl 4.14.

### F7: LOW-MEDIUM. AD-6: R2 and the AWS SDK default checksums

- **Default behavior.** `@aws-sdk/client-s3` since 3.729 sends CRC32 checksums by default (`requestChecksumCalculation: 'WHEN_SUPPORTED'`).
- **Compatibility.** R2 and some S3-compatible servers have rejected these checksums or handled them inconsistently, and reports are mixed as of 2026.
- **Fix.** Construct the client with `requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED'`. Add a smoke test of `PutObject` and a presigned GET against both SeaweedFS 4.47 and R2.

### F8: LOW. Tone.js and @tonejs/midi maintenance

- **tone.** The stable 15.1.22 is 17 months old. The repo is active (pushed 2026-09-16), with prereleases on `next` (15.5.x). Pin exactly `15.1.22`.
- **@tonejs/midi.** Last published 2022-02, so effectively unmaintained. Risk is low: it runs server-side, only on admin uploads, and is a pure-JS parser. Wrap it behind the `media` MIDI converter so it can be swapped for `midi-file` if it breaks.

### F9: LOW. Runtime and deferred items

- **Node 24.** Enters **maintenance on 2026-10-20**; Node 26 becomes LTS on 2026-10-28, per `nodejs/docker-node` versions.json. This is consistent with the Deferred item. Add a date to it: revisit in Q1 2027.
- **Stack table gaps.** Add `@nestjs/throttler 6.7`, `@nestjs/schedule 12.0`, `@nestjs/config 12.0`, `nestjs-pino 5.2`, `@prisma/adapter-pg 7.10` and Caddy (unversioned), so that "unversioned in spine" does not become "whatever `latest` is on install day".

## Confirmed without issue

- **TypeScript.** The pin to 6.0.3 is justified: `@nestjs/cli@12.0.7` depends on `typescript ~6.0.2`.
- **Throttler and schedule.** `@nestjs/throttler` 6.7.1 and `@nestjs/schedule` 12.0.2 both declare Nest 12 peers.
- **Frontend libraries.** next-intl 4.14.7 declares `next ^16`. shadcn 4.21 defaults to Tailwind v4 with React 19. react-paypal-js 10.5.1 accepts React 19.
- **PayPal Orders and refunds.** Orders v2 create/capture and refund of a capture are covered by the SDK.
- **CF-IPCountry.** Available on the Cloudflare Free plan, subject to the conditions in F3.

## Sources

- npm registry: `https://registry.npmjs.org/<pkg>` (queried 2026-09-27)
- https://nextjs.org/docs/app/api-reference/functions/revalidateTag
- https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents
- https://next-intl.dev/docs/routing/middleware
- https://next-intl.dev/docs/routing/configuration
- https://github.com/amannn/next-intl/issues/1493, /2074, /2229
- https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7
- https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators
- https://trilon.io/blog/nestjs-12-is-now-available
- https://docs.nestjs.com/migration-guide
- https://github.com/BenLorantfy/nestjs-zod/pull/478
- https://github.com/pigulla/skill-matrix/issues/14
- https://developer.paypal.com/community/blog/paypal-has-updated-its-webhook-verification-endpoint/
- https://developers.cloudflare.com/network/ip-geolocation/
- https://community.cloudflare.com/t/aws-sdk-client-s3-v3-729-0-breaks-uploadpart-and-putobject-r2-s3-api-compatibility/758637
- https://raw.githubusercontent.com/nodejs/docker-node/main/versions.json
- `npm pack @paypal/paypal-server-sdk@2.5.0` (controller list inspected locally)
