import { Devvit } from '@devvit/public-api';
import { DailyCase, DebateSubmission } from '../types';
import { keys } from './redis';
import { getToday } from './dates';

const TIMEZONE = 'America/New_York';
const DEFAULT_HOME_SUBREDDIT = 'thedailydocket';
const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  month: 'short',
  day: 'numeric',
});
const PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
type DocketContext = Pick<Devvit.Context, 'redis' | 'reddit'> & { subredditName?: string };

type QuestionTemplate = {
  metric: DailyCase['metric'];
  topicTag: string;
  pickThreshold: (subreddit: SubredditProfile) => number;
  pickKeywords?: (subreddit: SubredditProfile) => string[];
  makeTitle: (subreddit: SubredditProfile, threshold: number, keywords?: string[]) => string;
  makeDescription: (subreddit: SubredditProfile, threshold: number, keywords?: string[]) => string;
};

type SubredditProfile = {
  name: string;
  label: string;
  category: string;
  commentsThresholds: number[];
  upvoteThresholds: number[];
  postThresholds: number[];
  top3CommentThresholds: number[];
  top3UpvoteThresholds: number[];
  keywords: string[];
};

const SUBREDDIT_PROFILES: SubredditProfile[] = [
  {
    name: 'AskReddit',
    label: 'AskReddit',
    category: 'Conversation',
    commentsThresholds: [1500, 2500, 4000],
    upvoteThresholds: [25000, 40000, 60000],
    postThresholds: [80, 120, 160],
    top3CommentThresholds: [5000, 7000, 9500],
    top3UpvoteThresholds: [60000, 90000, 120000],
    keywords: ['dating', 'job', 'childhood', 'confession', 'petty', 'creepy'],
  },
  {
    name: 'technology',
    label: 'Technology',
    category: 'Tech Pulse',
    commentsThresholds: [900, 1300, 1800],
    upvoteThresholds: [12000, 18000, 25000],
    postThresholds: [45, 65, 90],
    top3CommentThresholds: [2800, 3800, 5200],
    top3UpvoteThresholds: [32000, 45000, 65000],
    keywords: ['AI', 'Apple', 'OpenAI', 'Google', 'chip', 'robot'],
  },
  {
    name: 'worldnews',
    label: 'World News',
    category: 'Global Affairs',
    commentsThresholds: [1200, 1800, 2600],
    upvoteThresholds: [18000, 26000, 36000],
    postThresholds: [55, 80, 105],
    top3CommentThresholds: [4200, 5600, 7800],
    top3UpvoteThresholds: [42000, 60000, 82000],
    keywords: ['election', 'Ukraine', 'China', 'court', 'tariff', 'wildfire'],
  },
  {
    name: 'gaming',
    label: 'Gaming',
    category: 'Player Jury',
    commentsThresholds: [700, 1100, 1600],
    upvoteThresholds: [9000, 15000, 22000],
    postThresholds: [60, 90, 120],
    top3CommentThresholds: [2400, 3500, 4700],
    top3UpvoteThresholds: [25000, 36000, 50000],
    keywords: ['Nintendo', 'Steam', 'GTA', 'Xbox', 'Sony', 'patch'],
  },
  {
    name: 'movies',
    label: 'Movies',
    category: 'Box Office Bench',
    commentsThresholds: [650, 1000, 1500],
    upvoteThresholds: [8000, 13000, 19000],
    postThresholds: [30, 45, 60],
    top3CommentThresholds: [2200, 3100, 4200],
    top3UpvoteThresholds: [22000, 32000, 44000],
    keywords: ['trailer', 'Marvel', 'Oscars', 'casting', 'box office', 'A24'],
  },
  {
    name: 'sports',
    label: 'Sports',
    category: 'Stadium Docket',
    commentsThresholds: [1000, 1500, 2200],
    upvoteThresholds: [10000, 16000, 24000],
    postThresholds: [45, 65, 90],
    top3CommentThresholds: [3200, 4500, 6200],
    top3UpvoteThresholds: [30000, 43000, 56000],
    keywords: ['trade', 'finals', 'injury', 'draft', 'coach', 'playoffs'],
  },
];

