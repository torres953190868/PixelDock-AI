import { defaultWriterPrompts } from '@/lib/prompts';
import type { Settings, VocabItem, WriterDraft } from '@/types';

const STORAGE_KEYS = {
  settings: 'pixeldock.settings',
  vocab: 'pixeldock.vocab',
  writerDrafts: 'pixeldock.writerDrafts',
} as const;

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  model: 'deepseek-chat',
  targetLanguage: 'zh-CN',
  writerPrompts: defaultWriterPrompts,
  updatedAt: '',
};

const LOCAL_DEEPSEEK_MODEL = (import.meta.env.WXT_DEEPSEEK_MODEL || '').trim();

function withLocalDefaults(stored?: Partial<Settings>): Settings {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...stored,
    writerPrompts: {
      ...defaultWriterPrompts,
      ...(stored?.writerPrompts ?? {}),
    },
  };
  return {
    ...merged,
    apiKey: merged.apiKey.trim(),
    model: merged.model.trim() || LOCAL_DEEPSEEK_MODEL || DEFAULT_SETTINGS.model,
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

  await storageSet({ [STORAGE_KEYS.vocab]: [item, ...items] });
  return { ok: true, item, duplicate: false };
}

export async function deleteVocabItem(id: string): Promise<void> {
  const items = await listVocabItems();
  await storageSet({ [STORAGE_KEYS.vocab]: items.filter((item) => item.id !== id) });
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
  const [settings, vocabItems, writerDrafts] = await Promise.all([
    getSettings(),
    listVocabItems(),
    listWriterDrafts(),
  ]);
  return JSON.stringify({ settings, vocabItems, writerDrafts }, null, 2);
}

export async function clearLocalData(): Promise<void> {
  await storageRemove(Object.values(STORAGE_KEYS));
}
