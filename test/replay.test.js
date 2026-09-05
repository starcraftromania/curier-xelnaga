// Verificari pentru src/replay.js, fara Discord si fara retea. Ruleaza: node test/replay.test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cetatea-replay-'));
process.env.DATA_DIR = DIR;

const store = (await import('../src/store.js')).default;
const replay = await import('../src/replay.js');
const { porneste, DEFINITII, _intern, valideaza, formateazaCard, durataText, matchup, acordaReplay } = replay;
const { Collection } = await import('discord.js');

let trecute = 0; let picate = 0;
function ok(nume, conditie, detaliu = '') {
  if (conditie) { trecute++; }
  else { picate++; console.error(`  PICAT: ${nume} ${detaliu}`); }
}

// --- definitii -------------------------------------------------------------
ok('definitii: /replay cu optiune attachment (tip 11)', DEFINITII[0].name === 'replay' && DEFINITII[0].options[0].type === 11 && DEFINITII[0].options[0].name === 'fisier');

// --- validare --------------------------------------------------------------
const ATT = { name: 'Ley Lines LE (12).SC2Replay', size: 120_000, url: 'https://cdn.discordapp.test/x.SC2Replay' };
ok('validare: fisier bun', valideaza(ATT).ok === true);
ok('validare: extensia case-insensitive', valideaza({ ...ATT, name: 'joc.sc2replay' }).ok === true);
ok('validare: extensie gresita', valideaza({ ...ATT, name: 'joc.zip' }).ok === false && /SC2Replay/.test(valideaza({ ...ATT, name: 'joc.zip' }).motiv));
ok('validare: extensie ascunsa in nume', valideaza({ ...ATT, name: 'joc.SC2Replay.exe' }).ok === false);
ok('validare: exact 8 MB trece', valideaza({ ...ATT, size: 8 * 1024 * 1024 }).ok === true);
ok('validare: peste 8 MB pica', valideaza({ ...ATT, size: 8 * 1024 * 1024 + 1 }).ok === false && /MB/.test(valideaza({ ...ATT, size: 9_000_000 }).motiv));
ok('validare: fisier gol pica', valideaza({ ...ATT, size: 0 }).ok === false);
ok('validare: fara atasament', valideaza(null).ok === false);
ok('validare: fara url', valideaza({ ...ATT, url: '' }).ok === false);

// --- formatare -------------------------------------------------------------
ok('durata: 7:05', durataText(425) === '7:05');
ok('durata: 1:02:03', durataText(3723) === '1:02:03');
ok('matchup: TvZ', matchup([{ rasa: 'Terran' }, { rasa: 'Zerg' }]) === 'TvZ');
ok('matchup: PvP', matchup([{ rasa: 'Protoss' }, { rasa: 'Protoss' }]) === 'PvP');

const REZ = {
  harta: 'Ley Lines LE',
  durataSecunde: 731,
  jucatori: [
    { nume: 'Serral', rasa: 'Zerg', rezultat: 'victorie', apm: 412 },
    { nume: 'Clem', rasa: 'Terran', rezultat: 'infrangere', apm: 398 },
  ],
  build: Array.from({ length: 20 }, (_, k) => ({ secunda: 12 + k * 9, jucator: k % 2 ? 'Clem' : 'Serral', unitate: k % 2 ? 'SupplyDepot' : 'Overlord' })),
  versiune: '5.0.14.93333',
};
{
  const e = formateazaCard(REZ, { autorId: '42' }).toJSON();
  ok('card: titlul are harta si matchup-ul', e.title === 'Ley Lines LE · ZvT', `(${e.title})`);
  ok('card: descrierea are durata mm:ss si castigatorul', /12:11/.test(e.description) && /Serral/.test(e.description) && /<@42>/.test(e.description));
  const jucatori = e.fields.find((f) => f.name === 'Jucatori');
  ok('card: APM-ul fiecaruia', /Serral.*APM 412/.test(jucatori.value) && /Clem.*APM 398/.test(jucatori.value));
  ok('card: W/L marcat', /`W`.*Serral/.test(jucatori.value) && /`L`.*Clem/.test(jucatori.value));
  const build = e.fields.find((f) => f.name.startsWith('Build order'));
  ok('card: exact 14 mutari din 20', build.name.includes('14') && build.value.split('\n').filter((l) => /^\s*\d+:\d\d\s/.test(l)).length === 14);
  ok('card: mutarile au timp si unitate', /0:12\s+Serral\s+Overlord/.test(build.value));
  ok('card: footer cu patch-ul', /5\.0\.14\.93333/.test(e.footer.text));
  ok('card: campurile respecta limitele Discord', e.fields.every((f) => f.value.length <= 1024) && e.title.length <= 256);
  const gol = formateazaCard({ harta: 'X', durataSecunde: 0, jucatori: [], build: [] }).toJSON();
  ok('card: rezultat gol nu crapa', gol.title.startsWith('X') && gol.fields.some((f) => /Nu am putut extrage/.test(f.value)));
}

