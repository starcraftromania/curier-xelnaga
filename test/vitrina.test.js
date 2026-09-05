// Verificari pentru vitrina (clasamentul publicat pe site), fara Discord si fara retea.
// Se ruleaza cu: node test/vitrina.test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cetatea-vitrina-'));
process.env.DATA_DIR = DIR;
process.env.GITHUB_TOKEN = 'token-de-test';

let trecute = 0; let picate = 0;
function ok(nume, conditie, detaliu = '') {
  if (conditie) { trecute++; } else { picate++; console.error(`  PICAT: ${nume} ${detaliu}`); }
}

// --- client Discord simulat --------------------------------------------------
const NUME = { u1: 'Artanis', u2: 'Kerrigan', u3: 'Raynor', u4: 'Zeratul' };
const guild = {
  id: 'g1',
  members: { fetch: async (id) => { if (!NUME[id]) throw new Error('Unknown Member'); return { displayName: NUME[id] }; } },
  channels: { cache: new Map() },
};
const client = new EventEmitter();
client.guilds = { cache: new Map([[guild.id, guild]]) };
const cfg = { guild: 'g1', moneda: '◈', canale: { general: 'general' }, puncte: { plafonZilnic: 600 } };

// --- fetch simulat -----------------------------------------------------------
const apeluri = [];
let shaPeServer = null; // null -> fisierul nu exista (404)
globalThis.fetch = async (url, opt = {}) => {
  apeluri.push({ url: String(url), method: opt.method ?? 'GET', headers: opt.headers ?? {}, body: opt.body ? JSON.parse(opt.body) : null });
  if ((opt.method ?? 'GET') === 'GET') {
    if (!shaPeServer) return { ok: false, status: 404, json: async () => ({ message: 'Not Found' }), text: async () => 'Not Found' };
    return { ok: true, status: 200, json: async () => ({ sha: shaPeServer }), text: async () => '' };
  }
  shaPeServer = 'sha-' + apeluri.length;
  return { ok: true, status: 201, json: async () => ({ content: { sha: shaPeServer } }), text: async () => '' };
};

const store = (await import('../src/store.js')).default;
const { _intern: V, IMPLICIT, porneste } = await import('../src/vitrina.js');

// --- date de start -----------------------------------------------------------
store.acorda('u1', 500, 9999);
store.acorda('u2', 300, 9999);
store.acorda('u3', 100, 9999);
store.acorda('1272997404391637067', 9000, 99999); // Snac, exclus
store.utilizator('u4'); // pilot cu sold 0
store.acordaTrivia('u2', 25, 1200); store.acordaTrivia('u2', 25, 1200);
store.acordaTrivia('u1', 25, 1200);
store.utilizator('u3').minuteVoice = 90; store.salveaza();

fs.writeFileSync(path.join(DIR, 'buletin.json'), JSON.stringify({
  conturi: { u1: { battleTag: 'Artanis#1234' }, u2: { battleTag: 'Kerrigan#2222' } },
  echipe: {
    'a1': { rating: 4200, leagueType: 5, wins: 30, losses: 20, race: 'PROTOSS', nume: 'Artanis', season: 60 },
    'a2': { rating: 4500, leagueType: 5, wins: 5, losses: 3, race: 'ZERG', nume: 'Artanis', season: 60 },   // al doilea cont, MMR mai mare
    'a0': { rating: 5000, leagueType: 6, wins: 99, losses: 1, race: 'PROTOSS', nume: 'Artanis', season: 59 }, // sezon vechi, ignorat
    'k1': { rating: 3100, leagueType: 3, wins: 10, losses: 12, race: 'ZERG', nume: 'Kerrigan', season: 60 },
    'x0': { rating: 3900, leagueType: 4, wins: 1, losses: 1, race: 'TERRAN', nume: 'Vechi', season: 58 },
  },
}));

