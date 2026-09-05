// Cardul de replay: /replay fisier:<.SC2Replay> -> embed cu harta, matchup, durata, rezultat, APM
// si primele mutari din build order. Parsarea se face intr-un proces separat (replay-worker.js)
// cu memorie limitata si timeout. 30 credite per replay, plafon 90/zi (camp propriu pe user).
// Luni la 12:00 se anunta in #general replay-ul saptamanii (cele mai multe stele).

import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import child_process from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EmbedBuilder } from 'discord.js';
import store from './store.js';
import {
  citesteJson, scrieJson, fetchCuTimeout, guildul, gasesteCanal, trimite,
  inceputSaptamanii, ziLocala, pad,
} from './comun.js';

const AICI = path.dirname(fileURLToPath(import.meta.url));
const CALE_WORKER = path.join(AICI, 'replay-worker.js');
const FISIER_STARE = 'replay.json';

const IMPLICIT = {
  marimeMax: 8 * 1024 * 1024,
  recompensa: 30,
  plafonZilnic: 90,
  premiuSaptamana: 400,
  timeoutParsareMs: 20_000,
  timeoutDescarcareMs: 15_000,
  parsariSimultane: 2,
  tickMs: 60_000,
  oraAnunt: 12, // luni, ora locala
};

export const DEFINITII = [
  {
    name: 'replay',
    description: 'Posteaza un replay SC2 si primeste cardul lui (+30 credite, max 90/zi)',
    options: [
      { name: 'fisier', description: 'Fisierul .SC2Replay (max 8 MB)', type: 11, required: true },
    ],
  },
];

// Injectabile in teste: fork-ul workerului si ceasul.
export const _intern = {
  fork: (cale, args, opt) => child_process.fork(cale, args, opt),
  acum: () => Date.now(),
};

let M = '◈';
let stare = null;
let inLucru = 0;

// ---------------------------------------------------------------------------
// Stare pe disc
// ---------------------------------------------------------------------------

function citesteStarea() {
  const s = citesteJson(FISIER_STARE, {});
  stare = {
    carduri: s.carduri && typeof s.carduri === 'object' ? s.carduri : {},
    ultimaSaptamanaAnuntata: s.ultimaSaptamanaAnuntata ?? null,
  };
  return stare;
}

function salveazaStarea() {
  if (stare) scrieJson(FISIER_STARE, stare);
}

function starea() {
  return stare ?? citesteStarea();
}

// ---------------------------------------------------------------------------
// Validare si recompensa
// ---------------------------------------------------------------------------

export function valideaza(atasament, c = IMPLICIT) {
  if (!atasament || !atasament.name) return { ok: false, motiv: 'Lipseste fisierul.' };
  if (!/\.sc2replay$/i.test(String(atasament.name))) {
    return { ok: false, motiv: 'Fisierul trebuie sa fie un `.SC2Replay` (din Documents/StarCraft II/Accounts/.../Replays).' };
  }
  const marime = Number(atasament.size) || 0;
  if (marime <= 0) return { ok: false, motiv: 'Fisierul e gol.' };
  if (marime > c.marimeMax) {
    return { ok: false, motiv: `Fisierul are ${(marime / 1024 / 1024).toFixed(1)} MB; limita e ${c.marimeMax / 1024 / 1024} MB.` };
  }
  if (!atasament.url) return { ok: false, motiv: 'Nu am primit adresa fisierului de la Discord.' };
  return { ok: true };
}

// 30 per replay, plafon 90/zi, pe campurile proprii replayAzi/ziReplay. Intoarce cat s-a dat.
export function acordaReplay(userId, c = IMPLICIT) {
  const u = store.utilizator(userId);
  const azi = store.ziCurenta();
  if (u.ziReplay !== azi) { u.ziReplay = azi; u.replayAzi = 0; }
  const ramas = Math.max(0, c.plafonZilnic - (u.replayAzi || 0));
  const dat = Math.max(0, Math.min(c.recompensa, ramas));
  if (dat > 0) {
    store.ajusteaza(userId, dat);
    u.totalCastigat += dat;
    u.replayAzi = (u.replayAzi || 0) + dat;
  }
  store.salveaza();
  return dat;
}

// ---------------------------------------------------------------------------
// Descarcare si parsare in proces separat
// ---------------------------------------------------------------------------

async function descarca(url, c) {
  const r = await fetchCuTimeout(url, {}, c.timeoutDescarcareMs);
  if (!r.ok) throw new Error(`descarcare esuata (HTTP ${r.status})`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length === 0) throw new Error('fisier gol');
  if (buf.length > c.marimeMax) throw new Error('fisierul e mai mare decat limita');
  const cale = path.join(os.tmpdir(), `curier-replay-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.SC2Replay`);
  fs.writeFileSync(cale, buf);
  return cale;
}

