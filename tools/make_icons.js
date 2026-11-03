// Генерация иконок: python3 -m http.server 8123 в корне, затем node tools/make_icons.js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const out = [['icon-512.png', 512, 0], ['icon-192.png', 192, 0], ['apple-touch-icon.png', 180, 0], ['icon-maskable-512.png', 512, 1]];
  for (const [name, size, pad] of out) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    await p.goto(`http://localhost:8123/tools/icon.html?pad=${pad}`);
    await p.waitForFunction(() => document.title === 'done');
    await p.addStyleTag({ content: `canvas{width:${size}px;height:${size}px}` });
    await p.screenshot({ path: `icons/${name}`, clip: { x: 0, y: 0, width: size, height: size } });
    await p.close();
  }
  await b.close();
})();
