---
title: Piano Daily - Addendum
purpose: Depth captured during brief discovery that belongs downstream (PRD / architecture) or doesn't fit the brief's 1-2 page shape.
---

## Reference site (visual/UX inspiration)

User supplied 4 screenshots from `pianosnap.com` (in `_bmad-output/img/`) as the visual/UX direction for Piano Daily's basic site experience:

1. **Level landing page** (`/level/beginner`) — top nav (Home, Search, Beginner, Intermediate, Advanced, Expert), hero banner with search box ("Type song name, lyrics, or ID..."), tag cloud of genres/topics, grid of sheet cards (thumbnail, title, composer, view count, tags like [Sheet][Chords][Mp4/Midi], page count).
2. **Sheet detail page** — breadcrumb, title (song + composer + format: PDF/MIDI/MP4/Tutorial), level badge, view count + last updated date, genre tag, list of related sheets (same series/composer), 3 download buttons (Download PDF / .mp3 / .mid), embedded audio player.
3. **Interactive practice player** — "Play & Practice this piece" — animated falling-notes style virtual keyboard synced to playback, sheet image rendered inline below the player, sidebar of related/discover-more sheets.
4. **Per-format download blocks + embedded YouTube tutorial** — separate call-out cards for "Download audio MIDI (.mid)" and "Download MP3", embedded YouTube video showing a synced piano-roll tutorial, disclaimer about third-party embeds, and a "Lyrics & Chords" section below.

Note: pianosnap.com is ad-monetized (visible display ads throughout, incl. mid-content). Piano Daily's monetization model is pay-per-download / bundle via PayPal instead (or possibly in addition to — open question, see Open Questions in brief).

## Section 8 — Payment (PayPal) feature spec, as supplied verbatim by user

### 8.1 Business flow
- Any Download button (PDF / .mid / .mp3) opens a payment modal instead of downloading immediately:
  - Shows song title, file type, price
  - Choice: buy single file or bundle (PDF + MIDI + MP3) at a discounted bundle price
  - Email capture to receive the download link (guest checkout, no account required)
  - PayPal button (PayPal JS SDK — Smart Payment Buttons, supports Visa/Mastercard via PayPal)
- On successful payment:
  - "Payment success" page with download buttons for purchased files
  - Email sent with a re-download link (download token, valid for N days / max M downloads)
- Repeat downloads (same email/token) skip payment
- Admin can mark a sheet FREE (price = 0) → Download works immediately, same as today
- Online sheet viewing, MIDI player playback, and YouTube video remain free — only file downloads are paid

### 8.2 Backend/technical
- PayPal REST API — Orders v2, server-side only, never trust client-supplied price:
  - `POST /payments/paypal/create-order { sheetId, fileTypes[] | bundle, email }` → backend computes price from DB, creates internal Order (PENDING), calls PayPal to create the order, returns `paypalOrderId`
  - `POST /payments/paypal/capture-order { paypalOrderId }` → calls PayPal capture, verifies `status = COMPLETED` and amount/currency match the internal Order, flips Order to PAID, generates download token, sends email
  - `POST /webhooks/paypal` → verifies webhook signature, handles `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.DENIED`; must be idempotent (processing the same event twice must not double-credit)
