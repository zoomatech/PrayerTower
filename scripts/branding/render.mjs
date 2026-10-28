// Renders an icon option into apps/mobile/assets/images (the files app.json
// points at), or every option into a preview sheet.
//   npm run brand -- tower            switch the app to the "tower" option
//   npm run brand -- --preview <dir>  draw all options side by side
// Sizes follow Expo (1024px icon, no transparency; 1024px transparent splash)
// and Android (108dp layers, logo inside the central 66dp).
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { MARKS } from './marks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'apps/mobile/assets/images');

const svg = (inner, size, { bg, scale = 1 } = {}) => {
  const fill = bg ? `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/>` : '';
  const t = (100 - 100 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">${fill}<g transform="translate(${t} ${t}) scale(${scale})">${inner}</g></svg>`;
};

async function shoot(page, markup, file, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup}</body></html>`);
  await page.locator('svg').screenshot({ path: file, omitBackground: true });
}

const [arg, previewDir] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();
try {
  if (arg === '--preview') {
    const dir = path.resolve(previewDir ?? path.join(root, 'build/icon-options'));
    await mkdir(dir, { recursive: true });
    for (const [name, m] of Object.entries(MARKS)) {
      await shoot(page, svg(m.draw(m.color), 512, { bg: m.bg, scale: 0.72 }), path.join(dir, `${name}-icon.png`), 512);
    }
    const tiles = Object.entries(MARKS)
      .map(([name, m]) => `<figure style="margin:0;text-align:center;font:600 18px system-ui;color:#2B2433">
          <div style="display:flex;gap:16px;align-items:flex-end">
            <div style="width:180px;height:180px;border-radius:40px;overflow:hidden">${svg(m.draw(m.color), 180, { bg: m.bg, scale: 0.72 })}</div>
            <div style="width:60px;height:60px;border-radius:14px;overflow:hidden">${svg(m.draw(m.color), 60, { bg: m.bg, scale: 0.72 })}</div>
            <div style="width:90px;height:180px;border-radius:12px;background:${m.bg[0]};display:flex;align-items:center;justify-content:center">${svg(m.draw(m.color), 60)}</div>
          </div><figcaption style="margin-top:10px">${name}: ${m.label}</figcaption></figure>`)
      .join('');
    await page.setViewportSize({ width: 1200, height: 320 });
    await page.setContent(`<html><body style="margin:0;padding:24px;background:#FBF8F3;display:flex;gap:40px">${tiles}</body></html>`);
    await page.screenshot({ path: path.join(dir, 'options.png'), fullPage: true });
    console.log(`Preview written to ${dir}`);
  } else {
    const m = MARKS[arg];
    if (!m) throw new Error(`Pick one of: ${Object.keys(MARKS).join(', ')}`);
    const mark = m.draw(m.color);
    await shoot(page, svg(mark, 1024, { bg: m.bg, scale: 0.72 }), path.join(out, 'icon.png'), 1024);
    // Android: 108dp layers; 66/108 ≈ 0.61, kept a little inside that.
    await shoot(page, svg(mark, 1024, { scale: 0.56 }), path.join(out, 'android-icon-foreground.png'), 1024);
    await shoot(page, svg('', 1024, { bg: m.bg }), path.join(out, 'android-icon-background.png'), 1024);
    await shoot(page, svg(m.draw('#000000'), 1024, { scale: 0.56 }), path.join(out, 'android-icon-monochrome.png'), 1024);
    await shoot(page, svg(mark, 1024), path.join(out, 'splash-icon.png'), 1024);
    await shoot(page, svg(mark, 48, { bg: m.bg, scale: 0.8 }), path.join(out, 'favicon.png'), 48);
    console.log(`Switched the app icon and splash to "${arg}". Splash background stays ${m.bg[0]} (app.json).`);
  }
} finally {
  await browser.close();
}
