// Verificari pentru Pilonul Cetatii, fara Discord real. Ruleaza: node test/pilon.test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cetatea-pilon-'));
process.env.DATA_DIR = DIR;

const { porneste, DEFINITII, _intern, NUME_TURN } = await import('../src/pilon.js');

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
let urmatorulId = 100;

const client = new EventEmitter();
client.guilds = { cache: new Colectie() };
const guild = {
  id: 'g1', afkChannelId: 'afk',
  roles: { everyone: { id: 'everyone' } },
  members: { me: { id: 'bot', permissions: { has: () => true }, roles: { highest: { position: 5 } } } },
  channels: { cache: new Colectie() },
};
guild.channels.create = async (opt) => {
  jurnal.push({ ce: 'create', opt });
  return canalNou({ id: String(urmatorulId++), name: opt.name, type: opt.type, parentId: opt.parent ?? null, userLimit: opt.userLimit ?? 0 });
};
client.guilds.cache.set('g1', guild);

function canalNou({ id, name, type = 2, parentId = null, userLimit = 0 }) {
  const c = {
    id, name, type, parentId, userLimit, guild,
    members: new Colectie(),
    async setName(n) { jurnal.push({ ce: 'setName', id, n }); this.name = n; },
    async send(m) { jurnal.push({ ce: 'send', id, m }); return { id: 'm' + urmatorulId++ }; },
  };
  guild.channels.cache.set(id, c);
  return c;
}

function membru(id, nume, bot = false) {
  return { id, displayName: nume, guild, user: { id, bot, username: nume }, voice: { channelId: null, channel: null } };
}

// intrarea/iesirea din voce: actualizeaza cache-ul INAINTE de eveniment, ca discord.js
async function muta(m, canal) {
  const vechi = { channelId: m.voice.channelId, channel: m.voice.channel, member: m, guild };
  if (m.voice.channel) m.voice.channel.members.delete(m.id);
  m.voice.channelId = canal?.id ?? null;
  m.voice.channel = canal ?? null;
  if (canal) canal.members.set(m.id, m);
  const nou = { channelId: m.voice.channelId, channel: m.voice.channel, member: m, guild };
  await _intern.peVoice(vechi, nou);
}

const general = canalNou({ id: 'gen', name: 'general', type: 0 });
const afk = canalNou({ id: 'afk', name: 'AFK', type: 2 });
const portal = canalNou({ id: 'portal', name: '➕ Creeaza camera', type: 2, userLimit: 1 });
const lobby = canalNou({ id: 'lobby', name: 'Lobby', type: 2 });
const arena = canalNou({ id: 'arena', name: 'Arena', type: 2 });

let T = Date.parse('2026-09-05T18:00:00Z');
_intern.ceas.acum = () => T;
const anunturi = () => jurnal.filter((j) => j.ce === 'send' && j.id === 'gen').map((j) => j.m);

porneste(client, { guild: 'g1', canale: { general: 'general' }, pilon: { racireAprinzatorMin: 45, racireMasaMin: 90, pragMasa: 3, intervalContorMin: 10 } });

ok('definitii: zero comenzi', Array.isArray(DEFINITII) && DEFINITII.length === 0);

// --- aprinzatorul ------------------------------------------------------------------
const ana = membru('u1', 'Ana');
const bogdan = membru('u2', 'Bogdan');
const cezar = membru('u3', 'Cezar');
const dan = membru('u4', 'Dan');
const radio = membru('b1', 'Radio', true);

await muta(radio, lobby);
ok('aprinzator: un bot nu aprinde nimic', anunturi().length === 0);

await muta(ana, afk);
ok('aprinzator: AFK nu conteaza', anunturi().length === 0);
await muta(ana, portal);
ok('aprinzator: portalul (userLimit 1) nu conteaza', anunturi().length === 0);

await muta(ana, lobby);
ok('aprinzator: primul om pe voce e anuntat in #general', anunturi().length === 1 && anunturi()[0].includes('Ana') && anunturi()[0].includes('Lobby'));

await muta(ana, null);
T += 10 * MIN;
await muta(ana, lobby);
ok('aprinzator: in racire (10 min) nu se repeta', anunturi().length === 1);

await muta(ana, null);
T += 40 * MIN;                      // 50 min de la primul anunt
await muta(bogdan, arena);
ok('aprinzator: dupa racire, urmatorul prim om e anuntat', anunturi().length === 2 && anunturi()[1].includes('Bogdan') && anunturi()[1].includes('Arena'));

await muta(ana, arena);
ok('aprinzator: al doilea om nu e "primul"', anunturi().length === 2);

// --- pragul de 3 -------------------------------------------------------------------
await muta(cezar, arena);
ok('masa: al treilea in acelasi canal declanseaza warp-in in masa', anunturi().length === 3 && /Warp-in in masa/.test(anunturi()[2]) && anunturi()[2].includes('Arena') && anunturi()[2].includes('3'));

await muta(dan, arena);
ok('masa: al patrulea nu mai declanseaza', anunturi().length === 3);

await muta(dan, null); await muta(cezar, null);
T += 5 * MIN;
await muta(cezar, arena);
ok('masa: in racire (90 min) nu se repeta', anunturi().length === 3);

T += 90 * MIN;
await muta(cezar, null); await muta(cezar, arena);
ok('masa: dupa racire se anunta din nou', anunturi().length === 4 && /Warp-in in masa/.test(anunturi()[3]));

