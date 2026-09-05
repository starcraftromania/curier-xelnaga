// Verificari pentru buletin.js, fara Discord si fara retea. Se ruleaza cu: node test/buletin.test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';

let trecute = 0; let picate = 0;
function ok(nume, conditie, detaliu = '') {
  if (conditie) { trecute++; }
  else { picate++; console.error(`  PICAT: ${nume} ${detaliu}`); }
}

// --- DATA_DIR temporar, INAINTE de a importa store/comun ------------------
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cetatea-buletin-'));
process.env.DATA_DIR = DIR;

// --- fetch mock-uit cu raspunsuri Pulse realiste --------------------------
const BAZA = 'https://sc2pulse.nephest.com/sc2';
const cereri = [];
const fetchReal = globalThis.fetch;
let fetchRealApelat = 0;

const membruEU = (id, nume, tag, raceGames) => ({
  character: { realm: 1, name: `${nume}#123`, id, accountId: id * 10, region: 2, battlenetId: 5000 + id },
  account: { battleTag: tag, id: id * 10, partition: 'GLOBAL' },
  clan: null, raceGames,
});

const CARACTERE = {
  "Xel'Naga#2100": [
    { leagueMax: 4, ratingMax: 3900, totalGamesPlayed: 1200, currentStats: { rating: 3800, gamesPlayed: 40, rank: 900 },
      members: membruEU(101, "Xel'Naga", "Xel'Naga#2100", { PROTOSS: 900, ZERG: 20 }) },
    { leagueMax: 2, ratingMax: 2500, totalGamesPlayed: 50, currentStats: { rating: 2400, gamesPlayed: 5, rank: 5000 },
      members: { ...membruEU(102, "Xel'Naga", "Xel'Naga#2100", { TERRAN: 50 }), character: { realm: 1, name: "Xel'Naga#456", id: 102, accountId: 1020, region: 1, battlenetId: 5102 } } },
    { leagueMax: 5, ratingMax: 4600, totalGamesPlayed: 3000, currentStats: { rating: 4500, gamesPlayed: 60, rank: 100 },
      members: { ...membruEU(103, "Xel'Naga", "Xel'Naga#2100", { ZERG: 3000 }), character: { realm: 1, name: "Xel'Naga#789", id: 103, accountId: 1030, region: 3, battlenetId: 5103 } } },
  ],
  'Marinar#1111': [
    { leagueMax: 3, ratingMax: 3200, totalGamesPlayed: 300, currentStats: { rating: 3100, gamesPlayed: 12, rank: 3000 },
      members: membruEU(201, 'Marinar', 'Marinar#1111', { TERRAN: 300 }) },
  ],
};

const SEZOANE = [
  { id: 100, battlenetId: 59, region: 'EU', year: 2026, number: 2, start: '2026-05-01', end: '2026-08-31' },
  { id: 101, battlenetId: 60, region: 'EU', year: 2026, number: 3, start: '2026-09-01', end: '2026-12-31' },
  { id: 99, battlenetId: 60, region: 'US', year: 2026, number: 3, start: '2026-09-01', end: '2026-12-31' },
];

const echipa = (uid, characterId, sezon, queue, rating, league, wins, losses, raceGames, lastPlayed) => ({
  id: uid * 7, legacyUid: uid, season: sezon, region: 'EU', queueType: queue, teamType: 0,
  league: { type: league, queueType: queue, teamType: 0 }, leagueType: league,
  rating, wins, losses, ties: 0, lastPlayed,
  members: [{ character: { id: characterId, name: 'x#1', region: 2 }, account: { battleTag: 'x' }, raceGames }],
});