// --- plafon 90/zi ----------------------------------------------------------
{
  const id = '777';
  const s0 = store.utilizator(id).sold;
  const d = [acordaReplay(id), acordaReplay(id), acordaReplay(id), acordaReplay(id)];
  const u = store.utilizator(id);
  ok('plafon: 30+30+30+0', d.join(',') === '30,30,30,0', `(${d})`);
  ok('plafon: soldul si totalCastigat cresc cu 90', u.sold === s0 + 90 && u.totalCastigat === 90);
  ok('plafon: campurile proprii replayAzi/ziReplay', u.replayAzi === 90 && u.ziReplay === store.ziCurenta());
  ok('plafon: NU atinge plafonul comun (castigatAzi ramane 0)', u.castigatAzi === 0);
  u.ziReplay = '2000-01-01'; // alta zi -> se reseteaza
  ok('plafon: se reseteaza in ziua urmatoare', acordaReplay(id) === 30 && store.utilizator(id).replayAzi === 30);
}

// --- comanda completa, cu fork si fetch simulate --------------------------
const client = new EventEmitter();
client.guilds = { cache: new Map() };
const reactii = [];
let raspunsFetch = () => new Response(Buffer.alloc(5000, 1), { status: 200 });
globalThis.fetch = async (url) => { fetchUrl.push(String(url)); return raspunsFetch(); };
const fetchUrl = [];

let comportamentWorker = 'ok';
const forkuri = [];
_intern.fork = (cale, args, opt) => {
  forkuri.push({ cale, args, opt });
  const w = new EventEmitter();
  w.kill = () => { w.omorat = true; };
  setImmediate(() => {
    if (comportamentWorker === 'ok') { w.emit('message', { ok: true, rezultat: REZ }); w.emit('exit', 0); }
    else if (comportamentWorker === 'eroare') { w.emit('message', { ok: false, eroare: 'parserul nu suporta build-ul asta (No protocol for 97364)' }); w.emit('exit', 0); }
    else if (comportamentWorker === 'crash') { w.emit('exit', 1); }
    // 'timeout': nu emite nimic
  });
  return w;
};
let ceas = Date.parse('2026-09-02T10:00:00+03:00'); // miercuri
_intern.acum = () => ceas;
porneste(client, { moneda: '◈', canale: { general: 'general' }, replay: { timeoutParsareMs: 200 } });

let nrMesaj = 0;
function interactiune(user, atasament) {
  const i = {
    user: { id: user, bot: false }, channelId: 'canal-replay',
    replied: false, deferred: false, raspunsuri: [], editari: [],
    isChatInputCommand: () => true, isButton: () => false, isModalSubmit: () => false,
    commandName: 'replay',
    options: { getAttachment: () => atasament },
    async reply(x) { i.replied = true; i.raspunsuri.push(x); return { id: `m${++nrMesaj}` }; },
    async deferReply() { i.deferred = true; },
    async editReply(x) {
      i.editari.push(x);
      const id = `m${++nrMesaj}`;
      return { id, channelId: 'canal-replay', react: async (em) => { reactii.push({ id, em }); } };
    },
  };
  return i;
}
async function emite(i) {
  client.emit('interactionCreate', i);
  for (let k = 0; k < 40; k++) await new Promise((r) => setImmediate(r));
  return i;
}
const text = (i) => [...i.raspunsuri, ...i.editari].map((r) => r.content ?? '').join(' | ');

