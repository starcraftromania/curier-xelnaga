// Marele Warp-in - fereastra fixa de voce a Cetatii: sambata si duminica, 18:00-20:00.
// In fereastra, fiecare om de pe voce ia +2 credite pe minut (prin plafonul zilnic
// comun), cu un plafon propriu per om per fereastra. Preanunt la T-60, anunt la T-0,
// rezumat la T+durata. Evenimentul Discord se creeaza cu pana la 72 h inainte.
// Starea (warpin.json) tine ultimele 8 ferestre; fiecare pas e marcat pe id-ul
// ferestrei, ca un restart sa nu repete anunturile. Un anunt esuat NU se marcheaza.

import {
  EmbedBuilder, ChannelType, PermissionFlagsBits,
  GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel,
} from 'discord.js';
import store from './store.js';
import {
  citesteJson, scrieJson, oraLocala, instant, guildul, gasesteCanal, trimite, alegeStabil, pad,
} from './comun.js';

export const DEFINITII = [];

export const IMPLICIT = {
  zile: [6, 0],          // sambata si duminica (0 = duminica)
  ora: 18,
  minut: 0,
  durataMinute: 120,
  bonusPeMinut: 2,
  plafonBonusZi: 240,    // plafon propriu per om per fereastra
  preanuntMinute: 60,
  tacereDacaGol: true,
  rolPing: null,
  canalVoce: 'Lobby',
  evenimentInainteOre: 72,
  gratieFinalMinute: 180, // cat timp dupa sfarsit mai trimitem rezumatul (dupa un restart)
};

const FISIER_STARE = 'warpin.json';
const FERESTRE_PASTRATE = 8;
const ZILE_NUME = ['duminica', 'luni', 'marti', 'miercuri', 'joi', 'vineri', 'sambata'];

// ---------------------------------------------------------------------------
// Ferestre - functii pure
// ---------------------------------------------------------------------------

export function idFereastra(start) {
  const l = oraLocala(start);
  return `${l.data}-${pad(l.ora)}${pad(l.minut)}`;
}

// Toate ferestrele din [acum - gratieMs, acum + 8 zile], ordonate dupa start.
// Fiecare: { id, start: Date, sfarsit: Date }.
export function ferestre(acum, c = IMPLICIT, gratieMs = 0) {
  const zile = new Set(c.zile);
  const rez = [];
  const t0 = acum.getTime();
  for (let d = -2; d <= 8; d++) {
    const l = oraLocala(new Date(t0 + d * 86400000));
    if (!zile.has(l.ziSapt)) continue;
    const start = instant(l.an, l.luna, l.zi, c.ora, c.minut);
    const sfarsit = new Date(start.getTime() + c.durataMinute * 60000);
    if (sfarsit.getTime() + gratieMs <= t0) continue;
    if (start.getTime() > t0 + 8 * 86400000) continue;
    rez.push({ id: idFereastra(start), start, sfarsit });
  }
  rez.sort((a, b) => a.start - b.start);
  return rez.filter((f, i) => i === 0 || f.id !== rez[i - 1].id);
}

// Ferestrele care nu s-au terminat inca (cea in curs, daca e, plus urmatoarele).
export function ferestreleUrmatoare(acum = new Date(), c = IMPLICIT) {
  return ferestre(acum, c, 0);
}

export function textZile(c = IMPLICIT) {
  const nume = c.zile.map((z) => ZILE_NUME[z]).filter(Boolean);
  if (nume.length <= 1) return nume[0] ?? '';
  return nume.slice(0, -1).join(', ') + ' si ' + nume[nume.length - 1];
}

export function subsol(c = IMPLICIT) {
  return `Urmatorul warp-in: ${textZile(c)}, ${pad(c.ora)}:${pad(c.minut)}`;
}

// ---------------------------------------------------------------------------
// Stare
// ---------------------------------------------------------------------------

let stare = {};
let stareCitita = false;

function citesteStarea() {
  if (!stareCitita) { stare = citesteJson(FISIER_STARE, {}); stareCitita = true; }
  return stare;
}

function fereastraStare(id) {
  citesteStarea();
  if (!stare[id]) stare[id] = { participanti: {}, preanunt: false, start: false, final: false, eveniment: null };
  return stare[id];
}

function salveazaStarea() {
  const chei = Object.keys(stare).sort();
  while (chei.length > FERESTRE_PASTRATE) delete stare[chei.shift()];
  scrieJson(FISIER_STARE, stare);
}

export function reseteazaStareaInMemorie() { stare = {}; stareCitita = false; }

// ---------------------------------------------------------------------------
// Texte
// ---------------------------------------------------------------------------

