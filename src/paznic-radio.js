// Paznicul radioului - Curierul vegheaza farul Radio Xel'Naga. Zero comenzi.
// Paznicul de pe VM-ul radioului editeaza la 5 minute un mesaj al lui in #off-topic
// ("Farul Cetatii"). Daca farul nu a mai batut de 20 de minute (4 batai ratate), Curierul
// alerteaza: DM catre Snac, #general si moderator-only (daca exista si poate scrie), cu
// indicatia catre portalul Azure. Reaminteste la 2 ore cat timp e cazut si anunta revenirea.
// Daca nu poate citi canalul sau pica reteaua: doar log - nu tipa pe necunoastere.
// Starea sta in paznic-radio.json.

import { PermissionFlagsBits } from 'discord.js';
import { citesteJson, scrieJson, guildul, gasesteCanal, trimite, dm, ID } from './comun.js';

export const DEFINITII = [];

const FISIER = 'paznic-radio.json';
export const SEMN_FAR = 'Farul Cetatii';
const AZURE = 'Portal Azure -> Virtual machines -> VM `radio-xelnaga` (resource group `radio-xelnaga`) -> Start / Restart.';

const IMPLICIT = {
  activ: true,
  canal: ID.offTopic,
  pragMinute: 20,
  intervalMinute: 5,
  reamintireMinute: 120,
  dm: ID.snac,
  canalPublic: 'general',
  canalStaff: 'moderator-only',
  autorFar: ID.appRadio,
};

export const ceas = { acum: () => Date.now() };

let conf = { ...IMPLICIT };
let stare = { mesajId: null, cazutDe: null, ultimaAlerta: null };
let cfgGlobal = {};
const avertizat = new Set();

function citesteStarea() {
  const d = citesteJson(FISIER, {});
  stare = {
    mesajId: d.mesajId ?? null,
    cazutDe: d.cazutDe ?? null,
    ultimaAlerta: d.ultimaAlerta ?? null,
  };
}

function salveazaStarea() {
  scrieJson(FISIER, stare);
}

function avertizeazaODataSingura(cheie, mesaj) {
  if (avertizat.has(cheie)) return;
  avertizat.add(cheie);
  console.warn('[paznic-radio]', mesaj);
}

export function durata(ms) {
  const minute = Math.max(0, Math.round(ms / 60_000));
  if (minute < 60) return `${minute} min`;
  const ore = Math.floor(minute / 60);
  const rest = minute % 60;
  if (ore < 24) return rest ? `${ore}h ${rest}min` : `${ore}h`;
  const zile = Math.floor(ore / 24);
  return `${zile}z ${ore % 24}h`;
}

// ---------------------------------------------------------------------------
// Gasirea farului
// ---------------------------------------------------------------------------

function eFar(m) {
  return m && m.author?.id === String(conf.autorFar) && String(m.content ?? '').includes(SEMN_FAR);
}

// Intoarce mesajul-far sau null. Arunca daca Discord/reteaua nu raspund (apelantul tace).
async function gasesteFarul(canal) {
  if (stare.mesajId) {
    let m = null;
    try { m = await canal.messages.fetch(stare.mesajId); } catch (e) {
      // 10008 = Unknown Message: farul a fost sters/recreat -> rescanam. Altceva = retea.
      if (e?.code !== 10008 && e?.status !== 404) throw e;
    }
    if (eFar(m)) return m;
  }
  const lot = await canal.messages.fetch({ limit: 50 });
  const lista = typeof lot?.values === 'function' ? [...lot.values()] : Array.isArray(lot) ? lot : [];
  const far = lista.filter(eFar).sort((a, b) => bataia(b) - bataia(a))[0] ?? null;
  if (far && far.id !== stare.mesajId) {
    stare.mesajId = far.id;
    salveazaStarea();
  }
  return far;
}

function bataia(m) {
  const t = m.editedTimestamp ?? m.createdTimestamp ?? null;
  if (t == null) return NaN;
  return typeof t === 'number' ? t : Date.parse(t);
}

// ---------------------------------------------------------------------------
// Alerte
// ---------------------------------------------------------------------------

function potScrie(canal, guild) {
  if (!canal) return false;
  if (typeof canal.permissionsFor !== 'function' || !guild?.members?.me) return true;
  try {
    const p = canal.permissionsFor(guild.members.me);
    return !p || p.has(PermissionFlagsBits.SendMessages);
  } catch { return true; }
}

