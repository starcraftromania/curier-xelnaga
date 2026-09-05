// Verificari pentru anuntul de relansare, fara Discord. Se ruleaza cu: node test/anunt-lansare.test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Collection } from 'discord.js';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cetatea-anunt-'));
process.env.DATA_DIR = DIR;

let trecute = 0; let picate = 0;
function ok(nume, conditie, detaliu = '') {
  if (conditie) { trecute++; } else { picate++; console.error(`  PICAT: ${nume} ${detaliu}`); }
}

const { _intern: A, IMPLICIT, porneste } = await import('../src/anunt-lansare.js');

// --- client Discord simulat ------------------------------------------------------
const trimise = [];
let pinuri = 0;
let pinEsueaza = false;
let sendEsueaza = false;
const general = {
  id: 'c-general', name: 'general', type: 0,
  send: async (x) => {
    if (sendEsueaza) throw new Error('Missing Access');
    trimise.push(x);
    return { id: 'm' + trimise.length, pin: async () => { if (pinEsueaza) throw new Error('Missing Permissions'); pinuri++; } };
  },
};
const trivia = { id: 'c-trivia', name: 'trivia', type: 0, send: async () => { throw new Error('nu aici'); } };
const guild = { id: 'g1', channels: { cache: new Collection([[general.id, general], [trivia.id, trivia]]) } };
const client = new EventEmitter();
client.guilds = { cache: new Map([[guild.id, guild]]) };
const cfg = { guild: 'g1', moneda: '◈', canale: { general: 'general', trivia: 'trivia' }, puncte: { peMinutVoce: 2, peMinutStream: 10, plafonZilnic: 600 } };
const stare = () => JSON.parse(fs.readFileSync(path.join(DIR, 'anunturi.json'), 'utf8'));

const textEmbed = (e) => { const j = e.toJSON(); return [j.title, j.description, ...(j.fields ?? []).flatMap((f) => [f.name, f.value]), j.footer?.text].join('\n'); };

// --- 1. continutul embedului ---------------------------------------------------------
{
  const t = textEmbed(A.construiesteEmbed(cfg, IMPLICIT));
  ok('embed: relansarea dupa reconstruire', /reconstruit/i.test(t));
  ok('embed: trivia in regim de concurs (25, o pe minut, 1200/zi)', /25/.test(t) && /O intrebare pe minut/i.test(t) && /1200\/zi/.test(t));
  ok('embed: pachetele Medivac 300', /Medivac/.test(t) && /300/.test(t));
  ok('embed: /daily', t.includes('/daily'));
  ok('embed: King of Kings si cele 4 titluri', /King of Kings/.test(t) && /Marele Uzurpator/.test(t) && /Boierul de Vespene/.test(t) && /Mintea Roiului/.test(t) && /Gura Cetatii/.test(t));
  ok('embed: Intrebarea zilei la 19:00', /Intrebarea zilei, la 19:00/.test(t));
  ok('embed: Marele Warp-in sambata si duminica 18:00-20:00, +2/min', /sambata si duminica, 18:00-20:00/.test(t) && /\+2 ◈\/minut/.test(t));
  ok('embed: /leaga-contul si buletinul de ladder', t.includes('/leaga-contul') && /ladder/i.test(t));
  ok('embed: lista de comenzi', /\/puncte/.test(t) && /\/clasament/.test(t) && /\/ghid/.test(t));
  ok('embed: primii 3 pasi', /Primii 3 pasi/.test(t) && /\*\*1\.\*\*/.test(t) && /\*\*3\.\*\*/.test(t));
  ok('embed: versiunea in subsol', t.includes('v2-relansare'));
  const tLung = A.construiesteEmbed(cfg, IMPLICIT).toJSON();
  ok('embed: fiecare camp sub 1024 de caractere', tLung.fields.every((f) => f.value.length <= 1024 && f.name.length <= 256));
  ok('embed: config warpin schimba orele', /19:00-21:00/.test(textEmbed(A.construiesteEmbed({ ...cfg, warpin: { ora: 19 } }, IMPLICIT))));
}

// --- 2. se posteaza o singura data ------------------------------------------------------
{
  const m = await A.posteaza(client, cfg);
  ok('post: mesaj trimis cu embed, fara ping implicit', m !== null && trimise.length === 1 && trimise[0].embeds?.length === 1 && trimise[0].content === undefined);
  ok('post: fixat (pin)', pinuri === 1);
  const s = stare();
  ok('stare: { versiune, mesajId, cand }', s.versiune === 'v2-relansare' && s.mesajId === 'm1' && !Number.isNaN(Date.parse(s.cand)));
  ok('post: #trivia devine mentiune reala', trimise[0].embeds[0].toJSON().fields.some((f) => f.value.includes('<#c-trivia>')) && !textEmbed(trimise[0].embeds[0]).includes('<#trivia>'));

  const m2 = await A.posteaza(client, cfg);
  ok('post: a doua oara nu mai posteaza', m2 === null && trimise.length === 1);
}

// --- 3. versiune noua -> posteaza din nou; pin esuat se ignora ------------------------------
{
  pinEsueaza = true;
  const vechi = console.warn; console.warn = () => {};
  const m = await A.posteaza(client, { ...cfg, anuntLansare: { versiune: 'v3', ping: 'here' } });
  console.warn = vechi;
  ok('versiune noua: posteaza din nou, cu @here', m !== null && trimise.length === 2 && trimise[1].content === '@here');
  ok('pin esuat: se ignora, starea se salveaza oricum', stare().versiune === 'v3' && stare().mesajId === 'm2');
  pinEsueaza = false;
}

// --- 4. send esuat -> nu marcheaza ------------------------------------------------------------
{
  sendEsueaza = true;
  const vechi = console.error; console.error = () => {};
  const m = await A.posteaza(client, { ...cfg, anuntLansare: { versiune: 'v4' } });
  console.error = vechi;
  ok('send esuat: null si versiunea ramane v3 (se reincearca la urmatorul boot)', m === null && stare().versiune === 'v3');
  sendEsueaza = false;
}

// --- 5. ping cu rol, fixeaza false --------------------------------------------------------------
{
  const inainte = pinuri;
  const m = await A.posteaza(client, { ...cfg, anuntLansare: { versiune: 'v5', ping: '123456', fixeaza: false } });
  ok('ping rol: <@&id>, fara pin', m !== null && trimise[trimise.length - 1].content === '<@&123456>' && pinuri === inainte);
  const c2 = new EventEmitter(); c2.guilds = client.guilds;
  porneste(c2, cfg);
  ok('porneste: asculta clientReady', c2.listenerCount('clientReady') === 1);
}

fs.rmSync(DIR, { recursive: true, force: true });
console.log(`\n${trecute} verificari trecute, ${picate} picate`);
process.exit(picate === 0 ? 0 : 1);
