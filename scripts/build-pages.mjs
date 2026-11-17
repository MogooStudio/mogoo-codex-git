import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Stage only public presentation files. Never upload the repository root.
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(root, process.argv[2] || 'release/pages');
await mkdir(output, { recursive: true });
if ((await readdir(output)).length) {
  throw new Error(`Pages output must be empty; choose a new directory: ${output}`);
}
const files = [
  ['docs/index.html', 'index.html'],
  ['docs/.nojekyll', '.nojekyll'],
  ...['favicon.svg', 'site.js', 'styles.css'].map(name => [`docs/site/${name}`, `site/${name}`]),
  ...['history-dark.webp', 'history-light.webp', 'diff-detail.webp', 'diff-light-detail.webp']
    .map(name => [`docs/site/assets/${name}`, `site/assets/${name}`]),
  ...['alpine.min.js', 'gsap.min.js', 'ScrollTrigger.min.js']
    .map(name => [`docs/site/vendor/${name}`, `site/vendor/${name}`]),
  ...['quick-demo.mp4', 'quick-demo-poster.jpg', 'full-demo.mp4', 'full-demo-poster.jpg']
    .map(name => [`docs/media/${name}`, `media/${name}`]),
  ...['LICENSE', 'THIRD-PARTY-NOTICES.md'].map(name => [name, name]),
  ...['ALPINE-MIT.txt', 'GSAP-STANDARD.txt', 'REACT-MIT.txt', 'LUCIDE-ISC.txt', 'FEATHER-MIT.txt']
    .map(name => [`licenses/${name}`, `licenses/${name}`]),
];
for (const [source, target] of files) {
  const destination = path.join(output, target);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(root, source), destination, { dereference: true });
}
// This notice lives one directory shallower in the published site.
const vendorNotice = await readFile(path.join(root, 'docs/site/vendor/LICENSES.md'), 'utf8');
await writeFile(path.join(output, 'site/vendor/LICENSES.md'), vendorNotice.replaceAll('../../../', '../../'));
console.log(`Prepared ${files.length + 1} Pages files in ${output}`);
