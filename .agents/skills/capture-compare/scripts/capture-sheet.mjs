// 후보(variants) × 상태(states)를 같은 페이지에서 캡처하고 한 장짜리 비교 시트를 만든다.
// 사용법: node capture-sheet.mjs <설정.mjs> <출력폴더>   (프로젝트 루트에서 실행)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [configPath, outArg] = process.argv.slice(2);
if (!configPath || !outArg) {
  console.error('사용법: node capture-sheet.mjs <설정.mjs> <출력폴더>');
  process.exit(1);
}
const out = resolve(outArg);
mkdirSync(out, { recursive: true });

const require = createRequire(resolve(process.cwd(), 'package.json'));
let chromium;
try { ({ chromium } = require('@playwright/test')); } catch { ({ chromium } = require('playwright')); }

const config = (await import(pathToFileURL(resolve(configPath)).href)).default;
const states = config.states?.length ? config.states : [{ key: 'plain', label: '평소', apply: async () => {} }];
const escape = text => String(text ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: config.viewport ?? { width: 1280, height: 900 } });
  await page.goto(config.url);
  if (config.hideCss) await page.addStyleTag({ content: config.hideCss });
  const conditions = (await config.setup?.(page)) ?? '';
  const shoot = config.target ? page.locator(config.target).first() : page;

  const rows = [];
  for (const variant of config.variants) {
    await variant.apply(page);
    const shots = [];
    for (const state of states) {
      await state.apply(page, variant);
      await page.waitForTimeout(config.settleMs ?? 150);
      const file = `${variant.key}-${state.key}.png`;
      await shoot.screenshot({ path: resolve(out, file) });
      shots.push({ file, label: state.label });
    }
    rows.push({ variant, shots });
    console.log(`captured ${variant.key}`);
  }

  const viewport = config.viewport ?? { width: 1280, height: 900 };
  const meta = [conditions, `${viewport.width}×${viewport.height}`, '같은 페이지·배치에서 비교 대상만 교체'].filter(Boolean).join(' · ');
  const html = `<!doctype html><meta charset="utf-8"><style>
body{font-family:system-ui,'Malgun Gothic',sans-serif;margin:24px;background:#f6f5fb;color:#17171f;width:1560px}
h1{font-size:22px;margin:0 0 4px}p.meta{margin:0 0 20px;color:#555}
section{background:#fff;border:1px solid #ddd;border-radius:10px;padding:14px;margin-bottom:18px}
h2{font-size:18px;margin:0 0 4px}p{margin:0 0 10px;color:#444}
.row{display:flex;gap:12px}.row figure{margin:0;flex:1}.row img{width:100%;border:1px solid #e3e3e3;border-radius:6px}
figcaption{font-size:13px;color:#666;margin-top:4px}</style>
<h1>${escape(config.title ?? '후보 비교')}</h1><p class="meta">${escape(meta)}</p>
${rows.map(({ variant, shots }) => `<section><h2>${escape(variant.title)}</h2><p>${escape(variant.desc)}</p><div class="row">
${shots.map(s => `<figure><img src="${s.file}"><figcaption>${escape(s.label)}</figcaption></figure>`).join('')}</div></section>`).join('\n')}`;
  writeFileSync(resolve(out, 'sheet.html'), html);

  const sheet = await browser.newPage({ viewport: { width: 1620, height: 900 } });
  await sheet.goto(pathToFileURL(resolve(out, 'sheet.html')).href);
  await sheet.screenshot({ path: resolve(out, 'sheet.png'), fullPage: true });
  console.log(resolve(out, 'sheet.png'));
} finally {
  await browser.close();
}
