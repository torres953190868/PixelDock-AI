import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { TranslatorPanel, type TranslatorPanelState } from '@/components/TranslatorPanel';
import { VocabPanel } from '@/components/VocabPanel';
import { WriterPanel } from '@/components/WriterPanel';
import type {
  LLMWriterResponse,
  PixelDockError,
  PixelDockPanel,
  SelectionContext,
  TranslationFlowResult,
  WriterPlatform,
} from '@/types';

export interface PixelDockHandle {
  hide: () => void;
  showHome: () => void;
  openTranslatorFromSelection: (
    source: SelectionContext['source'],
    fallbackText?: string,
  ) => Promise<void>;
}

interface PixelDockProps {
  translateSelection: (
    source: SelectionContext['source'],
    fallbackText?: string,
  ) => Promise<TranslationFlowResult>;
  generateWriter: (platform: WriterPlatform, idea: string) => Promise<LLMWriterResponse>;
}

const DOCK_VIEWPORT_MARGIN = 8;
const DOCK_MIN_WIDTH = 280;
const DOCK_MIN_HEIGHT = 180;

type DockPosition = { x: number; y: number };
type DockSize = { width: number; height: number };
type DockRect = { left: number; top: number; right: number; bottom: number };
type ResizeDirection = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const resizeHandles: Array<{ direction: ResizeDirection; label: string; className: string }> = [
  { direction: 'n', label: 'Resize top edge', className: 'pd-resize-n' },
  { direction: 'e', label: 'Resize right edge', className: 'pd-resize-e' },
  { direction: 's', label: 'Resize bottom edge', className: 'pd-resize-s' },
  { direction: 'w', label: 'Resize left edge', className: 'pd-resize-w' },
  { direction: 'ne', label: 'Resize top right corner', className: 'pd-resize-ne' },
  { direction: 'nw', label: 'Resize top left corner', className: 'pd-resize-nw' },
  { direction: 'se', label: 'Resize bottom right corner', className: 'pd-resize-se' },
  { direction: 'sw', label: 'Resize bottom left corner', className: 'pd-resize-sw' },
];

function dockMinWidth() {
  return Math.min(DOCK_MIN_WIDTH, Math.max(72, window.innerWidth - DOCK_VIEWPORT_MARGIN * 2));
}

function dockMinHeight() {
  return Math.min(DOCK_MIN_HEIGHT, Math.max(96, window.innerHeight - DOCK_VIEWPORT_MARGIN * 2));
}

function clampDockSize(width: number, height: number): DockSize {
  const minWidth = dockMinWidth();
  const minHeight = dockMinHeight();
  const maxWidth = Math.max(minWidth, window.innerWidth - DOCK_VIEWPORT_MARGIN * 2);
  const maxHeight = Math.max(minHeight, window.innerHeight - DOCK_VIEWPORT_MARGIN * 2);

  return {
    width: Math.max(minWidth, Math.min(maxWidth, width)),
    height: Math.max(minHeight, Math.min(maxHeight, height)),
  };
}

function clampDockPosition(x: number, y: number, width: number, height: number) {
  const maxX = Math.max(DOCK_VIEWPORT_MARGIN, window.innerWidth - width - DOCK_VIEWPORT_MARGIN);
  const visibleHeight = Math.min(height, window.innerHeight - DOCK_VIEWPORT_MARGIN * 2);
  const maxY = Math.max(
    DOCK_VIEWPORT_MARGIN,
    window.innerHeight - visibleHeight - DOCK_VIEWPORT_MARGIN,
  );

  return {
    x: Math.max(DOCK_VIEWPORT_MARGIN, Math.min(maxX, x)),
    y: Math.max(DOCK_VIEWPORT_MARGIN, Math.min(maxY, y)),
  };
}

