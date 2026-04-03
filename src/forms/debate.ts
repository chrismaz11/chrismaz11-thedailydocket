import { Devvit } from '@devvit/public-api';
import { DebateSubmission } from '../types';
import { keys } from '../utils/redis';
import { createDebateSubmission, formatSubmissionSummary } from '../utils/docket';

const metricOptions = [
  { label: 'Top post comments', value: 'comments' },
  { label: 'Top post upvotes', value: 'upvotes' },
  { label: 'Front page appearance', value: 'frontpage' },
  { label: 'New post volume', value: 'posts' },
  { label: 'Top 3 combined comments', value: 'top3comments' },
  { label: 'Top 3 combined upvotes', value: 'top3upvotes' },
  { label: 'Keyword in top 10 posts', value: 'keyword-top10' },
];

export const debateSubmissionForm = Devvit.createForm(
  {
    title: 'Submit a Community Debate',
    description: 'Pitch a future Daily Docket question for moderator review.',
    acceptLabel: 'Send to Moderators',
    fields: [
      {
        type: 'string',
        name: 'title',
        label: 'Debate headline',
        helpText: 'Make it sound like a Daily Docket case title.',
        required: true,
      },
      {
        type: 'paragraph',
        name: 'description',
        label: 'Why should the court hear this?',
        helpText: 'Give moderators context and the exact angle to test.',
        required: true,
      },
      {
        type: 'select',
        name: 'scope',
        label: 'Where should this debate happen?',
        defaultValue: ['subreddit'],
        options: [
          { label: 'One subreddit', value: 'subreddit' },
          { label: 'All of Reddit', value: 'reddit' },
        ],
      },
      {
        type: 'string',
        name: 'subreddit',
        label: 'Target subreddit',
        helpText: 'Leave blank only if this is for all of Reddit.',
      },
      {
        type: 'select',
        name: 'metric',
        label: 'How should the result be measured?',
        defaultValue: ['comments'],
        options: metricOptions,
      },
      {
        type: 'number',
        name: 'threshold',
        label: 'Threshold to beat',
        required: true,
        defaultValue: 1000,
      },
      {
        type: 'string',
        name: 'keywords',
        label: 'Keywords (optional)',
        helpText: 'Comma-separated. Useful for the keyword-based debate type.',
      },
      {
        type: 'string',
        name: 'topicTag',
        label: 'Case tag',
        helpText: 'Examples: Community Debate, Mod Pick, Hot Take.',
        defaultValue: 'Community Debate',
      },
    ],
  },
  async (event, context) => {
    const userId = context.userId;
    if (!userId) {
      context.ui.showToast('Log in to submit a debate.');
      return;
    }

    const username = await context.reddit.getCurrentUsername();
    const scope = (event.values.scope?.[0] ?? 'subreddit') as 'subreddit' | 'reddit';
    const subreddit = scope === 'reddit' ? 'all' : (event.values.subreddit || context.subredditName || 'thedailydocket');
    const metric = (event.values.metric?.[0] ?? 'comments') as DebateSubmission['metric'];
    const keywords = event.values.keywords
      ? event.values.keywords.split(',').map((value) => value.trim()).filter(Boolean)
      : undefined;

    const submission = createDebateSubmission({
      submittedByUserId: userId,
      submittedByUsername: username,
      title: event.values.title ?? 'Community Debate',
      description: event.values.description ?? 'No description provided.',
      targetScope: scope,
      subreddit,
      metric,
      threshold: Number(event.values.threshold ?? 1000),
      keywords,
      topicTag: event.values.topicTag,
    });

    await context.redis.set(keys.debateSubmission(submission.submissionId), JSON.stringify(submission));
    await context.redis.zAdd(keys.debateQueue.pending(), {
      member: submission.submissionId,
      score: Date.now(),
    });

    context.ui.showToast('Debate submitted for moderator review.');
  }
);

export const debateReviewForm = Devvit.createForm(
  (data: Record<string, any>) => ({
    title: `Review: ${String(data.submissionTitle ?? 'Community Debate')}`,
    description: String(data.submissionSummary ?? 'No submission summary provided.'),
    acceptLabel: 'Save Decision',
    fields: [
      {
        type: 'select',
        name: 'action',
        label: 'Moderator decision',
        defaultValue: ['approve'],
        options: [
          { label: 'Approve for docket queue', value: 'approve' },
          { label: 'Reject', value: 'reject' },
          { label: 'Leave pending', value: 'pending' },
        ],
      },
      {
        type: 'paragraph',
        name: 'moderatorNote',
        label: 'Moderator note',
        helpText: 'Optional note about edits, rationale, or follow-up.',
      },
    ],
  }),
  async (event, context) => {
    const submissionId = context.userId
      ? await context.redis.get(keys.debateReview(context.userId))
      : '';
    if (!submissionId) {
      context.ui.showToast('Missing submission context.');
      return;
    }

    const submissionData = await context.redis.get(keys.debateSubmission(submissionId));
    if (!submissionData) {
      context.ui.showToast('That submission is no longer available.');
      return;
    }

    const username = await context.reddit.getCurrentUsername();
    const submission: DebateSubmission = JSON.parse(submissionData);
    const action = event.values.action?.[0] ?? 'pending';

    submission.moderatorNote = event.values.moderatorNote?.trim() || undefined;
    submission.reviewedByUsername = username;
    submission.reviewedAt = new Date().toISOString();

    await context.redis.zRem(keys.debateQueue.pending(), [submissionId]);

    if (action === 'approve') {
      submission.status = 'approved';
      await context.redis.zAdd(keys.debateQueue.approved(), { member: submissionId, score: Date.now() });
      context.ui.showToast('Debate approved and queued.');
    } else if (action === 'reject') {
      submission.status = 'rejected';
      context.ui.showToast('Debate rejected.');
    } else {
      submission.status = 'pending';
      await context.redis.zAdd(keys.debateQueue.pending(), { member: submissionId, score: Date.now() });
      context.ui.showToast('Debate left in review queue.');
    }

    await context.redis.set(keys.debateSubmission(submissionId), JSON.stringify(submission));
    if (context.userId) {
      await context.redis.del(keys.debateReview(context.userId));
    }
  }
);

export async function openDebateSubmissionForm(context: Devvit.Context) {
  context.ui.showForm(debateSubmissionForm);
}

export async function openDebateReviewForm(context: Devvit.Context) {
  const pending = await context.redis.zRange(keys.debateQueue.pending(), 0, 0, { by: 'rank' });
  const submissionId = pending[0]?.member;

  if (!submissionId) {
    context.ui.showToast('No community debates are waiting for review.');
    return;
  }

  const submissionData = await context.redis.get(keys.debateSubmission(submissionId));
  if (!submissionData) {
    await context.redis.zRem(keys.debateQueue.pending(), [submissionId]);
    context.ui.showToast('Removed an empty queue item. Try again.');
    return;
  }

  const submission: DebateSubmission = JSON.parse(submissionData);
  if (context.userId) {
    await context.redis.set(keys.debateReview(context.userId), submissionId);
  }
  context.ui.showForm(debateReviewForm, {
    submissionTitle: submission.title,
    submissionSummary: formatSubmissionSummary(submission),
  });
}
