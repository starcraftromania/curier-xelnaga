// Verificari pentru camerele vocale automate, fara Discord real. Ruleaza: node test/camere.test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cetatea-camere-'));
process.env.DATA_DIR = DIR;

const { porneste, DEFINITII, _intern, PLANETE, NUME_PORTAL } = await import('../src/camere.js');

let trecute = 0; let picate = 0;
function ok(nume, conditie, detaliu = '') {
  if (conditie) trecute++;
  else { picate++; console.error(`  PICAT: ${nume} ${detaliu}`); }
}
const asteapta = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Discord simulat ---------------------------------------------------------
class Colectie extends Map {
  find(fn) { for (const v of this.values()) if (fn(v)) return v; return undefined; }
  filter(fn) { const c = new Colectie(); for (const [k, v] of this) if (fn(v)) c.set(k, v); return c; }
  first() { return this.values().next().value; }
}

const jurnal = [];
let urmatorulId = 100;

function creeazaGuild(client) {
  const guild = {
    id: 'g1', afkChannelId: 'afk',
    roles: { everyone: { id: 'everyone' } },
    members: { me: { id: 'bot', permissions: { has: () => true }, roles: { highest: { position: 5 } } } },
    channels: { cache: new Colectie() },
  };
  guild.channels.create = async (opt) => {
    const c = canalNou(guild, { id: String(urmatorulId++), name: opt.name, type: opt.type, parentId: opt.parent ?? null, userLimit: opt.userLimit ?? 0 });
    jurnal.push({ ce: 'create', opt });
    return c;
  };
  client.guilds.cache.set(guild.id, guild);
  return guild;
}

function canalNou(guild, { id, name, type = 2, parentId = null, userLimit = 0 }) {
  const c = {
    id, name, type, parentId, userLimit, guild,
    members: new Colectie(),
    async setName(n) { jurnal.push({ ce: 'setName', id, n }); this.name = n; },
    async setUserLimit(n) { jurnal.push({ ce: 'setUserLimit', id, n }); this.userLimit = n; },
    async delete() { jurnal.push({ ce: 'delete', id }); guild.channels.cache.delete(id); },
    permissionOverwrites: { edit: async (tinta, perms) => { jurnal.push({ ce: 'overwrite', id, tinta, perms }); } },
    async send(m) { jurnal.push({ ce: 'send', id, m }); return { id: 'm' + urmatorulId++ }; },
  };
  guild.channels.cache.set(id, c);
  return c;
}

function membruNou(client, guild, id, nume, bot = false) {
  const m = {
    id, displayName: nume, guild, user: { id, bot, username: nume },
    voice: { channelId: null, channel: null },
  };
  m.voice.setChannel = async (canal) => { jurnal.push({ ce: 'move', id, la: canal?.id ?? null }); muta(client, m, canal); };
  return m;
}

function muta(client, m, canal) {
  const vechi = { channelId: m.voice.channelId, channel: m.voice.channel, member: m, guild: m.guild };
  if (m.voice.channel) m.voice.channel.members.delete(m.id);
  m.voice.channelId = canal?.id ?? null;
  m.voice.channel = canal ?? null;
  if (canal) canal.members.set(m.id, m);
  const nou = { channelId: m.voice.channelId, channel: m.voice.channel, member: m, guild: m.guild };
  client.emit('voiceStateUpdate', vechi, nou);
}

function interactiune(m, sub, valori = {}) {
  const raspunsuri = [];
  return {
    raspunsuri,
    isChatInputCommand: () => true, commandName: 'camera',
    user: { id: m.id }, member: m, guild: m.guild,
    options: {
      getSubcommand: () => sub,
      getString: (n) => valori[n] ?? null,
      getInteger: (n) => valori[n] ?? null,
    },
    reply: async (o) => { raspunsuri.push(o); },
  };
}

// --- pregatire -------------------------------------------------------------------
const client = new EventEmitter();
client.guilds = { cache: new Colectie() };
const guild = creeazaGuild(client);
const categorie = canalNou(guild, { id: 'cat', name: 'Camere', type: 4 });
canalNou(guild, { id: 'afk', name: 'AFK', type: 2 });
const lobby = canalNou(guild, { id: 'lobby', name: 'Lobby', type: 2 });

const INTARZIERE = 40;
porneste(client, { guild: 'g1', camere: { intarziereStergereMs: INTARZIERE } });

