import {build} from 'esbuild';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = (entry) => build({
  entryPoints: [path.join(root, entry)], bundle: true, write: false,
  minify: true, target: 'es2020', format: 'iife', charset: 'utf8',
  loader: {'.woff2': 'dataurl'}, legalComments: 'none',
}).then(output => output.outputFiles[0].text);
const [template, js, css] = await Promise.all([
  readFile(path.join(root, 'src/shell.html'), 'utf8'),
  bundle('src/app.js'), bundle('src/style.css')
]);
const html = template.replace('<!-- STYLE -->', () => '<style>' + css + '</style>')
  .replace('<!-- SCRIPT -->', () => '<script>' + js.replace(/<\/script/gi,'<\\/script') + '</script>');
await mkdir(path.join(root, 'dist'), {recursive: true});
await writeFile(path.join(root, 'dist/index.html'), html);
console.log('dist/index.html · ' + Math.round(Buffer.byteLength(html)/1024) + ' KiB');
