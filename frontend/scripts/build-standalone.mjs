// Builds the whole game into ONE self-contained HTML file that works when you
// double-click it: no server, no internet needed to load the page.
//
//   npm run build:standalone                      -> standalone/FakeArt.html
//   npm run build:standalone -- --out=my/game.html
//
// It runs the normal Vite build, then embeds everything the page needs:
// the JavaScript, the CSS, the fonts, the images and the music. (The game still
// needs the internet to reach the game server when you press Play.)

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const tmpDir = path.join(root, 'node_modules', '.cache', 'standalone-build');
const fontCacheDir = path.join(root, 'node_modules', '.cache', 'standalone-fonts');

const outArg = process.argv.find((a) => a.startsWith('--out='));
const outFile = path.resolve(root, outArg ? outArg.slice('--out='.length) : 'standalone/FakeArt.html');

const MIME = { '.webp': 'image/webp', '.png': 'image/png', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };
const dataUri = (file) => {
  const mime = MIME[path.extname(file).toLowerCase()];
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
};
const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2) + ' MB';

// ---------- 1. The normal production build ----------
console.log('1/4 Building the game...');
execSync(`npx vite build --outDir "${tmpDir}" --emptyOutDir`, { cwd: root, stdio: 'inherit' });

let html = fs.readFileSync(path.join(tmpDir, 'index.html'), 'utf8');

// ---------- 2. Fonts (downloaded once, then cached) ----------
const FONT_CSS_URL =
  'https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Outfit:wght@400;500;600;700;800;900&display=swap';
// A modern browser name makes Google serve compact woff2 files.
const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

async function cached(name, fetcher) {
  fs.mkdirSync(fontCacheDir, { recursive: true });
  const file = path.join(fontCacheDir, name);
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const data = Buffer.from(await fetcher());
  fs.writeFileSync(file, data);
  return data;
}

async function buildFontCss() {
  console.log('2/4 Embedding fonts...');
  const css = (
    await cached('fonts.css', async () => {
      const res = await fetch(FONT_CSS_URL, { headers: { 'User-Agent': BROWSER } });
      if (!res.ok) throw new Error(`Google Fonts answered ${res.status}`);
      return res.arrayBuffer();
    })
  ).toString('utf8');

  // Keep only the Latin letters; every weight of a family usually shares one variable font file,
  // so group by file and merge the weights into a range to avoid embedding it several times.
  const groups = new Map();
  for (const m of css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)) {
    if (m[1] !== 'latin') continue;
    const body = m[2];
    const family = /font-family:\s*'([^']+)'/.exec(body)?.[1];
    const weight = Number(/font-weight:\s*(\d+)/.exec(body)?.[1]);
    const url = /url\(([^)]+)\)/.exec(body)?.[1];
    const range = /unicode-range:\s*([^;]+);/.exec(body)?.[1];
    if (!family || !weight || !url) continue;
    const key = `${family}|${url}`;
    if (!groups.has(key)) groups.set(key, { family, url, range, weights: [] });
    groups.get(key).weights.push(weight);
  }
  if (groups.size === 0) throw new Error('No fonts found in the Google Fonts response');

  let out = '';
  let n = 0;
  for (const g of groups.values()) {
    const bin = await cached(`font-${++n}.woff2`, async () => (await fetch(g.url)).arrayBuffer());
    const lo = Math.min(...g.weights);
    const hi = Math.max(...g.weights);
    out +=
      `@font-face{font-family:'${g.family}';font-style:normal;font-weight:${lo === hi ? lo : `${lo} ${hi}`};` +
      `font-display:swap;src:url(data:font/woff2;base64,${bin.toString('base64')}) format('woff2');` +
      (g.range ? `unicode-range:${g.range};` : '') +
      '}\n';
  }
  return out;
}

// ---------- 3. Put everything into the page ----------
async function main() {
  const fontCss = await buildFontCss();

  console.log('3/4 Embedding scripts, styles, images and music...');

  // The stylesheet.
  const cssTag = /<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/.exec(html);
  if (!cssTag) throw new Error('Could not find the built stylesheet in index.html');
  let css = fs.readFileSync(path.join(tmpDir, cssTag[1]), 'utf8');
  // The page background image lives in the CSS.
  css = css.replace(/url\(["']?(?:\.\.\/|\.\/|\/)?bg-fakeart\.webp["']?\)/g, `url(${dataUri(path.join(publicDir, 'bg-fakeart.webp'))})`);
  if (css.includes('bg-fakeart.webp')) throw new Error('The background image was not embedded');
  html = html.replace(cssTag[0], '');

  // The script. A closing script tag or comment opener inside the code would end the block early.
  const jsTag = /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/.exec(html);
  if (!jsTag) throw new Error('Could not find the built script in index.html');
  const js = fs
    .readFileSync(path.join(tmpDir, jsTag[1]), 'utf8')
    .replace(/<\/script/gi, '<\\/script')
    .replace(/<!--/g, '<\\!--');
  html = html.replace(jsTag[0], '');

  // Images and music, looked up by the game through assetUrl().
  const assets = {};
  for (const name of fs.readdirSync(publicDir)) {
    if (name === 'bg-fakeart.webp' || name === 'favicon.svg' || name === 'icons.svg') continue;
    if (MIME[path.extname(name).toLowerCase()]) assets[name] = dataUri(path.join(publicDir, name));
  }

  // Anything that would load from the internet or from other files is removed or embedded.
  html = html
    .replace(/<link[^>]*rel="preconnect"[^>]*>\s*/g, '')
    .replace(/<link[^>]*fonts\.googleapis\.com[^>]*>\s*/g, '')
    .replace(/<script[^>]*src="https:\/\/sdk\.crazygames\.com[^"]*"[^>]*><\/script>\s*/g, '')
    .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" type="image/svg+xml" href="${dataUri(path.join(publicDir, 'favicon.svg'))}" />`);

  const head = `<style>${fontCss}${css}</style>\n<script>window.__FAKEART_ASSETS__=${JSON.stringify(assets)};</script>\n`;
  html = html.replace('</head>', () => `${head}</head>`).replace('</body>', () => `<script type="module">${js}</script>\n</body>`);

  // ---------- 4. Write it ----------
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html);

  const leftovers = [...html.matchAll(/(?:src|href)="((?:https?:)?\/\/[^"]+)"/g)].map((m) => m[1]);
  console.log(`4/4 Done: ${outFile}`);
  console.log(`    ${mb(fs.statSync(outFile).size)}, ${Object.keys(assets).length} files embedded`);
  if (leftovers.length) console.warn('    Warning: still loads from the internet:', leftovers);
}

main().catch((err) => {
  console.error('Standalone build failed:', err.message);
  process.exit(1);
});