// 1. definitiile
ok('definitii: o comanda /camera cu 5 subcomenzi', DEFINITII.length === 1 && DEFINITII[0].name === 'camera' && DEFINITII[0].options.length === 5);
ok('definitii: toate optiunile sunt subcomenzi (type 1)', DEFINITII[0].options.every((o) => o.type === 1));
ok('definitii: limita e int 0-99', (() => { const l = DEFINITII[0].options.find((o) => o.name === 'limita').options[0]; return l.type === 4 && l.min_value === 0 && l.max_value === 99; })());

// 2. boot: portalul apare in categoria Camere, fara overwrites
const portal = await _intern.boot(client, { guild: 'g1' });
ok('boot: portalul e creat', !!portal && portal.name === NUME_PORTAL && portal.type === 2);
ok('boot: portalul are userLimit 1 si sta in categoria Camere', portal.userLimit === 1 && portal.parentId === 'cat');
const crearePortal = jurnal.find((j) => j.ce === 'create' && j.opt.name === NUME_PORTAL);
ok('boot: portalul nu cere permissionOverwrites la creare', !crearePortal.opt.permissionOverwrites);
const stareDisc = JSON.parse(fs.readFileSync(path.join(DIR, 'camere.json'), 'utf8'));
ok('boot: portalId e persistat in camere.json', stareDisc.portalId === portal.id);

// 3. intrarea in portal creeaza camera si muta omul
const ana = membruNou(client, guild, 'u1', 'Ana');
const bogdan = membruNou(client, guild, 'u2', 'Bogdan');
muta(client, ana, portal);
await asteapta(10);
const camere = Object.keys(_intern.starea().camere);
ok('creare: exista exact o camera in stare', camere.length === 1);
const camera = guild.channels.cache.get(camere[0]);
ok('creare: camera e canal de voce cu nume de planeta', !!camera && camera.type === 2 && PLANETE.includes(camera.name));
ok('creare: camera e in aceeasi categorie ca portalul', camera.parentId === 'cat');
ok('creare: Ana a fost mutata in camera ei', ana.voice.channelId === camera.id && camera.members.has('u1'));
ok('creare: proprietarul e Ana', _intern.starea().camere[camera.id].proprietar === 'u1');
const ow = jurnal.find((j) => j.ce === 'overwrite' && j.id === camera.id && j.tinta === 'u1');
ok('creare: Ana are ManageChannels pe camera ei', !!ow && ow.perms.ManageChannels === true);
const creareCamera = jurnal.find((j) => j.ce === 'create' && j.opt.name === camera.name);
ok('creare: camera nu cere permissionOverwrites la creare', !creareCamera.opt.permissionOverwrites);

// 4. a doua camera primeste alta planeta
muta(client, bogdan, portal);
await asteapta(10);
const camera2 = guild.channels.cache.get(Object.keys(_intern.starea().camere).find((id) => id !== camera.id));
ok('creare: a doua camera are alta planeta', !!camera2 && camera2.name !== camera.name && PLANETE.includes(camera2.name));
ok('creare: Bogdan e in camera lui', bogdan.voice.channelId === camera2.id);

// 5. comenzile: nume, limita, blocheaza, deblocheaza
{
  const i = interactiune(ana, 'nume', { nume: 'Baza Anei' });
  await _intern.peComanda(i);
  ok('/camera nume: redenumeste', camera.name === 'Baza Anei' && _intern.starea().camere[camera.id].nume === 'Baza Anei');
  ok('/camera nume: raspuns efemer', i.raspunsuri.length === 1 && i.raspunsuri[0].flags === 64);
}
{
  const i = interactiune(ana, 'limita', { limita: 4 });
  await _intern.peComanda(i);
  ok('/camera limita: seteaza userLimit', camera.userLimit === 4);
}
{
  const i = interactiune(ana, 'blocheaza');
  await _intern.peComanda(i);
  const j = jurnal.filter((x) => x.ce === 'overwrite' && x.id === camera.id && x.tinta === 'everyone').pop();
  ok('/camera blocheaza: Connect deny pentru @everyone', !!j && j.perms.Connect === false);
}
{
  const i = interactiune(ana, 'deblocheaza');
  await _intern.peComanda(i);
  const j = jurnal.filter((x) => x.ce === 'overwrite' && x.id === camera.id && x.tinta === 'everyone').pop();
  ok('/camera deblocheaza: Connect revine la neutru', !!j && j.perms.Connect === null);
}
{
  // Bogdan intra la Ana si incearca sa redenumeasca: nu e a lui
  muta(client, bogdan, camera);
  await asteapta(INTARZIERE + 20);
  ok('camera lui Bogdan a disparut dupa ce a ramas goala', !guild.channels.cache.has(camera2.id) && !_intern.starea().camere[camera2.id]);
  const i = interactiune(bogdan, 'nume', { nume: 'Hack' });
  await _intern.peComanda(i);
  ok('/camera nume: strainul e refuzat', camera.name === 'Baza Anei' && /proprietarul/i.test(i.raspunsuri[0].content));
}
{
  // cineva din lobby, fara camera
  const cezar = membruNou(client, guild, 'u3', 'Cezar');
  muta(client, cezar, lobby);
  await asteapta(5);
  const i = interactiune(cezar, 'limita', { limita: 2 });
  await _intern.peComanda(i);
  ok('/camera: in afara unei camere e refuzat politicos', i.raspunsuri.length === 1 && i.raspunsuri[0].content.includes(NUME_PORTAL));
}

