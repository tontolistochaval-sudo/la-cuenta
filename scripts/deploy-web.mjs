// Publica la versión web (para el iPhone) en GitHub Pages:
//   npm run web:deploy  → compila para /la-cuenta/ y la sube a la rama gh-pages del repositorio.
// Las claves (CARTO, Supabase) se leen de .env.local y quedan dentro del JavaScript publicado,
// que es lo normal en una web: la seguridad de los datos la ponen las reglas de Supabase.
import { execSync } from 'node:child_process';
import { copyFileSync, rmSync, writeFileSync } from 'node:fs';

const REPO = process.env.LA_CUENTA_REPO ?? 'https://github.com/tontolistochaval-sudo/la-cuenta.git';
const OUT = 'dist-web';
const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts });

rmSync(OUT, { recursive: true, force: true });
run(`npx tsc -b && npx vite build --outDir ${OUT}`, { env: { ...process.env, VITE_BASE: '/la-cuenta/' } });
writeFileSync(`${OUT}/.nojekyll`, ''); // que GitHub no procese los archivos
copyFileSync(`${OUT}/index.html`, `${OUT}/404.html`);

const git = (cmd) => run(`git ${cmd}`, { cwd: OUT });
git('init -q -b gh-pages');
git('add -A');
git(`commit -q -m "Publicar La Cuenta. ${new Date().toISOString().slice(0, 16).replace('T', ' ')}"`);
git(`push -f ${REPO} gh-pages`);
console.log('\nPublicado. En 1-2 minutos: https://tontolistochaval-sudo.github.io/la-cuenta/');
