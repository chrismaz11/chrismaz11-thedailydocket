import { Devvit, useWebView } from '@devvit/public-api';
import { UserProfile, DailyCase, UserRuling, LeaderboardEntry } from './types';
import { keys } from './utils/redis';
import { canAffordStake } from './utils/karma';
import { getToday, getCurrentWeek } from './utils/dates';
import { ensureDailyCase, ensureDailyPost, registerHomeSubreddit } from './utils/docket';
import { openDebateReviewForm, openDebateSubmissionForm } from './forms/debate';

// Register scheduler jobs
import './jobs/generateDailyCase';
import './jobs/resolveCases';
import './jobs/sendReminders';
import './triggers/registerInstallation';

// ─── Message types ────────────────────────────────────────────────────────────

type WebToDevvit =
  | { type: 'INIT_REQUEST' }
  | { type: 'SUBMIT_RULING'; prediction: 'guilty' | 'innocent'; stake: number }
  | { type: 'TOGGLE_REMINDERS' }
  | { type: 'GET_LEADERBOARD'; period: 'daily' | 'weekly' | 'alltime' }
  | { type: 'OPEN_DEBATE_FORM' };

type DevvitToWeb =
  | { type: 'INIT'; user: UserProfile; dailyCase: DailyCase | null; existingRuling: UserRuling | null }
  | { type: 'RULING_CONFIRMED'; ruling: UserRuling; user: UserProfile }
  | { type: 'LEADERBOARD'; entries: LeaderboardEntry[]; period: string }
  | { type: 'SETTINGS_UPDATED'; user: UserProfile }
  | { type: 'ERROR'; message: string };

// ─── App ──────────────────────────────────────────────────────────────────────

Devvit.configure({ redditAPI: true, redis: true });

// Menu item to create the post — accessible from the subreddit "..." menu
Devvit.addMenuItem({
  label: '⚖️ File Today’s Docket',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (_event, context) => {
    const homeSubreddit = await registerHomeSubreddit(context);
    const { dailyCase } = await ensureDailyCase(context);
    const postId = await ensureDailyPost(context, dailyCase, homeSubreddit);
    const post = await context.reddit.getPostById(postId);
    context.ui.showToast('Today’s docket is live.');
    if (post) {
      context.ui.navigateTo(post);
    }
  },
});

Devvit.addMenuItem({
  label: '🗳️ Review Debate Queue',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (_event, context) => {
    await openDebateReviewForm(context);
  },
});

async function loadInitData(context: Devvit.Context) {
  const userId = context.userId;
  if (!userId) return null;
  const username = await context.reddit.getCurrentUsername();

  const userKey = keys.user(userId);
  const userData = await context.redis.get(userKey);
  let user: UserProfile;

  if (userData) {
    user = JSON.parse(userData);
    if (username && user.username !== username) {
      user.username = username;
      await context.redis.set(userKey, JSON.stringify(user));
    }
  } else {
    user = {
      userId,
      username,
      karma: 1000,
      totalRulings: 0,
      correctRulings: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastRulingDate: null,
      specialSessionsCompleted: [],
      reminderSettings: { redditDM: true, reminderTime: '09:00' },
      createdAt: new Date().toISOString(),
    };
    await context.redis.set(userKey, JSON.stringify(user));
  }

  const today = getToday();
  await registerHomeSubreddit(context);
  const { dailyCase } = await ensureDailyCase(context, today);

  const rulingData = await context.redis.get(keys.userRuling(userId, today));
  const existingRuling: UserRuling | null = rulingData ? JSON.parse(rulingData) : null;

  return { user, dailyCase, existingRuling };
}

