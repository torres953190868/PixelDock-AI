import type { PixelDockError, SelectionContext } from '@/types';

export const DOUBLE_CTRL_WINDOW_MS = 400;
export const MAX_SELECTED_TEXT_CHARS = 2000;
export const MAX_SENTENCE_CONTEXT_CHARS = 1200;

const SENTENCE_BOUNDARIES = '.!?\u3002\uff01\uff1f;\uff1b\n';
const READABLE_CONTAINERS = new Set([
  'P',
  'LI',
  'TD',
  'TH',
  'BLOCKQUOTE',
  'ARTICLE',
  'SECTION',
  'DIV',
  'FIGCAPTION',
]);

export class SelectionError extends Error {
  constructor(public readonly detail: PixelDockError) {
    super(detail.message);
  }
}

function error(code: PixelDockError['code'], message: string): SelectionError {
  return new SelectionError({ code, message, retryable: false });
}

function normalizeSelectedText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeContextText(value: string): string {
  return value.replace(/[ \t\r\f\v]+/g, ' ').replace(/\n+/g, '\n').trim();
}

function normalizeContextOffsetText(value: string): string {
  return value.replace(/[ \t\r\f\v]+/g, ' ').replace(/\n+/g, '\n').replace(/^\s+/, '');
}

function activeTextControl(): HTMLInputElement | HTMLTextAreaElement | null {
  const active = document.activeElement;
  if (active instanceof HTMLTextAreaElement) return active;
  if (active instanceof HTMLInputElement && typeof active.selectionStart === 'number') return active;
  return null;
}

function selectedTextFromControl(): string {
  const control = activeTextControl();
  if (!control || control.selectionStart === control.selectionEnd) return '';
  return control.value.slice(control.selectionStart ?? 0, control.selectionEnd ?? 0);
}

export function getSelectedText(fallbackText = ''): string {
  const controlText = selectedTextFromControl();
  const selection = window.getSelection();
  const selectedText = controlText || (!selection || selection.isCollapsed ? '' : selection.toString());
  const normalized = normalizeSelectedText(selectedText || fallbackText);

  if (!normalized) {
    throw error('EMPTY_SELECTION', 'Select text first, then press Ctrl twice.');
  }

  if (normalized.length > MAX_SELECTED_TEXT_CHARS) {
    throw error('TEXT_TOO_LONG', 'Selection is too long. Please select a shorter phrase or sentence.');
  }

  return normalized;
}

function nearestReadableElement(node: Node | null): HTMLElement | null {
  let element = node instanceof HTMLElement ? node : node?.parentElement ?? null;
  let fallback: HTMLElement | null = null;

  while (element && element !== document.body) {
    const text = normalizeContextText(element.innerText || element.textContent || '');
    if (text.length > 0) {
      fallback = fallback ?? element;
      if (READABLE_CONTAINERS.has(element.tagName)) return element;
    }
    element = element.parentElement;
  }

  return fallback;
}

function findClosestIndex(indexes: number[], preferredIndex?: number): number {
  if (indexes.length === 0) return -1;
  if (typeof preferredIndex !== 'number') return indexes[0];

  return indexes.reduce((best, current) =>
    Math.abs(current - preferredIndex) < Math.abs(best - preferredIndex) ? current : best,
  );
}

function findAllIndexes(containerText: string, selectedText: string, caseSensitive: boolean): number[] {
  const haystack = caseSensitive ? containerText : containerText.toLowerCase();
  const needle = caseSensitive ? selectedText : selectedText.toLowerCase();
  const indexes: number[] = [];
  if (!needle) return indexes;

  let searchFrom = 0;
  while (searchFrom <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, searchFrom);
    if (index < 0) break;
    indexes.push(index);
    searchFrom = index + Math.max(needle.length, 1);
  }

  return indexes;
}

function findMatchIndex(containerText: string, selectedText: string, preferredIndex?: number): number {
  const directIndex = findClosestIndex(findAllIndexes(containerText, selectedText, true), preferredIndex);
  if (directIndex >= 0) return directIndex;

  const lowerIndex = findClosestIndex(findAllIndexes(containerText, selectedText, false), preferredIndex);
  if (lowerIndex >= 0) return lowerIndex;

  const anchor = selectedText.slice(0, 80);
  if (anchor.length >= 8) {
    const anchorIndex = findClosestIndex(findAllIndexes(containerText, anchor, false), preferredIndex);
    if (anchorIndex >= 0) return anchorIndex;
  }

  return -1;
}