const ECHIPE_CARACTER = {
  '101:LOTV_1V1': [echipa('201-0-2-9101', 101, 60, 201, 3800, 4, 20, 15, { PROTOSS: 35 }, '2026-09-03T20:00:00Z')],
  '101:LOTV_2V2': [echipa('202-0-2-9101', 101, 60, 202, 3300, 3, 4, 2, { PROTOSS: 6 }, '2026-09-02T20:00:00Z')],
  '201:LOTV_1V1': [echipa('201-0-2-9201', 201, 60, 201, 3100, 3, 6, 6, { TERRAN: 12 }, '2026-09-03T18:00:00Z')],
  '201:LOTV_2V2': [],
};

// starea "live" a ladderului, modificata de teste intre sondaje
let live = {};
function reseteazaLive() {
  live = {
    '201-0-2-9101': { rating: 3800, league: 4, wins: 20, losses: 15 },
    '202-0-2-9101': { rating: 3300, league: 3, wins: 4, losses: 2 },
    '201-0-2-9201': { rating: 3100, league: 3, wins: 6, losses: 6 },
  };
}
reseteazaLive();

function raspunsTeamsLast(uids) {
  const out = [];
  for (const uid of uids) {
    const l = live[uid]; if (!l) continue;
    const q = uid.startsWith('202') ? 202 : 201;
    // sezonul vechi, cu MULT mai multe victorii: trebuie ignorat de filtrul de sezon
    out.push(echipa(uid, 0, 59, q, l.rating - 300, l.league - 1, 250, 240, { PROTOSS: 490 }, '2026-08-30T10:00:00Z'));
    out.push(echipa(uid, 0, 60, q, l.rating, l.league, l.wins, l.losses, { PROTOSS: l.wins + l.losses }, '2026-09-04T10:00:00Z'));
  }
  return out;
}

globalThis.fetch = async (url, opt = {}) => {
  const u = String(url);
  cereri.push({ url: u, headers: opt.headers ?? {} });
  if (!u.startsWith(BAZA)) { fetchRealApelat++; throw new Error('retea reala interzisa in test: ' + u); }
  const { pathname, searchParams } = new URL(u);
  let corp = [];
  if (pathname.endsWith('/api/characters')) corp = CARACTERE[searchParams.get('query')] ?? [];
  else if (pathname.endsWith('/api/seasons')) corp = SEZOANE;
  else if (pathname.endsWith('/api/character-teams')) corp = ECHIPE_CARACTER[`${searchParams.get('characterId')}:${searchParams.get('queue')}`] ?? [];
  else if (pathname.endsWith('/api/teams')) corp = raspunsTeamsLast(searchParams.get('teamLegacyUid').split(','));
  else return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(corp)) };
};

// --- client Discord simulat ----------------------------------------------
class Colectie extends Map {
  find(fn) { for (const v of this.values()) if (fn(v)) return v; return undefined; }
  first() { return this.values().next().value; }
}
const trimise = [];
function canalFals(id, nume) {
  return { id, name: nume, type: 0, send: async (c) => { trimise.push({ canal: nume, continut: c }); return { id: 'm' + trimise.length }; } };
}
const membri = new Map();
function membruFals(id) {
  if (!membri.has(id)) {
    const roluri = new Set();
    membri.set(id, { id, displayName: 'Om' + id, roles: { cache: roluri, add: async (r) => { roluri.add(r); r.members.set(id, membri.get(id)); }, remove: async (r) => { roluri.delete(r); r.members.delete(id); } } });
  }
  return membri.get(id);
}
const guild = {
  id: '1540003384042590339',
  channels: { cache: new Colectie(), create: async ({ name }) => { const c = canalFals('c' + name, name); guild.channels.cache.set(c.id, c); return c; } },
  roles: {
    cache: new Colectie(), everyone: { id: 'everyone' },
    create: async ({ name, position }) => { const r = { id: 'r' + name, name, position, members: new Map() }; guild.roles.cache.set(r.id, r); return r; },
  },
  members: { me: { id: 'bot', roles: { highest: { position: 10 } }, permissions: { has: () => true } }, fetch: async (id) => membruFals(id) },
};
guild.channels.cache.set('1540008368045953134', canalFals('1540008368045953134', 'general'));
const client = new EventEmitter();
client.guilds = { cache: new Colectie([[guild.id, guild]]) };

