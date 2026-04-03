export const keys = {
  user: (userId: string) => `user:${userId}`,
  userRuling: (userId: string, date: string) => `user:${userId}:ruling:${date}`,
  dailyCase: (date: string) => `case:${date}`,
  caseRulings: (date: string) => `case:${date}:rulings`,
  session: (sessionId: string) => `session:${sessionId}`,
  sessionProgress: (sessionId: string, userId: string) => `session:${sessionId}:user:${userId}`,
  leaderboard: {
    daily: (date: string) => `leaderboard:daily:${date}`,
    weekly: (week: string) => `leaderboard:weekly:${week}`,
    allTime: () => `leaderboard:alltime`,
    session: (sessionId: string) => `leaderboard:session:${sessionId}`,
  },
  reminders: (date: string) => `reminders:${date}`,
  activeSessions: () => `sessions:active`,
  pendingReminders: (userId: string) => `user:${userId}:pending`,
  dailyPost: (date: string) => `post:${date}`,
  config: {
    homeSubreddit: () => 'config:home-subreddit',
  },
  debateSubmission: (submissionId: string) => `debate:${submissionId}`,
  debateQueue: {
    pending: () => 'debate:queue:pending',
    approved: () => 'debate:queue:approved',
  },
  debateReview: (userId: string) => `debate:review:${userId}`,
};
