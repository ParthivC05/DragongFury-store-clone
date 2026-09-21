# About

This is the Partner Platform user backend repository. It provides a minimal base with one test API used to verify backend–frontend connectivity. All required commands are in `package.json`.

- **Test API:** `GET /api/status` — returns `{ "status": "ok", "message": "Backend connected" }` (no database required).
- **Optional:** `GET /api/healthcheck` — checks database connection; returns 503 if DB is down.

The server starts even if the database is not configured or unreachable.

## Installation

1. Create a `.env` file: copy `env.sample` and fill it with the required credentials (database, port, `ALLOWED_ORIGIN`, etc.).
2. If you use a database from Docker, set the container name as the host and the external port in `.env`.
3. Optional: for development without Mailjet (bypass email verification and admin OTP), see the Mailjet/bypass section in `env.sample` and **README-MAILJET-BYPASS.md**.
4. Run with `npm run start:dev` (development) or `npm run start` (production-style).

## Commands

**Development (watch mode):**

```bash
npm run start:dev
```

Runs `nodemon index.js`. Backend runs at http://localhost:8080 (or the port in `.env`).

**Production-style (no watch):**

```bash
npm run start
```

Runs `node index.js`.

## Branches

```
Staging branch  - develop
Production branch - main
```
