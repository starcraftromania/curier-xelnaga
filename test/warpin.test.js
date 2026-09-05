// Verificari pentru Marele Warp-in, fara Discord. Se ruleaza cu: node test/warpin.test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Collection } from 'discord.js';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cetatea-warpin-'));
process.env.DATA_DIR = DIR;

let trecute = 0; let picate = 0;
function ok(nume, conditie, detaliu = '') {
  if (conditie) { trecute++; } else { picate++; console.error(`  PICAT: ${nume} ${detaliu}`); }
}

const store = (await import('../src/store.js')).default;
const { instant } = await import('../src/comun.js');
const { ferestreleUrmatoare, idFereastra, IMPLICIT, _intern: W, porneste } = await import('../src/warpin.js');

const iso = (d) => d.toISOString();

// --- 1. ferestrele: functii pure ---------------------------------------------
{
  const f = ferestreleUrmatoare(new Date('2026-09-04T12:00:00Z'), IMPLICIT); // vineri
  ok('ferestre: prima e sambata 5 sept, a doua duminica 6 sept', f[0]?.id === '2026-09-05-1800' && f[1]?.id === '2026-09-06-1800', f.map((x) => x.id).join(','));
  ok('ferestre: 18:00 EEST = 15:00 UTC', iso(f[0].start) === '2026-09-05T15:00:00.000Z', iso(f[0].start));
  ok('ferestre: durata 120 de minute', f[0].sfarsit - f[0].start === 120 * 60000);
  ok('ferestre: ordonate crescator, fara duplicate', f.every((x, i) => i === 0 || x.start > f[i - 1].start) && new Set(f.map((x) => x.id)).size === f.length);
  ok('idFereastra: formatul YYYY-MM-DD-HHMM', idFereastra(instant(2026, 9, 5, 18, 0)) === '2026-09-05-1800');

  // fereastra in curs ramane in lista
  const inCurs = ferestreleUrmatoare(new Date('2026-09-05T16:30:00Z'), IMPLICIT);
  ok('ferestre: fereastra in curs e prima', inCurs[0].id === '2026-09-05-1800');
  const dupa = ferestreleUrmatoare(new Date('2026-09-05T17:00:00Z'), IMPLICIT);
  ok('ferestre: fereastra terminata dispare', dupa[0].id === '2026-09-06-1800');
}

// --- 2. schimbarea de ora ------------------------------------------------------
{
  const oct = ferestreleUrmatoare(new Date('2026-10-23T10:00:00Z'), IMPLICIT); // vineri, DST se termina duminica 25 oct
  ok('DST oct: sambata 24 oct 18:00 = 15:00 UTC (EEST)', oct[0].id === '2026-10-24-1800' && iso(oct[0].start) === '2026-10-24T15:00:00.000Z', iso(oct[0].start));
  ok('DST oct: duminica 25 oct 18:00 = 16:00 UTC (EET)', oct[1].id === '2026-10-25-1800' && iso(oct[1].start) === '2026-10-25T16:00:00.000Z', iso(oct[1].start));
  ok('DST oct: ambele ferestre tin 120 de minute', oct[0].sfarsit - oct[0].start === 7200000 && oct[1].sfarsit - oct[1].start === 7200000);

  const mar = ferestreleUrmatoare(new Date('2027-03-26T10:00:00Z'), IMPLICIT); // vineri, DST incepe duminica 28 mar
  ok('DST mar: sambata 27 mar 18:00 = 16:00 UTC (EET)', mar[0].id === '2027-03-27-1800' && iso(mar[0].start) === '2027-03-27T16:00:00.000Z', iso(mar[0].start));
  ok('DST mar: duminica 28 mar 18:00 = 15:00 UTC (EEST)', mar[1].id === '2027-03-28-1800' && iso(mar[1].start) === '2027-03-28T15:00:00.000Z', iso(mar[1].start));
}

// --- 3. subsolul din config ----------------------------------------------------
{
  ok('subsol: implicit', W.subsol(IMPLICIT) === 'Urmatorul warp-in: sambata si duminica, 18:00', W.subsol(IMPLICIT));
  ok('subsol: config alt', W.subsol({ ...IMPLICIT, zile: [5], ora: 20, minut: 30 }) === 'Urmatorul warp-in: vineri, 20:30');
  ok('subsol: trei zile', W.textZile({ zile: [1, 3, 5] }) === 'luni, miercuri si vineri');
}

