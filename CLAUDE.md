# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # Install dependencies
npm run dev        # Playtest locally via Devvit
npm run build      # Build for production
npm run upload     # Upload to Devvit (deploy)
```

There is no test runner configured. TypeScript type-checking can be run with:
```bash
npx tsc --noEmit
```

## What This Is

**The Daily Docket** is a Reddit app built with [Devvit](https://developers.reddit.com/docs) — Reddit's platform for building custom post types. The app is a prediction game where users stake karma on daily Reddit trend questions and special event sessions (Oscars, GRAMMYs, etc.).

Architecture: **Devvit Web** — a thin Devvit Blocks wrapper (`src/main.tsx`) launches a full HTML/CSS/JS web app (`webroot/index.html`) via the `useWebView` hook. All game UI lives in the webroot; all data/API logic lives in main.tsx.

Key platform facts:
- All persistent state lives in **Redis** via `context.redis` (no SQL, no external DB)
- Scheduled jobs are declared in `devvit.yaml` and registered via `Devvit.addSchedulerJob()`
- Server↔client communication: `hook.postMessage(msg)` (server→web) and `window.parent.postMessage(msg, '*')` (web→server). Messages from server arrive in the web app as `event.data.data.message` when `event.data.type === 'devvit-message'`.

## Architecture

### Entry Point & Server
`src/main.tsx` — Uses `useWebView` to mount `webroot/index.html`. Handles all Redis reads/writes and Reddit API calls in `onMessage`. Message types: `INIT_REQUEST`, `SUBMIT_RULING`, `TOGGLE_REMINDERS`, `GET_LEADERBOARD` (from web) and `INIT`, `RULING_CONFIRMED`, `LEADERBOARD`, `SETTINGS_UPDATED`, `ERROR` (to web).

### Web UI
`webroot/index.html` — Single-file HTML/CSS/JS app. Pure vanilla JS, no build step. Three views: Daily Docket, Special Sessions, Leaderboard. Animated scales of justice SVG tilts based on vote ratio. Google Fonts: Cinzel (headings) + Inter (body).

### Data Layer
- **`src/utils/redis.ts`** — Single source of truth for all Redis key names. Always use `keys.*` helpers here rather than constructing key strings manually.
- **`src/types/index.ts`** — All TypeScript interfaces: `UserProfile`, `DailyCase`, `UserRuling`, `SpecialSession`, `SpecialQuestion`, `UserSessionProgress`, `LeaderboardEntry`.
- All dates/times are stored as ISO strings and treated as **America/New_York** timezone via `src/utils/dates.ts`.

### Game Logic
- **`src/utils/karma.ts`** — `calculateWinnings(stake, isCorrect, streak)`: correct predictions return 2x + streak bonus (0.1x per day, capped at +3x). Wrong predictions lose the stake.
- **`src/utils/predictions.ts`** — `EVENT_CALENDAR` defines all special sessions and their questions.

### Scheduled Jobs (all times ET)
- **`src/jobs/generateDailyCase.ts`** — Runs at midnight; creates today's `DailyCase` in Redis. Saves `subreddit` and `metric` fields required by the resolver.
- **`src/jobs/resolveCases.ts`** — Runs at 1 AM; resolves yesterday's case using real Reddit API calls (`context.reddit.getTopPosts`, `getNewPosts`). Does not resolve if API fails.
- **`src/jobs/sendReminders.ts`** — Runs at 9 AM; applies karma changes to users, updates streaks, sends Reddit DMs to opted-in users.

### Dead Code
`src/components/` — Old Blocks components, no longer imported. Can be deleted.

## Redis Key Schema

| Key pattern | Contents |
|---|---|
| `user:{userId}` | `UserProfile` JSON |
| `user:{userId}:ruling:{date}` | `UserRuling` JSON |
| `case:{date}` | `DailyCase` JSON (date = YYYY-MM-DD) |
| `case:{date}:rulings` | list of rulings for that day |
| `session:{sessionId}` | `SpecialSession` JSON |
| `session:{sessionId}:user:{userId}` | `UserSessionProgress` JSON |
| `leaderboard:daily:{date}` | sorted set |
| `leaderboard:weekly:{week}` | sorted set |
| `leaderboard:alltime` | sorted set |
| `sessions:active` | list of active session IDs |
| `user:{userId}:pending` | pending reminder data |