const PREANUNTURI = [
  (M, c, link) => `⚡ **Marele Warp-in** incepe intr-o ora, la ${pad(c.ora)}:${pad(c.minut)}. Doua ore de voce, +${c.bonusPeMinut} ${M}/minut pe langa ce iei oricum. Incalziti tastaturile.${link}`,
  (M, c, link) => `⚡ Pylonul se incarca: in 60 de minute deschidem **Marele Warp-in** (${pad(c.ora)}:${pad(c.minut)}-${pad(c.ora + Math.floor(c.durataMinute / 60))}:${pad(c.minut)}). Cine e pe voce ia +${c.bonusPeMinut} ${M}/minut, pana la ${c.plafonBonusZi} ${M} pe fereastra.${link}`,
  (M, c, link) => `⚡ Peste o ora suna gongul: **Marele Warp-in** de la ${pad(c.ora)}:${pad(c.minut)}. Intrati pe voce, jucati, vorbiti, creditele curg singure (+${c.bonusPeMinut} ${M}/min).${link}`,
];

const DESCHIDERI = [
  (M, c) => `🌀 **Marele Warp-in a inceput!** Urmatoarele ${c.durataMinute} de minute, fiecare minut pe voce aduce +${c.bonusPeMinut} ${M} bonus. Lobby-ul e deschis.`,
  (M, c) => `🌀 **Warp-in!** Fereastra e deschisa pana la ${pad(c.ora + Math.floor(c.durataMinute / 60))}:${pad(c.minut)}. Pe voce se castiga +${c.bonusPeMinut} ${M}/minut, plafon ${c.plafonBonusZi} ${M} pe fereastra. Nu conteaza ce jucati, conteaza ca sunteti acolo.`,
  (M, c) => `🌀 **Portalul s-a deschis.** Marele Warp-in e in curs: ${c.durataMinute} de minute, +${c.bonusPeMinut} ${M} pe minut pentru toti cei de pe voce. Cine sta cu castile pe mute (deaf) nu se numara.`,
];

function pingul(c) {
  return c.rolPing ? `<@&${c.rolPing}> ` : '';
}

function linkEveniment(guild, eventId) {
  return eventId ? `\nEveniment: https://discord.com/events/${guild.id}/${eventId}` : '';
}

// ---------------------------------------------------------------------------
// Voce
// ---------------------------------------------------------------------------

// Oamenii eligibili de pe voce: nu boti, nu AFK, nu canale cu userLimit 1, nu selfDeaf.
export function participantiiDePeVoce(guild) {
  const rez = [];
  for (const canal of guild.channels.cache.values()) {
    if (canal.type !== ChannelType.GuildVoice && canal.type !== ChannelType.GuildStageVoice) continue;
    if (guild.afkChannelId && canal.id === guild.afkChannelId) continue;
    if (canal.userLimit === 1) continue;
    for (const m of canal.members.values()) {
      if (m.user?.bot) continue;
      if (m.voice?.selfDeaf) continue;
      rez.push(m);
    }
  }
  return rez;
}

// ---------------------------------------------------------------------------
// Evenimentul Discord
// ---------------------------------------------------------------------------

async function asiguraEvenimentul(guild, f, c) {
  const s = fereastraStare(f.id);
  if (s.eveniment) return;
  const eu = guild.members?.me;
  const perm = eu?.permissions;
  if (!perm || !(perm.has(PermissionFlagsBits.CreateEvents) || perm.has(PermissionFlagsBits.ManageEvents))) return;
  const canalVoce = gasesteCanal(guild, c.canalVoce, ChannelType.GuildVoice);
  if (!canalVoce) return;
  try {
    const ev = await guild.scheduledEvents.create({
      name: 'Marele Warp-in',
      scheduledStartTime: f.start,
      scheduledEndTime: f.sfarsit,
      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      entityType: GuildScheduledEventEntityType.Voice,
      channel: canalVoce.id,
      description: `Doua ore de voce in Cetate. +${c.bonusPeMinut} credite pe minut pentru toti cei prezenti (plafon ${c.plafonBonusZi} pe fereastra).`,
      reason: 'Marele Warp-in',
    });
    s.eveniment = ev?.id ?? null;
    salveazaStarea();
  } catch (e) {
    console.error('[warpin] nu am putut crea evenimentul:', e.message);
  }
}

// ---------------------------------------------------------------------------
// Pasii ferestrei
// ---------------------------------------------------------------------------

async function preanunta(guild, canal, f, c, M) {
  const s = fereastraStare(f.id);
  const text = alegeStabil(PREANUNTURI, f.id)(M, c, linkEveniment(guild, s.eveniment));
  const m = await trimite(canal, { content: pingul(c) + text });
  if (m) { s.preanunt = true; salveazaStarea(); }
}

