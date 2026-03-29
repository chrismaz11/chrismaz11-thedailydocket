import { Devvit, useState, useAsync } from '@devvit/public-api';
import { SpecialSession, SpecialQuestion, UserSessionProgress, UserProfile } from '../types';
import { keys } from '../utils/redis';
import { getToday } from '../utils/dates';
import { GlassCard } from './GlassCard';
import { GlowButton } from './GlowButton';
import { AnimatedNumber } from './AnimatedNumber';

interface SpecialSessionsProps {
  user: UserProfile;
  context: Devvit.Context;
}

export function SpecialSessions({ user, context }: SpecialSessionsProps) {
  const [selectedSession, setSelectedSession] = useState<SpecialSession | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Load Active Sessions using useAsync
  const { data: sessions, loading } = useAsync<SpecialSession[]>(async () => {
    // Replace SMEMBERS with ZRANGE
    const rawIds = await context.redis.zRange(keys.activeSessions(), 0, -1);
    const sessionIds = rawIds.map(r => r.member);
    const loaded: SpecialSession[] = [];
    
    for (const id of sessionIds) {
      const data = await context.redis.get(keys.session(id));
      if (data) {
        const session: SpecialSession = JSON.parse(data);
        if (['open', 'upcoming'].includes(session.status)) {
          loaded.push(session);
        }
      }
    }
    
    // Auto-generate weekly rotating session if none active
    if (loaded.length === 0) {
      const trendingTopics = ['AI', 'Crypto', 'Climate', 'Space', 'Gaming', 'Movies'];
      const topic = trendingTopics[Math.floor(Math.random() * trendingTopics.length)];
      const today = getToday();
      
      const session: SpecialSession = {
        sessionId: `weekly-${today}`,
        name: `This Week in ${topic}`,
        description: `Special session on trending ${topic} discussions across Reddit.`,
        eventType: 'rotating',
        status: 'open',
        opensAt: new Date().toISOString(),
        closesAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        bonusMultiplier: 3,
        questions: Array.from({ length: 10 }, (_, i) => ({
          questionId: `weekly-${today}-${i}`,
          order: i + 1,
          text: `Prediction ${i + 1} about ${topic}...`,
          options: ['Yes', 'No', 'Maybe', 'Unsure'],
          unlocksAt: new Date().toISOString(),
          locksAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'open',
          category: `${topic} Trends`,
        })),
      };
      
      await context.redis.set(keys.session(session.sessionId), JSON.stringify(session));
      // Replace SADD with ZADD
      await context.redis.zAdd(keys.activeSessions(), { member: session.sessionId, score: Date.now() });
      loaded.push(session);
    }
    
    return loaded;
  }, {
    depends: [refreshCounter]
  });

  if (selectedSession) {
    return (
      <SessionDocket 
        session={selectedSession} 
        user={user} 
        context={context}
        onBack={() => setSelectedSession(null)}
      />
    );
  }

  return (
    <vstack gap="large" padding="large" backgroundColor="#0F0F13">
      <hstack gap="small" alignment="center middle">
        <text size="xxlarge">🏛️</text>
        <vstack>
          <text size="xlarge" weight="bold" color="#F5F5F0">SPECIAL SESSIONS</text>
          <text size="small" color="#8A8A8A">Limited-time high-stakes proceedings</text>
        </vstack>
      </hstack>

      {loading ? (
        <vstack alignment="center middle" gap="medium">
          <text color="#8A8A8A">Summoning court records...</text>
        </vstack>
      ) : (!sessions || sessions.length === 0) ? (
        <GlassCard>
          <vstack gap="medium" alignment="center middle">
            <text size="xlarge">📅</text>
            <text color="#F5F5F0">No special sessions in progress</text>
            <text size="small" color="#8A8A8A">
              Check back during major events like the GRAMMYs, Oscars, Super Bowl, or Election Day for bonus multipliers up to 5x!
            </text>
          </vstack>
        </GlassCard>
      ) : (
        <vstack gap="medium">
          {sessions.map((session) => (
            <GlassCard key={session.sessionId}>
              <hstack 
                onPress={() => setSelectedSession(session)}
                gap="medium"
                alignment="center middle"
              >
                <vstack width="60px" height="60px" backgroundColor="rgba(255,215,0,0.1)" cornerRadius="medium" alignment="center middle">
                  <text size="xxlarge">{session.icon || '🏛️'}</text>
                </vstack>
                
                <vstack grow gap="small">
                  <text weight="bold" color="#F5F5F0" size="large">{session.name}</text>
                  <text size="small" color="#8A8A8A">{session.description}</text>
                  <hstack gap="small">
                    <text size="small" color="#FFD700">{session.questions.length} Cases</text>
                    <text size="small" color="#8A8A8A">•</text>
                    <text size="small" color="#00FF00">{session.bonusMultiplier}x Bonus</text>
                  </hstack>
                </vstack>
                
                <vstack alignment="end middle" gap="small">
                  <text size="small" color="#8A8A8A">Ends</text>
                  <text size="small" color="#FF6B35">{formatCountdown(session.closesAt)}</text>
                </vstack>
              </hstack>
            </GlassCard>
          ))}
        </vstack>
      )}
    </vstack>
  );
}

