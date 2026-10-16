import { useEffect, useState } from 'react';
import { REVIEW_STAGE_COUNT, applyReviewResult } from '@/lib/review';
import {
  ensureReviewStates,
  getNextReviewAt,
  listDueReviews,
  saveReviewState,
  type DueReviewItem,
} from '@/lib/storage';

export function ReviewPanel() {
  const [queue, setQueue] = useState<DueReviewItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [rememberedCount, setRememberedCount] = useState(0);
  const [nextReviewAt, setNextReviewAt] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      await ensureReviewStates();
      const [due, upcoming] = await Promise.all([listDueReviews(), getNextReviewAt()]);
      setQueue(due);
      setNextReviewAt(upcoming);
    })();
  }, []);

  const current = queue?.[index] ?? null;

  const answer = async (remembered: boolean) => {
    if (!current) return;
    await saveReviewState(applyReviewResult(current.review, remembered));
    if (remembered) setRememberedCount((count) => count + 1);
    setRevealed(false);
    setIndex((value) => value + 1);
    if (index + 1 >= (queue?.length ?? 0)) {
      setNextReviewAt(await getNextReviewAt());
    }
  };

  if (queue === null) {
    return (
      <section className="pd-panel" aria-label="Review panel" data-testid="Review panel">
        <div className="pd-card pd-muted" aria-label="Review loading" data-testid="Review loading">
          Loading review queue...
        </div>
      </section>
    );
  }

  if (queue.length === 0) {
    return (
      <section className="pd-panel" aria-label="Review panel" data-testid="Review panel">
        <div className="pd-card" aria-label="Review empty state" data-testid="Review empty state">
          <p className="pd-result-text">No words due for review.</p>
          {nextReviewAt && (
            <p className="pd-muted" aria-label="Next review time" data-testid="Next review time">
              Next review: {new Date(nextReviewAt).toLocaleString()}
            </p>
          )}
        </div>
      </section>
    );
  }

  if (!current) {
    return (
      <section className="pd-panel" aria-label="Review panel" data-testid="Review panel">
        <div className="pd-card" aria-label="Review summary" data-testid="Review summary">
          <p className="pd-result-text">Review session complete.</p>
          <p className="pd-muted">
            Remembered {rememberedCount} of {queue.length}.
          </p>
          {nextReviewAt && (
            <p className="pd-muted" aria-label="Next review time" data-testid="Next review time">
              Next review: {new Date(nextReviewAt).toLocaleString()}
            </p>
          )}
        </div>
      </section>
    );
  }

  const { item, review } = current;

  return (
    <section className="pd-panel" aria-label="Review panel" data-testid="Review panel">
      <p className="pd-muted" aria-label="Review progress" data-testid="Review progress">
        Card {index + 1} of {queue.length} · Stage {review.stage + 1} of {REVIEW_STAGE_COUNT}
      </p>

      <div className="pd-card" aria-label="Review card" data-testid="Review card">
        <strong className="pd-review-word" data-testid="Review word">
          {item.word}
        </strong>
        {item.sentence && (
          <p className="pd-muted pd-result-text" aria-label="Review sentence" data-testid="Review sentence">
            {item.sentence}
          </p>
        )}

        {revealed ? (
          <div aria-label="Review answer" data-testid="Review answer">
            <p className="pd-result-text">{item.translation}</p>
            {item.explanation && <p className="pd-muted pd-result-text">{item.explanation}</p>}
          </div>
        ) : (
          <button
            type="button"
            className="pd-button"
            aria-label="Show review answer"
            data-testid="Show review answer"
            onClick={() => setRevealed(true)}
          >
            Show answer
          </button>
        )}
      </div>

      {revealed && (
        <div className="pd-button-row">
          <button
            type="button"
            className="pd-button"
            aria-label="Forgot review"
            data-testid="Forgot review"
            onClick={() => void answer(false)}
          >
            Forgot
          </button>
          <button
            type="button"
            className="pd-button"
            aria-label="Remembered review"
            data-testid="Remembered review"
            onClick={() => void answer(true)}
          >
            Remembered
          </button>
        </div>
      )}
    </section>
  );
}
