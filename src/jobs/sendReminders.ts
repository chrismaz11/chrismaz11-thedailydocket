import { Devvit } from '@devvit/public-api';
import { keys } from '../utils/redis';
import { getYesterday, getToday } from '../utils/dates';
import { calculateWinnings } from '../utils/karma';

// Daily verdict reminder (9 AM ET)
Devvit.addSchedulerJob({
  name: 'daily-verdict-reminder',
  onRun: async (event, context) => {
    const yesterday = getYesterday();
    const today = getToday();
    // Replace SMEMBERS with ZRANGE
    const rawIds = await context.redis.zRange(keys.reminders(yesterday), 0, -1);
    const userIds = rawIds.map(r => r.member);
    
    for (const userId of userIds) {
      try {
        // Get yesterday's ruling
        const rulingKey = keys.userRuling(userId, yesterday);
        const rulingData = await context.redis.get(rulingKey);
        
        if (!rulingData) continue;
        const ruling = JSON.parse(rulingData);
        
        // Get case result
        const caseKey = keys.dailyCase(yesterday);
        const caseData = await context.redis.get(caseKey);
        if (!caseData) continue;
        const caseResult = JSON.parse(caseData);
        
        // Only remind if result is ready
        if (ruling.result === 'pending' && caseResult.status === 'resolved') {
          const userKey = keys.user(userId);
          const userData = await context.redis.get(userKey);
          let user: any = null;
          
          if (userData) {
            user = JSON.parse(userData);
            const won = ruling.prediction === caseResult.actualResult;
            const actualKarmaChange = won ? calculateWinnings(ruling.stake, true, user.currentStreak) : -ruling.stake;
            ruling.karmaChange = actualKarmaChange;
            
            user.karma += actualKarmaChange;
            user.totalRulings += 1;
            
            if (won) {
              user.correctRulings += 1;
              if (user.lastRulingDate === yesterday) {
                user.currentStreak += 1;
              } else {
                user.currentStreak = 1;
              }
              user.longestStreak = Math.max(user.longestStreak, user.currentStreak);
            } else {
              user.currentStreak = 0;
            }
            
            user.lastRulingDate = yesterday;
            await context.redis.set(userKey, JSON.stringify(user));
            
            ruling.result = won ? 'correct' : 'incorrect';
            await context.redis.set(rulingKey, JSON.stringify(ruling));
            
            if (user?.reminderSettings?.redditDM) {
              await sendVerdictDM(context, userId, ruling, caseResult, won, ruling.karmaChange);
            }
          }
        }
        
        // Streak risk check
        const userKey = keys.user(userId);
        const userData = await context.redis.get(userKey);
        if (userData) {
          const user = JSON.parse(userData);
          const todayRuling = await context.redis.get(keys.userRuling(userId, today));
          if (!todayRuling && user.currentStreak > 0) {
            await sendStreakRiskDM(context, userId, user);
          }
        }
        
      } catch (error) {
        console.error(`Failed to process reminder for ${userId}:`, error);
      }
    }
    
    await context.redis.del(keys.reminders(yesterday));
  }
});

// Session ending reminders
Devvit.addSchedulerJob({
  name: 'session-ending-reminder',
  onRun: async (event, context) => {
    // In production, you would iterate participants of active sessions
    // For MVP, we'll keep this simplified.
  }
});

async function sendVerdictDM(context: any, userId: string, ruling: any, caseResult: any, won: boolean, karmaChange: number) {
  const message = `
⚖️ **The Daily Docket Verdict is In!**

**Case #${ruling.caseId}** has been resolved.

**Your Ruling:** ${ruling.prediction === 'guilty' ? '⚖️ GUILTY (YES)' : '⚖️ INNOCENT (NO)'}
**Actual Result:** ${caseResult.actualResult === 'guilty' ? '✅ GUILTY' : '❌ INNOCENT'}

${won ? `🎉 **CORRECT!** You won ${karmaChange} karma!` : `💔 **INCORRECT.** You lost ${Math.abs(karmaChange)} karma.`}

**[Render Today's Verdict](${context.postUrl || '#'})**
  `;
  
  try {
    await context.reddit.sendPrivateMessage({
      to: userId,
      subject: won ? 'The Daily Docket: Verdict Correct!' : 'The Daily Docket: Verdict Rendered',
      text: message,
    });
  } catch (e) {
    console.error('Failed to send DM:', e);
  }
}

async function sendStreakRiskDM(context: any, userId: string, user: any) {
  const message = `
🔥 **Your ${user.currentStreak}-Day Streak is at Risk!**

You haven't rendered today's verdict yet. Court closes at midnight ET!

**[Save Your Streak](${context.postUrl || '#'})**
  `;
  
  try {
    await context.reddit.sendPrivateMessage({
      to: userId,
      subject: '🔥 Streak Alert!',
      text: message,
    });
  } catch (e) {
    console.error('Failed to send streak DM:', e);
  }
}
