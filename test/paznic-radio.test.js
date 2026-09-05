// Verificari pentru paznicul radioului, fara Discord real. Ruleaza: node test/paznic-radio.test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cetatea-paznic-'));
process.env.DATA_DIR = DIR;

const { porneste, DEFINITII, _intern, SEMN_FAR } = await import('../src/paznic-radio.js');
const { ID } = await import('../src/comun.js');

let trecute = 0; let picate = 0;
function ok(nume, conditie, detaliu = '') {
  if (conditie) trecute++;
  else { picate++; console.error(`  PICAT: ${nume} ${detaliu}`); }
}
const MIN = 60_000;

// --- Discord simulat ---------------------------------------------------------
class Colectie extends Map {
  find(fn) { for (const v of this.values()) if (fn(v)) return v; return undefined; }
  filter(fn) { const c = new Colectie(); for (const [k, v] of this) if (fn(v)) c.set(k, v); return c; }
  first() { return this.values().next().value; }
}

const jurnal = [];
const dmuri = [];
let reteaCazuta = false;
let fetchuri = { individuale: 0, loturi: 0 };

const client = new EventEmitter();
client.guilds = { cache: new Colectie() };
client.users = { fetch: async (id) => ({ id, send: async (m) => { dmuri.push({ id, m }); return { id: 'dm' }; } }) };
const guild = {
  id: 'g1',
  roles: { everyone: { id: 'everyone' } },
  members: { me: { id: 'bot' } },
  channels: { cache: new Colectie() },
};
client.guilds.cache.set('g1', guild);

const mesaje = new Colectie();     // #off-topic
function canalText(id, name, { potScrie = true } = {}) {
  const c = {
    id, name, type: 0, guild,
    async send(m) { jurnal.push({ id, m }); return { id: 'x' }; },
    permissionsFor: () => ({ has: () => potScrie }),
    messages: {
      fetch: async (arg) => {
        if (reteaCazuta) { const e = new Error('fetch failed'); e.code = 'ECONNRESET'; throw e; }
        if (typeof arg === 'string') {
          fetchuri.individuale++;
          const m = mesaje.get(arg);
          if (!m) { const e = new Error('Unknown Message'); e.code = 10008; throw e; }
          return m;
        }
        fetchuri.loturi++;
        return mesaje.filter(() => true);
      },
    },
  };
  guild.channels.cache.set(id, c);
  return c;
}
const offTopic = canalText(ID.offTopic, 'off-topic');
canalText('gen', 'general');
canalText('mod', 'moderator-only');

let T = Date.parse('2026-09-05T20:00:00Z');
_intern.ceas.acum = () => T;

// zgomot + farul
mesaje.set('m1', { id: 'm1', author: { id: 'u1' }, content: 'Farul Cetatii? ce e ala', createdTimestamp: T - 100 * MIN, editedTimestamp: null });
mesaje.set('m2', { id: 'm2', author: { id: ID.appRadio }, content: 'Radio Xel\'Naga: playlistul de seara', createdTimestamp: T - 90 * MIN, editedTimestamp: null });
const far = { id: 'm3', author: { id: ID.appRadio }, content: '📡 Farul Cetatii bate. Ultima bataie: 20:00', createdTimestamp: T - 3 * 24 * 60 * MIN, editedTimestamp: T - 2 * MIN };
mesaje.set('m3', far);

porneste(client, { guild: 'g1', canale: { general: 'general' } });
ok('definitii: zero comenzi', Array.isArray(DEFINITII) && DEFINITII.length === 0);

const publice = () => jurnal.filter((j) => j.id === 'gen').map((j) => j.m);
const staff = () => jurnal.filter((j) => j.id === 'mod').map((j) => j.m);
const stare = () => JSON.parse(fs.readFileSync(path.join(DIR, 'paznic-radio.json'), 'utf8'));

// 1. gasirea farului dupa autor + text, pe editedTimestamp
let r = await _intern.tick(client);
ok('far: gasit prin scanarea ultimelor 50 (autor Radio + "Farul Cetatii")', r === 'ok' && stare().mesajId === 'm3');
ok('far: fara alerta cand e proaspat', publice().length === 0 && dmuri.length === 0);
ok('far: id-ul e tinut in paznic-radio.json', _intern.starea().mesajId === 'm3');

// 2. a doua oara merge direct pe id
fetchuri = { individuale: 0, loturi: 0 };
T += 5 * MIN; far.editedTimestamp = T - 1 * MIN;
r = await _intern.tick(client);
ok('far: a doua oara se citeste dupa id, fara scanare', r === 'ok' && fetchuri.individuale === 1 && fetchuri.loturi === 0);

// 3. vechime 15 min: inca sub prag
T += 15 * MIN;
r = await _intern.tick(client);
ok('prag: la 16 min nu se alerteaza', r === 'ok' && publice().length === 0);

