import { createServer } from 'node:http';
import { mkdir, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const extensionPath = path.join(root, '.output', 'chrome-mv3');
const profileDir = path.join(root, '.tmp', `pixeldock-qa-${Date.now()}`);

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
let lastReport = null;
const localKeyEnvNames = ['WXT_DEEPSEEK_API_KEY', 'DEEPSEEK_API_KEY'];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hasLocalDeepSeekKeyFallback() {
  if (localKeyEnvNames.some((name) => Boolean(process.env[name]?.trim()))) return true;
  const envPath = path.join(root, '.env.local');
  if (!existsSync(envPath)) return false;
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  return localKeyEnvNames.some((name) =>
    lines.some((line) => line.trimStart().startsWith(`${name}=`) && Boolean(line.split('=').slice(1).join('=').trim())),
  );
}

function executablePath() {
  const bundledChromium = chromium.executablePath();
  if (existsSync(bundledChromium)) return bundledChromium;
  if (existsSync(chromePath)) return chromePath;
  if (existsSync(edgePath)) return edgePath;
  throw new Error('Chrome or Edge executable was not found.');
}

function startServer() {
  const html = `<!doctype html>
    <html>
      <head><title>PixelDock QA Page</title></head>
      <body>
        <main>
          <p id="target">React Server Components reduce client JavaScript. They improve performance.</p>
        </main>
      </body>
    </html>`;

  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}/`,
      });
    });
  });
}

async function shadowState(page) {
  return page.evaluate(() => {
    const host = Array.from(document.querySelectorAll('*')).find((element) =>
      element.shadowRoot?.querySelector('[data-testid="PixelDock shell"]'),
    );
    const root = host?.shadowRoot;
    const shell = root?.querySelector('[data-testid="PixelDock shell"]');
    const appText = root?.querySelector('.pixeldock-root')?.textContent ?? root?.textContent ?? '';
    const translator = root?.querySelector('[data-testid="Translator"]');
    const writer = root?.querySelector('[data-testid="Writer"]');
    const collapse = root?.querySelector('[data-testid="Collapse PixelDock"]');
    const resizeHandleCount = root?.querySelectorAll('[data-testid^="Resize "]').length ?? 0;
    const rect = shell?.getBoundingClientRect();
    return {
      hasHost: Boolean(host),
      hasShell: Boolean(shell),
      hasTranslator: Boolean(translator),
      hasWriter: Boolean(writer),
      hasCollapse: Boolean(collapse),
      resizeHandleCount,
      text: appText,
      rect: rect
        ? {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          }
        : null,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    };
  });
}

async function clickShadow(page, testId) {
  await page.evaluate((testIdValue) => {
    const host = Array.from(document.querySelectorAll('*')).find((element) =>
      element.shadowRoot?.querySelector(`[data-testid="${testIdValue}"]`),
    );
    const target = host?.shadowRoot?.querySelector(`[data-testid="${testIdValue}"]`);
    if (!(target instanceof HTMLElement)) throw new Error(`Missing shadow target: ${testIdValue}`);
    target.click();
  }, testId);
}

async function dragTitlebar(page) {
  const rect = await page.evaluate(() => {
    const host = Array.from(document.querySelectorAll('*')).find((element) =>
      element.shadowRoot?.querySelector('[data-testid="PixelDock title bar"]'),
    );
    const target = host?.shadowRoot?.querySelector('[data-testid="PixelDock title bar"]');
    const box = target?.getBoundingClientRect();
    return box
      ? { x: box.left + 24, y: box.top + 12 }
      : null;
  });
  assert(rect, 'PixelDock title bar was not found for dragging.');
  await page.mouse.move(rect.x, rect.y);
  await page.mouse.down();
  await page.mouse.move(rect.x - 90, rect.y - 80);
  await page.mouse.up();
}

async function resizeShadow(page, testId, deltaX, deltaY) {
  const point = await page.evaluate((testIdValue) => {
    const host = Array.from(document.querySelectorAll('*')).find((element) =>
      element.shadowRoot?.querySelector(`[data-testid="${testIdValue}"]`),
    );
    const target = host?.shadowRoot?.querySelector(`[data-testid="${testIdValue}"]`);
    const box = target?.getBoundingClientRect();
    return box
      ? { x: box.left + box.width / 2, y: box.top + box.height / 2 }
      : null;
  }, testId);
  assert(point, `PixelDock resize handle was not found: ${testId}`);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + deltaX, point.y + deltaY, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(100);
}

function createVocabFixture(pageUrl, count = 18) {
  return Array.from({ length: count }, (_, index) => {
    const suffix = String(index + 1).padStart(2, '0');
    return {
      id: `vocab_scroll_fixture_${suffix}`,
      word: `scroll fixture ${suffix}`,
      normalizedWord: `scroll fixture ${suffix}`,
      selectedText: `scroll fixture ${suffix}`,
      sentence: `This fixture verifies that PixelDock can scroll long vocabulary panels ${suffix}.`,
      translation: `滚动验证 ${suffix}`,
      explanation: 'QA item used to force the dock body beyond the available height.',
      url: pageUrl,
      pageTitle: 'PixelDock QA Page',
      favicon: '',
      createdAt: new Date(Date.now() - index * 1000).toISOString(),
      tags: ['qa'],
    };
  });
}

async function setExtensionStorage(worker, items) {
  await worker.evaluate(
    (storageItems) =>
      new Promise((resolve, reject) => {
        chrome.storage.local.set(storageItems, () => {
          const error = chrome.runtime.lastError;
          if (error) {
            reject(new Error(error.message));
            return;
          }
          resolve(null);
        });
      }),
    items,
  );
}

async function measureMainScroll(page) {
  return page.evaluate(() => {
    const host = Array.from(document.querySelectorAll('*')).find((element) =>
      element.shadowRoot?.querySelector('[data-testid="PixelDock main panel"]'),
    );
    const root = host?.shadowRoot;
    const main = root?.querySelector('[data-testid="PixelDock main panel"]');
    const shell = root?.querySelector('[data-testid="PixelDock shell"]');
    const items = Array.from(root?.querySelectorAll('[data-testid="Vocabulary items"] li') ?? []);
    const lastItem = items.at(-1);
    if (!(main instanceof HTMLElement) || !(shell instanceof HTMLElement) || !(lastItem instanceof HTMLElement)) {
      throw new Error('Scrollable PixelDock vocabulary panel was not found.');
    }

    main.scrollTop = main.scrollHeight;
    const mainRect = main.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    const lastRect = lastItem.getBoundingClientRect();

    return {
      clientHeight: main.clientHeight,
      scrollHeight: main.scrollHeight,
      scrollTop: main.scrollTop,
      shellBottom: shellRect.bottom,
      viewportHeight: window.innerHeight,
      lastItemVisible:
        lastRect.top >= mainRect.top - 1 && lastRect.bottom <= mainRect.bottom + 1,
    };
  });
}

async function selectTargetText(page) {
  await page.evaluate(() => {
    const paragraph = document.querySelector('#target');
    const textNode = paragraph?.firstChild;
    if (!textNode?.textContent) throw new Error('Target text node missing.');
    const phrase = 'client JavaScript';
    const start = textNode.textContent.indexOf(phrase);
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, start + phrase.length);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
}

async function run() {
  assert(existsSync(extensionPath), 'Build output .output/chrome-mv3 does not exist.');
  await mkdir(profileDir, { recursive: true });
  const { server, url } = await startServer();

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    executablePath: executablePath(),
    viewport: { width: 1280, height: 800 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  const report = {
    dock: {},
    translator: {},
    options: {},
    diagnostics: {
      console: [],
      pageErrors: [],
    },
  };
  lastReport = report;

  try {
    const startupWorker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker', { timeout: 5000 }).catch(() => null));
    const worker = startupWorker ?? (await context.waitForEvent('serviceworker', { timeout: 5000 }).catch(() => null));
    assert(worker, 'Extension service worker did not start.');
    const extensionId = new URL(worker.url()).host;
    report.diagnostics.serviceWorkersAtStartup = context.serviceWorkers().map((worker) => worker.url());
    report.diagnostics.hasStartupWorker = Boolean(startupWorker);

    const page = await context.newPage();
    page.on('console', (message) => {
      report.diagnostics.console.push(`${message.type()}: ${message.text()}`);
    });
    page.on('pageerror', (error) => {
      report.diagnostics.pageErrors.push(error.message);
    });
    await page.goto(url);
    await page.waitForTimeout(3000);

    const injectionDiagnostics = await page.evaluate(() => ({
      url: location.href,
      extensionHosts: Array.from(document.querySelectorAll('*'))
        .map((element) => ({
          tagName: element.tagName,
          id: element.id,
          className: element.className,
          hasShadowRoot: Boolean(element.shadowRoot),
          text: element.shadowRoot?.textContent?.slice(0, 80) ?? '',
        }))
        .filter((item) => item.hasShadowRoot || item.tagName.toLowerCase().includes('wxt')),
    }));
    report.diagnostics.injection = injectionDiagnostics;

    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll('*')).some((element) =>
        element.shadowRoot?.querySelector('[data-testid="PixelDock shell"]'),
      ),
    );

    const initial = await shadowState(page);
    assert(initial.hasShell, 'PixelDock shell did not render.');
    assert(initial.hasTranslator, 'Translator button missing.');
    assert(initial.hasWriter, 'Writer button missing.');
    assert(initial.resizeHandleCount === 8, 'PixelDock resize handles missing.');
    assert(initial.rect.right > initial.viewport.width - 40, 'Dock is not bottom-right by default.');
    assert(initial.rect.bottom > initial.viewport.height - 40, 'Dock is not bottom-right by default.');
    report.dock.initial = initial;

    await dragTitlebar(page);
    const dragged = await shadowState(page);
    assert(dragged.rect.left < initial.rect.left - 30, 'Dock did not move after drag.');
    report.dock.dragged = dragged.rect;

    await resizeShadow(page, 'Resize bottom right corner', 80, 80);
    const resized = await shadowState(page);
    assert(resized.rect.width > dragged.rect.width + 50, 'Dock did not grow wider after resize.');
    assert(resized.rect.height > dragged.rect.height + 50, 'Dock did not grow taller after resize.');
    assert(resized.rect.right <= resized.viewport.width, 'Dock resize extended past the viewport width.');
    assert(resized.rect.bottom <= resized.viewport.height, 'Dock resize extended past the viewport height.');
    report.dock.resized = resized.rect;

    await clickShadow(page, 'Collapse PixelDock');
    const collapsed = await shadowState(page);
    assert(collapsed.text.includes('+'), 'Dock did not collapse.');
    await clickShadow(page, 'Expand PixelDock');
    report.dock.collapsible = true;

    await setExtensionStorage(worker, { 'pixeldock.vocab': createVocabFixture(url) });
    await clickShadow(page, 'Vocabulary');
    await page.waitForFunction(() => {
      const host = Array.from(document.querySelectorAll('*')).find((element) =>
        element.shadowRoot?.querySelector('[data-testid="Vocabulary items"]'),
      );
      return host?.shadowRoot?.textContent?.includes('scroll fixture 18');
    });
    const vocabularyScroll = await measureMainScroll(page);
    assert(
      vocabularyScroll.scrollHeight > vocabularyScroll.clientHeight,
      'Vocabulary panel did not exceed the main panel height.',
    );
    assert(vocabularyScroll.scrollTop > 0, 'PixelDock main panel did not scroll.');
    assert(vocabularyScroll.lastItemVisible, 'Vocabulary panel could not scroll to the final item.');
    assert(
      vocabularyScroll.shellBottom <= vocabularyScroll.viewportHeight,
      'PixelDock shell extended below the viewport after rendering long content.',
    );
    report.dock.vocabularyScroll = vocabularyScroll;

    report.translator.localApiKeyFallbackConfigured = hasLocalDeepSeekKeyFallback();
    if (report.translator.localApiKeyFallbackConfigured) {
      report.translator.doubleCtrlShowsMissingKey = 'skipped';
    } else {
      await selectTargetText(page);
      await page.keyboard.press('Control');
      await page.keyboard.press('Control');
      await page.waitForFunction(() => {
        const host = Array.from(document.querySelectorAll('*')).find((element) =>
          element.shadowRoot?.querySelector('[data-testid="Translator error"]'),
        );
        return host?.shadowRoot?.textContent?.includes('MISSING_API_KEY');
      });
      report.translator.doubleCtrlShowsMissingKey = true;
    }

    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
    await optionsPage.locator('[data-testid="DeepSeek API key"]').fill('qa-key');
    await optionsPage.locator('[data-testid="Model name"]').fill('deepseek-chat');
    await optionsPage.locator('[data-testid="Target language"]').fill('zh-CN');
    await optionsPage.locator('[data-testid="Save options"]').click();
    await optionsPage.locator('[data-testid="Options notice"]').waitFor();
    report.options.saveWorks = true;

    await optionsPage.locator('[data-testid="Clear local data"]').click();
    await optionsPage.locator('[data-testid="Options notice"]').waitFor();
    report.options.clearWorks = true;

    console.log(JSON.stringify({ status: 'pass', report }, null, 2));
  } finally {
    await context.close();
    server.close();
    const resolvedProfile = path.resolve(profileDir);
    const resolvedRoot = path.resolve(root);
    if (resolvedProfile.startsWith(resolvedRoot)) {
      await rm(resolvedProfile, { recursive: true, force: true });
    }
  }
}

run().catch((error) => {
  console.error(JSON.stringify({ status: 'fail', error: error.message, report: lastReport }, null, 2));
  process.exit(1);
});
