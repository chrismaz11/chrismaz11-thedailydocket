import { Devvit } from '@devvit/public-api';
import { DailyCase } from '../types';
import { keys } from '../utils/redis';
import { getYesterday } from '../utils/dates';

Devvit.addSchedulerJob({
  name: 'resolve-daily-cases',
  onRun: async (event, context) => {
    const yesterday = getYesterday();
    const caseKey = keys.dailyCase(yesterday);
    const caseData = await context.redis.get(caseKey);

    if (!caseData) {
      console.log(`No case found for ${yesterday}`);
      return;
    }

    const dailyCase: DailyCase = JSON.parse(caseData);
    if (dailyCase.status === 'resolved') {
      console.log(`Case ${yesterday} already resolved`);
      return;
    }

    const { subreddit, metric, threshold } = dailyCase;

    if (!subreddit || !metric || threshold === undefined) {
      console.error(`Case ${yesterday} is missing subreddit/metric/threshold — cannot resolve`);
      return;
    }

    let actualValue = 0;

    try {
      if (metric === 'comments' || metric === 'upvotes') {
        // Get the top post of the day from the subreddit
        const listing = context.reddit.getTopPosts({
          subredditName: subreddit,
          timeframe: 'day',
          limit: 1,
          pageSize: 1,
        });
        const posts = await listing.get(1);
        if (posts.length > 0) {
          actualValue = metric === 'comments'
            ? posts[0].numberOfComments
            : posts[0].score;
        }
      } else if (metric === 'top3comments' || metric === 'top3upvotes') {
        const listing = context.reddit.getTopPosts({
          subredditName: subreddit,
          timeframe: 'day',
          limit: 3,
          pageSize: 3,
        });
        const posts = await listing.get(3);
        actualValue = posts.reduce((sum, post) => (
          sum + (metric === 'top3comments' ? post.numberOfComments : post.score)
        ), 0);
      } else if (metric === 'frontpage') {
        // Check if any top post on r/all today came from this subreddit
        const listing = context.reddit.getTopPosts({
          subredditName: 'all',
          timeframe: 'day',
          limit: 100,
          pageSize: 100,
        });
        const posts = await listing.get(100);
        const hit = posts.some(
          (p) => p.subredditName.toLowerCase() === subreddit.toLowerCase()
        );
        actualValue = hit ? 1 : 0;
      } else if (metric === 'posts') {
        // Count new posts from the subreddit in the last 24 hours
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        const listing = context.reddit.getNewPosts({
          subredditName: subreddit,
          limit: 100,
          pageSize: 100,
        });
        const posts = await listing.get(100);
        actualValue = posts.filter((p) => p.createdAt.getTime() >= cutoff).length;
      } else if (metric === 'keyword-top10') {
        const keywords = (dailyCase.keywords ?? []).map((value) => value.toLowerCase());
        if (keywords.length === 0) {
          console.error(`Case ${yesterday} is missing keywords for keyword-top10 resolution`);
          return;
        }

        const listing = context.reddit.getTopPosts({
          subredditName: subreddit,
          timeframe: 'day',
          limit: 10,
          pageSize: 10,
        });
        const posts = await listing.get(10);
        actualValue = posts.some((post) => {
          const title = post.title.toLowerCase();
          return keywords.some((keyword) => title.includes(keyword));
        }) ? 1 : 0;
      }
    } catch (err) {
      console.error(`Reddit API error resolving case ${yesterday}:`, err);
      return; // Don't resolve — leave for manual retry or next run
    }

    const actualResult: 'guilty' | 'innocent' = actualValue >= threshold ? 'guilty' : 'innocent';

    dailyCase.status = 'resolved';
    dailyCase.actualResult = actualResult;
    dailyCase.resolutionData = { actualValue, threshold };

    await context.redis.set(caseKey, JSON.stringify(dailyCase));
    console.log(
      `Resolved case ${yesterday}: ${metric} on r/${subreddit} = ${actualValue} (threshold ${threshold}) → ${actualResult}`
    );
  },
});
