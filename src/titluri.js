// Titlurile Cetatii - rolurile de podium, in afara de coroana.
// Modul de sine statator: o linie in index.js, zero comenzi noi, nu scrie in
// data.json si nu tine fisier de stare (starea e chiar apartenenta la rol).
//
// 👑 Regele Regilor ramane EXCLUSIV al lui kingofkings.js. Aici nu se atinge.

import { PermissionFlagsBits } from 'discord.js';
import store from './store.js';
import { _intern as kok } from './kingofkings.js';

const INTERVAL_MS = 5 * 60 * 1000;
const INTARZIERE_MS = 12_000; // dupa coroana, ca sa nu se calce in picioare

export const TITLURI = [
  { nume: '🗡️ Marele Uzurpator',  culoare: 0xC0C0C0, sursa: 'credite', loc: 2, motiv: 'locul 2 la credite' },
  { nume: '💠 Boierul de Vespene', culoare: 0x2ECC71, sursa: 'credite', loc: 3, motiv: 'locul 3 la credite' },
  { nume: '🧠 Mintea Roiului',     culoare: 0x9B59B6, sursa: 'camp', camp: 'triviaCastigate', loc: 1, motiv: 'primul la trivia' },
  { nume: '🎙️ Gura Cetatii',       culoare: 0x3498DB, sursa: 'camp', camp: 'minuteVoice',     loc: 1, motiv: 'primul la voce' },
];

export const ALERTE = new Map();
const avertizat = new Set();

function warnODataSingura(cheie, mesaj) {
  if (avertizat.has(cheie)) return;
  avertizat.add(cheie);
  console.warn('[titluri]', mesaj);
}

function tinta(titlu) {
  // Locurile 2 si 3 la credite vin din CHIAR functia folosita de coroana,
  // ca locurile 1-2-3 sa nu se poata contrazice intre ele.
  const lista = titlu.sursa === 'credite'
    ? kok.clasament(Math.max(3, titlu.loc))
    : store.clasamentDupa(titlu.camp, Math.max(3, titlu.loc));
  return lista[titlu.loc - 1]?.id ?? null;
}

async function asiguraRol(guild, titlu, subPozitia) {
  let rol = guild.roles.cache.find((r) => r.name === titlu.nume);
  if (rol) return rol;
  try {
    rol = await guild.roles.create({
      name: titlu.nume,
      color: titlu.culoare,
      hoist: true,
      reason: `Titlurile Cetatii: ${titlu.motiv}`,
      position: Math.max(1, subPozitia - 1),
    });
    return rol;
  } catch (e) {
    ALERTE.set(titlu.nume, `nu am putut crea rolul: ${e.message}`);
    warnODataSingura('creare-' + titlu.nume, `nu am putut crea ${titlu.nume}: ${e.message}`);
    return null;
  }
}

async function aplica(guild, rol, tintaId, titlu) {
  const alMeu = guild.members.me.roles.highest;
  if (rol.position >= alMeu.position) {
    const m = `rolul ${titlu.nume} e deasupra rolului botului - trage "Curierul Xel'Naga" mai sus in Server Settings → Roles`;
    ALERTE.set(titlu.nume, m);
    warnODataSingura('ierarhie-' + titlu.nume, m);
    return;
  }
  if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    const m = 'imi lipseste Manage Roles';
    ALERTE.set(titlu.nume, m);
    warnODataSingura('perm', m);
    return;
  }

  try {
    for (const m of rol.members.values()) {
      if (m.id !== tintaId) await m.roles.remove(rol);
    }
    if (tintaId) {
      const m = await guild.members.fetch(tintaId).catch(() => null);
      if (m && !m.roles.cache.has(rol.id)) await m.roles.add(rol);
    }
    ALERTE.delete(titlu.nume);
  } catch (e) {
    ALERTE.set(titlu.nume, e.message);
    warnODataSingura('aplicare-' + titlu.nume, `${titlu.nume}: ${e.message}`);
  }
}

async function tick(client, cfg) {
  const guild = client.guilds.cache.get(cfg.guild) ?? client.guilds.cache.first();
  if (!guild) return;

  const coroana = guild.roles.cache.find((r) => r.name === kok.NUME_ROL);
  const subPozitia = coroana ? coroana.position : guild.members.me.roles.highest.position;

  // Crearea se face in ordine INVERSA: fiecare rol nou se aseaza imediat sub
  // coroana si il impinge in jos pe cel dinainte, deci in sidebar ies in ordinea dorita.
  for (const titlu of [...TITLURI].reverse()) {
    if (titlu.activ === false) continue;
    const rol = await asiguraRol(guild, titlu, subPozitia);
    if (!rol) continue;
    await aplica(guild, rol, tinta(titlu), titlu);
  }
}

export function porneste(client, cfg) {
  client.once('clientReady', () => {
    setTimeout(() => tick(client, cfg).catch((e) => console.error('[titluri]', e.message)), INTARZIERE_MS);
    setInterval(() => tick(client, cfg).catch((e) => console.error('[titluri]', e.message)), INTERVAL_MS);
  });
}

export default { porneste, TITLURI, ALERTE };
