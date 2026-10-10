import { useEffect, useState } from 'react';
import { deleteVocabItem, exportVocabCSV, exportVocabJSON, searchVocabItems } from '@/lib/storage';
import type { VocabItem } from '@/types';

function downloadTextFile(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

const SOURCE_PATH_MAX_CHARS = 48;
const SOURCE_FALLBACK_MAX_CHARS = 96;

function truncateEnd(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 3)}...`;
}

function readablePathname(pathname: string): string {
  const path = pathname.replace(/^\/+/, '');
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

function urlSourceLabel(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return 'Unknown source';

  try {
    const parsed = new URL(trimmed);
    const path = readablePathname(parsed.pathname);
    const source = parsed.hostname || parsed.protocol.replace(':', '') || 'source';
    return path ? `${source} / ${truncateEnd(path, SOURCE_PATH_MAX_CHARS)}` : source;
  } catch {
    return truncateEnd(trimmed, SOURCE_FALLBACK_MAX_CHARS);
  }
}

function sourceLabel(item: VocabItem): string {
  return item.pageTitle.trim() || urlSourceLabel(item.url);
}

export function VocabPanel() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<VocabItem[]>([]);
  const [notice, setNotice] = useState('');

  const load = async (nextQuery = query) => {
    setItems(await searchVocabItems(nextQuery));
  };

  useEffect(() => {
    void load('');
  }, []);

  const removeItem = async (id: string) => {
    await deleteVocabItem(id);
    await load();
    setNotice('Deleted.');
  };

  const exportJSON = async () => {
    downloadTextFile('pixeldock-vocabulary.json', await exportVocabJSON(), 'application/json');
  };

  const exportCSV = async () => {
    downloadTextFile('pixeldock-vocabulary.csv', await exportVocabCSV(), 'text/csv');
  };

  return (
    <section className="pd-panel" aria-label="Vocabulary panel" data-testid="Vocabulary panel">
      <label className="pd-label" htmlFor="pixeldock-vocab-search">
        Search vocabulary
        <input
          id="pixeldock-vocab-search"
          className="pd-input"
          aria-label="Search vocabulary"
          data-testid="Search vocabulary"
          value={query}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            void load(value);
          }}
          placeholder="Search words, translations, pages..."
        />
      </label>

      <div className="pd-button-row">
        <button
          type="button"
          className="pd-button"
          aria-label="Export vocabulary JSON"
          data-testid="Export vocabulary JSON"
          onClick={exportJSON}
        >
          Export JSON
        </button>
        <button
          type="button"
          className="pd-button"
          aria-label="Export vocabulary CSV"
          data-testid="Export vocabulary CSV"
          onClick={exportCSV}
        >
          Export CSV
        </button>
      </div>

      {items.length === 0 ? (
        <div className="pd-card" aria-label="Vocabulary empty state" data-testid="Vocabulary empty state">
          No vocabulary items yet.
        </div>
      ) : (
        <ul className="pd-list" aria-label="Vocabulary items" data-testid="Vocabulary items">
          {items.map((item) => {
            const label = sourceLabel(item);

            return (
              <li key={item.id} aria-label={`Vocabulary item ${item.word}`} data-testid="Vocabulary item">
                <div className="pd-split">
                  <strong>{item.word}</strong>
                  <button
                    type="button"
                    className="pd-button"
                    aria-label={`Delete vocabulary item ${item.word}`}
                    data-testid="Delete vocabulary item"
                    onClick={() => removeItem(item.id)}
                  >
                    Delete
                  </button>
                </div>
                <p className="pd-result-text">{item.translation}</p>
                <details
                  className="pd-vocab-context"
                  aria-label={`Vocabulary sentence for ${item.word}`}
                  data-testid="Vocabulary sentence"
                  open
                >
                  <summary className="pd-details-summary">Sentence</summary>
                  <p className="pd-result-text">{item.sentence || item.selectedText}</p>
                </details>
                <details
                  className="pd-vocab-context"
                  aria-label={`Vocabulary source for ${item.word}`}
                  data-testid="Vocabulary source"
                >
                  <summary className="pd-details-summary">Source</summary>
                  <div className="pd-source-row">
                    {item.favicon && (
                      <img className="pd-favicon" src={item.favicon} alt="" aria-hidden="true" />
                    )}
                    <div className="pd-source-meta">
                      <a
                        className="pd-link pd-source-link"
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        title={item.url}
                        aria-label={`Open source page for ${item.word}: ${label}`}
                        data-testid="Open vocabulary source"
                      >
                        {label}
                      </a>
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      {notice && (
        <div className="pd-card" role="status" aria-label="Vocabulary notice" data-testid="Vocabulary notice">
          {notice}
        </div>
      )}
    </section>
  );
}
