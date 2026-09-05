// Verificari pentru src/social.js (dueluri si predictii), fara Discord. Ruleaza: node test/social.test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cetatea-social-'));
process.env.DATA_DIR = DIR;

const store = (await import('../src/store.js')).default;
const { porneste, DEFINITII, _intern } = await import('../src/social.js');
const { PermissionFlagsBits } = await import('discord.js');

let trecute = 0; let picate = 0;
function ok(nume, conditie, detaliu = '') {
  if (conditie) { trecute++; }
  else { picate++; console.error(`  PICAT: ${nume} ${detaliu}`); }
}

// --- client si interactiuni simulate ---------------------------------------
const editari = [];
const client = new EventEmitter();
client.guilds = { cache: new Map() };
client.channels = {
  fetch: async (canalId) => ({
    messages: { fetch: async (mesajId) => ({ id: mesajId, edit: async (x) => { editari.push({ canalId, mesajId, ...x }); } }) },
  }),
};

let ceas = 1_000_000_000_000;
_intern.acum = () => ceas;
porneste(client, { moneda: '◈' });

let nrMesaj = 0;
function interactiune(fel, { user, custom = {}, optiuni = {}, sub = null, staff = false, campuri = {} } = {}) {
  const i = {
    user: { id: user, bot: false },
    channelId: 'canal-1',
    replied: false, deferred: false,
    raspunsuri: [], actualizari: [], modale: [],
    isChatInputCommand: () => fel === 'comanda',
    isButton: () => fel === 'buton',
    isModalSubmit: () => fel === 'modal',
    commandName: custom.commandName ?? null,
    customId: custom.customId ?? null,
    memberPermissions: { has: (p) => staff && p === PermissionFlagsBits.ManageGuild },
    options: {
      getUser: (n) => optiuni[n] ?? null,
      getInteger: (n) => optiuni[n] ?? null,
      getString: (n) => optiuni[n] ?? null,
      getSubcommand: () => sub,
    },
    fields: { getTextInputValue: (n) => campuri[n] },
    async reply(x) { i.replied = true; i.raspunsuri.push(x); i.ultimulId = `m${++nrMesaj}`; return { id: i.ultimulId }; },
    async followUp(x) { i.raspunsuri.push(x); return { id: `m${++nrMesaj}` }; },
    async fetchReply() { return { id: i.ultimulId }; },
    async update(x) { i.replied = true; i.actualizari.push(x); return {}; },
    async showModal(m) { i.modale.push(m); return {}; },
  };
  return i;
}

// asteapta ca handlerele asincrone de pe eveniment sa termine
async function emite(i) {
  client.emit('interactionCreate', i);
  for (let k = 0; k < 20; k++) await new Promise((r) => setImmediate(r));
  return i;
}

const textRaspuns = (i) => i.raspunsuri.map((r) => (typeof r === 'string' ? r : r.content ?? '')).join(' | ');
const textActualizare = (i) => i.actualizari.map((r) => r.content ?? '').join(' | ');
const efemer = (i) => i.raspunsuri.every((r) => r.ephemeral === true);
const idDuelCurent = () => Object.keys(store.dueluri)[0];

const A = '100'; const B = '200'; const C = '300';
const om = (id) => ({ id, bot: false });

async function duel(a, b, miza) {
  return emite(interactiune('comanda', { user: a, custom: { commandName: 'duel' }, optiuni: { om: om(b), miza } }));
}
async function buton(user, customId) {
  return emite(interactiune('buton', { user, custom: { customId } }));
}

// --- definitii -------------------------------------------------------------
ok('definitii: /duel si /predictie', DEFINITII.map((d) => d.name).sort().join(',') === 'duel,predictie');
ok('definitii: /predictie cere Manage Server', DEFINITII.find((d) => d.name === 'predictie').default_member_permissions === '32');

// --- dueluri ---------------------------------------------------------------
store.ajusteaza(A, 500); store.ajusteaza(B, 500); store.ajusteaza(C, 5);