// 4. vechime > 20 min: alerta pe toate cele 3 cai, o singura data
T += 5 * MIN;                         // 21 min de la ultima bataie
r = await _intern.tick(client);
ok('alerta: la >20 min se alerteaza', r === 'alerta');
ok('alerta: DM catre Snac', dmuri.length === 1 && dmuri[0].id === ID.snac && /cazut/.test(dmuri[0].m));
ok('alerta: mesaj in #general', publice().length === 1 && /Radio/.test(publice()[0]));
ok('alerta: mesaj in moderator-only', staff().length === 1);
ok('alerta: indica portalul Azure si VM-ul radio-xelnaga', /radio-xelnaga/.test(publice()[0]) && /Azure/.test(publice()[0]));
ok('alerta: cazutDe = momentul ultimei batai', stare().cazutDe === new Date(far.editedTimestamp).toISOString() && !!stare().ultimaAlerta);

T += 5 * MIN;
r = await _intern.tick(client);
ok('alerta: fara alerta dubla la tick-ul urmator', r === 'cazut' && publice().length === 1 && dmuri.length === 1);

T += 60 * MIN;
r = await _intern.tick(client);
ok('alerta: la 65 min inca nu e reamintire', r === 'cazut' && publice().length === 1);

// 5. reamintirea la 120 min
T += 55 * MIN;                        // 120 min de la alerta
r = await _intern.tick(client);
ok('reamintire: la 120 min de la alerta se reaminteste', r === 'reamintire' && publice().length === 2 && /in continuare/.test(publice()[1]));
ok('reamintire: DM si pentru reamintire', dmuri.length === 2);

// 6. pe timpul caderii pica si reteaua: tacere
reteaCazuta = true;
T += 130 * MIN;
r = await _intern.tick(client);
ok('retea: eroarea de retea nu produce alerta, doar log', r === 'eroare' && publice().length === 2 && dmuri.length === 2);
reteaCazuta = false;

// 7. revenirea: mesaj cu durata caderii
far.editedTimestamp = T - 1 * MIN;
r = await _intern.tick(client);
ok('revenire: mesaj de revenire in #general si DM', r === 'revenit' && publice().length === 3 && /revenit/.test(publice()[2]) && dmuri.length === 3);
ok('revenire: durata caderii e cea de la ultima bataie', /caderea a tinut 4h 3[0-9]min|caderea a tinut 4h 4[0-9]min/.test(publice()[2]), `(${publice()[2]})`);
ok('revenire: starea e curata', stare().cazutDe === null && stare().ultimaAlerta === null);
ok('revenire: nu merge in moderator-only (doar alerta si reamintirea au ajuns acolo)', staff().length === 2);

T += 5 * MIN;
r = await _intern.tick(client);
ok('revenire: dupa revenire, tick-ul e linistit', r === 'ok' && publice().length === 3);

// 8. farul sters si recreat cu alt id -> rescanare
mesaje.delete('m3');
const far2 = { id: 'm4', author: { id: ID.appRadio }, content: 'Farul Cetatii bate iar', createdTimestamp: T - 1 * MIN, editedTimestamp: null };
mesaje.set('m4', far2);
r = await _intern.tick(client);
ok('far: id vechi disparut -> rescanare si id nou', r === 'ok' && stare().mesajId === 'm4');

// 9. farul lipseste cu totul -> tacere (nu tipa pe necunoastere)
mesaje.delete('m4');
r = await _intern.tick(client);
ok('far: lipsa farului nu produce alerta', r === 'fara-far' && publice().length === 3 && dmuri.length === 3);

// 10. canal de staff in care nu poate scrie -> alerta merge pe restul, o singura avertizare
{
  mesaje.set('m5', { id: 'm5', author: { id: ID.appRadio }, content: 'Farul Cetatii', createdTimestamp: T - 30 * MIN, editedTimestamp: null });
  const mod = guild.channels.cache.get('mod');
  mod.permissionsFor = () => ({ has: () => false });
  const avertismente = [];
  const warnVechi = console.warn; console.warn = (...a) => avertismente.push(a.join(' '));
  r = await _intern.tick(client);
  T += 125 * MIN;
  await _intern.tick(client);
  console.warn = warnVechi;
  ok('staff: fara drept de scriere alerta merge pe DM + #general', r === 'alerta' && publice().length === 5 && staff().length === 2);
  ok('staff: avertisment in log o singura data', avertismente.filter((a) => /staff/.test(a)).length === 1, `(${avertismente.length})`);
}

// 11. dezactivat din config
{
  const client2 = new EventEmitter();
  porneste(client2, { guild: 'g1', paznicRadio: { activ: false } });
  ok('config: activ=false nu leaga niciun ascultator', client2.listenerCount('clientReady') === 0);
}

// 12. durata
ok('durata: formatare', _intern.durata(5 * MIN) === '5 min' && _intern.durata(125 * MIN) === '2h 5min' && _intern.durata(26 * 60 * MIN) === '1z 2h');

fs.rmSync(DIR, { recursive: true, force: true });
console.log(`\n${trecute} verificari trecute, ${picate} picate`);
process.exit(picate === 0 ? 0 : 1);