const QUESTION_TEMPLATES: QuestionTemplate[] = [
  {
    metric: 'comments',
    topicTag: 'Cross-Examination',
    pickThreshold: (subreddit) => pickOne(subreddit.commentsThresholds),
    makeTitle: (subreddit, threshold) =>
      `Will r/${subreddit.name}'s most argued post rack up at least ${formatNumber(threshold)} comments before court adjourns?`,
    makeDescription: (subreddit, threshold) =>
      `The bench is tracking whether ${subreddit.label}'s loudest thread can clear ${formatNumber(threshold)} comments in a single day.`,
  },
  {
    metric: 'upvotes',
    topicTag: 'Viral Appeal',
    pickThreshold: (subreddit) => pickOne(subreddit.upvoteThresholds),
    makeTitle: (subreddit, threshold) =>
      `Will r/${subreddit.name}'s headline case break ${formatNumber(threshold)} upvotes today?`,
    makeDescription: (subreddit, threshold) =>
      `A straight viral test. The court wants to know if ${subreddit.label} can force a post past ${formatNumber(threshold)} upvotes.`,
  },
  {
    metric: 'frontpage',
    topicTag: 'Appeals Court',
    pickThreshold: () => 1,
    makeTitle: (subreddit) =>
      `Will r/${subreddit.name} win a place on Reddit's front page today?`,
    makeDescription: (subreddit) =>
      `This is the national spotlight round. One breakout post from ${subreddit.label} is enough to make the docket.`,
  },
  {
    metric: 'posts',
    topicTag: 'Court Calendar',
    pickThreshold: (subreddit) => pickOne(subreddit.postThresholds),
    makeTitle: (subreddit, threshold) =>
      `Will r/${subreddit.name} publish at least ${formatNumber(threshold)} new filings before midnight ET?`,
    makeDescription: (subreddit, threshold) =>
      `The court is measuring pure activity. ${subreddit.label} needs ${formatNumber(threshold)} new posts to meet the calendar.`,
  },
  {
    metric: 'top3comments',
    topicTag: 'Hot Bench',
    pickThreshold: (subreddit) => pickOne(subreddit.top3CommentThresholds),
    makeTitle: (subreddit, threshold) =>
      `Will the top 3 posts in r/${subreddit.name} combine for ${formatNumber(threshold)} comments or more today?`,
    makeDescription: (subreddit, threshold) =>
      `Instead of one runaway thread, this hearing tests whether the whole front bench in ${subreddit.label} can hit ${formatNumber(threshold)} comments.`,
  },
  {
    metric: 'top3upvotes',
    topicTag: 'Majority Opinion',
    pickThreshold: (subreddit) => pickOne(subreddit.top3UpvoteThresholds),
    makeTitle: (subreddit, threshold) =>
      `Will the top 3 posts in r/${subreddit.name} deliver a combined ${formatNumber(threshold)} upvotes today?`,
    makeDescription: (subreddit, threshold) =>
      `The court is reading the room across multiple posts. ${subreddit.label} needs a combined ${formatNumber(threshold)} upvotes on its top three.`,
  },
  {
    metric: 'keyword-top10',
    topicTag: 'Community Debate',
    pickThreshold: () => 1,
    pickKeywords: (subreddit) => [pickOne(subreddit.keywords)],
    makeTitle: (subreddit, _threshold, keywords) =>
      `Will one of r/${subreddit.name}'s top 10 posts mention "${keywords?.[0] ?? 'the chosen topic'}" today?`,
    makeDescription: (subreddit, _threshold, keywords) =>
      `The bench is watching for a live debate topic in ${subreddit.label}. A single top 10 post mentioning "${keywords?.[0] ?? 'the chosen topic'}" is enough.`,
  },
];

export async function registerHomeSubreddit(context: DocketContext, subredditName?: string): Promise<string> {
  const resolved = sanitizeSubredditName(
    subredditName ??
      context.subredditName ??
      (await safeGetCurrentSubredditName(context)) ??
      DEFAULT_HOME_SUBREDDIT
  );

  await context.redis.set(keys.config.homeSubreddit(), resolved);
  return resolved;
}

