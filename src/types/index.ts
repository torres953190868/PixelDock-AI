export type WriterPlatform = 'x' | 'xiaohongshu' | 'reddit';

export type PixelDockPanel = 'home' | 'translator' | 'writer' | 'vocab';

export interface Settings {
  apiKey: string;
  model: string;
  targetLanguage: string;
  writerPrompts: Record<WriterPlatform, string>;
  updatedAt: string;
}

export interface KeyTerm {
  term: string;
  meaning: string;
}

export interface LLMTranslationResponse {
  sourceLanguage: string;
  targetLanguage: string;
  translation: string;
  briefExplanation: string;
  keyTerms: KeyTerm[];
}

export interface WordExplanationResponse {
  word: string;
  normalizedWord: string;
  partOfSpeech: string;
  meaningInContext: string;
  simpleMeaning: string;
  sentenceTranslation: string;
}

export interface XWriterResponse {
  platform: 'x';
  variants: string[];
}

export interface XiaohongshuWriterResponse {
  platform: 'xiaohongshu';
  titles: string[];
  body: string;
  hashtags: string[];
}

export interface RedditWriterResponse {
  platform: 'reddit';
  title: string;
  body: string;
  tldr: string;
}

export type LLMWriterResponse =
  | XWriterResponse
  | XiaohongshuWriterResponse
  | RedditWriterResponse;

export interface VocabItem {
  id: string;
  word: string;
  normalizedWord: string;
  selectedText: string;
  sentence: string;
  translation: string;
  explanation: string;
  url: string;
  pageTitle: string;
  favicon: string;
  createdAt: string;
  tags: string[];
}

export interface WriterDraft {
  id: string;
  platform: WriterPlatform;
  idea: string;
  output: LLMWriterResponse;
  url?: string;
  pageTitle?: string;
  createdAt: string;
}

export interface SelectionContext {
  selectedText: string;
  sentence: string;
  url: string;
  pageTitle: string;
  favicon: string;
  source: 'keyboard' | 'contextMenu' | 'dock';
}

export type PixelDockErrorCode =
  | 'MISSING_API_KEY'
  | 'INVALID_API_KEY'
  | 'NETWORK_ERROR'
  | 'RATE_LIMITED'
  | 'DEEPSEEK_ERROR'
  | 'EMPTY_RESPONSE'
  | 'MALFORMED_JSON'
  | 'SCHEMA_VALIDATION_FAILED'
  | 'TEXT_TOO_LONG'
  | 'EMPTY_SELECTION'
  | 'SENTENCE_EXTRACTION_FAILED'
  | 'STORAGE_ERROR'
  | 'UNKNOWN_ERROR';

export interface PixelDockError {
  code: PixelDockErrorCode;
  message: string;
  retryable: boolean;
  details?: unknown;
  raw?: string;
}

export type RuntimeResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: PixelDockError };

export interface TranslatePayload {
  selectedText: string;
  sentence: string;
  url: string;
  pageTitle: string;
  requestId?: string;
}

export interface GenerateWriterPayload {
  platform: WriterPlatform;
  idea: string;
}

export type RuntimeRequest =
  | { type: 'PIXELDOCK_TRANSLATE'; payload: TranslatePayload }
  | { type: 'PIXELDOCK_GENERATE_WRITER_DRAFT'; payload: GenerateWriterPayload }
  | { type: 'PIXELDOCK_CANCEL_TRANSLATE'; payload: { requestId: string } };

export interface ContextMenuTranslateMessage {
  type: 'PIXELDOCK_CONTEXT_MENU_TRANSLATE';
  payload: {
    selectedText: string;
  };
}

export interface TranslationFlowResult {
  context: SelectionContext;
  result: LLMTranslationResponse;
  warning?: string;
}
