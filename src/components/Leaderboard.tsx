import { Devvit, useState, useAsync } from '@devvit/public-api';
import { LeaderboardEntry } from '../types';
import { keys } from '../utils/redis';
import { getToday, getCurrentWeek } from '../utils/dates';
import { GlassCard } from './GlassCard';
import { GlowButton } from './GlowButton';
import { AnimatedNumber } from './AnimatedNumber';

interface LeaderboardProps {
  context: Devvit.Context;
  currentUserId?: string;
}

export function Leaderboard({ context, currentUserId }: LeaderboardProps) {
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly' | 'alltime' | 'sessions'>('daily');

  // Load Leaderboard using useAsync
  const { data: entries, loading } = useAsync<LeaderboardEntry[]>(async () => {
    let key: string;
    
    switch(activeTab) {
      case 'daily': key = keys.leaderboard.daily(getToday()); break;
      case 'weekly': key = keys.leaderboard.weekly(getCurrentWeek()); break;
      case 'alltime': key = keys.leaderboard.allTime(); break;
      case 'sessions': key = keys.leaderboard.session('all'); break;
      default: key = keys.leaderboard.daily(getToday());
    }
    
    // In Devvit redis: zRange returns an array of ZRangeMember { member, score }
    const rawData = await context.redis.zRange(key, 0, 49, { by: 'rank' });
    const formatted: LeaderboardEntry[] = [];
    
    for (let i = 0; i < rawData.length; i++) {
      const { member: userId, score } = rawData[i];
      const userData = await context.redis.get(keys.user(userId));
      const user = userData ? JSON.parse(userData) : null;
      
      formatted.push({
        userId,
        username: user?.username || `Judge_${userId.slice(-4)}`,
        score,
        rank: i + 1,
        streak: user?.currentStreak || 0,
        isCurrentUser: userId === currentUserId,
      });
    }
    
    return formatted;
  }, {
    depends: [activeTab]
  });

  const currentUserEntry = entries?.find(e => e.userId === currentUserId);

  return (
    <vstack gap="large" padding="large" backgroundColor="#0F0F13">
      {/* Header */}
      <vstack gap="small">
        <hstack gap="small" alignment="center middle">
          <text size="xxlarge">🏆</text>
          <text size="xlarge" weight="bold" color="#F5F5F0">COURT RECORDS</text>
        </hstack>
        {currentUserEntry ? (
          <text color="#FFD700">Your Rank: #{currentUserEntry.rank}</text>
        ) : null}
      </vstack>

      {/* Tabs */}
      <hstack gap="small" alignment="center middle">
        {[
          { id: 'daily', label: 'TODAY', icon: '📅' },
          { id: 'weekly', label: 'WEEK', icon: '📊' },
          { id: 'alltime', label: 'ALL TIME', icon: '👑' },
          { id: 'sessions', label: 'SESSIONS', icon: '🏛️' },
        ].map(tab => (
          <GlowButton
            onPress={() => setActiveTab(tab.id as any)}
            selected={activeTab === tab.id}
            color={activeTab === tab.id ? '#FFD700' : '#8A8A8A'}
            label={tab.label}
            size="small"
          />
        ))}
      </hstack>

      {/* List */}
      {loading ? (
        <text color="#8A8A8A">Loading records...</text>
      ) : (!entries || entries.length === 0) ? (
        <GlassCard>
          <vstack alignment="center middle" gap="medium">
            <text size="xlarge">📭</text>
            <text color="#8A8A8A">No rulings recorded yet</text>
            <text size="small" color="#8A8A8A">Be the first to render a verdict!</text>
          </vstack>
        </GlassCard>
      ) : (
        <vstack gap="small">
          {entries.map((entry) => (
            <GlassCard 
              key={entry.userId}
              color={entry.isCurrentUser ? '#FFD700' : undefined}
            >
              <hstack gap="medium" alignment="center middle">
                {/* Rank */}
                <vstack width="40px" alignment="center middle">
                  {entry.rank <= 3 ? (
                    <text size="xlarge">
                      {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : '🥉'}
                    </text>
                  ) : (
                    <text color="#8A8A8A" weight="bold">#{entry.rank}</text>
                  )}
                </vstack>
                
                {/* User */}
                <vstack grow gap="small">
                  <hstack gap="small" alignment="center middle">
                    <text weight="bold" color={entry.isCurrentUser ? '#FFD700' : '#F5F5F0'}>
                      {entry.isCurrentUser ? '👤 YOU' : entry.username}
                    </text>
                    {(entry.streak !== undefined && entry.streak > 0) ? (
                      <hstack gap="small" backgroundColor="rgba(255,107,53,0.2)" padding="small" cornerRadius="full">
                        <text size="small" color="#FF6B35">🔥 {entry.streak}</text>
                      </hstack>
                    ) : null}
                  </hstack>
                </vstack>
                
                {/* Score */}
                <vstack alignment="end middle">
                  <AnimatedNumber value={entry.score} color="#FFD700" />
                  <text size="small" color="#8A8A8A">karma</text>
                </vstack>
              </hstack>
            </GlassCard>
          ))}
        </vstack>
      )}
    </vstack>
  );
}