export async function getHomeSubreddit(context: DocketContext): Promise<string> {
  const stored = await context.redis.get(keys.config.homeSubreddit());
  if (stored) return sanitizeSubredditName(stored);
  return registerHomeSubreddit(context);
}

export async function ensureDailyCase(context: DocketContext, date: string = getToday()) {
  const existing = await context.redis.get(keys.dailyCase(date));
  if (existing) {
    return { dailyCase: JSON.parse(existing) as DailyCase, created: false };
  }

  const communityCase = await buildCaseFromApprovedSubmission(context, date);
  const dailyCase = communityCase ?? buildGeneratedCase(date);

  await context.redis.set(keys.dailyCase(date), JSON.stringify(dailyCase));
  return { dailyCase, created: true };
}

export async function ensureDailyPost(
  context: DocketContext,
  dailyCase: DailyCase,
  subredditName: string,
  date: string = dailyCase.caseId
) {
  const existingPostId = await context.redis.get(keys.dailyPost(date));
  if (existingPostId) {
    return existingPostId;
  }

  const post = await context.reddit.submitPost({
    subredditName,
    title: `⚖️ The Daily Docket — ${date} | ${dailyCase.title}`,
    preview: (
      <vstack height="100%" width="100%" alignment="center middle" backgroundColor="#080810">
        <text size="xxlarge" color="#C9A84C">⚖️ The Daily Docket</text>
        <text size="small" color="#555555">Court is coming to order…</text>
      </vstack>
    ),
  });

  await context.redis.set(keys.dailyPost(date), post.id);
  try {
    await context.reddit.setPostFlair({
      postId: post.id,
      subredditName,
      text: '⚖️ Daily Docket',
      cssClass: 'daily-docket',
    });
  } catch (_error) {}
  return post.id;
}

export async function getDailyPostUrl(context: DocketContext, date: string): Promise<string | null> {
  const postId = await context.redis.get(keys.dailyPost(date));
  if (!postId) return null;

  try {
    const post = await context.reddit.getPostById(postId);
    return post?.permalink ? `https://www.reddit.com${post.permalink}` : null;
  } catch {
    return null;
  }
}

export function buildGeneratedCase(date: string): DailyCase {
  const subreddit = pickOne(SUBREDDIT_PROFILES);
  const template = pickOne(QUESTION_TEMPLATES);
  const threshold = template.pickThreshold(subreddit);
  const keywords = template.pickKeywords?.(subreddit);
  const opensAt = startOfEtDay(date);
  const closesAt = endOfEtDay(date);
  const resolvesAt = addHoursEt(date, 25);

  return {
    caseId: date,
    title: template.makeTitle(subreddit, threshold, keywords),
    description: template.makeDescription(subreddit, threshold, keywords),
    category: 'reddit',
    status: 'open',
    opensAt,
    closesAt,
    resolvesAt,
    totalRulings: 0,
    guiltyCount: 0,
    innocentCount: 0,
    subreddit: subreddit.name,
    metric: template.metric,
    threshold,
    keywords,
    topicTag: template.topicTag,
    targetScope: subreddit.name === 'all' ? 'reddit' : 'subreddit',
  };
}

