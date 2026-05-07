import { useState } from 'react';
import { addVocabItem } from '@/lib/storage';
import { isSingleWordOrShortPhrase } from '@/lib/selection';
import type { LLMTranslationResponse, PixelDockError, SelectionContext } from '@/types';

export type TranslatorPanelState =
  | { status: 'idle' }
  | { status: 'loading'; context?: SelectionContext }
  | {
      status: 'success';
      context: SelectionContext;
      result: LLMTranslationResponse;
      warning?: string;
      refreshError?: PixelDockError;
    }
  | { status: 'error'; error: PixelDockError; context?: SelectionContext };

interface TranslatorPanelProps {
  state: TranslatorPanelState;
  onTranslateSelection: () => void;
  onOpenVocabulary: () => void;
}

async function copyText(value: string, setMessage: (message: string) => void) {
  await navigator.clipboard.writeText(value);
  setMessage('Copied.');
}

export function TranslatorPanel({
  state,
  onTranslateSelection,
  onOpenVocabulary,
}: TranslatorPanelProps) {
  const [notice, setNotice] = useState('');

  const addCurrentToVocabulary = async () => {
    if (state.status !== 'success') return;
    const { context, result } = state;
    const response = await addVocabItem({
      word: context.selectedText,
      selectedText: context.selectedText,
      sentence: context.sentence,
      translation: result.translation,
      explanation: result.briefExplanation,
      url: context.url,
      pageTitle: context.pageTitle,
      favicon: context.favicon,
      tags: [],
    });
    setNotice(
      response.duplicate
        ? 'Already in vocabulary for this page.'
        : 'Added with sentence and page link.',
    );
  };

  const canAddVocab =
    state.status === 'success' && isSingleWordOrShortPhrase(state.context.selectedText);

  return (
    <section className="pd-panel" aria-label="Translator panel" data-testid="Translator panel">
      <div className="pd-button-row">
        <button
          type="button"
          className="pd-button"
          aria-label="Translate selected text"
          data-testid="Translate selected text"
          onClick={onTranslateSelection}
        >
          Translate selection
        </button>
        <button
          type="button"
          className="pd-button"
          aria-label="Open vocabulary"
          data-testid="Open vocabulary"
          onClick={onOpenVocabulary}
        >
          Vocabulary
        </button>
      </div>

      {state.status === 'idle' && (
        <div className="pd-card" aria-label="Translator empty state" data-testid="Translator empty state">
          <p className="pd-result-text">Select webpage text, then press Ctrl twice or use the button above.</p>
        </div>
      )}

      {state.status === 'loading' && (
        <div className="pd-card" aria-label="Translator loading state" data-testid="Translator loading state">
          <p className="pd-result-text">Translating selected text...</p>
        </div>
      )}

      {state.status === 'error' && (
        <div className="pd-card" aria-label="Translator error" data-testid="Translator error">
          <strong className="pd-error">{state.error.code}</strong>
          <p className="pd-result-text">{state.error.message}</p>
        </div>
      )}

      {state.status === 'success' && (
        <>
          {state.refreshError && (
            <div
              className="pd-card"
              aria-label="Translator refresh error"
              data-testid="Translator refresh error"
            >
              <strong className="pd-error">{state.refreshError.code}</strong>
              <p className="pd-result-text">{state.refreshError.message}</p>
            </div>
          )}

          {state.warning && (
            <div className="pd-card pd-warning" aria-label="Sentence warning" data-testid="Sentence warning">
              {state.warning}
            </div>
          )}

          <div className="pd-card" aria-label="Original selected text" data-testid="Original selected text">
            <strong>Original</strong>
            <p className="pd-result-text">{state.context.selectedText}</p>
          </div>

          <div className="pd-card" aria-label="Chinese translation" data-testid="Chinese translation">
            <div className="pd-split">
              <strong>Translation</strong>
              <button
                type="button"
                className="pd-button"
                aria-label="Copy translation"
                data-testid="Copy translation"
                onClick={() => copyText(state.result.translation, setNotice)}
              >
                Copy
              </button>
            </div>
            <p className="pd-result-text">{state.result.translation}</p>
          </div>

          <div className="pd-card" aria-label="Brief explanation" data-testid="Brief explanation">
            <strong>Brief explanation</strong>
            <p className="pd-result-text">{state.result.briefExplanation}</p>
          </div>

          {canAddVocab && (
            <div
              className="pd-card"
              aria-label="Vocabulary save preview"
              data-testid="Vocabulary save preview"
            >
              <strong>Saved context</strong>
              <p className="pd-result-text">{state.context.sentence}</p>
              <a
                className="pd-link"
                href={state.context.url}
                target="_blank"
                rel="noreferrer"
                aria-label="Open saved source page"
                data-testid="Open saved source page"
                title={state.context.url}
              >
                {state.context.pageTitle || state.context.url}
              </a>
            </div>
          )}

          <div className="pd-card" aria-label="Key terms" data-testid="Key terms">
            <strong>Key terms</strong>
            {state.result.keyTerms.length === 0 ? (
              <p className="pd-muted">No key terms returned.</p>
            ) : (
              <ul className="pd-term-list">
                {state.result.keyTerms.map((term) => (
                  <li key={`${term.term}-${term.meaning}`}>
                    <strong>{term.term}</strong>
                    <span>{term.meaning}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="pd-button-row">
            <button
              type="button"
              className="pd-button"
              aria-label="Add selected text to vocabulary"
              data-testid="Add selected text to vocabulary"
              disabled={!canAddVocab}
              onClick={addCurrentToVocabulary}
            >
              Add to vocabulary
            </button>
            {!canAddVocab && <span className="pd-muted">Only single words or short phrases can be saved.</span>}
          </div>
        </>
      )}

      {notice && (
        <div className="pd-card" role="status" aria-label="Translator notice" data-testid="Translator notice">
          {notice}
        </div>
      )}
    </section>
  );
}
