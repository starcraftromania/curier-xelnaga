// Camerele Cetatii - camere vocale automate (join-to-create).
// Un canal-portal de voce "➕ Creeaza camera": cine intra in el primeste pe loc o camera
// proprie, numita dupa o planeta din SC2, si e mutat acolo. Cand pleaca toata lumea,
// camera dispare dupa cateva secunde. Starea sta in camere.json.

import { ChannelType, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { citesteJson, scrieJson, guildul } from './comun.js';

export const NUME_PORTAL = '➕ Creeaza camera';
export const NUME_CATEGORIE = 'Camere';
export const PLANETE = [
  'Aiur', 'Char', 'Korhal', 'Shakuras', 'Zerus', 'Tarsonis',
  'Mar Sara', 'Umoja', 'Kaldir', 'Moria', 'Braxis', 'Ulnar',
];

const FISIER = 'camere.json';
const IMPLICIT = {
  intarziereStergereMs: 8_000,
  categorie: NUME_CATEGORIE,
};
const LIMITA_REDENUMIRI = 2;               // limita Discord: 2 redenumiri / 10 minute pe canal
const FEREASTRA_REDENUMIRI_MS = 10 * 60 * 1000;

let conf = { ...IMPLICIT };
let stare = { portalId: null, camere: {} };
const stergeri = new Map();      // canalId -> timeout
const redenumiri = new Map();    // canalId -> [timestamp, ...]

export const DEFINITII = [
  {
    name: 'camera',
    description: 'Gestioneaza camera ta vocala (creata prin portalul ➕ Creeaza camera)',
    options: [
      {
        type: 1, name: 'nume', description: 'Redenumeste camera ta',
        options: [{ type: 3, name: 'nume', description: 'Noul nume (max 32 caractere)', required: true, max_length: 32 }],
      },
      {
        type: 1, name: 'limita', description: 'Seteaza limita de locuri (0 = fara limita)',
        options: [{ type: 4, name: 'limita', description: 'Numar de locuri, 0-99', required: true, min_value: 0, max_value: 99 }],
      },
      { type: 1, name: 'blocheaza', description: 'Inchide camera: nimeni altcineva nu mai poate intra' },
      { type: 1, name: 'deblocheaza', description: 'Deschide camera din nou pentru toata lumea' },
      { type: 1, name: 'preia', description: 'Preia camera daca proprietarul a plecat' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Stare
// ---------------------------------------------------------------------------

function citesteStarea() {
  const d = citesteJson(FISIER, {});
  stare = {
    portalId: d.portalId ?? null,
    camere: d.camere && typeof d.camere === 'object' ? d.camere : {},
  };
}

function salveazaStarea() {
  scrieJson(FISIER, stare);
}

function eOm(m) {
  return m && !m.user?.bot;
}

function oameni(canal) {
  if (!canal?.members) return [];
  return [...canal.members.values()].filter(eOm);
}

function eVoce(canal) {
  return canal && (canal.type === ChannelType.GuildVoice || canal.type === ChannelType.GuildStageVoice);
}

// ---------------------------------------------------------------------------
// Portalul si categoria
// ---------------------------------------------------------------------------

function categoria(guild) {
  const nume = String(conf.categorie).toLowerCase();
  return guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && String(c.name).toLowerCase() === nume,
  ) ?? null;
}

async function asiguraPortal(guild) {
  let portal = stare.portalId ? guild.channels.cache.get(stare.portalId) : null;
  if (!portal) {
    portal = guild.channels.cache.find((c) => eVoce(c) && c.name === NUME_PORTAL) ?? null;
  }
  if (!portal) {
    const cat = categoria(guild);
    try {
      // Fara permissionOverwrites la creare: nu cerem biti pe care botul poate nu-i are.
      portal = await guild.channels.create({
        type: ChannelType.GuildVoice,
        name: NUME_PORTAL,
        userLimit: 1,
        parent: cat ? cat.id : undefined,
        reason: 'Camerele Cetatii: portalul de creare',
      });
    } catch (e) {
      console.error('[camere] nu am putut crea portalul:', e.message);
      return null;
    }
  }
  if (portal && stare.portalId !== portal.id) {
    stare.portalId = portal.id;
    salveazaStarea();
  }
  return portal;
}

// La boot: camerele din stare care nu mai exista sau sunt goale dispar.
async function curataOrfane(guild) {
  let schimbat = false;
  for (const id of Object.keys(stare.camere)) {
    const canal = guild.channels.cache.get(id);
    if (!canal) { delete stare.camere[id]; schimbat = true; continue; }
    if (oameni(canal).length === 0) {
      try { await canal.delete('Camerele Cetatii: camera orfana'); } catch (e) { console.error('[camere] orfana:', e.message); }
      delete stare.camere[id];
      schimbat = true;
    }
  }
  if (schimbat) salveazaStarea();
}

async function boot(client, cfg) {
  const guild = guildul(client, cfg);
  if (!guild) return null;
  const portal = await asiguraPortal(guild);
  await curataOrfane(guild);
  return portal;
}

// ---------------------------------------------------------------------------
// Crearea si stergerea camerelor
// ---------------------------------------------------------------------------

function numeLiber(guild) {
  const folosite = new Set();
  for (const c of Object.values(stare.camere)) folosite.add(c.nume);
  for (const c of guild.channels.cache.values()) if (eVoce(c)) folosite.add(c.name);
  const libere = PLANETE.filter((p) => !folosite.has(p));
  if (libere.length > 0) return libere[Math.floor(Math.random() * libere.length)];
  return `Camera ${Object.keys(stare.camere).length + 1}`;
}

async function creeazaCamera(member) {
  const guild = member.guild;
  const portal = guild.channels.cache.get(stare.portalId);
  const nume = numeLiber(guild);
  let canal;
  try {
    canal = await guild.channels.create({
      type: ChannelType.GuildVoice,
      name: nume,
      parent: portal?.parentId ?? undefined,
      reason: `Camerele Cetatii: camera lui ${member.displayName ?? member.id}`,
    });
  } catch (e) {
    console.error('[camere] nu am putut crea camera:', e.message);
    return null;
  }

  stare.camere[canal.id] = { proprietar: member.id, nume, creat: new Date().toISOString() };
  salveazaStarea();

  try {
    await canal.permissionOverwrites.edit(member.id, { ManageChannels: true, Connect: true });
  } catch (e) {
    console.error('[camere] overwrite proprietar:', e.message);
  }

  try {
    await member.voice.setChannel(canal);
  } catch (e) {
    // a plecat intre timp: camera goala dispare pe drumul obisnuit
    console.error('[camere] nu l-am putut muta:', e.message);
    programeazaStergerea(guild, canal.id);
  }
  return canal;
}

function anuleazaStergerea(canalId) {
  const t = stergeri.get(canalId);
  if (t) { clearTimeout(t); stergeri.delete(canalId); }
}

function programeazaStergerea(guild, canalId) {
  anuleazaStergerea(canalId);
  const t = setTimeout(() => {
    stergeri.delete(canalId);
    stergeDacaGoala(guild, canalId).catch((e) => console.error('[camere] stergere:', e.message));
  }, conf.intarziereStergereMs);
  if (typeof t.unref === 'function') t.unref();
  stergeri.set(canalId, t);
}

async function stergeDacaGoala(guild, canalId) {
  const canal = guild.channels.cache.get(canalId);
  if (!canal) {
    delete stare.camere[canalId];
    salveazaStarea();
    return;
  }
  if (oameni(canal).length > 0) return;
  try { await canal.delete('Camerele Cetatii: camera goala'); } catch (e) { console.error('[camere] delete:', e.message); }
  delete stare.camere[canalId];
  redenumiri.delete(canalId);
  salveazaStarea();
}

async function peVoice(vechi, nou) {
  const member = nou?.member ?? vechi?.member;
  if (!member) return;
  const guild = member.guild;
  const vechiId = vechi?.channelId ?? null;
  const nouId = nou?.channelId ?? null;
  if (vechiId === nouId) return;

  // a plecat dintr-o camera -> daca a ramas goala, o stergem dupa intarziere
  if (vechiId && stare.camere[vechiId]) {
    const canal = guild.channels.cache.get(vechiId);
    if (!canal) { delete stare.camere[vechiId]; salveazaStarea(); }
    else if (oameni(canal).length === 0) programeazaStergerea(guild, vechiId);
  }

  // a intrat intr-o camera -> anulam o eventuala stergere programata
  if (nouId && stare.camere[nouId]) anuleazaStergerea(nouId);

  // a intrat in portal -> camera noua
  if (nouId && nouId === stare.portalId && eOm(member)) {
    await creeazaCamera(member);
  }
}

// ---------------------------------------------------------------------------
// Comenzile /camera
// ---------------------------------------------------------------------------

function raspunde(i, content) {
  return i.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
}

function potRedenumi(canalId, acum) {
  const lista = (redenumiri.get(canalId) ?? []).filter((t) => acum - t < FEREASTRA_REDENUMIRI_MS);
  redenumiri.set(canalId, lista);
  return lista.length < LIMITA_REDENUMIRI;
}

async function peComanda(i) {
  const sub = i.options.getSubcommand();
  const guild = i.guild;
  const canalId = i.member?.voice?.channelId ?? null;
  const camera = canalId ? stare.camere[canalId] : null;
  const canal = canalId ? guild.channels.cache.get(canalId) : null;

  if (!camera || !canal) {
    return raspunde(i, `Nu esti intr-o camera creata prin **${NUME_PORTAL}**. Intra in portal si primesti una.`);
  }

  if (sub === 'preia') {
    if (camera.proprietar === i.user.id) return raspunde(i, 'Camera e deja a ta.');
    const proprietarPrezent = oameni(canal).some((m) => m.id === camera.proprietar);
    if (proprietarPrezent) return raspunde(i, 'Proprietarul e inca in camera. Nu se preia sub ochii lui.');
    const vechi = camera.proprietar;
    camera.proprietar = i.user.id;
    salveazaStarea();
    try { await canal.permissionOverwrites.edit(vechi, { ManageChannels: null, Connect: null }); } catch { /* poate nu mai exista */ }
    try { await canal.permissionOverwrites.edit(i.user.id, { ManageChannels: true, Connect: true }); } catch (e) { console.error('[camere] preia:', e.message); }
    return raspunde(i, `Camera **${canal.name}** e acum a ta.`);
  }

  if (camera.proprietar !== i.user.id) {
    return raspunde(i, 'Doar proprietarul camerei poate face asta. Daca a plecat, foloseste `/camera preia`.');
  }

  try {
    if (sub === 'nume') {
      const nume = String(i.options.getString('nume') ?? '').trim().slice(0, 32);
      if (!nume) return raspunde(i, 'Numele nu poate fi gol.');
      if (!potRedenumi(canal.id, Date.now())) {
        return raspunde(i, 'Discord permite doar 2 redenumiri la 10 minute pe canal. Mai asteapta putin.');
      }
      await canal.setName(nume, 'Camerele Cetatii: /camera nume');
      redenumiri.get(canal.id).push(Date.now());
      camera.nume = nume;
      salveazaStarea();
      return raspunde(i, `Camera se numeste acum **${nume}**.`);
    }
    if (sub === 'limita') {
      const n = Math.max(0, Math.min(99, Number(i.options.getInteger('limita')) || 0));
      await canal.setUserLimit(n, 'Camerele Cetatii: /camera limita');
      return raspunde(i, n === 0 ? 'Camera nu mai are limita de locuri.' : `Limita camerei: **${n}** locuri.`);
    }
    if (sub === 'blocheaza') {
      await canal.permissionOverwrites.edit(guild.roles.everyone.id, { Connect: false });
      return raspunde(i, 'Camera e incuiata. Cine e inauntru ramane; altii nu mai intra.');
    }
    if (sub === 'deblocheaza') {
      await canal.permissionOverwrites.edit(guild.roles.everyone.id, { Connect: null });
      return raspunde(i, 'Camera e deschisa din nou.');
    }
  } catch (e) {
    console.error('[camere] comanda:', e.message);
    return raspunde(i, `Nu am reusit: ${e.message}`);
  }
  return raspunde(i, 'Subcomanda necunoscuta.');
}

// ---------------------------------------------------------------------------
// Pornire
// ---------------------------------------------------------------------------

export function porneste(client, cfg) {
  conf = { ...IMPLICIT, ...(cfg?.camere ?? {}) };
  citesteStarea();

  client.on('voiceStateUpdate', (vechi, nou) => {
    peVoice(vechi, nou).catch((e) => console.error('[camere voice]', e.message));
  });

  client.on('interactionCreate', (i) => {
    if (typeof i.isChatInputCommand === 'function' && i.isChatInputCommand() && i.commandName === 'camera') {
      peComanda(i).catch((e) => console.error('[camere cmd]', e.message));
    }
  });

  client.once('clientReady', () => {
    setTimeout(() => boot(client, cfg).catch((e) => console.error('[camere]', e.message)), 5_000).unref?.();
  });
}

export const _intern = {
  boot, peVoice, peComanda, creeazaCamera, numeLiber, oameni,
  starea: () => stare, PLANETE, NUME_PORTAL,
};
export default { porneste, DEFINITII, _intern };