// --- importam modulul (dupa mock-uri) -------------------------------------
const store = (await import('../src/store.js')).default;
const mod = await import('../src/buletin.js');
const { _intern: B, DEFINITII, FOOTER } = mod;

const cfg = { guild: guild.id, moneda: '◈', canale: { general: '1540008368045953134' } };
mod.porneste(client, cfg);

// 1. definitiile comenzilor
ok('definitii: cele 4 comenzi', DEFINITII.map((d) => d.name).sort().join(',') === 'buletin,cont,ladder,leaga-contul');
ok('definitii: /cont are lega/sterge/lista', DEFINITII.find((d) => d.name === 'cont').options.map((o) => o.name).join(',') === 'lega,sterge,lista');

// 2. normalizarea inputului
ok('normalizare: apostrof tipografic -> ASCII, trim', B.normalizeaza('  Xel\u2019Naga#2100 ') === "Xel'Naga#2100", `(${B.normalizeaza('  Xel\u2019Naga#2100 ')})`);
ok('normalizare: spatii multiple', B.normalizeaza('Xel   Naga') === 'Xel Naga');
ok('link: battle.net e detectat', B.eLink('https://starcraft2.blizzard.com/en-us/profile/2/1/12345'));
ok('link: sc2pulse e detectat', B.eLink('sc2pulse.nephest.com/sc2/?type=character&id=12345'));
ok('link: un BattleTag nu e link', !B.eLink("Xel'Naga#2100"));
{
  const inainte = cereri.length;
  const r = await B.leaga('u1', 'https://sc2pulse.nephest.com/sc2/?type=character&id=99');
  ok('leaga: linkul lipit primeste explicatia despre ID-ul intern', /ID-ul intern/.test(r.text) && /BattleTag/.test(r.text));
  ok('leaga: linkul nu genereaza nicio cerere', cereri.length === inainte);
}

// 3. legarea cu apostrof tipografic, alegerea EU + MMR maxim, structura buletin.json
{
  const inainte = cereri.length;
  const r = await B.leaga('u1', 'Xel\u2019Naga#2100');
  const noi = cereri.slice(inainte).map((c) => c.url);
  ok('leaga: cauta cu apostroful ASCII', noi[0] === `${BAZA}/api/characters?query=${encodeURIComponent("Xel'Naga#2100")}`, `(${noi[0]})`);
  ok('leaga: alege contul EU (id 101), nu KR cu MMR mai mare', r.cont?.id === 101, `(${r.cont?.id})`);
  ok('leaga: spune cate rezultate a gasit', /3 rezultate/.test(r.text));
  ok('leaga: o cerere per coada per caracter', noi.filter((u) => u.includes('/api/character-teams')).length === 2
    && noi.some((u) => u.includes('characterId=101&season=60&queue=LOTV_1V1')) && noi.some((u) => u.includes('characterId=101&season=60&queue=LOTV_2V2')), `(${noi.join(' | ')})`);
  ok('leaga: raspunsul contine MMR, liga si rasa', /3800/.test(r.text) && /Diamond/.test(r.text) && /Protoss/.test(r.text), `(${r.text})`);

  const s = JSON.parse(fs.readFileSync(path.join(DIR, 'buletin.json'), 'utf8'));
  ok('buletin.json: cheile de stare', ['conturi', 'echipe', 'snapshotZi', 'snapshotSapt', 'promovari', 'cursa'].every((k) => k in s), `(${Object.keys(s)})`);
  ok('buletin.json: conturi[u1] = [{id,nume,battleTag,regiune}]', JSON.stringify(s.conturi.u1) === JSON.stringify([{ id: 101, nume: "Xel'Naga", battleTag: "Xel'Naga#2100", regiune: 'EU' }]), `(${JSON.stringify(s.conturi.u1)})`);
  const e = s.echipe['201-0-2-9101'];
  ok('buletin.json: echipe[legacyUid] are toate campurile',
    e && e.discordId === 'u1' && e.characterId === 101 && e.nume === "Xel'Naga" && e.coada === 'LOTV_1V1' && e.season === 60
    && e.rating === 3800 && e.leagueType === 4 && e.wins === 20 && e.losses === 15 && e.race === 'Protoss' && e.lastPlayed === '2026-09-03T20:00:00Z' && e.eticheta === '1v1', `(${JSON.stringify(e)})`);
  ok('buletin.json: echipa de 2v2 e etichetata 2v2', s.echipe['202-0-2-9101']?.eticheta === '2v2');

  await B.leaga('u1', "Xel'Naga#2100");
  ok('leaga: nu dubleaza contul', B.listaConturi('u1').length === 1);
  const r2 = await B.leaga('u2', 'Marinar#1111');
  ok('leaga: al doilea om, un singur rezultat, fara mesajul de "rezultate"', r2.cont?.id === 201 && !/rezultate/.test(r2.text));
  ok('leaga: cont fara echipe 2v2 nu creeaza intrari goale', Object.keys(B.stare.echipe).length === 3);
}

