// Utilitare partajate de toate modulele Curierului.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PermissionFlagsBits, ChannelType } from 'discord.js';

const AICI = path.dirname(fileURLToPath(import.meta.url));
export const RADACINA_DATE = process.env.DATA_DIR || path.join(AICI, '..');
try { fs.mkdirSync(RADACINA_DATE, { recursive: true }); } catch { /* exista */ }

export const FUS = 'Europe/Bucharest';

export const ID = {
  guild: '1540003384042590339',
  general: '1540008368045953134',
  offTopic: '1540008628210372739',
  trivia: '1540428231495262258',
  snac: '1272997404391637067',
  appCurier: '1540386506902995024',
  appRadio: '1540810161315381250',
};

// ---------------------------------------------------------------------------
// JSON pe disc, scriere atomica
// ---------------------------------------------------------------------------

export function caleDate(nume) {
  return path.join(RADACINA_DATE, nume);
}

export function citesteJson(nume, implicit = {}) {
  try {
    const d = JSON.parse(fs.readFileSync(caleDate(nume), 'utf8'));
    return d && typeof d === 'object' ? d : implicit;
  } catch {
    return implicit;
  }
}

export function scrieJson(nume, date) {
  const cale = caleDate(nume);
  const tmp = cale + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(date, null, 2));
    fs.renameSync(tmp, cale);
    return true;
  } catch (e) {
    console.error(`[comun] nu am putut scrie ${nume}:`, e.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Timp local (Europe/Bucharest), corect si la schimbarea de ora
// ---------------------------------------------------------------------------

const fmtParti = new Intl.DateTimeFormat('en-GB', {
  timeZone: FUS, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
});

const ZILE = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// { an, luna, zi, ora, minut, secunda, ziSapt (0=duminica), data:'YYYY-MM-DD' }
export function oraLocala(cand = new Date()) {
  const p = Object.fromEntries(fmtParti.formatToParts(cand).map((x) => [x.type, x.value]));
  return {
    an: +p.year, luna: +p.month, zi: +p.day,
    ora: +p.hour, minut: +p.minute, secunda: +p.second,
    ziSapt: ZILE[p.weekday],
    data: `${p.year}-${p.month}-${p.day}`,
  };
}

// Offsetul fusului fata de UTC, in minute, la momentul dat.
function offsetMinute(cand) {
  const l = oraLocala(cand);
  const caUtc = Date.UTC(l.an, l.luna - 1, l.zi, l.ora, l.minut, l.secunda);
  return Math.round((caUtc - cand.getTime()) / 60000);
}

// Momentul (Date) la care e ora locala data, in ziua data. Corectie iterativa a offsetului.
export function instant(an, luna, zi, ora = 0, minut = 0) {
  let t = Date.UTC(an, luna - 1, zi, ora, minut, 0);
  for (let i = 0; i < 3; i++) {
    const off = offsetMinute(new Date(t));
    const nou = Date.UTC(an, luna - 1, zi, ora, minut, 0) - off * 60000;
    if (nou === t) break;
    t = nou;
  }
  return new Date(t);
}

// Luni 00:00 local al saptamanii care contine momentul dat.
export function inceputSaptamanii(cand = new Date()) {
  const l = oraLocala(cand);
  const inapoi = (l.ziSapt + 6) % 7; // luni=0
  const azi = instant(l.an, l.luna, l.zi, 0, 0);
  return new Date(azi.getTime() - inapoi * 86400000 + 1000 * 60 * 60 * 0);
}

export function ziLocala(cand = new Date()) {
  return oraLocala(cand).data;
}

// ---------------------------------------------------------------------------
// Discord: canale, permisiuni, roluri
// ---------------------------------------------------------------------------

export function guildul(client, cfg) {
  return client.guilds.cache.get(cfg?.guild ?? ID.guild) ?? client.guilds.cache.first() ?? null;
}

// Gaseste un canal dupa ID sau dupa nume (fara #). tip: ChannelType sau null pentru orice.
export function gasesteCanal(guild, spec, tip = ChannelType.GuildText) {
  if (!guild || !spec) return null;
  const s = String(spec).replace(/^#/, '');
  const dupaId = guild.channels.cache.get(s);
  if (dupaId) return dupaId;
  return guild.channels.cache.find((c) => c.name === s && (tip === null || c.type === tip)) ?? null;
}

// Gaseste sau creeaza un canal text. Capcanele: nu cere biti pe care botul nu-i are;
// daca inchizi SendMessages pentru @everyone, pune-ti intai exceptia ta.
export async function asiguraCanal(guild, nume, { readOnly = false, motiv = 'Curierul Xel\'Naga', parinte = null } = {}) {
  let canal = gasesteCanal(guild, nume);
  if (canal) return canal;
  const overwrites = [];
  if (readOnly) {
    overwrites.push({ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] });
    overwrites.push({
      id: guild.members.me.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
    });
  }
  try {
    canal = await guild.channels.create({
      name: String(nume), type: ChannelType.GuildText, reason: motiv,
      parent: parinte ?? undefined, permissionOverwrites: overwrites,
    });
    return canal;
  } catch (e) {
    console.error(`[comun] nu am putut crea canalul ${nume}:`, e.message);
    return null;
  }
}

export async function asiguraRol(guild, nume, { culoare = 0x99AAB5, hoist = false, motiv = 'Curierul Xel\'Naga', subPozitia = null } = {}) {
  let rol = guild.roles.cache.find((r) => r.name === nume);
  if (rol) return rol;
  try {
    const pozitie = subPozitia ?? guild.members.me.roles.highest.position;
    rol = await guild.roles.create({ name: nume, color: culoare, hoist, reason: motiv, position: Math.max(1, pozitie - 1) });
    return rol;
  } catch (e) {
    console.error(`[comun] nu am putut crea rolul ${nume}:`, e.message);
    return null;
  }
}

export function potMutaRolul(guild, rol) {
  return rol && rol.position < guild.members.me.roles.highest.position
    && guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles);
}

export async function numeleLui(guild, id) {
  try { return (await guild.members.fetch(id)).displayName; } catch { return `plecat (${id})`; }
}

// Trimite in canal fara sa arunce.
export async function trimite(canal, continut) {
  if (!canal) return null;
  try { return await canal.send(continut); } catch (e) { console.error('[comun] send:', e.message); return null; }
}

export async function dm(client, userId, continut) {
  try { const u = await client.users.fetch(userId); return await u.send(continut); } catch (e) { console.error('[comun] dm:', e.message); return null; }
}

// ---------------------------------------------------------------------------
// Galeata cu jetoane (rate limit simplu)
// ---------------------------------------------------------------------------

export function galeata(capacitate, peSecunda) {
  let jetoane = capacitate; let ultim = Date.now();
  return async function ia() {
    for (;;) {
      const acum = Date.now();
      jetoane = Math.min(capacitate, jetoane + ((acum - ultim) / 1000) * peSecunda);
      ultim = acum;
      if (jetoane >= 1) { jetoane -= 1; return; }
      await new Promise((r) => setTimeout(r, Math.ceil((1 - jetoane) / peSecunda * 1000)));
    }
  };
}

// fetch cu timeout, headere DOAR ASCII (apostroful tipografic omoara fetch-ul in Node).
export async function fetchCuTimeout(url, optiuni = {}, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...optiuni, signal: ctrl.signal, headers: { 'User-Agent': 'CurierulXelNaga/2.0 (Discord bot; SC2 Romania)', ...(optiuni.headers ?? {}) } });
  } finally { clearTimeout(t); }
}

export function alegeStabil(lista, cheie) {
  let h = 0;
  for (const c of String(cheie)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return lista[h % lista.length];
}

export function pad(n) { return String(n).padStart(2, '0'); }

export default {
  RADACINA_DATE, FUS, ID, caleDate, citesteJson, scrieJson, oraLocala, instant, inceputSaptamanii, ziLocala,
  guildul, gasesteCanal, asiguraCanal, asiguraRol, potMutaRolul, numeleLui, trimite, dm, galeata, fetchCuTimeout,
  alegeStabil, pad,
};
