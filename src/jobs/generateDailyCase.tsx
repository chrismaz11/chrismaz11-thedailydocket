import { Devvit } from '@devvit/public-api';
import { ensureDailyCase, ensureDailyPost, getHomeSubreddit } from '../utils/docket';
import { getToday } from '../utils/dates';

Devvit.addSchedulerJob({
  name: 'generate-daily-case',
  onRun: async (_event, context) => {
    const today = getToday();
    try {
      const { dailyCase, created } = await ensureDailyCase(context, today);
      const homeSubreddit = await getHomeSubreddit(context);
      const postId = await ensureDailyPost(context, dailyCase, homeSubreddit, today);
      console.log(
        `${created ? 'Generated' : 'Reused'} case ${today} and ensured post ${postId} in r/${homeSubreddit}`
      );
    } catch (error) {
      console.error(`Failed to generate docket for ${today}:`, error);
    }
  },
});