function resizeDockRect(direction: ResizeDirection, startRect: DockRect, dx: number, dy: number) {
  const minWidth = dockMinWidth();
  const minHeight = dockMinHeight();
  const maxRight = window.innerWidth - DOCK_VIEWPORT_MARGIN;
  const maxBottom = window.innerHeight - DOCK_VIEWPORT_MARGIN;

  let { left, top, right, bottom } = startRect;
  if (direction.includes('n')) top = startRect.top + dy;
  if (direction.includes('e')) right = startRect.right + dx;
  if (direction.includes('s')) bottom = startRect.bottom + dy;
  if (direction.includes('w')) left = startRect.left + dx;

  left = Math.max(DOCK_VIEWPORT_MARGIN, Math.min(left, right - minWidth));
  top = Math.max(DOCK_VIEWPORT_MARGIN, Math.min(top, bottom - minHeight));
  right = Math.min(maxRight, Math.max(right, left + minWidth));
  bottom = Math.min(maxBottom, Math.max(bottom, top + minHeight));

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function toPixelDockError(err: unknown): PixelDockError {
  if (typeof err === 'object' && err && 'detail' in err) {
    return (err as { detail: PixelDockError }).detail;
  }
  if (typeof err === 'object' && err && 'code' in err && 'message' in err) {
    return err as PixelDockError;
  }
  return {
    code: 'UNKNOWN_ERROR',
    message: err instanceof Error ? err.message : 'Unexpected PixelDock error.',
    retryable: true,
  };
}

function clearTranslatorRefreshError(
  state: Extract<TranslatorPanelState, { status: 'success' }>,
): Extract<TranslatorPanelState, { status: 'success' }> {
  const nextState = { ...state };
  delete nextState.refreshError;
  return nextState;
}

export const PixelDock = forwardRef<PixelDockHandle, PixelDockProps>(function PixelDock(
  { translateSelection, generateWriter },
  ref,
) {
  const [visible, setVisible] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [panel, setPanel] = useState<PixelDockPanel>('home');
  const [translatorState, setTranslatorState] = useState<TranslatorPanelState>({ status: 'idle' });
  const [position, setPosition] = useState<DockPosition | null>(null);
  const [dockSize, setDockSize] = useState<DockSize | null>(null);
  const shellRef = useRef<HTMLElement | null>(null);
  const dockSizeRef = useRef<DockSize | null>(null);
  const translationRequestIdRef = useRef(0);
  const hasCustomPosition = position !== null;
  const hasCustomSize = dockSize !== null;

  const shellStyle = useMemo<CSSProperties>(() => {
    const style: CSSProperties = position
      ? { left: position.x, top: position.y }
      : { right: 20, bottom: 20 };
    if (!collapsed && dockSize) {
      style.width = dockSize.width;
      style.height = dockSize.height;
    }
    return style;
  }, [collapsed, dockSize, position]);

  const openTranslatorFromSelection = async (
    source: SelectionContext['source'],
    fallbackText = '',
  ) => {
    const requestId = translationRequestIdRef.current + 1;
    translationRequestIdRef.current = requestId;
    setVisible(true);
    setCollapsed(false);
    setPanel('translator');
    setTranslatorState((current) => {
      const nextState =
        current.status === 'success' ? clearTranslatorRefreshError(current) : { status: 'loading' as const };
      return nextState;
    });
    try {
      const flow = await translateSelection(source, fallbackText);
      if (translationRequestIdRef.current !== requestId) return;
      const nextState: TranslatorPanelState = {
        status: 'success',
        context: flow.context,
        result: flow.result,
        warning: flow.warning,
      };
      setTranslatorState(nextState);
    } catch (err) {
      if (translationRequestIdRef.current !== requestId) return;
      const error = toPixelDockError(err);
      setTranslatorState((current) => {
        const nextState: TranslatorPanelState =
          current.status === 'success'
            ? { ...clearTranslatorRefreshError(current), refreshError: error }
            : { status: 'error', error };
        return nextState;
      });
    }
  };

  const showHome = () => {
    setVisible(true);
    setCollapsed(false);
    setPanel('home');
  };

  const hide = () => {
    setVisible(false);
  };

  useImperativeHandle(ref, () => ({
    hide,
    showHome,
    openTranslatorFromSelection,
  }));

  useEffect(() => {
    dockSizeRef.current = dockSize;
  }, [dockSize]);

  useEffect(() => {
    if (!hasCustomPosition && !hasCustomSize) return;
    const shell = shellRef.current;
    if (!shell) return;

    const clampCurrentBox = () => {
      const rect = shell.getBoundingClientRect();
      const nextSize = dockSizeRef.current
        ? clampDockSize(dockSizeRef.current.width, dockSizeRef.current.height)
        : null;
      if (nextSize) {
        setDockSize((current) => {
          if (!current) return current;
          return nextSize.width === current.width && nextSize.height === current.height
            ? current
            : nextSize;
        });
      }
      setPosition((current) => {
        if (!current) return current;
        const next = clampDockPosition(
          current.x,
          current.y,
          nextSize?.width ?? rect.width,
          nextSize?.height ?? rect.height,
        );
        return next.x === current.x && next.y === current.y ? current : next;
      });
    };

    clampCurrentBox();
    const observer = new ResizeObserver(clampCurrentBox);
    observer.observe(shell);
    window.addEventListener('resize', clampCurrentBox);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', clampCurrentBox);
    };
  }, [hasCustomPosition, hasCustomSize]);

  const startDrag = (event: React.PointerEvent<HTMLElement>) => {
    const shell = event.currentTarget.closest<HTMLElement>('[data-testid="PixelDock shell"]');
    if (!shell) return;
    const rect = shell.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    event.currentTarget.setPointerCapture(event.pointerId);

    const move = (moveEvent: PointerEvent) => {
      setPosition(
        clampDockPosition(moveEvent.clientX - offsetX, moveEvent.clientY - offsetY, rect.width, rect.height),
      );
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  const startResize = (direction: ResizeDirection, event: React.PointerEvent<HTMLButtonElement>) => {
    const shell = shellRef.current;
    if (!shell) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = shell.getBoundingClientRect();
    const startRect = {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    };
    const startX = event.clientX;
    const startY = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
    setPosition({ x: rect.left, y: rect.top });
    setDockSize(clampDockSize(rect.width, rect.height));

    const move = (moveEvent: PointerEvent) => {
      const next = resizeDockRect(direction, startRect, moveEvent.clientX - startX, moveEvent.clientY - startY);
      setPosition({ x: next.x, y: next.y });
      setDockSize({ width: next.width, height: next.height });
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  const openPanel = (nextPanel: PixelDockPanel) => {
    setVisible(true);
    setCollapsed(false);
    setPanel(nextPanel);
    if (nextPanel === 'translator' && translatorState.status === 'idle') {
      setTranslatorState({ status: 'idle' });
    }
  };

  if (!visible) return null;

  return (
    <section
      ref={shellRef}
      className={`pd-shell ${collapsed ? 'pd-collapsed' : ''}`}
      style={shellStyle}
      aria-label="PixelDock AI"
      data-testid="PixelDock shell"
    >
      <header
        className="pd-titlebar"
        aria-label="PixelDock title bar"
        data-testid="PixelDock title bar"
        onPointerDown={startDrag}
      >
        <div className="pd-title">
          <span aria-hidden="true" className="pd-pixel-mark" />
          {!collapsed && <span>PixelDock AI</span>}
        </div>
        <button
          type="button"
          className="pd-icon-button"
          aria-label={collapsed ? 'Expand PixelDock' : 'Collapse PixelDock'}
          data-testid={collapsed ? 'Expand PixelDock' : 'Collapse PixelDock'}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? '+' : '-'}
        </button>
      </header>

      {!collapsed && (
        <>
          <main className="pd-main" aria-label="PixelDock main panel" data-testid="PixelDock main panel">
            {panel === 'home' && (
              <section className="pd-home-actions" aria-label="Dock actions" data-testid="Dock actions">
                <button
                  type="button"
                  className="pd-button"
                  aria-label="Translator"
                  data-testid="Translator"
                  onClick={() => openPanel('translator')}
                >
                  Translator
                </button>
                <button
                  type="button"
                  className="pd-button"
                  aria-label="Writer"
                  data-testid="Writer"
                  onClick={() => openPanel('writer')}
                >
                  Writer
                </button>
              </section>
            )}
            {panel === 'translator' && (
              <TranslatorPanel
                state={translatorState}
                onTranslateSelection={() => openTranslatorFromSelection('dock')}
                onOpenVocabulary={() => openPanel('vocab')}
              />
            )}
            {panel === 'writer' && <WriterPanel onGenerateWriter={generateWriter} />}
            {panel === 'vocab' && <VocabPanel />}
          </main>

          <nav className="pd-footer" aria-label="PixelDock navigation" data-testid="PixelDock navigation">
            <button type="button" className="pd-button" aria-label="Home" data-testid="Home" onClick={() => openPanel('home')}>
              Home
            </button>
            <button
              type="button"
              className="pd-button"
              aria-label="Vocabulary"
              data-testid="Vocabulary"
              onClick={() => openPanel('vocab')}
            >
              Vocabulary
            </button>
          </nav>

          {resizeHandles.map((handle) => (
            <button
              key={handle.direction}
              type="button"
              className={`pd-resize-handle ${handle.className}`}
              aria-label={handle.label}
              data-testid={handle.label}
              onPointerDown={(event) => startResize(handle.direction, event)}
            />
          ))}
        </>
      )}
    </section>
  );
});
