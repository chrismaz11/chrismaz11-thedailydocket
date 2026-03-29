import { Devvit } from '@devvit/public-api';
import { DailyCase } from '../types';
import { keys } from '../utils/redis';
import { getToday } from '../utils/dates';

type Metric = DailyCase['metric'];

// Related subreddits to cross-post a link to for each featured subreddit.
// Add/remove entries here to control where the daily post gets shared.
// Leave a list empty to skip cross-posting for that subreddit.
const CROSS_POST_SUBREDDITS: Record<string, string[]> = {
  AskReddit:   ['NoStupidQuestions'],
  funny:       ['memes'],
  gaming:      ['pcgaming'],
  pics:        ['itookapicture'],
  worldnews:   ['news'],
  technology:  ['tech'],
};

Devvit.addSchedulerJob({
  name: 'generate-daily-case',
  onRun: async (event, context) => {
    const today = getToday();

    // Check if already exists
    const existing = await context.redis.get(keys.dailyCase(today));
    if (existing) {
      console.log(`Case for ${today} already exists`);
      return;
    }

    // Generate prediction based on trending subreddits
    const trendingSubs = ['AskReddit', 'funny', 'gaming', 'pics', 'worldnews', 'technology'];
    const selectedSub = trendingSubs[Math.floor(Math.random() * trendingSubs.length)];

    const predictions: { title: string; description: string; metric: Metric; threshold: number }[] = [
      {
        title: `Will r/${selectedSub}'s top post today receive more than 1,000 comments?`,
        description: `The court examines the engagement level of r/${selectedSub}'s most popular content.`,
        metric: 'comments',
        threshold: 1000,
      },
      {
        title: `Will r/${selectedSub} have a post reach the front page (r/all) today?`,
        description: `The court predicts whether r/${selectedSub} content will break into the mainstream.`,
        metric: 'frontpage',
        threshold: 1,
      },
      {
        title: `Will r/${selectedSub}'s top post accumulate more than 10,000 upvotes?`,
        description: `The court gauges the viral potential of today's top content.`,
        metric: 'upvotes',
        threshold: 10000,
      },
      {
        title: `Will there be more than 50 new posts in r/${selectedSub} today?`,
        description: `The court measures the activity level of the community.`,
        metric: 'posts',
        threshold: 50,
      },
    ];

    const selected = predictions[Math.floor(Math.random() * predictions.length)];

    const newCase: DailyCase = {
      caseId: today,
      title: selected.title,
      description: selected.description,
      category: 'reddit',
      status: 'open',
      opensAt: new Date().toISOString(),
      closesAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      resolvesAt: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
      totalRulings: 0,
      guiltyCount: 0,
      innocentCount: 0,
      subreddit: selectedSub,
      metric: selected.metric,
      threshold: selected.threshold,
    };

    await context.redis.set(keys.dailyCase(today), JSON.stringify(newCase));
    console.log(`Generated case for ${today}: ${newCase.title}`);

    // ── Auto-create the daily feed post ──────────────────────────────────────
    const subredditName = context.subredditName;
    if (!subredditName) {
      console.log('No subreddit context — skipping auto-post');
      return;
    }

    let postPermalink: string | null = null;

    try {
      const post = await context.reddit.submitPost({
        subredditName,
        title: `⚖️ The Daily Docket — ${today} | ${selected.title}`,
        preview: (
          <vstack height="100%" width="100%" alignment="center middle" backgroundColor="#080810">
            <text size="xxlarge" color="#C9A84C">⚖️ The Daily Docket</text>
            <text size="small" color="#555555">Loading…</text>
          </vstack>
        ),
      });

      postPermalink = post.permalink;
      await context.redis.set(keys.dailyPost(today), post.id);
      console.log(`Auto-created daily post ${post.id} for ${today}`);

      // ── Apply flair ───────────────────────────────────────────────────────
      try {
        await context.reddit.setPostFlair({
          postId: post.id,
          subredditName,
          text: '⚖️ Daily Docket',
          cssClass: 'daily-docket',
        });
        console.log('Flair applied');
      } catch (flairErr) {
        // Flair may not be configured on this subreddit — that's fine
        console.log('Flair not applied (may not be configured):', flairErr);
      }
    } catch (postErr) {
      console.log('Failed to create daily post:', postErr);
    }

    // ── Cross-post to related subreddits ─────────────────────────────────────
    if (!postPermalink) return;

    const relatedSubs = CROSS_POST_SUBREDDITS[selectedSub] ?? [];
    for (const relSub of relatedSubs) {
      try {
        await context.reddit.submitPost({
          subredditName: relSub,
          title: `⚖️ Daily Docket — ${today}: ${selected.title} [Predict & Win Karma]`,
          url: `https://www.reddit.com${postPermalink}`,
        });
        console.log(`Cross-posted to r/${relSub}`);
      } catch (crossErr) {
        console.log(`Cross-post to r/${relSub} failed:`, crossErr);
      }
    }
  },
});
