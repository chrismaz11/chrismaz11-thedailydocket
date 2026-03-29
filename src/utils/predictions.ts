import { SpecialSession, SpecialQuestion } from '../types';

export const EVENT_CALENDAR: Record<string, any> = {
  'grammys-2026': {
    name: '68th Annual GRAMMY Awards',
    date: '2026-02-15',
    type: 'awards',
    category: 'Music',
    icon: '🎵',
    description: 'The biggest night in music. Render verdicts on all major categories.',
    questions: [
      { category: 'Album of the Year', text: 'Who will win Album of the Year?', options: ['Beyoncé', 'Taylor Swift', 'SZA', 'Olivia Rodrigo', 'The Weeknd'] },
      { category: 'Record of the Year', text: 'Who will win Record of the Year?', options: ['Flowers', 'Kill Bill', 'Anti-Hero', 'Cruel Summer', 'Last Night'] },
      { category: 'Song of the Year', text: 'Who will win Song of the Year?', options: ['What Was I Made For?', 'Vampire', 'Butter', 'Good 4 U', 'Levitating'] },
      { category: 'Best New Artist', text: 'Who will win Best New Artist?', options: ['Ice Spice', 'Peso Pluma', 'Fred again..', 'Jelly Roll', 'Noah Kahan'] },
      { category: 'Best Pop Vocal Album', text: 'Who will win Best Pop Vocal Album?', options: ['Midnights', 'Guts', 'Endless Summer Vacation', '- (Subtract)', 'Special'] },
      { category: 'Best Rap Album', text: 'Who will win Best Rap Album?', options: ['Her Loss', 'Michael', 'Utopia', 'King\'s Disease III', 'Cheat Codes'] },
    ],
  },
  'oscars-2026': {
    name: '98th Academy Awards',
    date: '2026-03-01',
    type: 'awards',
    category: 'Film',
    icon: '🎬',
    description: 'Hollywood\'s biggest night. Predict the winners of cinema\'s highest honors.',
    questions: [
      { category: 'Best Picture', text: 'Which film will win Best Picture?', options: ['Dune: Part Two', 'Joker: Folie à Deux', 'Wicked', 'Gladiator II', 'Furiosa', 'The Brutalist'] },
      { category: 'Best Director', text: 'Who will win Best Director?', options: ['Denis Villeneuve', 'Todd Phillips', 'Jon M. Chu', 'Ridley Scott', 'George Miller'] },
    ],
  },
  'weekly-rotation': {
    name: 'Weekly Trending Session',
    date: 'weekly',
    type: 'rotating',
    category: 'Trending',
    icon: '📈',
    description: 'Auto-generated based on trending Reddit topics and world events.',
    autoGenerate: true,
  },
};

export function getUpcomingEvents(daysAhead: number = 30): string[] {
  return Object.entries(EVENT_CALENDAR)
    .filter(([id, event]) => {
      if (event.date === 'weekly') return true;
      const eventDate = new Date(event.date);
      const now = new Date();
      const diffTime = eventDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > 0 && diffDays <= daysAhead;
    })
    .map(([id]) => id);
}

export function generateSpecialSession(eventId: string): SpecialSession {
  const event = EVENT_CALENDAR[eventId];
  if (!event) throw new Error(`Unknown event: ${eventId}`);
  
  const questions: SpecialQuestion[] = event.questions.map((q: any, idx: number) => ({
    questionId: `${eventId}-${idx + 1}`,
    order: idx + 1,
    text: q.text,
    options: q.options || generateOptions(event.type, q.category),
    category: q.category,
    unlocksAt: new Date().toISOString(),
    locksAt: new Date(event.date).toISOString(),
    status: 'open',
  }));
  
  return {
    sessionId: eventId,
    name: event.name,
    description: event.description,
    eventType: event.type,
    category: event.category,
    icon: event.icon,
    status: 'open',
    opensAt: new Date().toISOString(),
    closesAt: new Date(event.date).toISOString(),
    bonusMultiplier: 5,
    questions,
  };
}

function generateOptions(eventType: string, category: string): string[] {
  return ['Yes', 'No'];
}
