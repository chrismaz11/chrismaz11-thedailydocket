// User & Karma
export interface UserProfile {
  [key: string]: any;
  userId: string;
  username?: string;
  karma: number;
  totalRulings: number;
  correctRulings: number;
  currentStreak: number;
  longestStreak: number;
  lastRulingDate: string | null;
  specialSessionsCompleted: string[];
  reminderSettings: {
    redditDM: boolean;
    reminderTime: string; // "09:00"
  };
  createdAt: string;
}

// Daily Cases
export interface DailyCase {
  [key: string]: any;
  caseId: string; // YYYY-MM-DD format
  title: string;
  description: string;
  category: 'reddit' | 'event' | 'trending' | 'community';
  status: 'open' | 'closed' | 'resolved';
  opensAt: string; // ISO timestamp
  closesAt: string;
  resolvesAt: string;
  totalRulings: number;
  guiltyCount: number; // YES votes
  innocentCount: number; // NO votes
  actualResult?: 'guilty' | 'innocent' | 'tie';
  subreddit: string; // e.g. "AskReddit"
  metric: 'comments' | 'upvotes' | 'frontpage' | 'posts' | 'top3comments' | 'top3upvotes' | 'keyword-top10'; // what to measure
  threshold: number; // value to beat
  targetScope?: 'subreddit' | 'reddit';
  keywords?: string[];
  topicTag?: string;
  sourceSubmissionId?: string;
  resolutionData?: {
    actualValue: number;
    threshold: number;
  };
}

export interface UserRuling {
  [key: string]: any;
  caseId: string;
  userId: string;
  prediction: 'guilty' | 'innocent';
  stake: number;
  result: 'pending' | 'correct' | 'incorrect';
  karmaChange: number;
  ruledAt: string;
}

// Special Sessions
export interface SpecialSession {
  [key: string]: any;
  sessionId: string; // event-slug-year (e.g., "grammys-2026")
  name: string;
  description: string;
  eventType: 'awards' | 'sports' | 'election' | 'custom' | 'tech' | 'culture' | 'politics' | 'rotating';
  category?: string;
  icon?: string;
  status: 'upcoming' | 'open' | 'closed' | 'archived';
  opensAt: string;
  closesAt: string;
  bonusMultiplier: number; // 5x for completing all
  questions: SpecialQuestion[];
}

export interface SpecialQuestion {
  [key: string]: any;
  questionId: string;
  order: number;
  text: string;
  options: string[];
  correctAnswer?: string;
  unlocksAt: string;
  locksAt: string;
  status: 'locked' | 'open' | 'closed';
  category: string; // e.g., "Album of the Year"
}

export interface UserSessionProgress {
  [key: string]: any;
  sessionId: string;
  userId: string;
  answers: Record<string, {
    answer: string;
    stake: number;
    answeredAt: string;
    result: 'pending' | 'correct' | 'incorrect';
    karmaChange: number;
  }>;
  questionsAnswered: number;
  totalStake: number;
  bonusEarned: boolean;
  finalScore: number;
  completedAt?: string;
}

// Leaderboard
export interface LeaderboardEntry {
  [key: string]: any;
  userId: string;
  username: string;
  score: number;
  rank: number;
  streak?: number;
  isCurrentUser?: boolean;
}

export interface DebateSubmission {
  [key: string]: any;
  submissionId: string;
  submittedByUserId: string;
  submittedByUsername?: string;
  title: string;
  description: string;
  targetScope: 'subreddit' | 'reddit';
  subreddit: string;
  metric: DailyCase['metric'];
  threshold: number;
  keywords?: string[];
  topicTag?: string;
  status: 'pending' | 'approved' | 'rejected' | 'scheduled';
  moderatorNote?: string;
  reviewedByUsername?: string;
  reviewedAt?: string;
  createdAt: string;
}
