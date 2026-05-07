# AGENTS.md

## User Context

- User name: Hongyu Zhou
- Student ID: 2575016
- Programme: MRes Computer Science
- Prefer Chinese for project collaboration unless the task clearly requires English.

## Project Overview

PixelDock AI is a WXT browser extension built with React, TypeScript, Tailwind CSS, and Zod.

The extension injects a pixel-style floating AI dock into webpages. The main user workflows are:

- Translate selected webpage text into Chinese.
- Save single words or short phrases into a local vocabulary book.
- Generate social writing drafts for X, Xiaohongshu, and Reddit.
- Configure DeepSeek API settings from the options page.

Current extension architecture:

- `entrypoints/content.tsx`: injects the Shadow DOM UI, listens for double Ctrl, reads webpage selection, and sends runtime messages.
- `entrypoints/background.ts`: owns context menu setup and routes runtime messages to LLM logic.
- `entrypoints/options/*`: renders the extension options page.
- `src/components/*`: React UI panels and options form.
- `src/lib/selection.ts`: deterministic selection and sentence-context extraction.
- `src/lib/storage.ts`: `chrome.storage.local` settings, vocabulary, draft persistence, and export helpers.
- `src/lib/llm.ts`: DeepSeek API calls, JSON parsing, and Zod schema validation.
- `src/lib/prompts.ts`: translator, word explanation, and writer prompt templates.
- `src/types/index.ts`: shared runtime, storage, LLM, and UI types.
- `src/styles/pixel.css`: shared pixel-style UI system for injected dock and options page.
- `scripts/qa-extension.mjs`: Playwright-based extension smoke QA after build.

## Read First

- At the start of each new conversation, read `CLAUDE.md` if it exists. If it does not exist, continue without blocking.
- Use `NeedsDoc.md` as product/PRD context, but verify current implementation from source before assuming a feature exists.
- This directory is not necessarily a git repository. Check before relying on git commands.

## Development Commands

- Install dependencies: `npm install`
- Start WXT dev mode: `npm run dev`
- Type-check only: `npm run compile`
- Build extension: `npm run build`
- Smoke QA after build: `node scripts/qa-extension.mjs`

Minimum verification:

- For docs-only edits, verify the file can be read and has the expected content.
- For TypeScript or React edits, run `npm run compile`.
- For manifest, content script, background, Shadow DOM, or user-flow changes, run `npm run build`, then `node scripts/qa-extension.mjs` when feasible.
- Do the smallest relevant verification immediately after each change, not only at the end.

## Engineering Principles

- Pursue high cohesion and low coupling.
- Keep deterministic logic out of LLM prompts. Use code for selection, routing, storage, validation, permissions, and UI state.
- Use the LLM only for natural-language translation, explanation, and writing generation.
- Validate all LLM JSON with Zod before using it in UI or storage.
- Keep API keys user-provided and stored through settings. Never hard-code a real DeepSeek API key.
- Keep shared data contracts in `src/types/index.ts`.
- Prefer small focused functions and modules. If a file grows beyond 400 lines, explicitly warn Hongyu Zhou that it should be considered for refactoring.
- Current large-file watch item: `NeedsDoc.md` is exactly 400 lines, so avoid expanding it without considering a split.

## Browser Extension Boundaries

- Content scripts may read selection and DOM context, then render UI in an isolated Shadow DOM.
- Background service worker should own API calls and browser-extension integration such as context menus.
- Use `chrome.runtime.sendMessage` for content-to-background communication.
- Use `chrome.storage.local` for settings, vocabulary, and writer drafts.
- Avoid adding permissions unless a feature requires them. Current manifest permissions are `storage`, `contextMenus`, `activeTab`, and `scripting`; host permission is limited to DeepSeek.
- Do not assume access to data outside normal browser extension capabilities.

## UI Conventions

- Important regions and controls must have stable semantic selectors.
- Prefer semantic tags such as `header`, `main`, `nav`, `aside`, `section`, and `button`.
- Main areas and controls should have `aria-label` or `aria-labelledby`.
- Add stable `data-testid` values to important regions and buttons.
- Do not make tests or debugging depend on `nth-of-type`.
- Name test IDs by the user-visible feature, for example `Conversation history`, `User profile`, or `Message composer`.
- Preserve the existing PixelDock naming style, such as `PixelDock shell`, `Translator panel`, `Writer panel`, `Vocabulary panel`, and `Save options`.
- Keep text readable in compact panels. Do not allow button or card text to overflow.
- Keep the existing pixel style: square edges, hard borders, monospace type, compact layout, and high z-index injected dock.

## Component Responsibilities

- `PixelDock.tsx` coordinates top-level panel state, collapse state, drag state, and imperative open-from-selection behavior.
- `TranslatorPanel.tsx` renders translation state, copy actions, key terms, and vocabulary saving.
- `WriterPanel.tsx` owns platform selection, idea input, draft generation UI, copy actions, and draft persistence trigger.
- `VocabPanel.tsx` loads, searches, deletes, and exports vocabulary items.
- `OptionsForm.tsx` edits settings, custom writer prompts, data export, and local data clearing.

When adding behavior, place it in the narrowest module that owns that concern. Avoid letting UI components directly absorb background routing, storage implementation details, or LLM parsing if a `src/lib/*` module is the better owner.

## Data And Error Handling

- Keep runtime responses in the `RuntimeResponse<T>` shape.
- Surface errors through `PixelDockError` with a stable code, user-facing message, and retryability flag.
- Do not throw raw network or Zod errors into UI.
- For vocabulary duplicates, preserve the existing rule: `normalizedWord + url`.
- CSV/JSON export helpers should stay deterministic and local.

## Testing Notes

- The smoke script expects a built extension at `.output/chrome-mv3`.
- The smoke script checks Shadow DOM injection, dock controls, drag/collapse behavior, double Ctrl behavior, options save, and local data clear.
- If UI test IDs change, update `scripts/qa-extension.mjs` in the same change.
- Do not rely on live DeepSeek calls for ordinary smoke QA; missing API key handling is part of the expected local flow.

## Known Repository Notes

- `CLAUDE.md` is currently absent.
- `README.md` is currently absent.
- `NeedsDoc.md` appears to contain product requirements, but console rendering may show mojibake depending on encoding. Treat it carefully and avoid rewriting it unless encoding is deliberately handled.
- No file currently exceeds 400 lines based on the project scan, excluding dependencies and generated output.
