# Church ICT Service Management Platform

A full-stack platform for church organizations to manage ICT support requests, equipment/room bookings, and internal communication — replacing WhatsApp threads, phone calls, and spreadsheets.

## Architecture

**Stack:** Node.js + Express (REST API) · PostgreSQL · vanilla HTML/JS frontend (Tailwind via CDN) · JWT authentication.

The backend is a modular monolith: each domain (auth, tickets, bookings, items, FAQs, announcements, notifications, admin) has its own route file under `src/routes/`, sharing one PostgreSQL connection pool and one JWT-based auth middleware. This keeps deployment to a single Node process while still being easy to navigate and test file-by-file.

The frontend is a single-page app (`public/index.html`) that calls the REST API directly with `fetch`. It was kept intentionally framework-free to minimize build tooling and keep the whole project runnable from a phone/lightweight environment — there's no bundler, no `npm run build` step; Express just serves `public/` as static files.

```
├── index.js                  # App entrypoint — wires routes, middleware, Swagger UI
├── src/
│   ├── config/database.js    # PostgreSQL connection pool
│   ├── middleware/auth.js    # JWT verification + role-based access guards
│   ├── routes/                # One file per domain (auth, tickets, bookings, items, faqs, announcements, notifications, admin)
│   └── utils/notify.js       # Shared helper to write in-app notifications
├── public/index.html         # Frontend SPA (login/register, dashboard, admin panel)
├── db/schema.sql             # Full schema, constraints, indexes
├── scripts/migrate.js        # Applies schema.sql to DATABASE_URL
├── scripts/seed.js           # Creates a default admin + sample items/FAQs
├── docs/openapi.json         # OpenAPI 3.0 spec, served at /api/docs
├── tests/                    # Jest + Supertest suite against the real app
└── .github/workflows/ci.yml  # Runs the test suite on every push/PR
```

## Database ERD

```
users (id, name, email, password, role, created_at)
  │
  ├──< tickets (id, user_id → users.id, assigned_to → users.id,
  │             category, description, priority, status, created_at, updated_at)
  │
  ├──< bookings (id, user_id → users.id, item_id → items.id,
  │              start_time, end_time, purpose, status, created_at)
  │
  ├──< announcements (id, title, body, posted_by → users.id, created_at)
  │
  └──< notifications (id, user_id → users.id, message, is_read, created_at)

items (id, name, type[Equipment|Room], description, status, created_at)
  └──< bookings (item_id → items.id)

faqs (id, question, answer, created_at)   -- standalone, no FK
```

Relationships are 1:M throughout — one user has many tickets/bookings/notifications; one item has many bookings. Foreign keys cascade on delete for tickets/bookings (so removing a user cleans up their records) and `SET NULL` for `tickets.assigned_to` (so removing a staff member doesn't delete the ticket, just unassigns it).

**Double-booking prevention** is enforced in two layers:
1. **Application layer** (`src/routes/bookings.js`): before inserting, checks for any existing `Pending` or `Approved` booking on the same item whose time range overlaps the requested one, using Postgres's `OVERLAPS` operator.
2. **Database layer** (`db/schema.sql`): a `EXCLUDE USING gist` constraint on `bookings` guarantees no two `Approved` bookings for the same item can ever overlap, even under concurrent requests — the application check alone has a race-condition window; the DB constraint closes it.

## Core Workflow

Tickets move through `Pending → Assigned → In Progress → Resolved → Closed`. The status-update endpoint (`PATCH /api/tickets/:id/status`) enforces this as a state machine — only valid forward (and limited corrective backward) transitions are accepted; e.g. you cannot jump from `Pending` straight to `Resolved`.

## Setup

### 1. Prerequisites
- Node.js 18+
- A PostgreSQL database (local, or a free hosted instance — [Neon](https://neon.tech), [Render](https://render.com), [Railway](https://railway.app) all work)

### 2. Install
```bash
npm install
cp .env.example .env
# edit .env: set DATABASE_URL to your Postgres connection string, and JWT_SECRET to a random string
```

### 3. Set up the database
```bash
npm run migrate   # creates all tables, constraints, indexes
npm run seed       # creates a default Admin account + sample equipment/rooms/FAQs
```
The seed script prints the admin login it created (defaults to `admin@church.org` / `ChangeMe123!` unless overridden via `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in `.env`).

### 4. Run
```bash
npm start        # production
npm run dev       # auto-restart on change (nodemon)
```
Visit `http://localhost:3000` for the app, `http://localhost:3000/api/docs` for interactive API documentation (Swagger UI).

### 5. Test
```bash
npm test
```
Tests run against the real Express app and route handlers, with the PostgreSQL pool swapped for an in-memory fake (`tests/mockPool.js`) so they run anywhere without a live database — including in CI.

## Deployment

Any Node host works. A simple path:
1. Push this repo to GitHub.
2. Create a free Postgres database (e.g. Neon) and run `npm run migrate` / `npm run seed` against it once (locally, pointed at the hosted `DATABASE_URL`).
3. Deploy to [Render](https://render.com) or [Railway](https://railway.app): connect the GitHub repo, set `DATABASE_URL` and `JWT_SECRET` as environment variables, set the start command to `npm start`.
4. GitHub Actions (`.github/workflows/ci.yml`) runs the test suite automatically on every push/PR to `main`.

## Roles

| Role  | Can do |
|-------|--------|
| User  | Register/login, submit tickets, request bookings, view FAQs/announcements, manage own notifications |
| Staff | Everything a User can, plus: view/assign/update all tickets, approve/reject all bookings |
| Admin | Everything Staff can, plus: manage users & roles, manage equipment/rooms, publish FAQs/announcements, view platform statistics |

New registrations always start as `User`. Promote someone to `Staff`/`Admin` via the Admin panel (`PATCH /api/admin/users/:id/role`) after they've registered.

## What's implemented vs. bonus

**Implemented:** full auth + RBAC, tickets with enforced status workflow, bookings with two-layer double-booking prevention, equipment/room management, FAQs, announcements, in-app notifications, admin stats, Swagger docs, automated tests, CI pipeline.

**Not implemented in this pass** (noted here rather than half-built): real-time (WebSocket) notifications — current notifications are poll/refresh-based, not push; email notifications; file uploads (e.g. attaching a photo to a ticket); Docker packaging; response caching. These are reasonable next additions but were deprioritized to keep the core workflow fully correct within the time available.