async function buildCaseFromApprovedSubmission(
  context: DocketContext,
  date: string
): Promise<DailyCase | null> {
  const approved = await context.redis.zRange(keys.debateQueue.approved(), 0, 0, { by: 'rank' });
  const submissionId = approved[0]?.member;
  if (!submissionId) return null;

  const submissionData = await context.redis.get(keys.debateSubmission(submissionId));
  if (!submissionData) {
    await context.redis.zRem(keys.debateQueue.approved(), [submissionId]);
    return null;
  }

  const submission: DebateSubmission = JSON.parse(submissionData);
  submission.status = 'scheduled';
  submission.reviewedAt = new Date().toISOString();
  await context.redis.set(keys.debateSubmission(submissionId), JSON.stringify(submission));
  await context.redis.zRem(keys.debateQueue.approved(), [submissionId]);

  return {
    caseId: date,
    title: submission.title,
    description: submission.description,
    category: 'community',
    status: 'open',
    opensAt: startOfEtDay(date),
    closesAt: endOfEtDay(date),
    resolvesAt: addHoursEt(date, 25),
    totalRulings: 0,
    guiltyCount: 0,
    innocentCount: 0,
    subreddit: submission.subreddit,
    metric: submission.metric,
    threshold: submission.threshold,
    targetScope: submission.targetScope,
    keywords: submission.keywords,
    topicTag: submission.topicTag ?? 'Community Debate',
    sourceSubmissionId: submission.submissionId,
  };
}

async function safeGetCurrentSubredditName(context: DocketContext): Promise<string | undefined> {
  try {
    return await context.reddit.getCurrentSubredditName();
  } catch {
    return undefined;
  }
}

function sanitizeSubredditName(value: string): string {
  return value.replace(/^r\//i, '').trim() || DEFAULT_HOME_SUBREDDIT;
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function pickOne<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function startOfEtDay(date: string): string {
  return zonedDate(date, 0).toISOString();
}

function endOfEtDay(date: string): string {
  return zonedDate(date, 23, 59, 59, 999).toISOString();
}

function addHoursEt(date: string, hours: number): string {
  const base = zonedDate(date, 0);
  base.setHours(base.getHours() + hours);
  return base.toISOString();
}

function zonedDate(
  date: string,
  hours: number,
  minutes = 0,
  seconds = 0,
  ms = 0
): Date {
  const [year, month, day] = date.split('-').map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds, ms));
  const zonedParts = getTimeZoneParts(utcGuess);
  const wantedAsUtc = Date.UTC(year, month - 1, day, hours, minutes, seconds, ms);
  const zonedAsUtc = Date.UTC(
    zonedParts.year,
    zonedParts.month - 1,
    zonedParts.day,
    zonedParts.hour,
    zonedParts.minute,
    zonedParts.second,
    ms
  );
  return new Date(utcGuess.getTime() + (wantedAsUtc - zonedAsUtc));
}

function getTimeZoneParts(date: Date) {
  const parts = PARTS_FORMATTER.formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === 'year')?.value ?? '0'),
    month: Number(parts.find((part) => part.type === 'month')?.value ?? '1'),
    day: Number(parts.find((part) => part.type === 'day')?.value ?? '1'),
    hour: Number(parts.find((part) => part.type === 'hour')?.value ?? '0'),
    minute: Number(parts.find((part) => part.type === 'minute')?.value ?? '0'),
    second: Number(parts.find((part) => part.type === 'second')?.value ?? '0'),
  };
}

export function createDebateSubmission(input: {
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
}): DebateSubmission {
  return {
    submissionId: globalThis.crypto.randomUUID(),
    submittedByUserId: input.submittedByUserId,
    submittedByUsername: input.submittedByUsername,
    title: input.title.trim(),
    description: input.description.trim(),
    targetScope: input.targetScope,
    subreddit: sanitizeSubredditName(input.subreddit || 'all'),
    metric: input.metric,
    threshold: input.threshold,
    keywords: input.keywords?.filter(Boolean),
    topicTag: input.topicTag?.trim() || 'Community Debate',
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
}

export function formatSubmissionSummary(submission: DebateSubmission): string {
  const scopeLabel = submission.targetScope === 'reddit' ? 'Entire Reddit' : `r/${submission.subreddit}`;
  const keywordLabel = submission.keywords?.length ? `Keywords: ${submission.keywords.join(', ')}` : 'No keywords';
  return [
    `Scope: ${scopeLabel}`,
    `Metric: ${submission.metric}`,
    `Threshold: ${formatNumber(submission.threshold)}`,
    keywordLabel,
    submission.description,
  ].join('\n');
}

export function formatTodayTag(date = getToday()): string {
  return SHORT_DATE_FORMATTER.format(new Date(`${date}T12:00:00Z`));
}