// sold insuficient
{
  const i = await duel(C, A, 50);
  ok('duel: sold insuficient -> refuz efemer', /Nu ai miza/.test(textRaspuns(i)) && efemer(i));
  ok('duel: sold insuficient -> niciun duel creat', Object.keys(store.dueluri).length === 0);
}
// cu tine / cu bot
{
  const i = await duel(A, A, 50);
  ok('duel: nu cu tine insuti', /tine insuti/.test(textRaspuns(i)));
  const j = await emite(interactiune('comanda', { user: A, custom: { commandName: 'duel' }, optiuni: { om: { id: '9', bot: true }, miza: 20 } }));
  ok('duel: nu cu boti', /Botii/.test(textRaspuns(j)));
  ok('duel: soldul lui A neatins dupa refuzuri', store.utilizator(A).sold === 500);
}
// provocare -> escrow
{
  const i = await duel(A, B, 50);
  ok('duel: provocarea intra in escrow (A 500 -> 450)', store.utilizator(A).sold === 450, `(${store.utilizator(A).sold})`);
  const id = idDuelCurent();
  const d = store.dueluri[id];
  ok('duel: starea provocat, mesajId retinut', d && d.stare === 'provocat' && d.a === A && d.b === B && d.miza === 50 && d.mesajId === i.ultimulId);
  ok('duel: mesaj public cu butoane accepta/refuza', !i.raspunsuri[0].ephemeral && i.raspunsuri[0].components?.length === 1);
  const ids = i.raspunsuri[0].components[0].components.map((b) => b.data.custom_id);
  ok('duel: customId-urile butoanelor', ids.join(',') === `duel:accepta:${id},duel:refuza:${id}`, `(${ids})`);

  // un singur duel activ per user
  const j = await duel(A, C, 20);
  ok('duel: A nu poate porni al doilea duel', /deja un duel/.test(textRaspuns(j)) && store.utilizator(A).sold === 450);
  store.ajusteaza(C, 100);
  const k = await duel(C, B, 20);
  ok('duel: B (provocat) nu poate fi provocat de altcineva', /deja un duel/.test(textRaspuns(k)) && store.utilizator(C).sold === 105);

  // doar cel provocat raspunde
  const strain = await buton(C, `duel:accepta:${id}`);
  ok('duel: strainul nu poate accepta', /Doar cel provocat/.test(textRaspuns(strain)) && store.dueluri[id].stare === 'provocat');

  // refuz -> refund
  const r = await buton(B, `duel:refuza:${id}`);
  ok('duel: refuzul intoarce miza (A 450 -> 500)', store.utilizator(A).sold === 500 && !store.dueluri[id]);
  ok('duel: refuzul editeaza mesajul fara butoane', /refuzat/.test(textActualizare(r)) && r.actualizari[0].components.length === 0);
}
// acceptare + acord
{
  await duel(A, B, 60);
  const id = idDuelCurent();
  const acc = await buton(B, `duel:accepta:${id}`);
  ok('duel: acceptarea intra in escrow (B 500 -> 440)', store.utilizator(B).sold === 440 && store.dueluri[id].stare === 'acceptat');
  const idsVot = acc.actualizari[0].components[0].components.map((b) => b.data.custom_id);
  ok('duel: butoanele de vot', idsVot.join(',') === `duel:eu:${id},duel:el:${id}`, `(${idsVot})`);
  const etichete = acc.actualizari[0].components[0].components.map((b) => b.data.label);
  ok('duel: etichetele de vot', etichete.join('|') === 'Am castigat eu|A castigat el', `(${etichete})`);

  const v1 = await buton(A, `duel:eu:${id}`);
  ok('duel: primul vot nu incheie', /Vot inregistrat/.test(textRaspuns(v1)) && store.dueluri[id]);
  const v1b = await buton(A, `duel:el:${id}`);
  ok('duel: nu poti vota de doua ori', /votat deja/.test(textRaspuns(v1b)));
  const v2 = await buton(B, `duel:el:${id}`);
  ok('duel: acord -> castigatorul ia 2x miza (A 440 -> 560)', store.utilizator(A).sold === 560, `(${store.utilizator(A).sold})`);
  ok('duel: invinsul ramane fara miza (B 440)', store.utilizator(B).sold === 440);
  ok('duel: contoarele dueluriV/dueluriP', store.utilizator(A).dueluriV === 1 && store.utilizator(B).dueluriP === 1 && store.utilizator(A).dueluriP === 0);
  ok('duel: duelul e sters si mesajul final e editat', !store.dueluri[id] && /Duel incheiat/.test(textActualizare(v2)));
  const disc = JSON.parse(fs.readFileSync(store.undeSalvez(), 'utf8'));
  ok('duel: data.json nu mai contine duelul', Object.keys(disc.dueluri).length === 0 && disc.utilizatori[A].sold === 560);
}
// dezacord -> refund
{
  await duel(B, A, 40);
  const id = idDuelCurent();
  await buton(A, `duel:accepta:${id}`);
  ok('duel: ambele mize in escrow (A 520, B 400)', store.utilizator(A).sold === 520 && store.utilizator(B).sold === 400);
  await buton(A, `duel:eu:${id}`);
  const fin = await buton(B, `duel:eu:${id}`);
  ok('duel: dezacord -> refund la amandoi (A 560, B 440)', store.utilizator(A).sold === 560 && store.utilizator(B).sold === 440);
  ok('duel: dezacordul nu schimba contoarele', store.utilizator(A).dueluriV === 1 && store.utilizator(B).dueluriV === 0 && store.utilizator(B).dueluriP === 1);
  ok('duel: mesaj de dezacord', /Dezacord/.test(textActualizare(fin)) && !store.dueluri[id]);
}
// expirare la 15 min, fara raspuns
{
  await duel(A, B, 30);
  const id = idDuelCurent();
  ok('duel: escrow inainte de expirare (A 530)', store.utilizator(A).sold === 530);
  ceas += 14 * 60_000;
  await _intern.tick();
  ok('duel: la 14 min nu expira', Boolean(store.dueluri[id]));
  ceas += 61_000;
  await _intern.tick();
  ok('duel: la 15 min expira si A primeste refund (560)', !store.dueluri[id] && store.utilizator(A).sold === 560);
  ok('duel: mesajul expirat e editat', editari.some((e) => /expirat/.test(e.content) && e.mesajId));
}
// expirare dupa acceptare, cu un singur vot
{
  await duel(A, B, 30);
  const id = idDuelCurent();
  await buton(B, `duel:accepta:${id}`);
  await buton(B, `duel:eu:${id}`);
  ok('duel: mize in escrow (A 530, B 410)', store.utilizator(A).sold === 530 && store.utilizator(B).sold === 410);
  store.dueluri[id].creat = ceas - 16 * 60_000; // creat in trecut
  await _intern.tick();
  ok('duel: expirat dupa acceptare -> refund la amandoi (560, 440)', !store.dueluri[id] && store.utilizator(A).sold === 560 && store.utilizator(B).sold === 440);
}
// buton pe duel inexistent
{
  const i = await buton(A, 'duel:accepta:nuexista');
  ok('duel: buton pe duel inexistent -> mesaj efemer', /nu mai exista/.test(textRaspuns(i)) && efemer(i));
}

