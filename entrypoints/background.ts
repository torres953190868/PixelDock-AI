import { generateWriterDraft, translateText } from '@/lib/llm';
import { getSettings } from '@/lib/storage';
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

function pixelError(
  code: PixelDockError['code'],
  message: string,
  retryable = false,
): PixelDockError {
  return { code, message, retryable };
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

async function handleTranslate(payload: TranslatePayload): Promise<RuntimeResponse<LLMTranslationResponse>> {
  const settings = await getSettings();
  return translateText(payload, settings);
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

  chrome.runtime.onInstalled.addListener(setupContextMenu);

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
    void handleMessage(message).then(sendResponse);
    return true;
  });
});