async function deschide(guild, canal, f, c, M) {
  const s = fereastraStare(f.id);
  const text = alegeStabil(DESCHIDERI, f.id + ':start')(M, c);
  const m = await trimite(canal, { content: pingul(c) + text });
  if (m) { s.start = true; salveazaStarea(); }
}

const ultimulMinutAcordat = new Map(); // id fereastra -> minutul (epoch / 60000)

function acordaMinutul(guild, f, c, cfg, acum) {
  const minut = Math.floor(acum.getTime() / 60000);
  if (ultimulMinutAcordat.get(f.id) === minut) return 0;
  ultimulMinutAcordat.set(f.id, minut);

  const s = fereastraStare(f.id);
  const plafonComun = cfg?.puncte?.plafonZilnic ?? 600;
  let dat = 0;
  for (const m of participantiiDePeVoce(guild)) {
    const p = s.participanti[m.id] ?? (s.participanti[m.id] = { minute: 0, bonus: 0 });
    p.minute += 1;
    const ramas = Math.max(0, c.plafonBonusZi - p.bonus);
    const cerut = Math.min(c.bonusPeMinut, ramas);
    if (cerut > 0) {
      const primit = store.acorda(m.id, cerut, plafonComun);
      p.bonus += primit;
      dat += primit;
    }
  }
  salveazaStarea();
  return dat;
}

async function incheie(guild, canal, f, c, M) {
  const s = fereastraStare(f.id);
  const lista = Object.entries(s.participanti);
  if (lista.length === 0) {
    if (c.tacereDacaGol) { s.final = true; salveazaStarea(); return; }
  }
  const minuteTotale = lista.reduce((a, [, p]) => a + p.minute, 0);
  const bonusTotal = lista.reduce((a, [, p]) => a + p.bonus, 0);
  const top = lista.sort((a, b) => b[1].minute - a[1].minute).slice(0, 5);
  const linii = [];
  for (let k = 0; k < top.length; k++) {
    const [id, p] = top[k];
    linii.push(`**${k + 1}.** <@${id}> — ${p.minute} min · +${M}${p.bonus}`);
  }
  const e = new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle('🌀 Marele Warp-in s-a incheiat')
    .setDescription(lista.length === 0
      ? 'Portalul a stat deschis, dar nimeni nu a trecut prin el.'
      : `${lista.length} ${lista.length === 1 ? 'pilot' : 'piloti'} pe voce · ${minuteTotale} minute in total · ${M}${bonusTotal} bonus impartit`)
    .setFooter({ text: subsol(c) })
    .setTimestamp(f.sfarsit);
  if (linii.length) e.addFields({ name: 'Prezenta', value: linii.join('\n') });
  const m = await trimite(canal, { embeds: [e] });
  if (m) { s.final = true; salveazaStarea(); }
}

// ---------------------------------------------------------------------------
// Tick (la 60 s). `acum` se poate injecta pentru teste.
// ---------------------------------------------------------------------------

export async function tick(client, cfg, acum = new Date()) {
  const c = { ...IMPLICIT, ...(cfg?.warpin ?? {}) };
  const M = cfg?.moneda ?? '◈';
  const guild = guildul(client, cfg);
  if (!guild) return;
  const canal = gasesteCanal(guild, cfg?.canale?.general ?? 'general');
  const t = acum.getTime();

  for (const f of ferestre(acum, c, c.gratieFinalMinute * 60000)) {
    const s = fereastraStare(f.id);
    const start = f.start.getTime();
    const sfarsit = f.sfarsit.getTime();

    if (t < start) {
      if (t >= start - c.evenimentInainteOre * 3600000) await asiguraEvenimentul(guild, f, c);
      if (t >= start - c.preanuntMinute * 60000 && !s.preanunt) await preanunta(guild, canal, f, c, M);
      continue;
    }
    if (t < sfarsit) {
      if (!s.start) await deschide(guild, canal, f, c, M);
      acordaMinutul(guild, f, c, cfg, acum);
      continue;
    }
    if (!s.final) await incheie(guild, canal, f, c, M);
  }
}

export function porneste(client, cfg) {
  citesteStarea();
  client.once('clientReady', () => {
    const ruleaza = () => tick(client, cfg).catch((e) => console.error('[warpin]', e.message));
    setTimeout(ruleaza, 20_000);
    setInterval(ruleaza, 60_000);
  });
}

export const _intern = {
  ferestre, ferestreleUrmatoare, idFereastra, subsol, textZile, tick, participantiiDePeVoce,
  reseteazaStareaInMemorie, FISIER_STARE, PREANUNTURI, DESCHIDERI,
};
export default { porneste, DEFINITII, ferestreleUrmatoare, idFereastra, _intern };
