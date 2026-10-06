/**
 * Regenerates the favicon and the Apple touch icon from the studio's mark.
 *
 *   npm run dev            # in one terminal, on :3111
 *   node scripts/make-icons.mjs
 *
 * ---------------------------------------------------------------------------
 * WHY THIS DRIVES A BROWSER INSTEAD OF WRITING AN SVG FILE
 *
 * `components/grace-mark.tsx` sets the script "Grace" in Great Vibes, which
 * arrives as a webfont through next/font. Inside a page that is fine: the SVG
 * is inline in the DOM and inherits the page's fonts. A favicon is a standalone
 * file with no page around it and no stylesheet, so the same markup saved to
 * disk falls back to whatever cursive the reader's device happens to have, and
 * the logo becomes a different logo on every machine.
 *
 * Rendering it in a browser that already has the real fonts loaded, and saving
 * pixels, removes the question. The alternative — subsetting Great Vibes and
 * base64-ing it into the SVG, or converting the glyphs to paths — needs tooling
 * this project does not have and would carry a font file for five letters.
 *
 * THE FAVICON IS THE MARK REVERSED, and that is deliberate. On the site the
 * disc is cream; at 16px on a white tab strip a cream disc with thin dark
 * strokes is close to invisible. Aubergine ground with the script in blush is
 * the same mark in the same two brand colours, and it is legible at tab size.
 * Compared side by side at 16px before choosing.
 *
 * The sub-strip (NAILS & BEAUTY SPA) and the serif GRACE are dropped for the
 * same reason `variant="compact"` drops them in the site header: below about
 * 60px they stop being letters.
 * ---------------------------------------------------------------------------
 */

import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const ORIGIN = process.env.ICON_ORIGIN ?? 'http://localhost:3111';
const BROWSER = process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium';

const INK = '#fdf8f7'; // blush-50
const GROUND = '#2a1626'; // aubergine-900

/**
 * @param {boolean} fullBleed Apple renders the icon on its own tile and applies
 *   its own rounded mask, so transparent corners come out black. The touch icon
 *   fills its square and insets the mark instead.
 */
function markSvg(fullBleed) {
  const scale = fullBleed ? 0.78 : 1;
  const c = 110;
  const r = (value) => c + (value - c) * scale;
  return `
    <svg viewBox="0 0 220 220" width="220" height="220" xmlns="http://www.w3.org/2000/svg">
      ${fullBleed ? `<rect width="220" height="220" fill="${GROUND}"/>` : ''}
      <circle cx="${c}" cy="${c}" r="${110 * scale}" fill="${GROUND}"/>
      <circle cx="${c}" cy="${c}" r="${103.5 * scale}" fill="none" stroke="${INK}" stroke-width="${2.5 * scale}"/>
      <circle cx="${c}" cy="${c}" r="${96 * scale}" fill="none" stroke="${INK}" stroke-width="${0.9 * scale}" opacity="0.55"/>
      <text x="${c}" y="${r(134)}" text-anchor="middle" fill="${INK}"
            textLength="${150 * scale}" lengthAdjust="spacingAndGlyphs"
            style="font-family:var(--font-script);font-size:${82 * scale}px">Grace</text>
    </svg>`;
}

/** A 32×32 PNG wrapped in an ICO container, for anything that still asks for /favicon.ico. */
function icoFromPng(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  const entry = Buffer.alloc(16);
  entry[0] = 32; // width
  entry[1] = 32; // height
  entry[2] = 0; // palette
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);
  return Buffer.concat([header, entry, png]);
}

const browser = await chromium.launch({ executablePath: BROWSER });
const page = await browser.newPage({ viewport: { width: 600, height: 600 } });

// The site itself, because that is where the fonts are.
const response = await page.goto(ORIGIN, { waitUntil: 'networkidle' });
if (!response?.ok()) throw new Error(`${ORIGIN} did not answer. Start the dev server first.`);
await page.evaluate(() => document.fonts.ready);

async function render(fullBleed, size, out) {
  await page.evaluate(
    ({ svg, size }) => {
      document.getElementById('icon-host')?.remove();

      /* The disc does not fill its own square, and `omitBackground` only drops
         the browser's default white — not the blush `body` background this site
         paints. Without clearing it, the page shows through the corners and
         ends up baked into the file. Found it in the first render: the header
         and the hero were in the icon's corners. */
      document.documentElement.style.background = 'transparent';
      document.body.style.background = 'transparent';
      for (const child of document.body.children) child.style.visibility = 'hidden';

      const host = document.createElement('div');
      host.id = 'icon-host';
      host.style.cssText = `position:fixed;top:0;left:0;z-index:99999;width:${size}px;height:${size}px;visibility:visible`;
      host.innerHTML = svg;
      const el = host.firstElementChild;
      el.setAttribute('width', String(size));
      el.setAttribute('height', String(size));
      document.body.appendChild(host);
    },
    { svg: markSvg(fullBleed), size },
  );
  await page.waitForTimeout(250);
  const png = await page.locator('#icon-host svg').screenshot({ omitBackground: !fullBleed });
  if (out) writeFileSync(out, png);
  return png;
}

await render(false, 512, 'app/icon.png');
await render(true, 180, 'app/apple-icon.png');
writeFileSync('app/favicon.ico', icoFromPng(await render(false, 32, null)));

await browser.close();
console.log('wrote app/icon.png (512), app/apple-icon.png (180), app/favicon.ico (32)');
