import { Devvit } from '@devvit/public-api';
import { registerHomeSubreddit } from '../utils/docket';

Devvit.addTrigger({
  event: 'AppInstall',
  onEvent: async (_event, context) => {
    await registerHomeSubreddit(context);
  },
});

Devvit.addTrigger({
  event: 'AppUpgrade',
  onEvent: async (_event, context) => {
    await registerHomeSubreddit(context);
  },
});