function SessionDocket({ session, user, context, onBack }: {
  session: SpecialSession;
  user: UserProfile;
  context: Devvit.Context;
  onBack: () => void;
}) {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Load Progress using useAsync
  const { data: progress, loading } = useAsync<UserSessionProgress>(async () => {
    const progressKey = keys.sessionProgress(session.sessionId, user.userId);
    const existing = await context.redis.get(progressKey);
    
    if (existing) {
      return JSON.parse(existing);
    } else {
      const newProgress: UserSessionProgress = {
        sessionId: session.sessionId,
        userId: user.userId,
        answers: {},
        questionsAnswered: 0,
        totalStake: 0,
        bonusEarned: false,
        finalScore: 0,
      };
      await context.redis.set(progressKey, JSON.stringify(newProgress));
      return newProgress;
    }
  }, {
    depends: [refreshCounter]
  });

  const currentQuestion = progress ? session.questions.find(q => !progress.answers[q.questionId]) : null;
  const showCelebration = progress && progress.questionsAnswered === session.questions.length;

  async function submitAnswer() {
    if (!currentQuestion || !selectedAnswer || !progress) return;
    
    setSubmitting(true);
    
    const stake = 100;
    const updatedAnswers = {
      ...progress.answers,
      [currentQuestion.questionId]: {
        answer: selectedAnswer,
        stake,
        answeredAt: new Date().toISOString(),
        result: 'pending' as const,
        karmaChange: 0,
      }
    };
    
    const updatedProgress: UserSessionProgress = {
      ...progress,
      answers: updatedAnswers,
      questionsAnswered: (progress.questionsAnswered || 0) + 1,
      totalStake: (progress.totalStake || 0) + stake,
      bonusEarned: (progress.questionsAnswered || 0) + 1 === session.questions.length,
    };
    
    if (updatedProgress.bonusEarned) {
      updatedProgress.completedAt = new Date().toISOString();
    }
    
    await context.redis.set(keys.sessionProgress(session.sessionId, user.userId), JSON.stringify(updatedProgress));
    await context.redis.set(keys.user(user.userId), JSON.stringify({ ...user, karma: user.karma - stake }));
    
    setSelectedAnswer(null);
    setSubmitting(false);
    setRefreshCounter(prev => prev + 1);
  }

  if (loading) return <text>Loading docket...</text>;

  if (showCelebration) {
    return (
      <vstack gap="large" padding="large" backgroundColor="#0F0F13" alignment="center middle">
        <text size="xxlarge">🏛️</text>
        <text size="xxlarge" weight="bold" color="#FFD700">SESSION COMPLETE</text>
        
        <GlassCard>
          <vstack gap="large" alignment="center middle">
            <text size="xlarge" color="#F5F5F0">{session.name}</text>
            <text color="#F5F5F0">You've rendered verdicts on all {session.questions.length} cases</text>
            
            {progress?.bonusEarned ? (
              <vstack backgroundColor="rgba(255,215,0,0.2)" padding="large" cornerRadius="medium" gap="small">
                <text size="xxlarge" color="#FFD700">🎉</text>
                <text size="xlarge" weight="bold" color="#FFD700">{session.bonusMultiplier}x BONUS UNLOCKED!</text>
                <text size="small" color="#F5F5F0">Return when results are announced for bonus payout</text>
              </vstack>
            ) : null}
            
            <hstack gap="small">
              <text color="#F5F5F0">Total at stake:</text>
              <AnimatedNumber value={progress?.totalStake || 0} color="#FFD700" />
              <text color="#F5F5F0">Karma</text>
            </hstack>
          </vstack>
        </GlassCard>
        
        <GlowButton onPress={onBack} selected={false} color="#00CED1" label="RETURN TO COURT" fullWidth />
      </vstack>
    );
  }

  return (
    <vstack gap="large" padding="large" backgroundColor="#0F0F13">
      {/* Header */}
      <hstack gap="small" alignment="center middle">
        <GlowButton onPress={onBack} selected={false} color="#8A8A8A" label="←" size="small" />
        <vstack grow>
          <text size="small" color="#8A8A8A">{session.category || 'SPECIAL SESSION'}</text>
          <text weight="bold" color="#F5F5F0" size="large">{session.name}</text>
        </vstack>
      </hstack>

      <vstack gap="small">
        <hstack gap="small" alignment="center middle">
          <text size="small" color="#8A8A8A">PROGRESS</text>
          <spacer grow />
          <text color="#FFD700">{progress?.questionsAnswered || 0}/{session.questions.length}</text>
        </hstack>
        <hstack height="8px" backgroundColor="rgba(255,255,255,0.1)" cornerRadius="full">
          <hstack 
            height="100%" 
            grow={progress ? (progress.questionsAnswered / session.questions.length) > 0 : false}
            backgroundColor="#FFD700"
            cornerRadius="full"
          />
        </hstack>
      </vstack>

      {currentQuestion ? (
        <vstack gap="large">
          <GlassCard>
            <vstack gap="medium">
              <text size="small" color="#8A8A8A">CASE {currentQuestion.order} OF {session.questions.length}</text>
              <text size="small" color="#FFD700">{currentQuestion.category}</text>
              <text size="xlarge" weight="bold" color="#F5F5F0">{currentQuestion.text}</text>
            </vstack>
          </GlassCard>

          <vstack gap="medium">
            <text size="small" color="#8A8A8A">SELECT YOUR VERDICT</text>
            <vstack gap="small">
              {currentQuestion.options.map((option, idx) => (
                <GlowButton
                  key={option}
                  onPress={() => setSelectedAnswer(option)}
                  selected={selectedAnswer === option}
                  color={idx % 2 === 0 ? '#FFD700' : '#00CED1'}
                  label={option}
                  fullWidth
                />
              ))}
            </vstack>
          </vstack>

          <GlowButton
            onPress={submitAnswer}
            selected={false}
            color={selectedAnswer ? '#00FF00' : '#8A8A8A'}
            label={submitting ? 'RECORDING VERDICT...' : '⚖️ SUBMIT VERDICT ⚖️'}
            size="large"
            disabled={!selectedAnswer || submitting}
            fullWidth
          />
        </vstack>
      ) : null}

      {progress && progress.questionsAnswered < session.questions.length ? (
        <text size="small" color="#8A8A8A" alignment="center middle">
          Complete {session.questions.length - progress.questionsAnswered} more for {session.bonusMultiplier}x bonus
        </text>
      ) : null}
    </vstack>
  );
}

function formatCountdown(isoString: string): string {
  const end = new Date(isoString).getTime();
  const now = Date.now();
  const diff = end - now;
  
  if (diff <= 0) return 'ENDED';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h left`;
}