- Currency: USD only (PayPal doesn't support VND)
- `GET /files/:id/download?token=...` — returns a signed URL only if the token is valid, paid, matches the purchased file, unexpired, and has downloads remaining; logs every download attempt
- Files live in private storage; the origin URL is never exposed to the frontend
- Config via `.env`: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_MODE` (sandbox | live); defaults to sandbox in development
- Email via SMTP or a provider (Resend/SendGrid), configured via `.env`

### 8.3 Data model additions
- **Sheet**: `price_pdf`, `price_midi`, `price_mp3`, `price_bundle` (decimal, USD), `is_free`
- **Order**: `id`, `order_code`, `email`, `sheet_id`, `items` (json: file types + prices), `amount`, `currency`, `status` (PENDING | PAID | FAILED | REFUNDED | CANCELLED), `paypal_order_id`, `paypal_capture_id`, `payer_email`, `payer_name`, `paid_at`, `created_at`
- **DownloadToken**: `id`, `order_id`, `token` (random, unique), `expires_at`, `max_downloads`, `used_downloads`
- **DownloadLog**: `id`, `token_id`, `file_id`, `ip`, `user_agent`, `created_at`
- **PaymentEvent**: `id`, `provider_event_id` (unique), `type`, `payload` (json), `processed_at` — webhook audit log

### 8.4 Admin additions
- Sheet form: per-file-type price inputs, bundle price, "Free" checkbox
- Bulk pricing tool (by level / composer / genre)
- **Orders** page: list, filter by status/date/email, order detail, download history, resend download email, extend token, refund (calls PayPal Refund API)
- Dashboard: revenue by day/month, order count, best-selling sheets
- Settings: toggle payments on/off, default token validity (days) and max downloads

## Sections 1-7 — Full technical requirements, as supplied verbatim by user (translated headers, content kept close to original)

### 1. Overview
Build a piano sheet-music sharing website. Users browse by level, search, view sheets online, preview audio (MIDI player with piano roll), watch YouTube tutorial videos, and download PDF/MIDI(.mid)/MP3 files.

Three parts:
1. **Frontend User** — public viewing site
2. **Frontend Admin** — admin/management site (login required)
3. **Backend API** — auth, CRUD, file upload/storage, analytics

### 2. Suggested tech stack (negotiable)
- Frontend User: Next.js (App Router, SSR/SSG for SEO) + TailwindCSS
- Frontend Admin: Next.js or React+Vite, UI kit (shadcn/ui or Ant Design)
- Backend: Node.js (NestJS or Express) + TypeScript
- Database: PostgreSQL + Prisma ORM
- File storage: S3-compatible (MinIO locally, AWS S3/Cloudflare R2 in production)
- Auth: JWT (access + refresh), bcrypt password hashing
- Everything runs via Docker Compose (web, admin, api, postgres, minio)

### 3. Data model
- **Sheet**: id, slug, title, subtitle, composer_id, level (BEGINNER|INTERMEDIATE|ADVANCED|EXPERT), difficulty_score (0-100), difficulty_note, description, lyrics_chords (markdown), youtube_url, series_id (nullable), page_count, has_sheet/has_chords/has_midi/has_mp3/has_video, view_count, download_count, is_hot, status (DRAFT|PUBLISHED), timestamps
- **SheetFile**: id, sheet_id, type (PDF|MIDI|MP3|THUMBNAIL|PAGE_IMAGE), storage_key, original_name, size, mime_type, page_number, download_count
- **Composer**: id, name, slug, bio, avatar
- **Genre**: id, name, slug, icon — many-to-many with Sheet (SheetGenre)
- **Series** (e.g. "Practical Method for Beginners, Op. 599"): id, name, slug, composer_id
- **AdSlot**: id, position (HEADER|SIDEBAR_LEFT|SIDEBAR_RIGHT|IN_LIST|STICKY_BOTTOM|IN_CONTENT), html_code or image+link, is_active
- **User (admin)**: id, email, password_hash, name, role (SUPER_ADMIN|EDITOR), is_active, last_login_at
- **SiteSetting**: key/value (site name, logo, SEO description, YouTube channel link, DB last-updated date, ...)

*(Payment-related tables — Order, DownloadToken, DownloadLog, PaymentEvent, and Sheet price fields — are specified separately above under "Section 8".)*

### 4. Frontend User — pages & features

**4.1 Shared layout**: header (logo, Home | Search | Beginner | Intermediate | Advanced | Expert), footer (about, links, copyright disclaimer), ad slots rendered from AdSlot (toggle from admin), responsive/mobile.

**4.2 Home / Level page** (`/level/[level]`): hero banner with title + subtitle showing total count ("325 Sheet PDFs Beginner with MIDI & MP4") + large search box; "Sheet database updated on dd/mm/yyyy" line; genre tag cloud with icons (click to filter); card grid (3 cols desktop / 1 col mobile) — thumbnail (first PDF page) + level badge + HOT badge, title, composer, view count, format labels ([Sheet][Chords][Mp4/Midi]), page count, play icon (preview) and note icon (MIDI); pagination or infinite scroll; sort by newest/most-viewed.

**4.3 Search page** (`/search?q=`): search by title, composer, lyrics, or ID; filters by level, genre, composer, available formats.

**4.4 Composer page** (`/composer/[slug]`) and **genre page** (`/genre/[slug]`): info + card grid of sheets.

**4.5 Sheet detail page** (`/sheet/[slug]` or `/pdf/[id]`): breadcrumb; H1 "{Title} PDF, MIDI, MP4 & Tutorial"; meta (composer, level, available formats); view count, updated date, "Download PDF (n pages)" link, genre; list of sheets in the same series; download buttons (PDF/.mp3/.mid); **MIDI player with piano roll** (play/replay, seek bar, speed 0.5x-2x, falling notes onto a virtual keyboard via Tone.js + @tonejs/midi or html-midi-player, "Play & Practice this piece" button, disclaimer that audio is simulated/for reference only); sheet rendered as per-page images (from PDF) with a difficulty header (e.g. 15/100); separate download call-out boxes for MIDI and MP3; embedded responsive/lazy-loaded YouTube video + third-party disclaimer; "Lyrics & Chords" section (if present); sidebar with a prominent Download PDF button + related sheets (same composer/series/level); SEO (meta title/description, Open Graph, JSON-LD MusicComposition, sitemap.xml).

### 5. Frontend Admin
- Login (email+password), logout, change password; protected admin routes
- Dashboard: sheet counts by level, total views/downloads, top-viewed sheets, recently updated
- Sheet management (searchable/filterable/paginated table): create/edit/delete, Draft/Published toggle, HOT flag; form fields: title, auto-generated slug, composer, series, genres (multi-select), level, difficulty score/note, description, lyrics & chords (markdown editor), YouTube link (with preview); file upload (PDF/MIDI/MP3, drag-drop, progress bar) — uploading a PDF auto-counts pages and generates a first-page thumbnail + per-page images; live preview of MIDI player and video inside the form
- Composer/Genre/Series management: basic CRUD
- Ad management: CRUD AdSlot, toggle by position
- Site settings: site name, logo, default SEO, YouTube channel link
- Admin account management (SUPER_ADMIN only): add/disable accounts, role assignment

### 6. Backend API
- **Auth**: POST /auth/login, /auth/refresh, /auth/logout, GET /auth/me; role-checking middleware
- **Public API** (no auth): GET /sheets (filter by level/genre/composer/q/sort/page), GET /sheets/:slug (with files, series, related sheets — increments view_count with anti-spam by IP/cookie), GET /composers, /genres, /series, /settings, /ads, GET /files/:id/download (increments download_count then redirects to a short-lived signed URL)
- **Admin API** (JWT required): CRUD for sheets, composers, genres, series, ads, settings, users
- **Upload**: POST /admin/sheets/:id/files (multipart), mime-type/size validation (PDF/MP3 ≤ 20MB, MIDI ≤ 2MB); PDF→image via pdf.js/pdftoppm or sharp
- **Search**: PostgreSQL full-text search (tsvector on title, composer, lyrics)
- Security: rate limiting on login and download, CORS, input validation (zod/class-validator), helmet
- Seed data: 1 admin account, 4 levels, a few composers/genres, 10 sample sheets

### 7. Deliverables
- Monorepo layout: `/apps/web`, `/apps/admin`, `/apps/api`, `/packages/shared` (shared types)
- `docker-compose.yml`, `.env.example`, README with local run instructions
- TypeScript throughout, clear module boundaries, DB migrations
- Suggested build order: (1) database + auth API, (2) CRUD + upload, (3) admin UI, (4) user UI + MIDI player, (5) SEO + optimization
- **Note:** this build order does not mention the payment feature (Section 8) at all — open question below on whether payment is in scope for the first build phase or a later addition.

## Open questions raised by this content (to resolve before/in PRD)

- Copyright/licensing of sheet content — user confirmed content is self-arranged/adapted from original sheets ("biến tấu", not verbatim copies), which lowers but does not eliminate legal risk (arrangements of copyrighted compositions can still require rights depending on jurisdiction and the underlying work's copyright status).
- Confirmed: monetization is **both** ads (AdSlot system, Section 3/4.1) **and** pay-per-download (Section 8) — not an either/or.
- Confirmed: personal project, but built with a business/revenue intent, not just a hobby.
- Confirmed: users span beginners, teachers, parents, and experienced players (broad, not a single niche persona).
- Open: the build order in Section 7 (DB+auth → CRUD/upload → admin UI → user UI/MIDI player → SEO) does not include the payment feature — is payment part of the initial MVP build, or a phase added after the core content platform ships?
- Open: business goals/targets — timeline, revenue target, or launch date not yet stated.
- Confirmed: v1 UI is bilingual (Vietnamese + English), locale auto-selected by visitor IP geolocation — Vietnam IP → Vietnamese, any other IP → English default; manual language switch also available. Implementation detail (not yet decided): IP geolocation source/library (e.g. Cloudflare geo headers, MaxMind GeoIP, ipapi), and whether detection happens at edge/CDN or in the Next.js app — left for Architecture.