// --- 1. ladder din buletin ---------------------------------------------------
{
  const l = V.ladderDinBuletin(JSON.parse(fs.readFileSync(path.join(DIR, 'buletin.json'), 'utf8')));
  ok('ladder: doar sezonul maxim, un rand per nume', l.length === 2 && l.map((r) => r.nume).join(',') === 'Artanis,Kerrigan', JSON.stringify(l));
  ok('ladder: se pastreaza MMR-ul cel mai mare', l[0].mmr === 4500 && l[0].rasa === 'ZERG' && l[0].meciuri === 8);
  ok('ladder: numele ligilor', l[0].liga === 'Master' && l[1].liga === 'Platinum');
  ok('ladder: fara buletin -> []', V.ladderDinBuletin(null).length === 0 && V.ladderDinBuletin({}).length === 0);
}

// --- 2. forma JSON-ului ------------------------------------------------------
{
  const cl = await V.construiesteClasament(guild, IMPLICIT);
  ok('json: cheile exacte', Object.keys(cl).join(',') === 'generat,sursa,creditSC2Pulse,regi,credite,ladder,trivia,voce,statistici', Object.keys(cl).join(','));
  ok('json: sursa si creditul Pulse', cl.sursa === 'Curierul Xel\'Naga' && cl.creditSC2Pulse === 'https://sc2pulse.nephest.com/sc2');
  ok('json: regii sunt primii 3 la credite', cl.regi.rege?.nume === 'Artanis' && cl.regi.rege.credite === 525 && cl.regi.uzurpator?.nume === 'Kerrigan' && cl.regi.boier?.nume === 'Raynor');
  ok('json: creditele respecta exclusii (Snac lipseste)', !cl.credite.some((r) => r.credite === 9000) && cl.credite[0].loc === 1);
  ok('json: trivia si voce', cl.trivia[0].nume === 'Kerrigan' && cl.trivia[0].victorii === 2 && cl.voce[0].nume === 'Raynor' && cl.voce[0].minute === 90);
  ok('json: statistici', cl.statistici.membri === 4 && cl.statistici.inCirculatie === 9975 && cl.statistici.conturiLegate === 2 && cl.statistici.piloti === 5, JSON.stringify(cl.statistici));
  ok('json: generat e ISO', !Number.isNaN(Date.parse(cl.generat)));
  const a1 = V.amprenta(cl); const a2 = V.amprenta({ ...cl, generat: 'altceva' });
  ok('amprenta: ignora campul generat', a1 === a2 && /^[0-9a-f]{64}$/.test(a1));
  ok('amprenta: se schimba cand se schimba datele', V.amprenta({ ...cl, credite: [] }) !== a1);
}

// --- 3. anonimizare ----------------------------------------------------------
{
  V.golesteCacheNume();
  const cl = await V.construiesteClasament(guild, { ...IMPLICIT, numeAnonim: true });
  ok('anonim: ab**** pe credite si ladder', cl.credite[0].nume === 'ar****' && cl.ladder[0].nume === 'ar****' && cl.regi.rege.nume === 'ar****');
}

// --- 4. primul commit: fisierul nu exista (404) -> PUT fara sha --------------
{
  const r = await V.tick(client, cfg);
  const put = apeluri.filter((a) => a.method === 'PUT');
  ok('commit: primul tick comite', r.comis === true && put.length === 1, r.motiv);
  ok('commit: fara sha cand fisierul nu exista', put[0] && put[0].body.sha === undefined);
  ok('commit: url, branch si mesaj', put[0].url === 'https://api.github.com/repos/starcraftromania/starcraftromania.github.io/contents/clasament.json' && put[0].body.branch === 'main' && /^vitrina: clasament \d{4}-/.test(put[0].body.message));
  ok('commit: anteturile GitHub', put[0].headers.Authorization === 'Bearer token-de-test' && put[0].headers.Accept === 'application/vnd.github+json' && put[0].headers['X-GitHub-Api-Version'] === '2022-11-28');
  const continut = JSON.parse(Buffer.from(put[0].body.content, 'base64').toString('utf8'));
  ok('commit: continutul e JSON-ul clasamentului', continut.regi.rege.nume === 'Artanis' && Array.isArray(continut.ladder));
  const st = JSON.parse(fs.readFileSync(path.join(DIR, 'vitrina.json'), 'utf8'));
  ok('stare: amprenta salvata in vitrina.json', st.amprenta === r.amprenta && !!st.ultimulCommit);
}

