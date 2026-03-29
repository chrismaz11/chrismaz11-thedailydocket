import { Devvit, useState, useAsync } from '@devvit/public-api';
import { DailyCase, UserRuling, UserProfile } from '../types';
import { keys } from '../utils/redis';
import { calculateWinnings, canAffordStake, getStakeOptions } from '../utils/karma';
import { formatTime, getToday, getYesterday, getTomorrow } from '../utils/dates';
import { AnimatedNumber } from './AnimatedNumber';
import { StreakFlame } from './StreakFlame';
import { GlassCard } from './GlassCard';
import { GlowButton } from './GlowButton';

interface DailyDocketProps {
  user: UserProfile;
  context: Devvit.Context;
  onRulingSubmitted?: () => void;
}

export function DailyDocket({ user, context, onRulingSubmitted }: DailyDocketProps) {
  const [prediction, setPrediction] = useState<'guilty' | 'innocent' | null>(null);
  const [stake, setStake] = useState(100);
  const [submitting, setSubmitting] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Load Case and Ruling using useAsync
  const { data: caseAndRuling, loading } = useAsync<{todayCase: DailyCase, existingRuling: UserRuling | null}>(async () => {
    const today = getToday();
    const caseKey = keys.dailyCase(today);
    const caseData = await context.redis.get(caseKey);
    
    let todayCase: DailyCase;
    if (caseData) {
      todayCase = JSON.parse(caseData);
    } else {
      // Fallback Case Generation (scheduler job missed or hasn't run yet)
      const trendingSubs = ['AskReddit', 'funny', 'gaming', 'pics', 'worldnews', 'technology', 'science', 'movies', 'sports', 'music'];
      const selectedSub = trendingSubs[Math.floor(Math.random() * trendingSubs.length)];

      todayCase = {
        caseId: today,
        title: `Will r/${selectedSub}'s top post exceed 1,000 comments?`,
        description: `The Court examines the engagement patterns of r/${selectedSub}. Render your verdict wisely.`,
        category: 'reddit',
        status: 'open',
        opensAt: new Date().toISOString(),
        closesAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        resolvesAt: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
        totalRulings: 0,
        guiltyCount: 0,
        innocentCount: 0,
        subreddit: selectedSub,
        metric: 'comments',
        threshold: 1000,
      };
      await context.redis.set(caseKey, JSON.stringify(todayCase));
    }

    const rulingKey = keys.userRuling(user.userId, today);
    const rulingData = await context.redis.get(rulingKey);
    const existingRuling = rulingData ? JSON.parse(rulingData) : null;

    return { todayCase, existingRuling };
  }, {
    depends: [refreshCounter]
  });

  const todayCase = caseAndRuling?.todayCase;
  const existingRuling = caseAndRuling?.existingRuling;
  const showResults = existingRuling?.result !== 'pending' && todayCase?.status === 'resolved';

  async function submitRuling() {
    if (!prediction || !todayCase || !canAffordStake(user.karma, stake)) return;
    
    setSubmitting(true);
    
    const ruling: UserRuling = {
      caseId: todayCase.caseId,
      userId: user.userId,
      prediction,
      stake,
      result: 'pending',
      karmaChange: 0,
      ruledAt: new Date().toISOString(),
    };
    
    await context.redis.set(keys.userRuling(user.userId, todayCase.caseId), JSON.stringify(ruling));
    
    const caseUpdates = {
      totalRulings: (todayCase.totalRulings || 0) + 1,
      guiltyCount: prediction === 'guilty' ? (todayCase.guiltyCount || 0) + 1 : (todayCase.guiltyCount || 0),
      innocentCount: prediction === 'innocent' ? (todayCase.innocentCount || 0) + 1 : (todayCase.innocentCount || 0),
    };
    
    await context.redis.set(keys.dailyCase(todayCase.caseId), JSON.stringify({ ...todayCase, ...caseUpdates }));
    await context.redis.set(keys.user(user.userId), JSON.stringify({ ...user, karma: user.karma - stake }));
    
    // Replace SADD with ZADD
    await context.redis.zAdd(keys.reminders(getTomorrow()), { member: user.userId, score: Date.now() });
    
    setSubmitting(false);
    setRefreshCounter(prev => prev + 1);
    if (onRulingSubmitted) onRulingSubmitted();
  }

  if (loading) return <text>Loading docket...</text>;
  if (!todayCase) return <text>Error loading case.</text>;

  if (showResults && existingRuling) {
    const won = existingRuling.result === 'correct';
    const karmaWon = existingRuling.karmaChange;
    
    return (
      <vstack gap="large" padding="large" backgroundColor={won ? "#0F1F0F" : "#1F0F0F"} border="thick" borderColor={won ? "#00FF00" : "#FF0000"} cornerRadius="large">
        <vstack alignment="center" gap="medium">
          <text size="xxlarge" weight="bold" color={won ? "#00FF00" : "#FF0000"}>
            {won ? '⚖️ JUSTICE SERVED' : '⚖️ JUSTICE DENIED'}
          </text>
          <text size="large" color="#F5F5F0">Case #{todayCase.caseId}</text>
        </vstack>
        
        <GlassCard>
          <vstack gap="medium" alignment="center">
            <hstack gap="large" alignment="center">
              <vstack alignment="center">
                <text size="small" color="#8A8A8A">YOUR RULING</text>
                <text size="xlarge" weight="bold" color={existingRuling.prediction === 'guilty' ? '#FFD700' : '#00CED1'}>
                  {existingRuling.prediction.toUpperCase()}
                </text>
              </vstack>
              <text size="xxlarge">VS</text>
              <vstack alignment="center">
                <text size="small" color="#8A8A8A">TRUTH</text>
                <text size="xlarge" weight="bold" color={todayCase.actualResult === 'guilty' ? '#FFD700' : '#00CED1'}>
                  {todayCase.actualResult?.toUpperCase()}
                </text>
              </vstack>
            </hstack>
            
            <hstack gap="small" alignment="center">
              <text size="large">Karma</text>
              <AnimatedNumber value={karmaWon} duration={1500} color={won ? '#00FF00' : '#FF0000'} prefix={won ? '+' : ''} />
            </hstack>
          </vstack>
        </GlassCard>
        
        {user.currentStreak > 0 && won && (
          <vstack alignment="center" gap="small">
            <StreakFlame intensity={Math.min(user.currentStreak, 30)} />
            <text size="large" color="#FF6B35">{user.currentStreak} Day Streak!</text>
          </vstack>
        )}
        
        {!won && (
          <vstack alignment="center">
            <text color="#8A8A8A">Streak reset. The Court shows no mercy.</text>
            <text size="small" color="#8A8A8A">Return tomorrow to begin anew.</text>
          </vstack>
        )}
      </vstack>
    );
  }

  if (existingRuling && todayCase?.status !== 'resolved') {
    return (
      <vstack gap="large" padding="large" backgroundColor="#0F0F13" border="thick" borderColor="#FFD700" cornerRadius="large">
        <vstack alignment="center" gap="medium">
          <text size="xxlarge" weight="bold" color="#FFD700">⚖️ VERDICT RECORDED</text>
          <GlassCard>
            <vstack gap="medium" alignment="center">
              <hstack gap="small">
                <text size="large">You ruled </text>
                <text size="large" weight="bold" color={existingRuling.prediction === 'guilty' ? '#FFD700' : '#00CED1'}>
                  {existingRuling.prediction.toUpperCase()}
                </text>
              </hstack>
              <hstack gap="small" alignment="center">
                <text>Stake:</text>
                <AnimatedNumber value={existingRuling.stake} color="#FFD700" />
                <text>Karma</text>
              </hstack>
              <text size="small" color="#8A8A8A">Court adjourns at {formatTime(todayCase.closesAt)}</text>
            </vstack>
          </GlassCard>
          
          {user.currentStreak > 0 && (
            <vstack alignment="center" gap="small">
              <StreakFlame intensity={user.currentStreak} />
              <text color="#FF6B35">{user.currentStreak} day streak on the line</text>
            </vstack>
          )}
          
          <text size="small" color="#8A8A8A">Return tomorrow for the verdict...</text>
        </vstack>
      </vstack>
    );
  }

  return (
    <vstack gap="large" padding="large" backgroundColor="#0F0F13">
      <hstack gap="medium" alignment="center">
        <vstack grow>
          <text size="small" color="#8A8A8A">CASE FILE</text>
          <text size="large" weight="bold" color="#F5F5F0">#{todayCase?.caseId || getToday()}</text>
        </vstack>
        {user.currentStreak > 0 && <StreakFlame intensity={user.currentStreak} showNumber />}
        <vstack alignment="end">
          <text size="small" color="#8A8A8A">BALANCE</text>
          <hstack gap="small" alignment="center">
            <text color="#FFD700">💰</text>
            <AnimatedNumber value={user.karma} color="#FFD700" />
          </hstack>
        </vstack>
      </hstack>

      <GlassCard>
        <vstack gap="large">
          <text size="xlarge" weight="bold" color="#F5F5F0">{todayCase?.title || 'Loading case data...'}</text>
          <text size="small" color="#8A8A8A">{todayCase?.description}</text>
          
          <vstack gap="small">
            <hstack gap="small" alignment="center">
              <text size="small" color="#8A8A8A">COURT SENTIMENT</text>
              <spacer grow />
              <text size="small" color="#8A8A8A">{todayCase?.totalRulings || 0} judges seated</text>
            </hstack>
            
            <hstack height="24px" cornerRadius="full">
              <hstack 
                grow={todayCase?.totalRulings ? (todayCase.guiltyCount / todayCase.totalRulings) > 0 : false} 
                backgroundColor="#FFD700"
                alignment="center"
              >
                <text size="small" weight="bold" color="#0F0F13">
                  {todayCase?.totalRulings ? Math.round((todayCase.guiltyCount / todayCase.totalRulings) * 100) : 50}%
                </text>
              </hstack>
              <hstack 
                grow={todayCase?.totalRulings ? (todayCase.innocentCount / todayCase.totalRulings) > 0 : false} 
                backgroundColor="#00CED1"
                alignment="center"
              >
                <text size="small" weight="bold" color="#0F0F13">
                  {todayCase?.totalRulings ? Math.round((todayCase.innocentCount / todayCase.totalRulings) * 100) : 50}%
                </text>
              </hstack>
            </hstack>
          </vstack>
        </vstack>
      </GlassCard>

      <vstack gap="medium">
        <text size="small" color="#8A8A8A">RENDER YOUR VERDICT</text>
        <hstack gap="medium">
          <GlowButton
            onPress={() => setPrediction('guilty')}
            selected={prediction === 'guilty'}
            color="#FFD700"
            icon="⚖️"
            label="GUILTY"
            sublabel="YES"
            disabled={submitting}
          />
          <GlowButton
            onPress={() => setPrediction('innocent')}
            selected={prediction === 'innocent'}
            color="#00CED1"
            icon="⚖️"
            label="INNOCENT"
            sublabel="NO"
            disabled={submitting}
          />
        </hstack>
      </vstack>

      <vstack gap="medium">
        <hstack gap="small" alignment="center">
          <text size="small" color="#8A8A8A">STAKE YOUR KARMA</text>
          <spacer grow />
          {user.currentStreak > 0 && (
            <text size="small" color="#FF6B35">
              🔥 {user.currentStreak}x streak bonus active
            </text>
          )}
        </hstack>
        
        <hstack gap="small">
          {getStakeOptions(user.karma).map((amount) => (
            <GlowButton
              onPress={() => setStake(amount)}
              selected={stake === amount}
              color="#DC143C"
              label={amount.toLocaleString()}
              size="small"
              disabled={user.karma < amount || submitting}
            />
          ))}
          <GlowButton
            onPress={() => setStake(user.karma)}
            selected={stake === user.karma}
            color="#FF0000"
            label="ALL IN"
            sublabel={user.karma.toLocaleString()}
            size="small"
            disabled={user.karma < 100 || submitting}
          />
        </hstack>
      </vstack>

      <GlowButton
        onPress={submitRuling}
        selected={false}
        color={prediction ? '#00FF00' : '#8A8A8A'}
        icon="⚖️"
        label={submitting ? 'RECORDING...' : 'SUBMIT VERDICT'}
        size="large"
        disabled={!prediction || submitting || user.karma < stake}
        fullWidth
      />
    </vstack>
  );
}
