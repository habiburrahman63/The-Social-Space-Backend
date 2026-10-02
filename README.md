# Backend — Social Space API

Express + TypeScript REST API on **MongoDB with a normalized, multi-collection
schema** (Mongoose). There is no local-file fallback anymore — a real,
reachable MongoDB is required, which is the whole point of this
architecture.

## Structure

```
Backend/
├── config/
│   ├── env.ts             Centralized environment variable access
│   └── database.ts        Mongoose connection singleton
├── models/                 One file per collection (schema + indexes)
│   ├── User.ts, Session.ts, Post.ts, Comment.ts, Conversation.ts,
│   │   Message.ts, Notification.ts, Page.ts, Group.ts, GroupMember.ts,
│   │   Story.ts, MarketplaceItem.ts, Event.ts, Report.ts,
│   │   VerificationCode.ts, Settings.ts
│   ├── plugins.ts          Shared `_id` → `id` string transform
│   └── index.ts            Re-exports every model
├── services/                Data-access helpers shared across controllers
│   (authService, userService, postService, messageService, notificationService)
├── controllers/              Request handlers, one file per feature area
├── routes/                    authRoutes.ts, apiRoutes.ts
├── middleware/                 auth.ts (JWT), cors.ts
├── utils/                       serialize.ts, createRouter.ts
├── migrations/
│   └── migrate.ts                One-time script: old `states` blob → new collections
├── server.ts                      Standalone dev/production entry point
└── api-entry.ts                    Serverless entry point (Vercel/Netlify)
```

## Setup

```bash
npm install
```

`.env` is already filled in with working values (see the root README's note
about rotating the MongoDB/SMTP credentials — they were real, live
credentials found in the original project).

## Migrating your existing data

Your current database has one `states` collection holding a single document
with everything nested inside a `data` field (`users`, `posts`, `messages`,
etc., all as arrays). Run the migration once against that same
`MONGODB_URI` to populate the new collections:

```bash
npm run migrate
```

- It's safe to re-run: if `users` already has documents, it aborts by
  default (use `npm run migrate:force` to wipe the new collections and redo it).
- Nothing is deleted: the old `states` collection is renamed to
  `states_pre_migration_backup` at the end, not dropped.
- It prints a per-collection count summary when done.

## Run

```bash
npm run dev      # tsx watch server.ts — http://localhost:3000, auto-restarts on changes
npm run build    # bundles to dist/server.cjs and dist/api-entry.cjs
npm start        # node dist/server.cjs (production)
npm run lint     # tsc --noEmit — type-check without emitting files
```

## Environment variables (`.env`)

| Variable       | Purpose                                                        |
|----------------|------------------------------------------------------------------|
| `PORT`         | Port the API listens on (default `3000`)                       |
| `MONGODB_URI`  | MongoDB Atlas connection string (required — no fallback)       |
| `JWT_SECRET`   | Secret used to sign session tokens                               |
| `SMTP_HOST/PORT/USER/PASS/FROM` | Used to send password-reset code emails (signup no longer requires email verification) |
| `CORS_ORIGIN`  | Comma-separated list of allowed Frontend origins, or `*` for any |

## Database design notes

See the top-level migration report shared with this delivery for the full
rationale. In short:
- Every document exposes a plain string `id` field (not `_id`) in API
  responses, so the **Frontend needs no changes**.
- Author/seller/creator info (`username`, `avatar`, etc.) is no longer
  duplicated on every post/comment/message — it's populated from the `User`
  document at read time. Editing your profile now updates everywhere
  instantly, with no cascading writes needed.
- `Comment` is its own collection (was an unbounded array on `Post`).
- `Story` documents auto-expire via a MongoDB TTL index (was manual 24h
  filtering in application code).
- `VerificationCode` also uses a TTL index for automatic cleanup.
- Friends/followers/following stay as ObjectId reference arrays on `User`
  (indexed) — a deliberate, documented tradeoff at this app's scale; see the
  migration report for the scale-up path if this ever needs to change.

## API

Endpoints and paths are **unchanged** from before this migration — same 56
`/api/*` routes plus 9 `/api/auth/*` routes, same request/response shapes.
`GET /api/health` and `GET /health` return `{ status: "ok" }` for uptime checks.
