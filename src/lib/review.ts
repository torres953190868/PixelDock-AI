import type { ReviewState } from '@/types';

export const REVIEW_INTERVALS_MS = [
  20 * 60_000,
  60 * 60_000,
  9 * 60 * 60_000,
  24 * 60 * 60_000,
  2 * 24 * 60 * 60_000,
  6 * 24 * 60 * 60_000,
  31 * 24 * 60 * 60_000,
] as const;

export const REVIEW_STAGE_COUNT = REVIEW_INTERVALS_MS.length;

function intervalAt(stage: number): number {
  return REVIEW_INTERVALS_MS[Math.min(Math.max(stage, 0), REVIEW_STAGE_COUNT - 1)];
}

export function createReviewState(vocabId: string, now: Date = new Date()): ReviewState {
  return {
    vocabId,
    stage: 0,
    nextReviewAt: new Date(now.getTime() + intervalAt(0)).toISOString(),
    lastReviewedAt: null,
    correctCount: 0,
    incorrectCount: 0,
    status: 'active',
  };
}

export function isReviewDue(state: ReviewState, now: number = Date.now()): boolean {
  return (
    state.status === 'active' &&
    typeof state.nextReviewAt === 'string' &&
    Date.parse(state.nextReviewAt) <= now
  );
}

export function applyReviewResult(
  state: ReviewState,
  remembered: boolean,
  now: Date = new Date(),
): ReviewState {
  const lastReviewedAt = now.toISOString();

  if (!remembered) {
    return {
      ...state,
      stage: 0,
      nextReviewAt: new Date(now.getTime() + intervalAt(0)).toISOString(),
      lastReviewedAt,
      incorrectCount: state.incorrectCount + 1,
      status: 'active',
    };
  }

  const nextStage = state.stage + 1;
  if (nextStage >= REVIEW_STAGE_COUNT) {
    return {
      ...state,
      stage: nextStage,
      nextReviewAt: null,
      lastReviewedAt,
      correctCount: state.correctCount + 1,
      status: 'mastered',
    };
  }

  return {
    ...state,
    stage: nextStage,
    nextReviewAt: new Date(now.getTime() + intervalAt(nextStage)).toISOString(),
    lastReviewedAt,
    correctCount: state.correctCount + 1,
    status: 'active',
  };
}

export function getEarliestReviewAt(states: Iterable<ReviewState>): string | null {
  let earliest: string | null = null;
  for (const state of states) {
    if (state.status !== 'active' || !state.nextReviewAt) continue;
    if (!earliest || state.nextReviewAt < earliest) earliest = state.nextReviewAt;
  }
  return earliest;
}
