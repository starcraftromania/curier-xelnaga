// Verificari pentru Intrebarea zilei si cele 105 dileme, fara Discord.
// Se ruleaza cu: node test/intrebarea-zilei.test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Collection } from 'discord.js';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cetatea-iz-'));
process.env.DATA_DIR = DIR;

let trecute = 0; let picate = 0;
function ok(nume, conditie, detaliu = '') {
  if (conditie) { trecute++; } else { picate++; console.error(`  PICAT: ${nume} ${detaliu}`); }
}

const { DILEME } = await import('../src/dileme.js');
const { _intern: IZ, IMPLICIT, porneste } = await import('../src/intrebarea-zilei.js');

// --- 1. dilemele ---------------------------------------------------------------
{
  ok('dileme: exact 105', DILEME.length === 105, `(${DILEME.length})`);
  ok('dileme: fiecare are q string si 2..4 optiuni string', DILEME.every((d) => typeof d.q === 'string' && d.q.length > 0 && Array.isArray(d.o) && d.o.length >= 2 && d.o.length <= 4 && d.o.every((o) => typeof o === 'string' && o.length > 0)));
  const qLungi = DILEME.filter((d) => d.q.length > 250);
  ok('dileme: intrebari <= 250 de caractere', qLungi.length === 0, `(${qLungi.length})`);
  const oLungi = DILEME.flatMap((d) => d.o).filter((o) => o.length > 55);
  ok('dileme: optiuni <= 55 de caractere', oLungi.length === 0, `(${oLungi.length}) ${oLungi[0] ?? ''}`);
  const dupQ = DILEME.length - new Set(DILEME.map((d) => d.q.trim().toLowerCase())).size;
  ok('dileme: zero intrebari duplicate', dupQ === 0, `(${dupQ})`);
  const dupO = DILEME.filter((d) => new Set(d.o).size !== d.o.length);
  ok('dileme: fara optiuni duplicate in aceeasi intrebare', dupO.length === 0, `(${dupO.length})`);
  const diacritice = DILEME.filter((d) => /[^\x00-\x7F]/.test(d.q + d.o.join('')));
  ok('dileme: fara diacritice (ASCII curat)', diacritice.length === 0, `(${diacritice.length})`);
  const ro = DILEME.filter((d) => /server|comunitat|romani|turneu|Cetatea/i.test(d.q));
  ok('dileme: exista intrebari despre comunitatea romaneasca', ro.length >= 10, `(${ro.length})`);
  ok('dileme: exista intrebari despre patch 5.0.16', DILEME.filter((d) => /5\.0\.16/.test(d.q)).length >= 3);
}

// --- 2. punga - functii pure -----------------------------------------------------
{
  const st = { punga: [], pozitie: 0 };
  const v = []; for (let i = 0; i < 105; i++) v.push(IZ.urmatorulIndex(st, 105));
  ok('punga: 105 extrageri fara repetitie, acopera 0..104', new Set(v).size === 105 && Math.min(...v) === 0 && Math.max(...v) === 104);
  ok('punga: pozitia a ajuns la capat', st.pozitie === 105);
  const urm = IZ.urmatorulIndex(st, 105);
  ok('punga: dupa 105 se reface si nu repeta ultima la granita', st.pozitie === 1 && urm !== v[104]);
  let rele = 0;
  for (let k = 0; k < 300; k++) {
    const s2 = { punga: [], pozitie: 0 };
    const w = []; for (let i = 0; i < 7; i++) w.push(IZ.urmatorulIndex(s2, 6));
    if (w[6] === w[5]) rele++;
  }
  ok('punga: nicio repetitie peste granita (300 de cicluri de 6)', rele === 0, `(${rele})`);
  const corupt = { punga: [1, 1, 2], pozitie: 99 };
  ok('punga: starea corupta se reface curat', Number.isInteger(IZ.urmatorulIndex(corupt, 105)) && corupt.punga.length === 105 && corupt.pozitie === 1);
  const veche = { punga: Array.from({ length: 50 }, (_, i) => i), pozitie: 10 };
  IZ.urmatorulIndex(veche, 105);
  ok('punga: marimea schimbata a bancii -> punga noua', veche.punga.length === 105 && veche.pozitie === 1);
}

// --- 3. fereastra orara ------------------------------------------------------------
{
  const s = { ultimaZi: null };
  ok('moment: 18:59 nu', IZ.eMomentul(s, new Date('2026-09-04T15:59:00Z')) === false);
  ok('moment: 19:00 da', IZ.eMomentul(s, new Date('2026-09-04T16:00:00Z')) === true);
  ok('moment: 21:59 inca da (boot tarziu)', IZ.eMomentul(s, new Date('2026-09-04T18:59:00Z')) === true);
  ok('moment: 22:00 nu, s-a renuntat pe ziua aia', IZ.eMomentul(s, new Date('2026-09-04T19:00:00Z')) === false);
  ok('moment: deja postat azi -> nu', IZ.eMomentul({ ultimaZi: '2026-09-04' }, new Date('2026-09-04T16:30:00Z')) === false);
  ok('moment: config ora 20:30', IZ.eMomentul(s, new Date('2026-09-04T17:29:00Z'), { ...IMPLICIT, ora: 20, minut: 30 }) === false && IZ.eMomentul(s, new Date('2026-09-04T17:30:00Z'), { ...IMPLICIT, ora: 20, minut: 30 }) === true);
}