// 4. sondajul: filtrul de sezon, 8 credite/victorie, plafonul de 300
{
  const r0 = await B.sondeaza();
  ok('sondaj: fara schimbari nu da nimic (sezonul vechi cu 250 victorii e ignorat)', r0.victorii === 0 && r0.credite === 0, `(${JSON.stringify(r0)})`);
  ok('sondaj: starea ramane pe sezonul 60', B.stare.echipe['201-0-2-9101'].season === 60 && B.stare.echipe['201-0-2-9101'].wins === 20);
  const ultima = cereri.at(-1).url;
  ok('sondaj: cererea e teams?last cu uid-urile urmarite', ultima.startsWith(`${BAZA}/api/teams?last&teamLegacyUid=`) && decodeURIComponent(ultima).includes('201-0-2-9101,202-0-2-9101,201-0-2-9201'), `(${ultima})`);

  live['201-0-2-9101'].wins = 22; live['201-0-2-9101'].rating = 3830;
  const r1 = await B.sondeaza();
  const u1 = store.utilizator('u1');
  ok('sondaj: +2 victorii -> 16 credite', r1.victorii === 2 && r1.credite === 16 && u1.sold === 16 && u1.ladderAzi === 16 && u1.totalCastigat === 16, `(${JSON.stringify(r1)} sold=${u1.sold})`);
  ok('sondaj: plafonul comun (castigatAzi) NU e atins', u1.castigatAzi === 0);
  ok('sondaj: MMR-ul se actualizeaza', B.stare.echipe['201-0-2-9101'].rating === 3830);

  live['201-0-2-9101'].wins = 62; // +40 victorii = 320, dar mai sunt doar 284 pana la 300
  const r2 = await B.sondeaza();
  ok('sondaj: plafonul de 300/zi taie la 284', r2.credite === 284 && store.utilizator('u1').sold === 300 && store.utilizator('u1').ladderAzi === 300, `(${JSON.stringify(r2)} sold=${store.utilizator('u1').sold})`);

  live['201-0-2-9101'].wins = 63;
  const r3 = await B.sondeaza();
  ok('sondaj: dupa plafon, victoria se numara dar nu mai plateste', r3.victorii === 1 && r3.credite === 0 && store.utilizator('u1').sold === 300);
  ok('sondaj: victoria unui alt om nu e afectata de plafonul primului', (() => { live['201-0-2-9201'].wins = 7; return true; })());
  const r4 = await B.sondeaza();
  ok('sondaj: u2 primeste 8 pentru victoria lui', r4.credite === 8 && store.utilizator('u2').sold === 8);

  // plafonul se reseteaza la zi noua (simulam ziua de ieri)
  store.utilizator('u1').ziLadder = '2000-01-01';
  const dat = B.acordaLadder('u1', 8);
  ok('acordaLadder: zi noua -> plafonul se reseteaza', dat === 8 && store.utilizator('u1').ladderAzi === 8 && store.utilizator('u1').sold === 308);
}