Devvit.addCustomPostType({
  name: 'The Daily Docket',
  description: 'Predict Reddit trends. Earn karma.',
  height: 'tall',
  render: (context) => {
    const webView = useWebView<WebToDevvit, DevvitToWeb>({
      url: 'index.html',

      onMessage: async (msg, hook) => {
        const userId = context.userId;
        if (!userId) {
          hook.postMessage({ type: 'ERROR', message: 'Please log in to Reddit to play.' });
          return;
        }

        try {
          // ── INIT REQUEST (fallback for timing races) ──────────────────────
          if (msg.type === 'INIT_REQUEST') {
            const data = await loadInitData(context);
            if (data) {
              hook.postMessage({ type: 'INIT', ...data });
            } else {
              hook.postMessage({ type: 'ERROR', message: 'Please log in to Reddit to play.' });
            }
            return;
          }

          // ── SUBMIT RULING ─────────────────────────────────────────────────
          if (msg.type === 'SUBMIT_RULING') {
            const { prediction, stake } = msg;
            const today = getToday();

            const userKey = keys.user(userId);
            const userData = await context.redis.get(userKey);
            if (!userData) {
              hook.postMessage({ type: 'ERROR', message: 'User not found.' });
              return;
            }
            const user: UserProfile = JSON.parse(userData);

            if (!canAffordStake(user.karma, stake)) {
              hook.postMessage({ type: 'ERROR', message: 'Insufficient karma for that stake.' });
              return;
            }

            const existingRulingData = await context.redis.get(keys.userRuling(userId, today));
            if (existingRulingData) {
              hook.postMessage({ type: 'ERROR', message: "You've already ruled on today's case." });
              return;
            }

            const caseData = await context.redis.get(keys.dailyCase(today));
            if (!caseData) {
              hook.postMessage({ type: 'ERROR', message: 'No case found for today.' });
              return;
            }
            const dailyCase: DailyCase = JSON.parse(caseData);

            const ruling: UserRuling = {
              caseId: today,
              userId,
              prediction,
              stake,
              result: 'pending',
              karmaChange: 0,
              ruledAt: new Date().toISOString(),
            };

            user.karma -= stake;
            dailyCase.totalRulings += 1;
            if (prediction === 'guilty') dailyCase.guiltyCount += 1;
            else dailyCase.innocentCount += 1;

            await context.redis.set(keys.userRuling(userId, today), JSON.stringify(ruling));
            await context.redis.set(keys.dailyCase(today), JSON.stringify(dailyCase));
            await context.redis.set(keys.user(userId), JSON.stringify(user));
            await context.redis.zAdd(keys.reminders(today), { member: userId, score: Date.now() });

            const week = getCurrentWeek();
            await context.redis.zAdd(keys.leaderboard.allTime(), { member: userId, score: user.karma });
            await context.redis.zAdd(keys.leaderboard.daily(today), { member: userId, score: user.karma });
            await context.redis.zAdd(keys.leaderboard.weekly(week), { member: userId, score: user.karma });

            hook.postMessage({ type: 'RULING_CONFIRMED', ruling, user });
          }

          if (msg.type === 'OPEN_DEBATE_FORM') {
            await openDebateSubmissionForm(context);
            return;
          }

          // ── TOGGLE REMINDERS ──────────────────────────────────────────────
          if (msg.type === 'TOGGLE_REMINDERS') {
            const userKey = keys.user(userId);
            const userData = await context.redis.get(userKey);
            if (!userData) return;
            const user: UserProfile = JSON.parse(userData);
            user.reminderSettings.redditDM = !user.reminderSettings.redditDM;
            await context.redis.set(userKey, JSON.stringify(user));
            hook.postMessage({ type: 'SETTINGS_UPDATED', user });
          }

          // ── LEADERBOARD ───────────────────────────────────────────────────
          if (msg.type === 'GET_LEADERBOARD') {
            const { period } = msg;
            const today = getToday();
            const week = getCurrentWeek();

            const redisKey =
              period === 'daily'  ? keys.leaderboard.daily(today) :
              period === 'weekly' ? keys.leaderboard.weekly(week) :
                                    keys.leaderboard.allTime();

            const raw = await context.redis.zRange(redisKey, 0, 9, { reverse: true, by: 'rank' });

            const entries: LeaderboardEntry[] = raw.map((entry, i) => ({
              userId: entry.member,
              username: 'u/' + entry.member.slice(-6),
              score: Math.round(entry.score),
              rank: i + 1,
              isCurrentUser: entry.member === userId,
            }));

            hook.postMessage({ type: 'LEADERBOARD', entries, period });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          hook.postMessage({ type: 'ERROR', message: `Server error: ${message}` });
        }
      },
    });

    // Preview screen — clicking ENTER THE COURT mounts the webview; it sends INIT_REQUEST on load
    registerHomeSubreddit(context).catch(() => undefined);
    return (
      <vstack height="100%" width="100%" alignment="center middle" backgroundColor="#080810">
        <vstack gap="medium" alignment="center" padding="large">
          <text size="xxlarge">⚖️</text>
          <vstack alignment="center" gap="none">
            <text size="xxlarge" weight="bold" color="#C9A84C">THE DAILY DOCKET</text>
            <text size="xsmall" color="#555555">THE HIGHEST COURT OF REDDIT</text>
          </vstack>
          <spacer size="small" />
          <hstack
            onPress={() => {
              webView.mount();
            }}
            padding="medium"
            backgroundColor="#C9A84C"
            cornerRadius="medium"
          >
            <text weight="bold" color="#080810">ENTER THE COURT</text>
          </hstack>
        </vstack>
      </vstack>
    );
  },
});

export default Devvit;
