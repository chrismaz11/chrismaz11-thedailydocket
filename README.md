# ⚖️ The Daily Docket

A Reddit Devvit prediction game where users render daily verdicts on Reddit trends and real-world events.

## Features
- **Daily Docket**: One prediction per day about Reddit trends
- **Special Sessions**: 10-question events (GRAMMYs, Oscars, Elections) with 5x bonuses
- **Streak System**: Consecutive correct rulings multiply karma gains
- **Leaderboards**: Daily, weekly, and all-time rankings
- **Reminders**: Reddit DMs when verdicts are ready and streaks are at risk

## Development
```bash
npm install
npm run dev    # Playtest locally
npm run build  # Build for production
npm run upload # Upload to Devvit
```

## Configuration
Set up environment variables in Devvit dashboard:
- `REDIS_URL`: Redis connection
- `DEVVIT_APP_ID`: Your app ID

## Scheduler Jobs
- `generate-daily-case`: Creates new case at midnight ET
- `resolve-daily-cases`: Resolves cases at 1 AM ET
- `daily-verdict-reminder`: Sends DMs at 9 AM ET
- `session-ending-reminder`: Alerts users 2 hours before session close