// 5. promovarea: anunt in #general, bonus 150, racire 30 min
{
  const acum = new Date('2026-09-04T12:00:00Z');
  const soldInainte = store.utilizator('u2').sold;
  live['201-0-2-9201'].league = 4; live['201-0-2-9201'].rating = 3400;
  const r = await B.sondeaza(acum);
  const anunt = trimise.filter((t) => t.canal === 'general' && /promovat/.test(String(t.continut)));
  ok('promovare: anunt in #general cu numele si liga', r.promovari === 1 && anunt.length === 1 && /Marinar/.test(anunt[0].continut) && /Diamond/.test(anunt[0].continut), `(${anunt.map((a) => a.continut)})`);
  ok('promovare: bonus 150', store.utilizator('u2').sold === soldInainte + 150, `(${store.utilizator('u2').sold})`);
  ok('promovare: racirea e in stare', B.stare.promovari.u2?.leagueType === 4 && B.stare.promovari.u2?.cand === acum.getTime());

  // cade inapoi si urca din nou dupa 10 minute: in racire, fara anunt si fara bonus
  live['201-0-2-9201'].league = 3; await B.sondeaza(new Date(acum.getTime() + 5 * 60000));
  live['201-0-2-9201'].league = 4;
  const r2 = await B.sondeaza(new Date(acum.getTime() + 10 * 60000));
  ok('promovare: aceeasi liga in 30 min -> nimic', r2.promovari === 0 && store.utilizator('u2').sold === soldInainte + 150
    && trimise.filter((t) => /promovat/.test(String(t.continut))).length === 1);

  // dupa 31 de minute, din nou: se anunta iar
  live['201-0-2-9201'].league = 3; await B.sondeaza(new Date(acum.getTime() + 20 * 60000));
  live['201-0-2-9201'].league = 4;
  const r3 = await B.sondeaza(new Date(acum.getTime() + 31 * 60000));
  ok('promovare: dupa racire se anunta din nou', r3.promovari === 1 && store.utilizator('u2').sold === soldInainte + 300);
}

// 6. buletinul zilnic si /buletin
{
  const acum = new Date('2026-09-04T09:00:00Z');
  B.stare.snapshotZi = { data: null, echipe: {} };
  B.asiguraSnapshotZi(acum);
  ok('snapshotZi: se ia o data pe zi', !B.asiguraSnapshotZi(acum) && Object.keys(B.stare.snapshotZi.echipe).length === 3);
  live['201-0-2-9101'].wins = 65; live['201-0-2-9101'].losses = 16; live['201-0-2-9101'].rating = 3900;
  await B.sondeaza(acum);
  const e = await B.buletinZilnic(guild, acum).then((x) => x.toJSON());
  ok('buletin zilnic: meciuri jucate azi per om', /Omu1/.test(e.description) && /3 meciuri, 2 victorii/.test(e.description), `(${e.description})`);
  ok('buletin zilnic: MMR curent si diferenta', /3900 MMR \(\+70\)/.test(e.description));
  ok('buletin zilnic: promovarile de azi', /Promovari azi/.test(e.description) && /<@u2>/.test(e.description));
  ok('buletin zilnic: footerul cu creditul Pulse', e.footer?.text === FOOTER);

  const top = (await B.construiesteBuletin(guild)).toJSON();
  ok('/buletin: topul 1v1 cu liga, rasa, ultimul meci', /\*\*1\.\*\* Omu1/.test(top.description) && /Diamond/.test(top.description) && /Protoss/.test(top.description) && /ultimul meci/.test(top.description) && top.footer.text === FOOTER, `(${top.description})`);

  // ticul de 23:00 trimite in #buletin-ladder (creat readOnly)
  const seara = new Date('2026-09-04T20:30:00Z'); // 23:30 la Bucuresti (EEST)
  B.stare.ultimulBuletin = null;
  await B.tick(seara);
  const inBuletin = trimise.filter((t) => t.canal === 'buletin-ladder');
  ok('tick 23:00: buletinul ajunge in #buletin-ladder', inBuletin.length === 1 && inBuletin[0].continut.embeds?.[0]);
  await B.tick(new Date(seara.getTime() + 60000));
  ok('tick 23:00: o singura data pe zi', trimise.filter((t) => t.canal === 'buletin-ladder').length === 1);
  await B.tick(new Date('2026-09-04T15:00:00Z'));
  ok('tick: inainte de 23:00 nu trimite buletin (alta zi in stare? nu: aceeasi zi, deja trimis)', trimise.filter((t) => t.canal === 'buletin-ladder').length === 1);
}