await muta(ana, lobby);
ok('masa: 3 oameni raspanditi in 2 canale nu inseamna masa', anunturi().length === 4);

const st = JSON.parse(fs.readFileSync(path.join(DIR, 'pilon.json'), 'utf8'));
ok('stare: racirile sunt persistate', st.ultimulAprinzator > 0 && st.ultimulMasa > 0);

// --- contorul de front --------------------------------------------------------------
// goleste vocea
for (const m of [ana, bogdan, cezar, dan, radio]) await muta(m, null);

let nume = await _intern.tickContor(client);
const contor = guild.channels.cache.get(_intern.starea().contorId);
ok('contor: canalul e creat la primul tick', !!contor && contor.type === 2 && !contor.parentId);
ok('contor: numele initial e Turnul de veghe', contor.name === NUME_TURN && nume === NUME_TURN);
const creare = jurnal.find((j) => j.ce === 'create' && j.opt.name === NUME_TURN);
ok('contor: e incuiat (Connect deny pentru @everyone)', !!creare.opt.permissionOverwrites?.some((o) => o.id === 'everyone' && Array.isArray(o.deny) && o.deny.length === 1));
ok('contor: id-ul e persistat', JSON.parse(fs.readFileSync(path.join(DIR, 'pilon.json'), 'utf8')).contorId === contor.id);

const redenumiri = () => jurnal.filter((j) => j.ce === 'setName' && j.id === contor.id);
await _intern.tickContor(client);
ok('contor: fara schimbare de nume nu se redenumeste', redenumiri().length === 0);

await muta(ana, lobby); await muta(bogdan, lobby);
T += 10 * MIN;
nume = await _intern.tickContor(client);
ok('contor: fara ladder arata "In voice: N"', nume === '🔊 In voice: 2' && contor.name === nume && redenumiri().length === 1);

await muta(cezar, lobby);
T += 3 * MIN;
await _intern.tickContor(client);
ok('contor: nu redenumeste la mai putin de 10 min de la ultima redenumire', redenumiri().length === 1);

T += 7 * MIN;
await _intern.tickContor(client);
ok('contor: dupa 10 min redenumeste cu noul numar', redenumiri().length === 2 && contor.name === '🔊 In voice: 3');

T += 10 * MIN;
await _intern.tickContor(client);
ok('contor: numele neschimbat nu consuma redenumire', redenumiri().length === 2);

// contorul insusi si botii nu se numara
ok('contor: oameniPeVoce ignora botii, AFK, portalul', _intern.oameniPeVoce(guild) === 3);

// ladder: buletin.json tolerant
fs.writeFileSync(path.join(DIR, 'buletin.json'), JSON.stringify({
  snapshotZi: { 'eu-1': { wins: 10, losses: 5 }, 'eu-2': 7 },
  echipe: [
    { legacyUid: 'eu-1', wins: 12, losses: 6, lastPlayed: new Date(T - 5 * MIN).toISOString() },
    { legacyUid: 'eu-2', wins: 8, losses: 1, lastPlayed: new Date(T - 60 * MIN).toISOString() },
    { legacyUid: 'eu-3', wins: 3, losses: 3, snapshotZi: { wins: 3, losses: 3 }, lastPlayed: null },
    null,
  ],
}));
const ladder = _intern.citesteLadder(T);
ok('ladder: in lupta = echipele cu lastPlayed in ultimele 20 min', ladder.inLupta === 1);
ok('ladder: meciuri azi = diferenta fata de snapshot', ladder.meciuriAzi === 3 + 2 + 0, `(${ladder.meciuriAzi})`);

T += 10 * MIN;
await _intern.tickContor(client);
ok('contor: cu ladder arata "In lupta: voce+ladder · azi: M meciuri"', contor.name === '⚔️ In lupta: 4 · azi: 5 meciuri', `(${contor.name})`);

fs.writeFileSync(path.join(DIR, 'buletin.json'), '{ stricat');
ok('ladder: fisier corupt -> fara date de ladder', _intern.citesteLadder(T) === null);
fs.rmSync(path.join(DIR, 'buletin.json'));
ok('ladder: fisier lipsa -> fara date de ladder', _intern.citesteLadder(T) === null);

for (const m of [ana, bogdan, cezar]) await muta(m, null);
T += 10 * MIN;
await _intern.tickContor(client);
ok('contor: cand nu e nimeni revine la Turnul de veghe', contor.name === NUME_TURN);

// restart: contorul existent e regasit, nu duplicat
{
  const creariInainte = jurnal.filter((j) => j.ce === 'create').length;
  await _intern.tickContor(client);
  ok('contor: la tick-uri repetate nu se creeaza alt canal', jurnal.filter((j) => j.ce === 'create').length === creariInainte);
}

// dezactivat din config
{
  const client2 = new EventEmitter();
  client2.guilds = client.guilds;
  porneste(client2, { guild: 'g1', pilon: { activ: false } });
  ok('config: activ=false nu leaga niciun ascultator', client2.listenerCount('voiceStateUpdate') === 0 && client2.listenerCount('clientReady') === 0);
}

fs.rmSync(DIR, { recursive: true, force: true });
console.log(`\n${trecute} verificari trecute, ${picate} picate`);
process.exit(picate === 0 ? 0 : 1);
