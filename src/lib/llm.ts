import { z } from 'zod';
import { translatorSystemPrompt, wordExplanationPrompt, writerPromptForPlatform } from '@/lib/prompts';
import type {
  GenerateWriterPayload,
  LLMTranslationResponse,
  LLMWriterResponse,
  PixelDockError,
  RuntimeResponse,
  Settings,
  TranslatePayload,
  WordExplanationResponse,
  WriterPlatform,
} from '@/types';

export const TranslationResponseSchema = z.object({
  sourceLanguage: z.string().min(1),
  targetLanguage: z.string().min(2),
  translation: z.string().min(1),
  briefExplanation: z.string().min(1),
  keyTerms: z.array(
    z.object({
      term: z.string().min(1),
      meaning: z.string().min(1),
    }),
  ),
});

export const WordExplanationResponseSchema = z.object({
  word: z.string().min(1),
  normalizedWord: z.string().min(1),
  partOfSpeech: z.string().min(1),
  meaningInContext: z.string().min(1),
  simpleMeaning: z.string().min(1),
  sentenceTranslation: z.string().min(1),
});

export const XWriterResponseSchema = z.object({
  variants: z.array(z.string().min(1)).length(3),
});

export const XiaohongshuWriterResponseSchema = z.object({
  titles: z.array(z.string().min(1)).length(3),
  body: z.string().min(1),
  hashtags: z.array(z.string().min(1)),
});

export const RedditWriterResponseSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  tldr: z.string().min(1),
});

type DeepSeekMessage = {
  role: 'system' | 'user';
  content: string;
};

const LOCAL_DEEPSEEK_API_KEY = (
  import.meta.env.WXT_DEEPSEEK_API_KEY ||
  import.meta.env.DEEPSEEK_API_KEY ||
  ''
).trim();

function pixelError(
  code: PixelDockError['code'],
  message: string,
  retryable: boolean,
  details?: unknown,
  raw?: string,
): PixelDockError {
  return { code, message, retryable, details, raw };
}

function ok<T>(data: T): RuntimeResponse<T> {
  return { ok: true, data };
}

function fail<T>(error: PixelDockError): RuntimeResponse<T> {
  return { ok: false, error };
}

async function callDeepSeek(settings: Settings, messages: DeepSeekMessage[]): Promise<RuntimeResponse<string>> {
  const apiKey = settings.apiKey.trim() || LOCAL_DEEPSEEK_API_KEY;
  if (!apiKey) {
    return fail(pixelError('MISSING_API_KEY', 'Add your DeepSeek API key in Options or .env.local.', false));
  }

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: settings.model.trim() || 'deepseek-chat',
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 1200,
        stream: false,
      }),
    });

    const bodyText = await response.text();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return fail(pixelError('INVALID_API_KEY', 'DeepSeek rejected the API key.', false, bodyText, bodyText));
      }
      if (response.status === 429) {
        return fail(pixelError('RATE_LIMITED', 'DeepSeek rate limit reached. Try again later.', true, bodyText, bodyText));
      }
      return fail(pixelError('DEEPSEEK_ERROR', 'DeepSeek returned an error.', response.status >= 500, bodyText, bodyText));
    }

    const apiJson = JSON.parse(bodyText) as {
      choices?: Array<{ finish_reason?: string; message?: { content?: string } }>;
    };
    const choice = apiJson.choices?.[0];
    const content = choice?.message?.content?.trim();

    if (!content) {
      return fail(pixelError('EMPTY_RESPONSE', 'DeepSeek returned an empty response.', true, apiJson, bodyText));
    }

    if (choice?.finish_reason === 'length') {
      return fail(pixelError('MALFORMED_JSON', 'The AI response was truncated.', true, apiJson, content));
    }

    return ok(content);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return fail(pixelError('MALFORMED_JSON', 'DeepSeek response was not valid JSON.', true, err));
    }
    return fail(pixelError('NETWORK_ERROR', 'Network request failed. Check your connection.', true, err));
  }
}

function parseJsonObject(raw: string): RuntimeResponse<unknown> {
  try {
    return ok(JSON.parse(raw));
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return ok(JSON.parse(raw.slice(start, end + 1)));
      } catch {
        // fall through to malformed JSON below
      }
    }
    return fail(pixelError('MALFORMED_JSON', 'The AI response was not valid JSON.', true, undefined, raw));
  }
}

function validateSchema<T>(schema: z.ZodType<T>, raw: string): RuntimeResponse<T> {
  const parsed = parseJsonObject(raw);
  if (!parsed.ok) return parsed;

  const validation = schema.safeParse(parsed.data);
  if (!validation.success) {
    return fail(
      pixelError(
        'SCHEMA_VALIDATION_FAILED',
        'The AI response did not match the expected format.',
        true,
        validation.error.flatten(),
        raw,
      ),
    );
  }

  return ok(validation.data);
}

export async function translateText(
  payload: TranslatePayload,
  settings: Settings,
): Promise<RuntimeResponse<LLMTranslationResponse>> {
  const response = await callDeepSeek(settings, [
    { role: 'system', content: translatorSystemPrompt(settings.targetLanguage || 'zh-CN') },
    {
      role: 'user',
      content: JSON.stringify({
        selectedText: payload.selectedText,
        sentence: payload.sentence,
        pageUrl: payload.url,
        pageTitle: payload.pageTitle,
      }),
    },
  ]);
  if (!response.ok) return response;

  const validated = validateSchema(TranslationResponseSchema, response.data);
  if (!validated.ok) return validated;

  return ok({
    ...validated.data,
    targetLanguage: settings.targetLanguage || validated.data.targetLanguage,
  });
}

export async function explainWord(
  payload: TranslatePayload,
  settings: Settings,
): Promise<RuntimeResponse<WordExplanationResponse>> {
  const response = await callDeepSeek(settings, [
    { role: 'system', content: wordExplanationPrompt },
    {
      role: 'user',
      content: JSON.stringify({
        selectedText: payload.selectedText,
        sentence: payload.sentence,
        pageUrl: payload.url,
        pageTitle: payload.pageTitle,
      }),
    },
  ]);
  if (!response.ok) return response;
  return validateSchema(WordExplanationResponseSchema, response.data);
}

export async function generateWriterDraft(
  payload: GenerateWriterPayload,
  settings: Settings,
): Promise<RuntimeResponse<LLMWriterResponse>> {
  const prompt = writerPromptForPlatform(payload.platform, settings.writerPrompts);
  const response = await callDeepSeek(settings, [
    { role: 'system', content: prompt },
    {
      role: 'user',
      content: JSON.stringify({
        idea: payload.idea,
      }),
    },
  ]);
  if (!response.ok) return response;

  if (payload.platform === 'x') {
    const validated = validateSchema(XWriterResponseSchema, response.data);
    if (!validated.ok) return validated;
    return ok({ platform: 'x', ...validated.data });
  }

  if (payload.platform === 'xiaohongshu') {
    const validated = validateSchema(XiaohongshuWriterResponseSchema, response.data);
    if (!validated.ok) return validated;
    return ok({ platform: 'xiaohongshu', ...validated.data });
  }

  const validated = validateSchema(RedditWriterResponseSchema, response.data);
  if (!validated.ok) return validated;
  return ok({ platform: 'reddit', ...validated.data });
}