{
  const i = await emite(interactiune('500', { ...ATT, name: 'x.txt' }));
  ok('comanda: extensie gresita -> raspuns efemer fara descarcare', i.raspunsuri[0]?.ephemeral === true && fetchUrl.length === 0 && !i.deferred);
}
{
  const i = await emite(interactiune('500', ATT));
  ok('comanda: descarca atasamentul', fetchUrl.length === 1 && fetchUrl[0] === ATT.url);
  ok('comanda: forkeaza workerul cu memorie limitata', forkuri.length === 1 && forkuri[0].cale.endsWith('replay-worker.js')
    && forkuri[0].opt.execArgv.includes('--max-old-space-size=128') && /\.SC2Replay$/.test(forkuri[0].args[0]));
  ok('comanda: fisierul temporar e sters dupa parsare', !fs.existsSync(forkuri[0].args[0]));
  ok('comanda: cardul e trimis cu +30', i.editari.length === 1 && i.editari[0].embeds?.length === 1 && /\+◈30/.test(text(i)));
  ok('comanda: reactia stea pe card', reactii.length === 1 && reactii[0].em === '⭐');
  const s = _intern.starea();
  ok('comanda: cardul e retinut in replay.json', Object.values(s.carduri).some((c) => c.autor === '500' && c.harta === 'Ley Lines LE' && c.canalId === 'canal-replay'));
  const disc = JSON.parse(fs.readFileSync(path.join(DIR, 'replay.json'), 'utf8'));
  ok('comanda: replay.json scris pe disc', Object.keys(disc.carduri).length === 1);
  ok('comanda: creditele acordate prin plafonul propriu', store.utilizator('500').sold === 30 && store.utilizator('500').replayAzi === 30);
}
{
  await emite(interactiune('500', ATT));
  await emite(interactiune('500', ATT));
  const i = await emite(interactiune('500', ATT));
  ok('comanda: al patrulea replay pe zi nu mai da credite', store.utilizator('500').sold === 90 && /plafonul zilnic/.test(text(i)) && i.editari[0].embeds?.length === 1);
}
{
  comportamentWorker = 'eroare';
  const i = await emite(interactiune('600', ATT));
  ok('comanda: parser picat -> mesaj clar, fara credite', /Nu am putut citi/.test(text(i)) && /build/.test(text(i)) && store.utilizator('600').sold === 0 && !i.editari[0].embeds);
  comportamentWorker = 'crash';
  const j = await emite(interactiune('600', ATT));
  ok('comanda: worker iesit fara rezultat -> mesaj, fara credite', /Nu am putut citi/.test(text(j)) && store.utilizator('600').sold === 0);
  comportamentWorker = 'timeout';
  const k0 = forkuri.length;
  const k = await emite(interactiune('600', ATT));
  await new Promise((r) => setTimeout(r, 400));
  ok('comanda: timeout -> workerul e omorat si mesaj clar', forkuri.length === k0 + 1 && /timp/.test(text(k)) && store.utilizator('600').sold === 0);
  comportamentWorker = 'ok';
}
{
  raspunsFetch = () => new Response('nu', { status: 404 });
  const i = await emite(interactiune('700', ATT));
  ok('comanda: descarcare esuata -> mesaj, fara fork nou', /Nu am putut citi/.test(text(i)) && store.utilizator('700').sold === 0);
  raspunsFetch = () => new Response(Buffer.alloc(5000, 1), { status: 200 });
}

// --- replay-ul saptamanii -------------------------------------------------
{
  const trimise = [];
  const general = { id: 'g1', name: 'general', type: 0, send: async (x) => { trimise.push(x); return { id: 'anunt' }; } };
  const guild = { id: 'guild1', channels: { cache: new Collection([['g1', general]]) } };
  client.guilds.cache.set('guild1', guild);
  const stele = { m2: 3, m3: 5, m4: 0 }; // m3 castiga
  client.channels = {
    fetch: async () => ({
      messages: { fetch: async (id) => ({ id, reactions: { cache: new Map([['⭐', { count: (stele[id] ?? 0) + 1, me: true }]]) } }) },
    }),
  };
  const s = _intern.starea();
  // cardurile de mai sus sunt din miercuri 2 sept; punem si unul din saptamana curenta care nu trebuie sa conteze
  s.carduri.viitor = { autor: '900', canalId: 'canal-replay', cand: Date.parse('2026-09-08T09:00:00+03:00'), harta: 'Nou' };
  stele.viitor = 99;

  ceas = Date.parse('2026-09-07T11:59:00+03:00'); // luni, inainte de 12
  ok('saptamana: inainte de luni 12:00 nu anunta', (await _intern.anuntaReplaySaptamanii(client, { guild: 'guild1', canale: { general: 'general' } })) === false && trimise.length === 0);
  ceas = Date.parse('2026-09-07T12:00:30+03:00');
  const s500 = store.utilizator('500').sold;
  const r = await _intern.anuntaReplaySaptamanii(client, { guild: 'guild1', canale: { general: 'general' } });
  ok('saptamana: luni la 12:00 alege cardul cu cele mai multe stele (fara steaua botului)', r && r.mesajId === 'm3' && r.stele === 5, `(${r && r.mesajId})`);
  ok('saptamana: anunt in #general cu autorul', trimise.length === 1 && /Replay-ul saptamanii/.test(trimise[0].content) && /<@500>/.test(trimise[0].content));
  ok('saptamana: premiul de 400 prin store.acorda', store.utilizator('500').sold === s500 + 400 && store.utilizator('500').castigatAzi === 400);
  ok('saptamana: nu anunta de doua ori', (await _intern.anuntaReplaySaptamanii(client, { guild: 'guild1', canale: { general: 'general' } })) === false && trimise.length === 1);
  ok('saptamana: cardul din saptamana curenta nu a fost luat in calcul', r.mesajId !== 'viitor');
  const disc = JSON.parse(fs.readFileSync(path.join(DIR, 'replay.json'), 'utf8'));
  ok('saptamana: ultimaSaptamanaAnuntata persistata', disc.ultimaSaptamanaAnuntata === '2026-09-07');
}

console.log(`\n${trecute} verificari trecute, ${picate} picate`);
fs.rmSync(DIR, { recursive: true, force: true });
process.exit(picate === 0 ? 0 : 1);