// --- 5. nimic schimbat -> NU comite -------------------------------------------
{
  const inainte = apeluri.length;
  const r = await V.tick(client, cfg);
  ok('commit: amprenta neschimbata -> zero apeluri', r.comis === false && apeluri.length === inainte, `${apeluri.length - inainte} apeluri`);
}

// --- 6. schimbare -> comite cu sha-ul existent --------------------------------
{
  store.acorda('u3', 50, 9999);
  const r = await V.tick(client, cfg);
  const put = apeluri.filter((a) => a.method === 'PUT');
  ok('commit: schimbarea datelor comite din nou', r.comis === true && put.length === 2);
  ok('commit: cu sha cand fisierul exista', put[1].body.sha === 'sha-2', JSON.stringify(put[1].body.sha));
  const get = apeluri.filter((a) => a.method === 'GET');
  ok('commit: GET-ul cere branch-ul main', get.every((g) => g.url.endsWith('?ref=main')));
}

// --- 7. one-shot index nou ----------------------------------------------------
{
  const caleIndex = path.join(DIR, 'site-index-nou.html');
  fs.writeFileSync(caleIndex, '<title>Cetatea</title>');
  const inainte = apeluri.filter((a) => a.method === 'PUT').length;
  await V.tick(client, { ...cfg, vitrina: { caleIndexNou: caleIndex } });
  const put = apeluri.filter((a) => a.method === 'PUT');
  const ultim = put[put.length - 1];
  ok('index nou: se comite ca index.html', put.length === inainte + 1 && ultim.url.endsWith('/contents/index.html'));
  ok('index nou: continutul e HTML-ul', Buffer.from(ultim.body.content, 'base64').toString('utf8') === '<title>Cetatea</title>');
  ok('index nou: fisierul local e sters', !fs.existsSync(caleIndex));
}

// --- 8. eroare de retea nu doboara -------------------------------------------
{
  const vechi = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('retea cazuta'); };
  store.acorda('u2', 1, 9999);
  let eroare = null;
  try { await V.tick(client, cfg); } catch (e) { eroare = e; }
  globalThis.fetch = vechi;
  ok('retea: eroarea se propaga la apelant (porneste o prinde), starea nu se strica', eroare !== null);
  const st = JSON.parse(fs.readFileSync(path.join(DIR, 'vitrina.json'), 'utf8'));
  ok('retea: amprenta veche ramane dupa esec', typeof st.amprenta === 'string');
}

// --- 9. fara token -> tacere ------------------------------------------------
{
  delete process.env.GITHUB_TOKEN;
  const inainte = apeluri.length;
  const r = await V.tick(client, cfg);
  ok('fara token: tick-ul nu face nimic', r.comis === false && r.motiv === 'fara token' && apeluri.length === inainte);
  const avert = [];
  const vechi = console.warn; console.warn = (...a) => avert.push(a.join(' '));
  const c2 = new EventEmitter(); c2.guilds = client.guilds;
  porneste(c2, cfg);
  console.warn = vechi;
  ok('fara token: un singur warn la boot, fara ascultator clientReady', avert.length === 1 && c2.listenerCount('clientReady') === 0);
  process.env.GITHUB_TOKEN = 'token-de-test';
  const c3 = new EventEmitter(); c3.guilds = client.guilds;
  porneste(c3, cfg);
  ok('cu token: se aboneaza la clientReady', c3.listenerCount('clientReady') === 1);
}

fs.rmSync(DIR, { recursive: true, force: true });
console.log(`\n${trecute} verificari trecute, ${picate} picate`);
process.exit(picate === 0 ? 0 : 1);
