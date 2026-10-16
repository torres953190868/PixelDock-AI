import { defaultWriterPrompts, legacyDefaultWriterPrompts } from '@/lib/prompts';
import { createReviewState, getEarliestReviewAt, isReviewDue } from '@/lib/review';
import type { ReviewState, Settings, VocabItem, WriterDraft, WriterPlatform } from '@/types';

const STORAGE_KEYS = {
  settings: 'pixeldock.settings',
  vocab: 'pixeldock.vocab',
  writerDrafts: 'pixeldock.writerDrafts',
  reviewStates: 'pixeldock.reviewStates',
} as const;

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  model: 'deepseek-chat',
  wordApiKey: '',
  wordModel: 'glm-4-flash',
  wordBaseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  targetLanguage: 'zh-CN',
  writerPrompts: defaultWriterPrompts,
  updatedAt: '',
};

const LOCAL_DEEPSEEK_MODEL = (import.meta.env.WXT_DEEPSEEK_MODEL || '').trim();

function withDefaultWriterPrompts(stored?: Partial<Settings>): Settings['writerPrompts'] {
  const storedPrompts: Partial<Record<WriterPlatform, string>> = stored?.writerPrompts ?? {};
  const writerPrompts = {
    ...defaultWriterPrompts,
    ...storedPrompts,
  };

  for (const platform of Object.keys(legacyDefaultWriterPrompts) as WriterPlatform[]) {
    if (storedPrompts[platform]?.trim() === legacyDefaultWriterPrompts[platform]?.trim()) {
      writerPrompts[platform] = defaultWriterPrompts[platform];
    }
  }

  return writerPrompts;
}

function withLocalDefaults(stored?: Partial<Settings>): Settings {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...stored,
    writerPrompts: withDefaultWriterPrompts(stored),
  };
  return {
    ...merged,
    apiKey: merged.apiKey.trim(),
    model: merged.model.trim() || LOCAL_DEEPSEEK_MODEL || DEFAULT_SETTINGS.model,
    wordApiKey: merged.wordApiKey.trim(),
    wordModel: merged.wordModel.trim() || DEFAULT_SETTINGS.wordModel,
    wordBaseUrl: merged.wordBaseUrl.trim() || DEFAULT_SETTINGS.wordBaseUrl,
    targetLanguage: merged.targetLanguage || DEFAULT_SETTINGS.targetLanguage,
  };
}

function storageGet<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(key, (items) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(error);
        return;
      }
      resolve(items[key] as T | undefined);
    });
  });
}

function storageSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function storageRemove(keys: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function createId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.();
  return `${prefix}_${randomId || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
}

export function normalizeWord(value: string): string {
  return value.trim().normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');
}

export async function getSettings(): Promise<Settings> {
  const stored = await storageGet<Partial<Settings>>(STORAGE_KEYS.settings);
  return withLocalDefaults(stored);
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next: Settings = {
    ...current,
    ...patch,
    writerPrompts: {
      ...current.writerPrompts,
      ...(patch.writerPrompts ?? {}),
    },
    updatedAt: new Date().toISOString(),
  };
  await storageSet({ [STORAGE_KEYS.settings]: next });
  return next;
}

export async function listVocabItems(): Promise<VocabItem[]> {
  const items = (await storageGet<VocabItem[]>(STORAGE_KEYS.vocab)) ?? [];
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addVocabItem(
  input: Omit<VocabItem, 'id' | 'createdAt' | 'normalizedWord'> & {
    normalizedWord?: string;
  },
): Promise<{ ok: true; item: VocabItem; duplicate: boolean }> {
  const items = await listVocabItems();
  const normalizedWord = input.normalizedWord || normalizeWord(input.word || input.selectedText);
  const existing = items.find((item) => item.normalizedWord === normalizedWord && item.url === input.url);

  if (existing) {
    return { ok: true, item: existing, duplicate: true };
  }

  const item: VocabItem = {
    ...input,
    id: createId('vocab'),
    normalizedWord,
    createdAt: new Date().toISOString(),
    tags: input.tags ?? [],
  };

  const reviewStates = await getReviewStateMap();
  await storageSet({
    [STORAGE_KEYS.vocab]: [item, ...items],
    [STORAGE_KEYS.reviewStates]: { ...reviewStates, [item.id]: createReviewState(item.id) },
  });
  return { ok: true, item, duplicate: false };
}

export async function deleteVocabItem(id: string): Promise<void> {
  const items = await listVocabItems();
  const reviewStates = await getReviewStateMap();
  delete reviewStates[id];
  await storageSet({
    [STORAGE_KEYS.vocab]: items.filter((item) => item.id !== id),
    [STORAGE_KEYS.reviewStates]: reviewStates,
  });
}

export async function searchVocabItems(query: string): Promise<VocabItem[]> {
  const normalizedQuery = normalizeWord(query);
  const items = await listVocabItems();
  if (!normalizedQuery) return items;

  return items.filter((item) => {
    const haystack = [
      item.word,
      item.translation,
      item.explanation,
      item.sentence,
      item.url,
      item.pageTitle,
      item.tags.join(' '),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

export async function getReviewStateMap(): Promise<Record<string, ReviewState>> {
  return (await storageGet<Record<string, ReviewState>>(STORAGE_KEYS.reviewStates)) ?? {};
}

export async function saveReviewState(state: ReviewState): Promise<void> {
  const reviewStates = await getReviewStateMap();
  reviewStates[state.vocabId] = state;
  await storageSet({ [STORAGE_KEYS.reviewStates]: reviewStates });
}

export async function ensureReviewStates(now: Date = new Date()): Promise<number> {
  const [items, reviewStates] = await Promise.all([listVocabItems(), getReviewStateMap()]);
  const missing = items.filter((item) => !reviewStates[item.id]);
  if (missing.length === 0) return 0;

  const nextStates = { ...reviewStates };
  for (const item of missing) {
    nextStates[item.id] = createReviewState(item.id, now);
  }
  await storageSet({ [STORAGE_KEYS.reviewStates]: nextStates });
  return missing.length;
}

export interface DueReviewItem {
  item: VocabItem;
  review: ReviewState;
}

export async function listDueReviews(now: number = Date.now()): Promise<DueReviewItem[]> {
  const [items, reviewStates] = await Promise.all([listVocabItems(), getReviewStateMap()]);
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const due: DueReviewItem[] = [];

  for (const review of Object.values(reviewStates)) {
    if (!isReviewDue(review, now)) continue;
    const item = itemsById.get(review.vocabId);
    if (item) due.push({ item, review });
  }

  return due.sort((a, b) => (a.review.nextReviewAt ?? '').localeCompare(b.review.nextReviewAt ?? ''));
}

export async function getNextReviewAt(): Promise<string | null> {
  return getEarliestReviewAt(Object.values(await getReviewStateMap()));
}

function csvCell(value: unknown): string {
  const text = Array.isArray(value) ? value.join(';') : String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

export async function exportVocabJSON(): Promise<string> {
  return JSON.stringify(await listVocabItems(), null, 2);
}

export async function exportVocabCSV(): Promise<string> {
  const items = await listVocabItems();
  const columns: Array<keyof VocabItem> = [
    'id',
    'word',
    'normalizedWord',
    'selectedText',
    'sentence',
    'translation',
    'explanation',
    'url',
    'pageTitle',
    'favicon',
    'createdAt',
    'tags',
  ];
  const header = columns.map(csvCell).join(',');
  const rows = items.map((item) => columns.map((column) => csvCell(item[column])).join(','));
  return [header, ...rows].join('\n');
}

export async function addWriterDraft(
  input: Omit<WriterDraft, 'id' | 'createdAt'>,
): Promise<WriterDraft> {
  const items = (await storageGet<WriterDraft[]>(STORAGE_KEYS.writerDrafts)) ?? [];
  const draft: WriterDraft = {
    ...input,
    id: createId('draft'),
    createdAt: new Date().toISOString(),
  };
  await storageSet({ [STORAGE_KEYS.writerDrafts]: [draft, ...items] });
  return draft;
}

export async function listWriterDrafts(): Promise<WriterDraft[]> {
  const items = (await storageGet<WriterDraft[]>(STORAGE_KEYS.writerDrafts)) ?? [];
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function exportAllData(): Promise<string> {
  const [settings, vocabItems, writerDrafts, reviewStates] = await Promise.all([
    getSettings(),
    listVocabItems(),
    listWriterDrafts(),
    getReviewStateMap(),
  ]);
  return JSON.stringify({ settings, vocabItems, writerDrafts, reviewStates }, null, 2);
}

export async function clearLocalData(): Promise<void> {
  await storageRemove(Object.values(STORAGE_KEYS));
}