// --- client Discord simulat -----------------------------------------------------------
const trimise = [];
const reactii = [];
let pollEsueaza = false;
let totulEsueaza = false;
const general = {
  id: 'c-general', name: 'general', type: 0,
  send: async (x) => {
    if (totulEsueaza) throw new Error('Missing Access');
    if (x.poll && pollEsueaza) throw new Error('Invalid Form Body: poll');
    trimise.push(x);
    return { id: 'm' + trimise.length, react: async (e) => { reactii.push(e); } };
  },
};
const guild = { id: 'g1', channels: { cache: new Collection([[general.id, general]]) }, members: { fetch: async () => ({ displayName: 'x' }) } };
const client = new EventEmitter();
client.guilds = { cache: new Map([[guild.id, guild]]) };
const cfg = { guild: 'g1', moneda: '◈', canale: { general: 'general' } };
const stare = () => JSON.parse(fs.readFileSync(path.join(DIR, 'intrebarea-zilei.json'), 'utf8'));

// --- 4. poll nativ la 19:00 --------------------------------------------------------------
{
  const r0 = await IZ.tick(client, cfg, new Date('2026-09-04T15:30:00Z'));
  ok('tick: inainte de 19:00 nu posteaza', r0 === null && trimise.length === 0);

  const r = await IZ.tick(client, cfg, new Date('2026-09-04T16:00:00Z'));
  ok('tick: la 19:00 posteaza un poll nativ', r?.mod === 'poll' && trimise.length === 1 && !!trimise[0].poll);
  const p = trimise[0].poll;
  ok('poll: forma exacta (question.text, answers[].text, duration 24, allowMultiselect false)',
    typeof p.question?.text === 'string' && Array.isArray(p.answers) && p.answers.every((a) => typeof a.text === 'string') && p.duration === 24 && p.allowMultiselect === false);
  ok('poll: intrebarea si optiunile vin din dilema aleasa', p.question.text === r.dilema.q && p.answers.length === r.dilema.o.length);
  const s = stare();
  ok('stare: punga de 105, pozitie 1, ultimaZi', s.punga.length === 105 && s.pozitie === 1 && s.ultimaZi === '2026-09-04');

  const r2 = await IZ.tick(client, cfg, new Date('2026-09-04T17:00:00Z'));
  ok('tick: a doua oara in aceeasi zi nu posteaza', r2 === null && trimise.length === 1);

  const r3 = await IZ.tick(client, cfg, new Date('2026-09-05T16:00:00Z'));
  ok('tick: a doua zi posteaza alta dilema', r3?.idx !== undefined && r3.idx !== r.idx && stare().pozitie === 2 && stare().ultimaZi === '2026-09-05');
}

// --- 5. caderea pe embed cu reactii --------------------------------------------------------
{
  pollEsueaza = true;
  const erori = [];
  const vechi = console.error; console.error = (...a) => erori.push(a.join(' '));
  const r = await IZ.tick(client, cfg, new Date('2026-09-06T16:05:00Z'));
  console.error = vechi;
  ok('fallback: cade pe embed', r?.mod === 'embed' && trimise.length === 3 && Array.isArray(trimise[2].embeds));
  const e = trimise[2].embeds[0].toJSON();
  ok('fallback: embedul contine intrebarea si optiunile numerotate', e.description.includes(r.dilema.q) && e.description.includes('1️⃣') && e.description.includes('2️⃣'));
  ok('fallback: reactii 1..N', reactii.length === r.dilema.o.length && reactii[0] === '1️⃣');
  ok('fallback: motivul e scris in consola', erori.some((x) => /poll-ul nativ a esuat/.test(x)));
  ok('fallback: starea avanseaza', stare().pozitie === 3 && stare().ultimaZi === '2026-09-06');
  pollEsueaza = false;
}

// --- 6. esec total -> punga neatinsa, se reincearca ------------------------------------------
{
  totulEsueaza = true;
  const vechi = console.error; console.error = () => {};
  const r = await IZ.tick(client, cfg, new Date('2026-09-07T16:00:00Z'));
  console.error = vechi;
  ok('esec: nu marcheaza ziua si nu avanseaza punga', r === null && stare().pozitie === 3 && stare().ultimaZi === '2026-09-06');
  totulEsueaza = false;
  const r2 = await IZ.tick(client, cfg, new Date('2026-09-07T16:01:00Z'));
  ok('esec: minutul urmator reuseste', r2?.mod === 'poll' && stare().pozitie === 4);
}

// --- 7. boot dupa 22:00 -> renunta ------------------------------------------------------------
{
  const n = trimise.length;
  const r = await IZ.tick(client, cfg, new Date('2026-09-08T19:30:00Z')); // 22:30 local
  ok('tarziu: dupa 22:00 nu mai posteaza', r === null && trimise.length === n);
}

// --- 8. pollNativ dezactivat din config -------------------------------------------------------
{
  const r = await IZ.tick(client, { ...cfg, intrebareaZilei: { pollNativ: false } }, new Date('2026-09-09T16:00:00Z'));
  ok('config: pollNativ=false -> direct embed', r?.mod === 'embed');
  const c2 = new EventEmitter(); c2.guilds = client.guilds;
  porneste(c2, cfg);
  ok('porneste: asculta clientReady', c2.listenerCount('clientReady') === 1);
}

fs.rmSync(DIR, { recursive: true, force: true });
console.log(`\n${trecute} verificari trecute, ${picate} picate`);
process.exit(picate === 0 ? 0 : 1);