// --- client Discord simulat ----------------------------------------------------
const trimise = [];
let sendEsueaza = false;
const general = {
  id: 'c-general', name: 'general', type: 0,
  send: async (x) => { if (sendEsueaza) throw new Error('Missing Permissions'); trimise.push(x); return { id: 'm' + trimise.length }; },
};
const membru = (id, { bot = false, selfDeaf = false } = {}) => ({ id, user: { bot }, voice: { selfDeaf } });
const lobby = { id: 'c-lobby', name: 'Lobby', type: 2, userLimit: 0, members: new Map() };
const afk = { id: 'c-afk', name: 'AFK', type: 2, userLimit: 0, members: new Map() };
const solo = { id: 'c-solo', name: 'Solo', type: 2, userLimit: 1, members: new Map() };
const evenimente = [];
let potCreaEvenimente = true;
const guild = {
  id: 'g1',
  afkChannelId: 'c-afk',
  channels: { cache: new Collection([[general.id, general], [lobby.id, lobby], [afk.id, afk], [solo.id, solo]]) },
  members: { me: { permissions: { has: (bit) => potCreaEvenimente } }, fetch: async (id) => ({ displayName: id }) },
  scheduledEvents: { create: async (o) => { evenimente.push(o); return { id: 'ev' + evenimente.length }; } },
};
const client = new EventEmitter();
client.guilds = { cache: new Map([[guild.id, guild]]) };
const cfg = { guild: 'g1', moneda: '◈', canale: { general: 'general' }, puncte: { peMinutVoce: 2, plafonZilnic: 600 } };

const stare = () => JSON.parse(fs.readFileSync(path.join(DIR, 'warpin.json'), 'utf8'));
const START = new Date('2026-09-05T15:00:00Z'); // sambata 18:00 local
const la = (minute) => new Date(START.getTime() + minute * 60000);

lobby.members.set('u1', membru('u1'));
lobby.members.set('u2', membru('u2', { selfDeaf: true }));
lobby.members.set('bot', membru('bot', { bot: true }));
afk.members.set('u3', membru('u3'));
solo.members.set('u4', membru('u4'));

// --- 4. participantii de pe voce -----------------------------------------------
{
  const p = W.participantiiDePeVoce(guild).map((m) => m.id);
  ok('voce: doar u1 (fara bot, fara selfDeaf, fara AFK, fara userLimit 1)', p.join(',') === 'u1', p.join(','));
}

// --- 5. T-60: preanunt + eveniment, un anunt esuat NU se marcheaza -----------------
{
  sendEsueaza = true;
  await W.tick(client, cfg, la(-60));
  ok('preanunt: esecul nu marcheaza pasul', trimise.length === 0 && stare()['2026-09-05-1800'].preanunt === false);
  ok('eveniment: creat cu 72 h inainte (sambata si duminica), tip Voice in Lobby', evenimente.length === 2 && evenimente[0].entityType === 2 && evenimente[0].channel === 'c-lobby' && stare()['2026-09-05-1800'].eveniment === 'ev1');
  ok('eveniment: orele corecte', evenimente[0].scheduledStartTime.getTime() === START.getTime() && evenimente[0].scheduledEndTime.getTime() === la(120).getTime());

  sendEsueaza = false;
  await W.tick(client, cfg, la(-59));
  ok('preanunt: postat la T-59 dupa esec, cu linkul evenimentului', trimise.length === 1 && /Warp-in/.test(trimise[0].content) && trimise[0].content.includes('https://discord.com/events/g1/ev1'));
  ok('preanunt: marcat in stare', stare()['2026-09-05-1800'].preanunt === true);

  await W.tick(client, cfg, la(-30));
  ok('preanunt: nu se repeta, nici evenimentele', trimise.length === 1 && evenimente.length === 2);
  ok('preanunt: textul e ales stabil din id', W.PREANUNTURI.length === 3 && W.DESCHIDERI.length === 3);
}

