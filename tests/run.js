// Lance l'appli en local et exécute tous les scénarios de test (GPS, trafic et cartes simulés).
// Usage : node tests/run.js            → tous les tests
//         node tests/run.js guidage     → seulement les tests dont le nom contient « guidage »
const http = require('http'), fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), PORT = 8765;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.svg': 'image/svg+xml' };
// Ce que chaque scénario DOIT afficher pour être réussi (en plus de l'absence d'erreur JavaScript)
const EXPECT = {
  'vehicule': ['settings thumb: true'],
  'carte-tomtom': ['orbis up: true', 'orbis up: false'],
  'reveil': ['overlay: true', 'test alarm: true', 'snooze set: true', 'ics ok: true'],
  'ouverture': ['skip works: true', '"on":true'],
  'ia': ['1 Réveil créé', '3 Itinéraire vers Plateau', 'C C’est fait', 'claude calls: 2'],
  'guidage-complet': ['journal enregistré : 1 trajet', 'arrived: true', 'arrival card: true', 'peek shows fab: 1', 'reports saved: 1'],
  'mode-reel': ['"terrain":true', 'nav driving→fallback normal: orbis-bg'],
  'estimation': ['"pointe": "43 min', '"arrive_oubliee_effacee": true'],
  'arret-et-sortie-de-route': ["recherche d'un meilleur itinéraire : true", 'recalcul après sortie de route : true'],
  'sondes-trafic': ['alerte : Bouchon dans 700 m', 'recherche lancée : true'],
  'contournement': ['acceptée seule : true', 'nouvel itinéraire contourne : true'],
  'accordeon': ['au lieu de 45']
};
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
}).listen(PORT, async () => {
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  const filter = process.argv[2] || '';
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js') && f.includes(filter)).sort();
  let failed = 0;
  for (const f of files) {
    const name = f.replace('.test.js', ''), t0 = Date.now();
    const r = await new Promise(ok => { const { spawn } = require('child_process'); const c = spawn(process.execPath, [path.join(__dirname, f)], { cwd: ROOT }); let out = ''; c.stdout.on('data', d => out += d); c.stderr.on('data', d => out += d); c.on('close', code => ok({ code, out })); setTimeout(() => c.kill('SIGKILL'), 240000); });
    const missing = (EXPECT[name] || []).filter(x => !r.out.includes(x));
    const jsErr = /errors?: (?!none)\S/.test(r.out.replace(/no errors/g, '')) || /ERR |pageerror|TypeError|ReferenceError/.test(r.out);
    const ok = r.code === 0 && !missing.length && !jsErr;
    if (!ok) failed++;
    console.log(`${ok ? '✅' : '❌'} ${name} (${((Date.now() - t0) / 1000).toFixed(0)} s)${missing.length ? ' — manquant : ' + missing.join(' | ') : ''}${r.code ? ' — code ' + r.code : ''}${jsErr ? ' — erreur JavaScript' : ''}`);
    if (!ok) console.log(r.out.split('\n').map(l => '    ' + l).join('\n'));
  }
  console.log(`\n${files.length - failed}/${files.length} scénarios réussis`);
  server.close(); process.exit(failed ? 1 : 0);
});
