# ⚖️ The Daily Docket

A Reddit Devvit prediction game where users render daily verdicts on Reddit trends and real-world events.

## Features
- **Daily Docket**: One prediction per day about Reddit trends
- **Courtroom Intro**: Animated Judge Snoo opening with a gavel slam and "Order! Order!" sequence
- **Special Sessions**: 10-question events (GRAMMYs, Oscars, Elections) with 5x bonuses
- **Streak System**: Consecutive correct rulings multiply karma gains
- **Leaderboards**: Daily, weekly, and all-time rankings
- **Reminders**: Reddit DMs when verdicts are ready and streaks are at risk
- **Community Debate Queue**: Players can submit subreddit or all-Reddit questions for moderator approval

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

## Moderator Workflow
- Use the subreddit menu action `⚖️ File Today’s Docket` to manually file the current day's post if you need an operational fallback.
- Use the subreddit menu action `🗳️ Review Debate Queue` to approve or reject community-submitted debate ideas.
