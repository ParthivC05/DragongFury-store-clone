# Partner Platform Admin

**Frontend-only** admin app for the Partner Platform. It uses the **same backend** as the main partner platform (`partner-platform-/backend`). There is no separate backend for admin.

## Stack

- React 18 + JSX
- Vite 5
- React Router 6

## Setup

1. **Backend must be running** from the main repo:
   ```bash
   cd ../partner-platform-/backend
   npm install
   npm run start:dev
   ```
   Ensure `.env` has `ALLOWED_ORIGIN` including the admin origin, e.g.:
   ```
   ALLOWED_ORIGIN=http://localhost:5173,http://localhost:5174
   ```
   (User app = 5173, Admin app = 5174.)

2. **Install and run the admin app**:
   ```bash
   cd partner-platform-admin
   npm install
   npm run dev
   ```
   Admin UI: http://localhost:5174

3. **Admin login**  
   Use **admin-only** login: `POST /api/admin/auth/login` (email + password). Only users with `isAdmin: true` can sign in here; the existing user signup/login APIs are unchanged. After login, use "Create account" to add new admin accounts (stored in the same `users` table with a `role` field: `admin` or `super_admin`).

## Project structure

```
partner-platform-admin/
├── index.html
├── package.json
├── vite.config.js      # Proxies /api to backend (e.g. localhost:8080)
├── src/
│   ├── main.jsx
│   ├── App.jsx         # Routes + protected admin layout
│   ├── index.css
│   ├── api/
│   │   ├── client.js   # Fetch wrapper with Bearer token
│   │   └── auth.js    # login, getMe, logout
│   ├── context/
│   │   └── AuthContext.jsx
│   ├── components/
│   │   ├── Layout.jsx
│   │   └── Layout.css
│   └── pages/
│       ├── Login.jsx
│       ├── Login.css
│       ├── Dashboard.jsx
│       └── Dashboard.css
└── public/
```

## Backend admin API (in partner-platform-/backend)

**Auth (admin-only; does not change user login/signup):**

- `POST /api/admin/auth/login` – admin login (body: `{ email, password }`). Returns `{ user, token }`. Only users with `isAdmin: true` can log in.

**Protected (require `Authorization: Bearer <token>` + `isAdmin: true`):**

- `GET /api/admin/dashboard` – dashboard stats (e.g. users count)
- `GET /api/admin/users?page=1&limit=20` – list users (includes `role`)
- `GET /api/admin/settings` – list settings
- `POST /api/admin/accounts` – create new admin account (body: `{ email, password, username?, firstName?, lastName?, role? }`). Role: `admin` or `super_admin`. Stored in the same `users` table with role-based tracking.
