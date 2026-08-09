# 📁 Project Directory Structure

Reference map of the repository for the **Church ICT Service Management Platform**. Reflects the actual codebase (not a plan) — every path below exists and does what's described.

```text
church-ict-platform/
├── .github/
│   └── workflows/
│       └── ci.yml               # GitHub Actions — runs the Jest suite on every push/PR
├── db/
│   └── schema.sql                # Full schema: users, items, bookings, tickets, faqs,
│                                  # announcements, notifications + constraints/indexes
├── docs/
│   └── openapi.json              # OpenAPI 3.0 spec — served live at /api/docs (Swagger UI)
├── public/
│   └── index.html                # Entire frontend SPA: login/register, user dashboard
│                                  # (tickets, bookings, equipment, FAQs, announcements,
│                                  # notifications), and admin panel — one file, vanilla JS
├── scripts/
│   ├── migrate.js                # Applies db/schema.sql to DATABASE_URL
│   └── seed.js                   # Creates a default Admin account + sample items/FAQs
├── src/
│   ├── config/
│   │   └── database.js           # PostgreSQL connection pool (pg.Pool)
│   ├── middleware/
│   │   └── auth.js               # JWT verification (authenticateToken) +
│   │                              # role guard (requireRole)
│   ├── routes/
│   │   ├── auth.js               # POST /register, /login, GET /me
│   │   ├── tickets.js            # ICT ticket CRUD + status workflow state machine
│   │   ├── bookings.js           # Room/equipment bookings + double-booking prevention
│   │   ├── items.js              # Equipment & room management (Admin CRUD)
│   │   ├── faqs.js               # Knowledge base (public GET, Admin write)
│   │   ├── announcements.js      # Announcements (public GET, Admin write)
│   │   ├── notifications.js      # Per-user in-app notifications
│   │   └── admin.js              # User management, role changes, platform stats
│   └── utils/
│       └── notify.js             # Shared helper — writes a notification row
├── tests/
│   ├── app.test.js               # Jest + Supertest — real routes, real app instance
│   └── mockPool.js               # In-memory fake of pg.Pool so tests run with no live DB
├── .env.example                  # Template for required environment variables
├── .gitignore
├── index.js                       # Express app entrypoint — wires all routes + Swagger UI
├── package.json
└── README.md                      # Setup, architecture, ERD, deployment instructions
```

## 🏗️ Core Architectural Modules

* **`db/`** — Single source of truth for the schema. `bookings` carries a `EXCLUDE USING gist` constraint so no two `Approved` bookings can overlap for the same item, even under concurrent writes — this is enforced at the database level, not just in application code.
* **`src/routes/`** — One file per domain, each a self-contained Express `Router`. `tickets.js` enforces the `Pending → Assigned → In Progress → Resolved → Closed` workflow as a state machine (`VALID_TRANSITIONS`), rejecting any status change that skips a step.
* **`src/middleware/auth.js`** — `authenticateToken` verifies the JWT and attaches `req.user`; `requireRole(...)` is composed into routes that need Staff/Admin-only access.
* **`docs/openapi.json`** — Hand-written to match every implemented endpoint exactly (not aspirational); mounted live at `/api/docs` via `swagger-ui-express`.
* **`tests/`** — `mockPool.js` intercepts SQL calls the real routes make and answers them from an in-memory store, so `app.test.js` exercises the actual route handlers and middleware (auth, RBAC, overlap checks, status transitions) without needing a live Postgres instance — this is what CI runs.
* **`public/index.html`** — No build step, no framework. Talks to the API with `fetch`. Kept as one file deliberately, to stay easy to edit from a phone.
