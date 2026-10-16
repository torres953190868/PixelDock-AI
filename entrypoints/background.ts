import { generateWriterDraft, translateText } from '@/lib/llm';
import { getEarliestReviewAt } from '@/lib/review';
import { ensureReviewStates, getReviewStateMap, getSettings, listDueReviews } from '@/lib/storage';
import type {
  GenerateWriterPayload,
  LLMTranslationResponse,
  LLMWriterResponse,
  PixelDockError,
  RuntimeRequest,
  RuntimeResponse,
  TranslatePayload,
} from '@/types';

const CONTEXT_MENU_ID = 'pixeldock-translate';
const REVIEW_ALARM_NAME = 'pixeldock-review-due';
const REVIEW_NOTIFICATION_ID = 'pixeldock-review-due';
const REVIEW_STATES_STORAGE_KEY = 'pixeldock.reviewStates';
const REVIEW_REMINDER_SNOOZE_MS = 60 * 60_000;

function pixelError(
  code: PixelDockError['code'],
  message: string,
  retryable = false,
  details?: unknown,
): PixelDockError {
  return { code, message, retryable, details };
}

function setupContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: 'PixelDock: Translate',
      contexts: ['selection'],
    });
  });
}

async function scheduleReviewAlarm(): Promise<void> {
  await chrome.alarms.clear(REVIEW_ALARM_NAME);
  const nextReviewAt = getEarliestReviewAt(Object.values(await getReviewStateMap()));
  if (!nextReviewAt) return;
  await chrome.alarms.create(REVIEW_ALARM_NAME, {
    when: Math.max(Date.now() + 250, Date.parse(nextReviewAt)),
  });
}

async function handleReviewAlarm(): Promise<void> {
  const due = await listDueReviews();
  if (due.length > 0) {
    try {
      await chrome.notifications.create(REVIEW_NOTIFICATION_ID, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/128.png'),
        title: 'PixelDock Review',
        message: `${due.length} word${due.length === 1 ? '' : 's'} due for review. Click to open the review panel.`,
      });
    } catch {
      // Notification delivery is best-effort; the alarm chain must continue either way.
    }
    await chrome.alarms.create(REVIEW_ALARM_NAME, { when: Date.now() + REVIEW_REMINDER_SNOOZE_MS });
    return;
  }
  await scheduleReviewAlarm();
}

async function openReviewPanelInTab(): Promise<void> {
  await chrome.notifications.clear(REVIEW_NOTIFICATION_ID);
  const tabs = await chrome.tabs.query({ lastFocusedWindow: true });
  const ordered = [...tabs].sort((a, b) => Number(b.active) - Number(a.active)).slice(0, 8);

  for (const tab of ordered) {
    if (!tab.id) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'PIXELDOCK_OPEN_REVIEW' });
      await chrome.tabs.update(tab.id, { active: true });
      if (tab.windowId !== undefined) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
      return;
    } catch {
      // This tab has no PixelDock content script; try the next one.
    }
  }

  await chrome.runtime.openOptionsPage();
}

const pendingTranslations = new Map<string, AbortController>();

async function handleTranslate(payload: TranslatePayload): Promise<RuntimeResponse<LLMTranslationResponse>> {
  const settings = await getSettings();
  const requestId = payload.requestId?.trim();
  if (!requestId) {
    return translateText(payload, settings);
  }
  const controller = new AbortController();
  pendingTranslations.set(requestId, controller);
  try {
    return await translateText(payload, settings, controller.signal);
  } finally {
    pendingTranslations.delete(requestId);
  }
}

async function handleWriter(payload: GenerateWriterPayload): Promise<RuntimeResponse<LLMWriterResponse>> {
  if (!payload.idea.trim()) {
    return {
      ok: false,
      error: pixelError('EMPTY_SELECTION', 'Enter a rough idea first.'),
    };
  }
  const settings = await getSettings();
  return generateWriterDraft(payload, settings);
}

async function handleMessage(message: RuntimeRequest): Promise<RuntimeResponse<unknown>> {
  if (message?.type === 'PIXELDOCK_TRANSLATE') {
    return handleTranslate(message.payload);
  }
  if (message?.type === 'PIXELDOCK_CANCEL_TRANSLATE') {
    pendingTranslations.get(message.payload?.requestId ?? '')?.abort();
    return { ok: true, data: null };
  }
  if (message?.type === 'PIXELDOCK_GENERATE_WRITER_DRAFT') {
    return handleWriter(message.payload);
  }
  return {
    ok: false,
    error: pixelError('UNKNOWN_ERROR', 'Unsupported PixelDock message.'),
  };
}

export default defineBackground(() => {
  setupContextMenu();

  chrome.runtime.onInstalled.addListener(() => {
    setupContextMenu();
    void ensureReviewStates();
    void scheduleReviewAlarm();
  });
  chrome.runtime.onStartup.addListener(() => {
    void scheduleReviewAlarm();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[REVIEW_STATES_STORAGE_KEY]) return;
    void scheduleReviewAlarm();
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== REVIEW_ALARM_NAME) return;
    void handleReviewAlarm();
  });

  chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationId !== REVIEW_NOTIFICATION_ID) return;
    void openReviewPanelInTab();
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== CONTEXT_MENU_ID || !tab?.id) return;
    chrome.tabs.sendMessage(tab.id, {
      type: 'PIXELDOCK_CONTEXT_MENU_TRANSLATE',
      payload: {
        selectedText: info.selectionText ?? '',
      },
    });
  });

  chrome.runtime.onMessage.addListener((message: RuntimeRequest, _sender, sendResponse) => {
    void handleMessage(message)
      .then(sendResponse)
      .catch((err) => {
        sendResponse({
          ok: false,
          error: pixelError(
            'UNKNOWN_ERROR',
            err instanceof Error ? err.message : 'PixelDock background request failed.',
            true,
            err,
          ),
        });
      });
    return true;
  });
});