// 7. cursa saptamanala
{
  const luniTrecut = new Date('2026-08-31T05:00:00Z'); // luni 08:00
  B.stare.snapshotSapt = { inceput: null, echipe: {} };
  B.stare.cursa = { ultimaAnuntata: null, inAsteptare: null };
  B.asiguraSnapshotSapt(luniTrecut);
  ok('snapshotSapt: se ia la inceputul saptamanii', B.stare.snapshotSapt.inceput && Object.keys(B.stare.snapshotSapt.echipe).length === 3 && !B.asiguraSnapshotSapt(new Date('2026-09-03T10:00:00Z')));

  // u1 urca +200 in 10 meciuri; u2 urca +500 dar in doar 2 meciuri (sub minim)
  live['201-0-2-9101'].rating += 200; live['201-0-2-9101'].wins += 7; live['201-0-2-9101'].losses += 3;
  live['201-0-2-9201'].rating += 500; live['201-0-2-9201'].wins += 2;
  await B.sondeaza(new Date('2026-09-05T10:00:00Z'));
  const soldU1 = store.utilizator('u1').sold;

  const luniNou = new Date('2026-09-06T21:30:00Z'); // luni 7 sept 00:30 la Bucuresti
  B.asiguraSnapshotSapt(luniNou);
  ok('cursa: la luni 00:00 castigatorul e calculat si tinut in asteptare (minim 5 meciuri)',
    B.stare.cursa.inAsteptare?.castigator?.discordId === 'u1' && B.stare.cursa.inAsteptare.castigator.castig === 200 && B.stare.cursa.inAsteptare.clasament.length === 1, `(${JSON.stringify(B.stare.cursa.inAsteptare)})`);

  await B.tick(new Date('2026-09-07T05:00:00Z')); // luni 08:00: inca nu
  ok('cursa: nu se anunta inainte de 11:00', B.stare.cursa.inAsteptare !== null && !trimise.some((t) => t.continut?.embeds?.[0]?.data?.title?.includes('Ascensiunea')));
  await B.tick(new Date('2026-09-07T08:05:00Z')); // luni 11:05
  const anunt = trimise.find((t) => t.canal === 'general' && t.continut?.embeds?.[0]?.data?.title?.includes('Ascensiunea'));
  ok('cursa: anuntul la 11:00 in #general', !!anunt && /<@u1>/.test(anunt.continut.embeds[0].data.description) && /\+200 MMR/.test(anunt.continut.embeds[0].data.description), `(${anunt?.continut.embeds[0].data.description})`);
  ok('cursa: premiul de 500', store.utilizator('u1').sold === soldU1 + 500);
  const rol = guild.roles.cache.find((r) => r.name === mod.NUME_ROL);
  ok('cursa: rolul hoistat e creat si dat castigatorului', rol && rol.members.has('u1') && membruFals('u1').roles.cache.has(rol));
  ok('cursa: se anunta o singura data', B.stare.cursa.inAsteptare === null && B.stare.cursa.ultimaAnuntata && !(await B.anuntaCursa(guild)));
  ok('cursa: footerul cu creditul Pulse', anunt.continut.embeds[0].data.footer.text === FOOTER);

  // rolul se muta de la castigatorul vechi la cel nou
  B.stare.cursa.inAsteptare = { saptamana: 'x', castigator: { discordId: 'u2', nume: 'Marinar', castig: 90, meciuri: 6, rating: 3400 }, clasament: [] };
  await B.anuntaCursa(guild);
  ok('cursa: rolul se muta la noul castigator', rol.members.has('u2') && !rol.members.has('u1'));
}