async function anunta(client, guild, text, { staff = false } = {}) {
  if (conf.dm) await dm(client, conf.dm, text);
  await trimite(gasesteCanal(guild, cfgGlobal?.canale?.general ?? conf.canalPublic), text);
  if (staff && conf.canalStaff) {
    const c = gasesteCanal(guild, conf.canalStaff);
    if (c && potScrie(c, guild)) await trimite(c, text);
    else avertizeazaODataSingura('staff', `canalul de staff "${conf.canalStaff}" lipseste sau nu pot scrie in el; alerta merge doar prin DM si #general`);
  }
}

function textAlerta(vechimeMs, reamintire) {
  const cap = reamintire
    ? `📻 **Radio Xel'Naga e in continuare cazut** de ${durata(vechimeMs)}.`
    : `📻 **Radio Xel'Naga pare cazut**: farul nu a mai batut de ${durata(vechimeMs)}.`;
  return [
    cap,
    `Ultima bataie a farului: acum ${durata(vechimeMs)}. Probabil VM-ul s-a oprit sau paznicul de pe el a murit.`,
    AZURE,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Tick-ul
// ---------------------------------------------------------------------------

async function tick(client) {
  if (!conf.activ) return 'inactiv';
  const guild = guildul(client, cfgGlobal);
  if (!guild) return 'fara-guild';
  const canal = gasesteCanal(guild, conf.canal);
  if (!canal || typeof canal.messages?.fetch !== 'function') {
    avertizeazaODataSingura('canal', `nu gasesc canalul farului (${conf.canal}); nu alertez`);
    return 'fara-canal';
  }

  let far;
  try {
    far = await gasesteFarul(canal);
  } catch (e) {
    console.error('[paznic-radio] nu pot citi farul (retea/Discord), tac:', e.message);
    return 'eroare';
  }
  if (!far) {
    avertizeazaODataSingura('far', `nu gasesc niciun mesaj cu "${SEMN_FAR}" de la app-ul Radio in ultimele 50; nu alertez`);
    return 'fara-far';
  }
  avertizat.delete('far');

  const acum = ceas.acum();
  const ultima = bataia(far);
  if (Number.isNaN(ultima)) return 'fara-timp';
  const vechime = acum - ultima;
  const prag = conf.pragMinute * 60_000;

  if (vechime > prag) {
    if (!stare.cazutDe) {
      stare.cazutDe = new Date(ultima).toISOString();
      stare.ultimaAlerta = null;
      salveazaStarea();
    }
    const deLaAlerta = stare.ultimaAlerta ? acum - Date.parse(stare.ultimaAlerta) : Infinity;
    const eReamintire = !!stare.ultimaAlerta;
    if (deLaAlerta >= conf.reamintireMinute * 60_000) {
      await anunta(client, guild, textAlerta(vechime, eReamintire), { staff: true });
      stare.ultimaAlerta = new Date(acum).toISOString();
      salveazaStarea();
      return eReamintire ? 'reamintire' : 'alerta';
    }
    return 'cazut';
  }

  if (stare.cazutDe) {
    const cadere = acum - Date.parse(stare.cazutDe);
    await anunta(client, guild, `📻 **Radio Xel'Naga a revenit.** Farul bate din nou; caderea a tinut ${durata(cadere)}.`);
    stare.cazutDe = null;
    stare.ultimaAlerta = null;
    salveazaStarea();
    return 'revenit';
  }
  return 'ok';
}

// ---------------------------------------------------------------------------
// Pornire
// ---------------------------------------------------------------------------

export function porneste(client, cfg) {
  cfgGlobal = cfg ?? {};
  conf = { ...IMPLICIT, ...(cfg?.paznicRadio ?? {}) };
  citesteStarea();
  if (!conf.activ) return;

  client.once('clientReady', () => {
    const ruleaza = () => tick(client).catch((e) => console.error('[paznic-radio]', e.message));
    setTimeout(ruleaza, 20_000).unref?.();
    setInterval(ruleaza, conf.intervalMinute * 60_000).unref?.();
  });
}

export const _intern = { ceas, tick, gasesteFarul, durata, starea: () => stare, SEMN_FAR };
export default { porneste, DEFINITII, _intern };