// --- predictii -------------------------------------------------------------
async function predictie(user, sub, optiuni = {}, staff = true) {
  return emite(interactiune('comanda', { user, custom: { commandName: 'predictie' }, optiuni, sub, staff }));
}
async function pariu(user, parte, suma) {
  const b = await buton(user, `predictie:${parte}`);
  const m = await emite(interactiune('modal', { user, custom: { customId: `predictie:modal:${parte}` }, campuri: { suma: String(suma) } }));
  return { b, m };
}
const P = { intrebare: 'Cine ia Cupa Cetatii?', a: 'Serral', b: 'Clem' };

// permisiune
{
  const i = await predictie(A, 'start', P, false);
  ok('predictie: fara Manage Server -> refuz', /staff/.test(textRaspuns(i)) && store.predictie() === null);
}
// start
{
  const i = await predictie(A, 'start', { ...P, minute: 30 });
  const p = store.predictie();
  ok('predictie: start creeaza predictia deschisa', p && p.deschisa && p.a === 'Serral' && p.b === 'Clem' && p.mesajId === i.ultimulId && p.canalId === 'canal-1');
  ok('predictie: inchiderea la 30 min', p.inchidereLa === ceas + 30 * 60_000);
  ok('predictie: embed + butoane a/b', i.raspunsuri[0].embeds?.length === 1
    && i.raspunsuri[0].components[0].components.map((b) => b.data.custom_id).join(',') === 'predictie:a,predictie:b');
  const j = await predictie(A, 'start', P);
  ok('predictie: o singura predictie activa', /deja o predictie/.test(textRaspuns(j)));
}
// pariuri in escrow, modal, un singur pariu
{
  const s0 = { A: store.utilizator(A).sold, B: store.utilizator(B).sold, C: store.utilizator(C).sold }; // 560, 440, 105
  const { b, m } = await pariu(A, 'a', 100);
  ok('predictie: butonul deschide modalul', b.modale.length === 1 && b.modale[0].data.custom_id === 'predictie:modal:a');
  ok('predictie: pariul intra in escrow (A -100)', store.utilizator(A).sold === s0.A - 100 && store.predictie().pariuri[A]?.suma === 100 && store.predictie().pariuri[A].parte === 'a');
  ok('predictie: confirmare efemera', /Pariu inregistrat/.test(textRaspuns(m)) && efemer(m));

  const dublu = await pariu(A, 'b', 50);
  ok('predictie: un singur pariu per user (buton)', /pariat deja/.test(textRaspuns(dublu.b)) && dublu.b.modale.length === 0);
  ok('predictie: un singur pariu per user (modal)', /pariat deja/.test(textRaspuns(dublu.m)) && store.utilizator(A).sold === s0.A - 100);

  const mic = await emite(interactiune('modal', { user: B, custom: { customId: 'predictie:modal:b' }, campuri: { suma: '5' } }));
  ok('predictie: suma sub 10 e refuzata', /minima/.test(textRaspuns(mic)) && store.utilizator(B).sold === s0.B);
  const mult = await emite(interactiune('modal', { user: B, custom: { customId: 'predictie:modal:b' }, campuri: { suma: '99999' } }));
  ok('predictie: suma peste sold e refuzata', /doar/.test(textRaspuns(mult)) && store.utilizator(B).sold === s0.B);

  await pariu(B, 'b', 200);
  await pariu(C, 'a', 55);
  ok('predictie: trei pariuri, escrow corect', store.utilizator(B).sold === s0.B - 200 && store.utilizator(C).sold === s0.C - 55
    && Object.keys(store.predictie().pariuri).length === 3);
  const sum = _intern.sumarPredictie(store.predictie());
  ok('predictie: sumarul pe parti', sum.a.total === 155 && sum.a.n === 2 && sum.b.total === 200 && sum.b.n === 1);

  // inchide
  const inc = await predictie(A, 'inchide');
  ok('predictie: inchide opreste parierea', store.predictie().deschisa === false && /inchis/.test(textRaspuns(inc)));
  const dupa = await buton(C, 'predictie:a');
  ok('predictie: nu se mai poate paria dupa inchidere', /inchis/.test(textRaspuns(dupa)) && dupa.modale.length === 0);

  // rezolva: pot 355, castiga a: A 100/155, C 55/155
  const sA = store.utilizator(A).sold; const sC = store.utilizator(C).sold; const sB = store.utilizator(B).sold;
  const rez = await predictie(A, 'rezolva', { castigator: 'a' });
  const castigA = Math.floor(355 * 100 / 155); // 229
  const castigC = Math.floor(355 * 55 / 155); // 125
  ok('predictie: rezolvarea proportionala cu rotunjire in jos (229 + 125, 1 in neant)',
    store.utilizator(A).sold === sA + castigA && store.utilizator(C).sold === sC + castigC && castigA + castigC === 354,
    `(A +${store.utilizator(A).sold - sA}, C +${store.utilizator(C).sold - sC})`);
  ok('predictie: perdantul nu primeste nimic', store.utilizator(B).sold === sB);
  ok('predictie: anuntul cu top castigatori', /rezolvata/.test(textRaspuns(rez)) && textRaspuns(rez).includes(`<@${A}> +◈${castigA}`) && textRaspuns(rez).includes(`<@${C}>`));
  ok('predictie: dupa rezolvare nu mai e activa', store.predictie() === null);
  ok('predictie: embedul final e editat fara butoane', editari.some((e) => e.mesajId && e.embeds?.length === 1 && e.components?.length === 0));
}
// anulare cu refund
{
  await predictie(A, 'start', P);
  const sA = store.utilizator(A).sold; const sB = store.utilizator(B).sold;
  await pariu(A, 'a', 30);
  await pariu(B, 'b', 40);
  ok('predictie: escrow inainte de anulare', store.utilizator(A).sold === sA - 30 && store.utilizator(B).sold === sB - 40);
  const an = await predictie(B, 'anuleaza');
  ok('predictie: anularea da refund tuturor', store.utilizator(A).sold === sA && store.utilizator(B).sold === sB && store.predictie() === null);
  ok('predictie: mesaj de anulare cu numarul de pariori', /2 pariori/.test(textRaspuns(an)));
}
// fara castigatori -> refund
{
  await predictie(A, 'start', P);
  const sA = store.utilizator(A).sold;
  await pariu(A, 'a', 30);
  await predictie(A, 'rezolva', { castigator: 'b' });
  ok('predictie: nimeni pe partea castigatoare -> refund', store.utilizator(A).sold === sA && store.predictie() === null);
}
// expirarea duratei de pariere prin tick
{
  await predictie(A, 'start', { ...P, minute: 1 });
  ceas += 61_000;
  await _intern.tick();
  ok('predictie: tick-ul inchide parierea dupa durata', store.predictie().deschisa === false);
  const t = await buton(A, 'predictie:a');
  ok('predictie: dupa expirare butonul refuza', /inchis/.test(textRaspuns(t)));
  await predictie(A, 'anuleaza');
}
// comenzi fara predictie activa
{
  const i = await predictie(A, 'rezolva', { castigator: 'a' });
  ok('predictie: rezolva fara predictie activa -> mesaj', /nicio predictie/.test(textRaspuns(i)));
}

console.log(`\n${trecute} verificari trecute, ${picate} picate`);
fs.rmSync(DIR, { recursive: true, force: true });
process.exit(picate === 0 ? 0 : 1);
