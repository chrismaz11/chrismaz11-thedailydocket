import { useState, useAsync } from '@devvit/public-api';
import { UserProfile } from '../types';
import { keys } from '../utils/redis';

const DEFAULT_USER: Partial<UserProfile> = {
  karma: 1000, // Starting karma
  totalRulings: 0,
  correctRulings: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastRulingDate: null,
  specialSessionsCompleted: [],
  reminderSettings: {
    redditDM: true,
    reminderTime: "09:00",
  },
};

export function useUser(context: any) {
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Use useAsync to load the user profile
  const { data: user, loading, error } = useAsync<UserProfile>(async () => {
    const userId = context.userId;
    if (!userId) {
      throw new Error('User not logged in');
    }

    const key = keys.user(userId);
    const existing = await context.redis.get(key);
    
    if (existing) {
      return JSON.parse(existing);
    } else {
      // Create new user
      const newUser: UserProfile = {
        ...DEFAULT_USER,
        userId,
        createdAt: new Date().toISOString(),
      } as UserProfile;
      
      await context.redis.set(key, JSON.stringify(newUser));
      return newUser;
    }
  }, {
    depends: [refreshCounter]
  });

  const updateUser = async (updates: Partial<UserProfile>) => {
    if (!user) return;
    const updated = { ...user, ...updates };
    await context.redis.set(keys.user(user.userId), JSON.stringify(updated));
    setRefreshCounter(prev => prev + 1);
  };

  const addKarma = async (amount: number) => {
    if (!user) return;
    const newKarma = Math.max(0, user.karma + amount);
    await updateUser({ karma: newKarma });
  };

  return { user, loading, error, updateUser, addKarma, refresh: () => setRefreshCounter(prev => prev + 1) };
}
