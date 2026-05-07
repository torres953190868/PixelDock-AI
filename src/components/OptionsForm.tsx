import { FormEvent, useEffect, useState } from 'react';
import { clearLocalData, DEFAULT_SETTINGS, exportAllData, getSettings, saveSettings } from '@/lib/storage';
import type { Settings } from '@/types';

function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function OptionsForm() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    void getSettings().then(setSettings);
  }, []);

  const updatePrompt = (key: keyof Settings['writerPrompts'], value: string) => {
    setSettings((current) => ({
      ...current,
      writerPrompts: {
        ...current.writerPrompts,
        [key]: value,
      },
    }));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSettings(await saveSettings(settings));
    setNotice('Settings saved.');
  };

  const clear = async () => {
    await clearLocalData();
    setSettings(await getSettings());
    setNotice('Local data cleared.');
  };

  const exportData = async () => {
    downloadTextFile('pixeldock-data.json', await exportAllData());
  };

  return (
    <main className="pixeldock-options" aria-label="PixelDock options" data-testid="PixelDock options">
      <form className="pd-options-shell" aria-label="Options form" data-testid="Options form" onSubmit={save}>
        <header className="pd-options-header" aria-labelledby="pixeldock-options-title">
          <h1 id="pixeldock-options-title">PixelDock AI Options</h1>
          <p className="pd-muted">Configure DeepSeek and local extension data.</p>
        </header>

        <section className="pd-card" aria-label="DeepSeek settings" data-testid="DeepSeek settings">
          <label className="pd-label" htmlFor="pixeldock-api-key">
            DeepSeek API key
            <input
              id="pixeldock-api-key"
              className="pd-input"
              type="password"
              aria-label="DeepSeek API key"
              data-testid="DeepSeek API key"
              value={settings.apiKey}
              onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })}
              placeholder="sk-..."
            />
          </label>

          <label className="pd-label" htmlFor="pixeldock-model">
            Model name
            <input
              id="pixeldock-model"
              className="pd-input"
              aria-label="Model name"
              data-testid="Model name"
              value={settings.model}
              onChange={(event) => setSettings({ ...settings, model: event.target.value })}
            />
          </label>

          <label className="pd-label" htmlFor="pixeldock-target-language">
            Target language
            <input
              id="pixeldock-target-language"
              className="pd-input"
              aria-label="Target language"
              data-testid="Target language"
              value={settings.targetLanguage}
              onChange={(event) => setSettings({ ...settings, targetLanguage: event.target.value })}
            />
          </label>
        </section>

        <section className="pd-card" aria-label="Custom writer prompts" data-testid="Custom writer prompts">
          <label className="pd-label" htmlFor="pixeldock-x-prompt">
            X prompt template
            <textarea
              id="pixeldock-x-prompt"
              className="pd-textarea"
              aria-label="X prompt template"
              data-testid="X prompt template"
              value={settings.writerPrompts.x}
              onChange={(event) => updatePrompt('x', event.target.value)}
            />
          </label>

          <label className="pd-label" htmlFor="pixeldock-xhs-prompt">
            Xiaohongshu prompt template
            <textarea
              id="pixeldock-xhs-prompt"
              className="pd-textarea"
              aria-label="Xiaohongshu prompt template"
              data-testid="Xiaohongshu prompt template"
              value={settings.writerPrompts.xiaohongshu}
              onChange={(event) => updatePrompt('xiaohongshu', event.target.value)}
            />
          </label>

          <label className="pd-label" htmlFor="pixeldock-reddit-prompt">
            Reddit prompt template
            <textarea
              id="pixeldock-reddit-prompt"
              className="pd-textarea"
              aria-label="Reddit prompt template"
              data-testid="Reddit prompt template"
              value={settings.writerPrompts.reddit}
              onChange={(event) => updatePrompt('reddit', event.target.value)}
            />
          </label>
        </section>

        <section className="pd-card" aria-label="Data controls" data-testid="Data controls">
          <div className="pd-button-row">
            <button type="submit" className="pd-button" aria-label="Save options" data-testid="Save options">
              Save
            </button>
            <button
              type="button"
              className="pd-button"
              aria-label="Export all data"
              data-testid="Export all data"
              onClick={exportData}
            >
              Export all data
            </button>
            <button
              type="button"
              className="pd-button"
              aria-label="Clear local data"
              data-testid="Clear local data"
              onClick={clear}
            >
              Clear local data
            </button>
          </div>
          {notice && (
            <div className="pd-card" role="status" aria-label="Options notice" data-testid="Options notice">
              {notice}
            </div>
          )}
        </section>
      </form>
    </main>
  );
}