// 6. preluarea: refuzata cat proprietarul e prezent, acceptata dupa ce pleaca
{
  const i = interactiune(bogdan, 'preia');
  await _intern.peComanda(i);
  ok('/camera preia: refuzata cat Ana e in camera', _intern.starea().camere[camera.id].proprietar === 'u1');
  muta(client, ana, lobby);
  await asteapta(5);
  const i2 = interactiune(bogdan, 'preia');
  await _intern.peComanda(i2);
  ok('/camera preia: Bogdan devine proprietar dupa plecarea Anei', _intern.starea().camere[camera.id].proprietar === 'u2');
  const ow2 = jurnal.filter((x) => x.ce === 'overwrite' && x.id === camera.id && x.tinta === 'u2').pop();
  ok('/camera preia: noul proprietar primeste ManageChannels', !!ow2 && ow2.perms.ManageChannels === true);
  ok('camera nu e stearsa cat Bogdan e in ea', guild.channels.cache.has(camera.id));
}

// 7. stergerea dupa intarziere, cu anulare daca intra cineva
{
  muta(client, bogdan, lobby);
  await asteapta(INTARZIERE / 2);
  ok('stergere: camera inca exista inainte de termen', guild.channels.cache.has(camera.id));
  muta(client, ana, camera);          // se intoarce inainte de termen
  await asteapta(INTARZIERE + 20);
  ok('stergere: anulata cand intra cineva la timp', guild.channels.cache.has(camera.id) && !!_intern.starea().camere[camera.id]);
  muta(client, ana, null);            // pleaca de tot
  await asteapta(INTARZIERE + 20);
  ok('stergere: camera dispare dupa termen cand ramane goala', !guild.channels.cache.has(camera.id) && !_intern.starea().camere[camera.id]);
  const peDisc = JSON.parse(fs.readFileSync(path.join(DIR, 'camere.json'), 'utf8'));
  ok('stergere: starea de pe disc e curata', Object.keys(peDisc.camere).length === 0);
}

// 8. botii nu primesc camere
{
  const radio = membruNou(client, guild, 'b1', 'Radio', true);
  const inainte = Object.keys(_intern.starea().camere).length;
  muta(client, radio, portal);
  await asteapta(10);
  ok('portal: un bot nu declanseaza crearea', Object.keys(_intern.starea().camere).length === inainte);
  muta(client, radio, null);
}

// 9. curatarea orfanelor la boot: camera goala din stare + camera care nu mai exista
{
  const fantoma = canalNou(guild, { id: 'orf1', name: 'Zerus', type: 2, parentId: 'cat' });
  _intern.starea().camere['orf1'] = { proprietar: 'u9', nume: 'Zerus', creat: new Date().toISOString() };
  _intern.starea().camere['nu-exista'] = { proprietar: 'u9', nume: 'Ulnar', creat: new Date().toISOString() };
  await _intern.boot(client, { guild: 'g1' });
  ok('boot: camera orfana goala e stearsa', !guild.channels.cache.has(fantoma.id) && !_intern.starea().camere['orf1']);
  ok('boot: camera inexistenta dispare din stare', !_intern.starea().camere['nu-exista']);
  ok('boot: portalul existent e refolosit, nu duplicat', jurnal.filter((j) => j.ce === 'create' && j.opt.name === NUME_PORTAL).length === 1);
}

fs.rmSync(DIR, { recursive: true, force: true });
console.log(`\n${trecute} verificari trecute, ${picate} picate`);
process.exit(picate === 0 ? 0 : 1);
