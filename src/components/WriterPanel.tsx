import { useState } from 'react';
import { addWriterDraft } from '@/lib/storage';
import type { LLMWriterResponse, PixelDockError, WriterPlatform } from '@/types';

interface WriterPanelProps {
  onGenerateWriter: (platform: WriterPlatform, idea: string) => Promise<LLMWriterResponse>;
}

type WriterStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; output: LLMWriterResponse }
  | { kind: 'error'; error: PixelDockError };

const platforms: Array<{ id: WriterPlatform; label: string }> = [
  { id: 'x', label: 'X' },
  { id: 'xiaohongshu', label: 'Xiaohongshu' },
  { id: 'reddit', label: 'Reddit' },
];

async function copyText(value: string, setNotice: (message: string) => void) {
  await navigator.clipboard.writeText(value);
  setNotice('Copied.');
}

function renderOutput(output: LLMWriterResponse, setNotice: (message: string) => void) {
  if (output.platform === 'x') {
    return (
      <div className="pd-card" aria-label="X generated variants" data-testid="X generated variants">
        <strong>X variants</strong>
        <ul className="pd-list">
          {output.variants.map((variant, index) => (
            <li key={variant}>
              <p className="pd-result-text">{variant}</p>
              <button
                type="button"
                className="pd-button"
                aria-label={`Copy X variant ${index + 1}`}
                data-testid={`Copy X variant ${index + 1}`}
                onClick={() => copyText(variant, setNotice)}
              >
                Copy
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (output.platform === 'xiaohongshu') {
    return (
      <div className="pd-card" aria-label="Xiaohongshu generated post" data-testid="Xiaohongshu generated post">
        <strong>Xiaohongshu</strong>
        <ul className="pd-list">
          {output.titles.map((title, index) => (
            <li key={title}>
              <p className="pd-result-text">{title}</p>
              <button
                type="button"
                className="pd-button"
                aria-label={`Copy Xiaohongshu title ${index + 1}`}
                data-testid={`Copy Xiaohongshu title ${index + 1}`}
                onClick={() => copyText(title, setNotice)}
              >
                Copy
              </button>
            </li>
          ))}
        </ul>
        <p className="pd-result-text">{output.body}</p>
        <p className="pd-muted">{output.hashtags.join(' ')}</p>
        <button
          type="button"
          className="pd-button"
          aria-label="Copy Xiaohongshu body"
          data-testid="Copy Xiaohongshu body"
          onClick={() => copyText(`${output.body}\n${output.hashtags.join(' ')}`, setNotice)}
        >
          Copy body
        </button>
      </div>
    );
  }

  return (
    <div className="pd-card" aria-label="Reddit generated post" data-testid="Reddit generated post">
      <strong>{output.title}</strong>
      <p className="pd-result-text">{output.body}</p>
      <p className="pd-result-text">TL;DR: {output.tldr}</p>
      <button
        type="button"
        className="pd-button"
        aria-label="Copy Reddit post"
        data-testid="Copy Reddit post"
        onClick={() => copyText(`${output.title}\n\n${output.body}\n\nTL;DR: ${output.tldr}`, setNotice)}
      >
        Copy post
      </button>
    </div>
  );
}

export function WriterPanel({ onGenerateWriter }: WriterPanelProps) {
  const [platform, setPlatform] = useState<WriterPlatform>('x');
  const [idea, setIdea] = useState('');
  const [status, setStatus] = useState<WriterStatus>({ kind: 'idle' });
  const [notice, setNotice] = useState('');

  const generate = async () => {
    const trimmedIdea = idea.trim();
    if (!trimmedIdea) {
      setStatus({
        kind: 'error',
        error: {
          code: 'EMPTY_SELECTION',
          message: 'Enter a rough idea first.',
          retryable: false,
        },
      });
      return;
    }

    setStatus({ kind: 'loading' });
    setNotice('');
    try {
      const output = await onGenerateWriter(platform, trimmedIdea);
      await addWriterDraft({
        platform,
        idea: trimmedIdea,
        output,
        url: location.href,
        pageTitle: document.title,
      });
      setStatus({ kind: 'success', output });
      setNotice('Draft saved locally.');
    } catch (err) {
      setStatus({
        kind: 'error',
        error: err as PixelDockError,
      });
    }
  };

  return (
    <section className="pd-panel" aria-label="Writer panel" data-testid="Writer panel">
      <div className="pd-platform-row" aria-label="Writer platform selector" data-testid="Writer platform selector">
        {platforms.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`pd-tab ${platform === item.id ? 'pd-button-active' : ''}`}
            aria-label={`${item.label} platform`}
            data-testid={`${item.label} platform`}
            onClick={() => setPlatform(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <label className="pd-label" htmlFor="pixeldock-writer-idea">
        Rough idea
        <textarea
          id="pixeldock-writer-idea"
          className="pd-textarea"
          aria-label="Writer idea input"
          data-testid="Writer idea input"
          value={idea}
          onChange={(event) => setIdea(event.target.value)}
          placeholder="Write a rough idea..."
        />
      </label>

      <button
        type="button"
        className="pd-button"
        aria-label="Generate writer draft"
        data-testid="Generate writer draft"
        onClick={generate}
      >
        Generate
      </button>

      {status.kind === 'loading' && (
        <div className="pd-card" data-testid="Writer loading state">
          Generating draft...
        </div>
      )}
      {status.kind === 'error' && (
        <div className="pd-card" aria-label="Writer error" data-testid="Writer error">
          <strong className="pd-error">{status.error.code}</strong>
          <p className="pd-result-text">{status.error.message}</p>
        </div>
      )}
      {status.kind === 'success' && renderOutput(status.output, setNotice)}
      {notice && (
        <div className="pd-card" role="status" aria-label="Writer notice" data-testid="Writer notice">
          {notice}
        </div>
      )}
    </section>
  );
}
