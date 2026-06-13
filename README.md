# PixelGrid.io 🎨

A high-performance, real-time, shared multiplayer pixel grid application where users can collaborate on a massive canvas to claim tiles/blocks.

## Key Features

- **Real-Time Synchronisation**: Every claimed block is synchronised instantly across all connected clients via WebSockets (`ws`).
- **Conflict Resolution & DB Persistence**: Claims are processed sequentially and persisted in an embedded **SQLite** database with smart `UPSERT` statements.
- **Buttery-Smooth Interactive Grid**: Built using an optimized **HTML5 Canvas** featuring native panning (drag-and-drop) and zooming (scroll-wheel) support.
- **Curated Vibrant Palettes**: Curated neon HSL color picker and customizable usernames.
- **Dynamic Leaderboard**: Real-time stats updating on client connections, tracking the top players claiming territory.
- **Spam Prevention**: Client & server-enforced **1.5s cooldowns** accompanied by a circular SVG countdown ring.

---

## 🛠 Tech Stack

- **Frontend**: React, TypeScript, Vite, HTML5 Canvas API, Vanilla CSS (Outfit Font + glassmorphic dark theme).
- **Backend**: Node.js, Express, WebSocket (`ws`), TypeScript (`tsx`).
- **Database**: SQLite (via `better-sqlite3`).

---

## 📦 Project Structure

```
├── backend/
│   ├── db.ts          # Database schema & persistence helper
│   ├── server.ts      # WebSocket & Express server config
│   ├── package.json   # Backend dependencies & dev scripts
│   └── tsconfig.json  # Backend TypeScript configuration
│
└── frontend/
    ├── src/
    │   ├── App.tsx          # Main canvas container & sidebar components
    │   ├── useWebSocket.ts  # Custom WebSocket synchronization hook
    │   ├── index.css        # Glassmorphism dark mode system
    │   └── main.tsx         # Client React entrypoint
    ├── index.html           # HTML5 wrapper & SEO tags
    └── tsconfig.json        # Frontend TypeScript config
```

---

## 🏃‍♂️ How to Run

Follow these simple steps to run both the backend and frontend locally:

### 1. Start the Backend Server

```bash
cd backend
npm install
npm run dev
```
*Starts the WebSocket server on **port 3001**.*

### 2. Start the Frontend client

```bash
cd frontend
npm install
npm run dev
```
*Starts the Vite dev server on **http://localhost:5173/**.*
