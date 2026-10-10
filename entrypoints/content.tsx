import '@/styles/pixel.css';
import '@/styles/dock-resize.css';
import { createRef } from 'react';
import ReactDOM from 'react-dom/client';
import { PixelDock, type PixelDockHandle } from '@/components/PixelDock';
import { DOUBLE_CTRL_WINDOW_MS, getSelectionContext, hasSelectedText } from '@/lib/selection';
import type {
  ContextMenuTranslateMessage,
  GenerateWriterPayload,
  LLMTranslationResponse,
  LLMWriterResponse,
  RuntimeRequest,
  RuntimeResponse,
  SelectionContext,
  TranslationFlowResult,
  WriterPlatform,
} from '@/types';

function sendRuntimeMessage<T>(request: RuntimeRequest): Promise<RuntimeResponse<T>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(request, (response: RuntimeResponse<T> | undefined) => {
      const error = chrome.runtime.lastError;
      if (error) {
        resolve({
          ok: false,
          error: {
            code: 'UNKNOWN_ERROR',
            message: error.message || 'Background service worker did not respond.',
            retryable: true,
          },
        });
        return;
      }
      resolve(
        response ?? {
          ok: false,
          error: {
            code: 'UNKNOWN_ERROR',
            message: 'Background service worker returned no response.',
            retryable: true,
          },
        },
      );
    });
  });
}

async function translateSelection(
  source: SelectionContext['source'],
  fallbackText = '',
  requestId?: string,
): Promise<TranslationFlowResult> {
  const { context, warning } = getSelectionContext(source, fallbackText);
  const response = await sendRuntimeMessage<LLMTranslationResponse>({
    type: 'PIXELDOCK_TRANSLATE',
    payload: {
      selectedText: context.selectedText,
      sentence: context.sentence,
      url: context.url,
      pageTitle: context.pageTitle,
      requestId,
    },
  });

  if (!response.ok) throw response.error;
  return { context, result: response.data, warning };
}

function cancelTranslationRequest(requestId: string): void {
  void sendRuntimeMessage({ type: 'PIXELDOCK_CANCEL_TRANSLATE', payload: { requestId } });
}

async function generateWriter(platform: WriterPlatform, idea: string): Promise<LLMWriterResponse> {
  const payload: GenerateWriterPayload = { platform, idea };
  const response = await sendRuntimeMessage<LLMWriterResponse>({
    type: 'PIXELDOCK_GENERATE_WRITER_DRAFT',
    payload,
  });
  if (!response.ok) throw response.error;
  return response.data;
}

function isEditableTarget(event: KeyboardEvent): boolean {
  const path = event.composedPath();
  return path.some((node) => {
    if (!(node instanceof HTMLElement)) return false;
    const tag = node.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || node.isContentEditable;
  });
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  async main(ctx) {
    const dockRef = createRef<PixelDockHandle>();
    let shadowWrapper: HTMLElement | null = null;

    const ui = await createShadowRootUi(ctx, {
      name: 'pixeldock-ai',
      position: 'inline',
      anchor: 'body',
      isolateEvents: true,
      onMount: (container) => {
        shadowWrapper = document.createElement('div');
        shadowWrapper.className = 'pixeldock-root';
        container.append(shadowWrapper);
        const root = ReactDOM.createRoot(shadowWrapper);
        root.render(
          <PixelDock
            ref={dockRef}
            translateSelection={translateSelection}
            generateWriter={generateWriter}
            cancelTranslation={cancelTranslationRequest}
          />,
        );
        return root;
      },
      onRemove: (root) => {
        root?.unmount();
      },
    });

    ui.mount();

    let lastCtrlAt = 0;
    ctx.addEventListener(window, 'keydown', (event: KeyboardEvent) => {
      if (shadowWrapper && event.composedPath().includes(shadowWrapper)) return;
      if (event.key === 'Escape') {
        dockRef.current?.hide();
        return;
      }
      if (event.key !== 'Control' || event.repeat || isEditableTarget(event)) return;

      const now = Date.now();
      if (now - lastCtrlAt <= DOUBLE_CTRL_WINDOW_MS) {
        lastCtrlAt = 0;
        if (hasSelectedText()) {
          void dockRef.current?.openTranslatorFromSelection('keyboard');
        } else {
          dockRef.current?.showHome();
        }
        return;
      }
      lastCtrlAt = now;
    });

    ctx.addEventListener(window, 'wxt:locationchange', () => {
      lastCtrlAt = 0;
      dockRef.current?.hide();
    });

    chrome.runtime.onMessage.addListener((message: ContextMenuTranslateMessage) => {
      if (message?.type !== 'PIXELDOCK_CONTEXT_MENU_TRANSLATE') return;
      void dockRef.current?.openTranslatorFromSelection('contextMenu', message.payload.selectedText);
    });
  },
});