// --- 6. T-0 si fereastra: anunt + bonus pe minut -------------------------------------
{
  await W.tick(client, cfg, la(0));
  ok('start: anuntul de deschidere', trimise.length === 2 && /inceput|deschis|Warp-in/.test(trimise[1].content));
  ok('start: marcat', stare()['2026-09-05-1800'].start === true);
  await W.tick(client, cfg, la(1));
  await W.tick(client, cfg, la(1)); // acelasi minut, nu dubleaza
  await W.tick(client, cfg, la(2));
  const s = stare()['2026-09-05-1800'];
  ok('bonus: u1 are 3 minute si 6 credite', s.participanti.u1?.minute === 3 && s.participanti.u1?.bonus === 6, JSON.stringify(s.participanti));
  ok('bonus: acelasi minut nu se acorda de doua ori', store.utilizator('u1').sold === 6);
  ok('bonus: trece prin plafonul zilnic comun (castigatAzi)', store.utilizator('u1').castigatAzi === 6);
  ok('bonus: u2 (deaf), u3 (AFK), u4 (limit 1), bot nu primesc', !s.participanti.u2 && !s.participanti.u3 && !s.participanti.u4 && !s.participanti.bot);
  ok('start: nu se repeta anuntul', trimise.length === 2);
}

// --- 7. T+durata: rezumat ----------------------------------------------------------
{
  lobby.members.set('u5', membru('u5'));
  await W.tick(client, cfg, la(3));
  await W.tick(client, cfg, la(120));
  ok('final: rezumatul e un embed', trimise.length === 3 && Array.isArray(trimise[2].embeds) && trimise[2].embeds.length === 1);
  const e = trimise[2].embeds[0].toJSON();
  ok('final: numara pilotii, minutele si bonusul', e.description.includes('2 piloti') && e.description.includes('5 minute') && e.description.includes('10 bonus'), e.description);
  ok('final: top prezenta cu u1 primul', e.fields?.[0]?.value.startsWith('**1.** <@u1>'));
  ok('final: subsolul din config', e.footer?.text === 'Urmatorul warp-in: sambata si duminica, 18:00');
  ok('final: marcat', stare()['2026-09-05-1800'].final === true);
  await W.tick(client, cfg, la(121));
  ok('final: nu se repeta', trimise.length === 3);
  ok('final: dupa fereastra nu se mai acorda', stare()['2026-09-05-1800'].participanti.u1.minute === 4);
}

// --- 8. plafonul propriu per fereastra (duminica) ------------------------------------
{
  const DUM = new Date('2026-09-06T15:00:00Z');
  const cfg2 = { ...cfg, warpin: { plafonBonusZi: 3 } };
  lobby.members.delete('u5');
  const soldInainte = store.utilizator('u1').sold;
  for (let m = 0; m < 5; m++) await W.tick(client, cfg2, new Date(DUM.getTime() + m * 60000));
  const s = stare()['2026-09-06-1800'];
  ok('plafon fereastra: 5 minute numarate, bonus oprit la 3', s.participanti.u1.minute === 5 && s.participanti.u1.bonus === 3, JSON.stringify(s.participanti.u1));
  ok('plafon fereastra: soldul a crescut exact cu 3', store.utilizator('u1').sold === soldInainte + 3);
}

// --- 9. tacere daca e gol ---------------------------------------------------------
{
  lobby.members.clear();
  const n = trimise.length;
  const SAMB = new Date('2026-09-12T15:00:00Z');
  await W.tick(client, cfg, new Date(SAMB.getTime() + 30 * 60000));
  await W.tick(client, cfg, new Date(SAMB.getTime() + 120 * 60000));
  ok('gol: deschiderea se posteaza, rezumatul nu', trimise.length === n + 1 && stare()['2026-09-12-1800'].final === true);
}

// --- 10. fara permisiune de evenimente, starea tine cel mult 8 ferestre --------------------
{
  potCreaEvenimente = false;
  const nEv = evenimente.length;
  await W.tick(client, cfg, new Date('2026-09-18T12:00:00Z')); // vineri, sub 72 h de sambata
  ok('eveniment: fara CreateEvents/ManageEvents nu se creeaza', evenimente.length === nEv);
  potCreaEvenimente = true;
  for (let z = 0; z < 6; z++) {
    const d = new Date('2026-10-03T15:00:00Z'); // sambata
    d.setUTCDate(d.getUTCDate() + z * 7);
    await W.tick(client, cfg, new Date(d.getTime() + 60000));
  }
  ok('stare: cel mult 8 ferestre pastrate', Object.keys(stare()).length <= 8, String(Object.keys(stare()).length));
}

// --- 11. porneste se aboneaza la clientReady ---------------------------------------------
{
  const c2 = new EventEmitter(); c2.guilds = client.guilds;
  porneste(c2, cfg);
  ok('porneste: asculta clientReady', c2.listenerCount('clientReady') === 1);
}

fs.rmSync(DIR, { recursive: true, force: true });
console.log(`\n${trecute} verificari trecute, ${picate} picate`);
process.exit(picate === 0 ? 0 : 1);