function sentenceFromText(containerText: string, selectedText: string, preferredIndex?: number): string | null {
  const index = findMatchIndex(containerText, selectedText, preferredIndex);
  if (index < 0) return null;

  let start = index;
  while (start > 0 && !SENTENCE_BOUNDARIES.includes(containerText[start - 1])) start -= 1;

  let end = index + selectedText.length;
  while (end < containerText.length && !SENTENCE_BOUNDARIES.includes(containerText[end])) end += 1;
  if (end < containerText.length) end += 1;

  let sentence = containerText.slice(start, end).trim();
  if (!sentence) return null;

  if (sentence.length > MAX_SENTENCE_CONTEXT_CHARS) {
    sentence = centerTrimSentence(sentence, selectedText, index - start);
  }

  return sentence.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function centerTrimSentence(sentence: string, selectedText: string, preferredIndex?: number): string {
  const index =
    typeof preferredIndex === 'number' && preferredIndex >= 0
      ? preferredIndex
      : Math.max(0, sentence.indexOf(selectedText));
  const half = Math.floor((MAX_SENTENCE_CONTEXT_CHARS - selectedText.length) / 2);
  const start = Math.max(0, index - half);
  const end = Math.min(sentence.length, start + MAX_SENTENCE_CONTEXT_CHARS);
  return `${start > 0 ? '...' : ''}${sentence.slice(start, end)}${end < sentence.length ? '...' : ''}`;
}

function selectedRange(): Range | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  return selection.getRangeAt(0);
}

function extractFromActiveControl(selectedText: string): string | null {
  const control = activeTextControl();
  if (!control) return null;
  const preferredIndex = normalizeContextOffsetText(
    control.value.slice(0, control.selectionStart ?? 0),
  ).length;
  return sentenceFromText(normalizeContextText(control.value), selectedText, preferredIndex);
}

function selectionStartOffsetInElement(element: HTMLElement, range: Range): number | undefined {
  const prefixRange = document.createRange();
  try {
    prefixRange.selectNodeContents(element);
    prefixRange.setEnd(range.startContainer, range.startOffset);
    return normalizeContextOffsetText(prefixRange.toString()).length;
  } catch {
    return undefined;
  }
}

export function extractSentenceAroundSelection(selectedText: string): string {
  const controlSentence = extractFromActiveControl(selectedText);
  if (controlSentence) return controlSentence;

  const range = selectedRange();
  const element = nearestReadableElement(range?.commonAncestorContainer ?? null);
  const containerText = normalizeContextText(element?.innerText || element?.textContent || '');
  const preferredIndex = element && range ? selectionStartOffsetInElement(element, range) : undefined;
  const sentence = sentenceFromText(containerText, selectedText, preferredIndex);

  if (!sentence) {
    throw error('SENTENCE_EXTRACTION_FAILED', 'Sentence context could not be extracted.');
  }

  return sentence;
}

function resolveFavicon(): string {
  const icon =
    document.querySelector<HTMLLinkElement>('link[rel~="icon"]') ||
    document.querySelector<HTMLLinkElement>('link[rel="shortcut icon"]');
  if (!icon?.href) return `${location.origin}/favicon.ico`;

  try {
    return new URL(icon.href, location.href).toString();
  } catch {
    return `${location.origin}/favicon.ico`;
  }
}

function findSentenceByVisibleText(selectedText: string): string | null {
  const selectors = 'p, li, td, th, blockquote, figcaption, article, section, div';
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(selectors));
  for (const candidate of candidates) {
    if (candidate.offsetParent === null && candidate !== document.body) continue;
    const text = normalizeContextText(candidate.innerText || candidate.textContent || '');
    if (!text || text.length > 8000) continue;
    const sentence = sentenceFromText(text, selectedText);
    if (sentence) return sentence;
  }
  return null;
}

export function getSelectionContext(
  source: SelectionContext['source'],
  fallbackText = '',
): { context: SelectionContext; warning?: string } {
  const selectedText = getSelectedText(fallbackText);
  let sentence = selectedText;
  let warning: string | undefined;

  try {
    sentence = extractSentenceAroundSelection(selectedText);
  } catch (err) {
    const fallbackSentence = fallbackText ? findSentenceByVisibleText(selectedText) : null;
    if (fallbackSentence) {
      sentence = fallbackSentence;
    } else if (err instanceof SelectionError && err.detail.code === 'SENTENCE_EXTRACTION_FAILED') {
      warning = err.detail.message;
    } else {
      throw err;
    }
  }

  return {
    context: {
      selectedText,
      sentence,
      url: location.href,
      pageTitle: document.title,
      favicon: resolveFavicon(),
      source,
    },
    warning,
  };
}

export function isSingleWordOrShortPhrase(value: string): boolean {
  const text = normalizeSelectedText(value);
  if (!text || text.length > 80 || /[.!?;\u3002\uff01\uff1f\uff1b]/.test(text)) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 6) return true;
  return words.length === 1 && text.length <= 24;
}