export function parseazaInProces(cale, c = IMPLICIT) {
  return new Promise((resolve, reject) => {
    let gata = false;
    const termina = (fn, val) => { if (gata) return; gata = true; clearTimeout(t); fn(val); };
    let w;
    try {
      w = _intern.fork(CALE_WORKER, [cale], { execArgv: ['--max-old-space-size=128'] });
    } catch (e) {
      return reject(new Error(`nu am putut porni parserul: ${e.message}`));
    }
    const t = setTimeout(() => {
      try { w.kill('SIGKILL'); } catch { /* deja mort */ }
      termina(reject, new Error('parsarea a depasit timpul'));
    }, c.timeoutParsareMs);
    w.on('message', (m) => {
      if (m && m.ok) termina(resolve, m.rezultat);
      else termina(reject, new Error(m?.eroare ?? 'parserul nu a intors nimic'));
    });
    w.on('error', (e) => termina(reject, new Error(`parser: ${e.message}`)));
    w.on('exit', (cod) => termina(reject, new Error(`parserul s-a oprit fara rezultat (cod ${cod})`)));
  });
}

// ---------------------------------------------------------------------------
// Cardul
// ---------------------------------------------------------------------------

export function durataText(secunde) {
  const s = Math.max(0, Math.round(Number(secunde) || 0));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function matchup(jucatori) {
  return (jucatori ?? []).map((j) => String(j.rasa ?? '?').charAt(0).toUpperCase() || '?').join('v');
}

function culoareaRasei(jucatori) {
  const invingator = (jucatori ?? []).find((j) => j.rezultat === 'victorie');
  const r = String(invingator?.rasa ?? '').toLowerCase();
  if (r.startsWith('t')) return 0x3498DB;
  if (r.startsWith('z')) return 0x9B59B6;
  if (r.startsWith('p')) return 0xF1C40F;
  return 0x95A5A6;
}

export function formateazaCard(rez, { autorId = null } = {}) {
  const jucatori = Array.isArray(rez.jucatori) ? rez.jucatori : [];
  const invingatori = jucatori.filter((j) => j.rezultat === 'victorie').map((j) => j.nume);
  const rezultat = invingatori.length > 0 ? `Castiga **${invingatori.join(', ')}**` : 'Rezultat necunoscut';

  const e = new EmbedBuilder()
    .setTitle(`${rez.harta ?? 'Harta necunoscuta'} · ${matchup(jucatori) || '?'}`.slice(0, 256))
    .setColor(culoareaRasei(jucatori))
    .setDescription(`Durata **${durataText(rez.durataSecunde)}** · ${rezultat}${autorId ? ` · postat de <@${autorId}>` : ''}`);

  if (jucatori.length > 0) {
    const linii = jucatori.map((j) => {
      const semn = j.rezultat === 'victorie' ? 'W' : j.rezultat === 'infrangere' ? 'L' : '-';
      return `\`${semn}\` **${j.nume}** (${j.rasa}) · APM ${j.apm ?? 0}`;
    });
    e.addFields({ name: 'Jucatori', value: linii.join('\n').slice(0, 1024) });
  }

  const build = Array.isArray(rez.build) ? rez.build.slice(0, 14) : [];
  if (build.length > 0) {
    const lat = Math.min(12, Math.max(...build.map((b) => String(b.jucator ?? '').length)));
    const linii = build.map((b) => {
      const cine = String(b.jucator ?? '').slice(0, lat).padEnd(lat);
      return `${durataText(b.secunda).padStart(5)}  ${cine}  ${b.unitate}`;
    });
    e.addFields({ name: `Build order (primele ${build.length} mutari)`, value: `\`\`\`\n${linii.join('\n')}\n\`\`\``.slice(0, 1024) });
  } else {
    e.addFields({ name: 'Build order', value: 'Nu am putut extrage mutarile din replay-ul asta.' });
  }

  const subsol = [rez.versiune ? `Patch ${rez.versiune}` : null, 'Pune o stea daca merita: replay-ul saptamanii ia 400'].filter(Boolean);
  e.setFooter({ text: subsol.join(' · ').slice(0, 2048) });
  return e;
}

// ---------------------------------------------------------------------------
// Comanda
// ---------------------------------------------------------------------------

async function peComandaReplay(i, c) {
  const atasament = i.options.getAttachment('fisier');
  const v = valideaza(atasament, c);
  if (!v.ok) return i.reply({ content: v.motiv, ephemeral: true });
  if (inLucru >= c.parsariSimultane) {
    return i.reply({ content: 'Citesc deja alte replay-uri. Incearca peste un minut.', ephemeral: true });
  }

  await i.deferReply();
  inLucru++;
  let cale = null;
  let rez;
  try {
    cale = await descarca(atasament.url, c);
    rez = await parseazaInProces(cale, c);
  } catch (e) {
    console.error('[replay] parsare:', e.message);
    let motiv = 'Nu am putut citi fisierul asta.';
    if (/build|protocol/i.test(e.message)) motiv = 'Nu am putut citi replay-ul: e probabil dintr-un build prea nou pentru parser (merge sigur pana la 5.0.14 / 96163).';
    else if (/timp/i.test(e.message)) motiv = 'Nu am putut citi replay-ul: parsarea a durat prea mult.';
    else if (/valid/i.test(e.message)) motiv = 'Fisierul nu pare un replay SC2 valid.';
    return i.editReply({ content: `${motiv} (${e.message}). Nu s-au dat credite.` });
  } finally {
    inLucru = Math.max(0, inLucru - 1);
    if (cale) { try { fs.unlinkSync(cale); } catch { /* deja sters */ } }
  }

  const dat = acordaReplay(i.user.id, c);
  const card = formateazaCard(rez, { autorId: i.user.id });
  const nota = dat > 0 ? `+${M}${dat} pentru replay` : `plafonul zilnic de ${M}${c.plafonZilnic} e atins, fara credite azi`;
  let mesaj = null;
  try {
    mesaj = await i.editReply({ content: nota, embeds: [card] });
  } catch (e) {
    console.error('[replay] editReply:', e.message);
    return null;
  }
  if (mesaj?.id) {
    try { await mesaj.react('⭐'); } catch (e) { console.error('[replay] reactie:', e.message); }
    const s = starea();
    s.carduri[mesaj.id] = {
      autor: i.user.id, canalId: mesaj.channelId ?? i.channelId ?? null,
      cand: _intern.acum(), harta: rez.harta ?? null,
    };
    salveazaStarea();
  }
  return mesaj;
}

// ---------------------------------------------------------------------------
// Replay-ul saptamanii: luni la 12:00 local (sau la primul tick de dupa, daca botul era jos)
// ---------------------------------------------------------------------------

async function numaraStelele(client, card) {
  try {
    const canal = await client.channels.fetch(card.canalId);
    const m = await canal.messages.fetch(card.mesajId);
    const r = m.reactions?.cache?.get('⭐');
    if (!r) return 0;
    return Math.max(0, (r.count ?? 0) - (r.me ? 1 : 0));
  } catch {
    return 0;
  }
}

export async function anuntaReplaySaptamanii(client, cfg, c = IMPLICIT) {
  const acum = new Date(_intern.acum());
  const startSapt = inceputSaptamanii(acum);
  const cheie = ziLocala(startSapt);
  if (acum.getTime() < startSapt.getTime() + c.oraAnunt * 3600_000) return false;
  const s = starea();
  if (s.ultimaSaptamanaAnuntata === cheie) return false;

  const de = startSapt.getTime() - 7 * 86400_000;
  const pana = startSapt.getTime();
  const candidati = Object.entries(s.carduri)
    .filter(([, card]) => card.cand >= de && card.cand < pana)
    .map(([mesajId, card]) => ({ mesajId, ...card }));

  let celMaiBun = null;
  for (const card of candidati) {
    const stele = await numaraStelele(client, card);
    if (stele >= 1 && (!celMaiBun || stele > celMaiBun.stele)) celMaiBun = { ...card, stele };
  }

  s.ultimaSaptamanaAnuntata = cheie;
  // curatenie: cardurile mai vechi de 3 saptamani nu mai conteaza
  for (const [id, card] of Object.entries(s.carduri)) if (card.cand < de - 14 * 86400_000) delete s.carduri[id];
  salveazaStarea();

  if (!celMaiBun) return false;
  store.acorda(celMaiBun.autor, c.premiuSaptamana, 99999);
  const guild = guildul(client, cfg);
  const general = gasesteCanal(guild, cfg?.canale?.general ?? 'general');
  const link = guild ? `https://discord.com/channels/${guild.id}/${celMaiBun.canalId}/${celMaiBun.mesajId}` : null;
  await trimite(general, {
    content: `**Replay-ul saptamanii** este al lui <@${celMaiBun.autor}>: *${celMaiBun.harta ?? 'harta necunoscuta'}* `
      + `cu ${celMaiBun.stele} ⭐. Premiul: **+${M}${c.premiuSaptamana}**.${link ? `\n${link}` : ''}`,
  });
  return celMaiBun;
}

// ---------------------------------------------------------------------------
// Pornire
// ---------------------------------------------------------------------------

export function porneste(client, cfg = {}) {
  const c = { ...IMPLICIT, ...(cfg.replay ?? {}) };
  M = cfg.moneda ?? M;
  citesteStarea();

  client.on('interactionCreate', (i) => {
    if (!i.isChatInputCommand?.() || i.commandName !== 'replay') return;
    peComandaReplay(i, c).catch((e) => {
      console.error('[replay]', e.message);
      const r = i.deferred || i.replied ? i.editReply({ content: 'Ceva a crapat la citirea replay-ului.' }) : i.reply({ content: 'Ceva a crapat la citirea replay-ului.', ephemeral: true });
      r.catch(() => {});
    });
  });

  client.once('clientReady', () => {
    const tick = () => anuntaReplaySaptamanii(client, cfg, c).catch((e) => console.error('[replay] saptamana:', e.message));
    setTimeout(tick, 20_000).unref?.();
    setInterval(tick, c.tickMs).unref?.();
  });

  _intern.config = c;
  return c;
}

Object.assign(_intern, { citesteStarea, starea, valideaza, acordaReplay, formateazaCard, parseazaInProces, anuntaReplaySaptamanii, peComandaReplay, IMPLICIT, CALE_WORKER });

export default { porneste, DEFINITII, _intern };
