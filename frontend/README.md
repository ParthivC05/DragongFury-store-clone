# Partner Platform - Frontend

## Project Overview

Partner Platform frontend is a web application built with **React** and **Vite**.

### Key Features

- **Fast development** — Vite for fast HMR and quick builds.
- **Backend integration** — Connects with the backend via proxy; test page calls `GET /api/status` to verify connection.
- **JavaScript only** — No TypeScript; all code in `.js` / `.jsx`.
- **Structured for growth** — Folders for API, components, config, data, forms, pages, and utils ready for platform and payment features.

### Technology Stack

- **Frontend:** React, Vite, ESLint.

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) with your browser. The page will show "Backend connected" when the backend is running and reachable.

## Code Quality & Project Structure

The project uses **ESLint** for linting. Run `npm run lint` to check code style.

## Project Structure

```
partner-platform-frontend
├── src
│   ├── api          # API client and backend calls
│   ├── assets       # Images, icons, static assets
│   ├── components   # Reusable UI components
│   ├── config       # App and API configuration
│   ├── data         # Data layer / mock data
│   ├── forms        # Form components and logic
│   ├── pages        # Page-level components
│   ├── utils        # Helper functions and utilities
│   ├── App.jsx      # Root component
│   ├── App.css      # App styles
│   ├── Global.css   # Global styles
│   ├── index.css    # Base styles
│   └── main.jsx     # Entry point
├── public           # Static assets (served as-is)
├── index.html       # HTML entry
├── vite.config.js   # Vite configuration (dev server, proxy)
├── package.json     # Dependencies and scripts
├── eslint.config.js # ESLint configuration
└── README.md
```

### Folder Responsibilities

- **api/** — API client and functions that call the backend.
- **assets/** — Images, icons, and other static assets used in the app.
- **components/** — Reusable UI components.
- **config/** — Application and API configuration (e.g. base URL).
- **data/** — Data fetching, models, or mock data.
- **forms/** — Form components and form-related logic.
- **pages/** — Top-level page components (views).
- **utils/** — Utility functions and helpers.

## Scripts

- `npm run dev` — Start Vite dev server (default: http://localhost:5173).
- `npm run build` — Production build (output in `dist/`).
- `npm run preview` — Preview production build locally.
- `npm run lint` — Run ESLint.