// 8. /ladder live si /cont
{
  const r = await B.cautaLadder("Xel\u2019Naga#2100");
  const d = r.embed.toJSON();
  ok('/ladder: top 5 dupa MMR maxim, cu regiune/liga/rasa', /\*\*1\.\*\* Xel'Naga.*KR.*max 4600.*Master.*Zerg/.test(d.description) && /\*\*2\.\*\*.*EU/.test(d.description), `(${d.description})`);
  ok('/ladder: footerul cu creditul Pulse', d.footer.text === FOOTER);
  const nimic = await B.cautaLadder('Nimeni#0000');
  ok('/ladder: fara rezultate -> text', /Nimic/.test(nimic.text));

  const cate = B.stergeConturile('u2');
  ok('/cont sterge: scoate conturile si echipele omului', cate === 1 && !B.stare.conturi.u2 && !Object.values(B.stare.echipe).some((t) => t.discordId === 'u2') && !B.stare.promovari.u2);
  ok('/cont lista: u1 mai are contul', B.listaConturi('u1').length === 1);
}

// 9. comanda prin interactiune simulata (efemer)
{
  const raspunsuri = [];
  const i = {
    commandName: 'leaga-contul', user: { id: 'u3' }, guild, deferred: false, replied: false,
    isChatInputCommand: () => true,
    options: { getString: () => 'Marinar#1111', getSubcommand: () => null },
    deferReply: async (o) => { i.deferred = true; raspunsuri.push({ defer: o }); },
    editReply: async (o) => { raspunsuri.push(o); },
    reply: async (o) => { raspunsuri.push(o); },
  };
  client.emit('interactionCreate', i);
  for (let k = 0; k < 100 && raspunsuri.length < 2; k++) await new Promise((r) => setTimeout(r, 50)); // galeata poate fi goala
  ok('interactiune: /leaga-contul raspunde efemer', raspunsuri[0]?.defer?.flags === 64 && /Cont legat/.test(raspunsuri[1]?.content), `(${JSON.stringify(raspunsuri)})`);
  ok('interactiune: contul lui u3 e salvat', B.listaConturi('u3').length === 1);
}

// 10. retea: totul a mers prin mock, doar catre Pulse, cu headere ASCII
ok('retea: nicio cerere reala', fetchRealApelat === 0 && cereri.length > 0);
ok('retea: toate cererile merg la SC2 Pulse', cereri.every((c) => c.url.startsWith(BAZA)));
ok('retea: headerele sunt DOAR ASCII', cereri.every((c) => Object.entries(c.headers).every(([k, v]) => /^[\x20-\x7e]*$/.test(k + v))));
ok('retea: User-Agent-ul din comun.js e prezent', cereri.every((c) => /CurierulXelNaga/.test(c.headers['User-Agent'] ?? '')));
ok('retea: nicio cerere nu contine apostroful tipografic', cereri.every((c) => !c.url.includes('\u2019') && !c.url.includes('%E2%80%99')));

// 11. fisierul de stare e ASCII-safe la recitire si supravietuieste restartului
{
  B.incarcaStarea();
  ok('stare: se reincarca din buletin.json cu toate cheile', B.stare.conturi.u1 && B.stare.echipe['201-0-2-9101'] && B.stare.cursa && B.stare.snapshotSapt.inceput);
}

globalThis.fetch = fetchReal;
fs.rmSync(DIR, { recursive: true, force: true });
console.log(`\n${trecute} verificari trecute, ${picate} picate`);
process.exit(picate === 0 ? 0 : 1);
