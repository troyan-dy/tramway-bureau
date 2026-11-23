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
const readText = async file =>
  (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
const [template, js, css, interLicense, ptLicense] = await Promise.all([
  readText('src/shell.html'), bundle('src/app.js'), bundle('src/style.css'),
  readText('assets/inter-LICENSE.txt'), readText('assets/ptserif-LICENSE.txt'),
]);
const credits = '<script type="text/plain" id="font-licenses">\nInter\n' + interLicense +
  '\nPT Serif\n' + ptLicense + '\n</script>';
const html = template.replace('<!-- STYLE -->', () => '<style>' + css + '</style>\n' + credits)
  .replace('<!-- SCRIPT -->', () => '<script>' + js.replace(/<\/script/gi,'<\\/script') + '</script>');
await mkdir(path.join(root, 'dist'), {recursive: true});
await writeFile(path.join(root, 'dist/index.html'), html);
console.log('dist/index.html · ' + Math.round(Buffer.byteLength(html)/1024) + ' KiB');
