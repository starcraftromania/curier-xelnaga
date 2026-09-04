// King of Kings - clasamentul live al Cetatii.
// Un singur embed in #king-of-kings, editat la 5 minute, plus rolul 👑 Regele Regilor,
// mutat automat la noul lider. Nu scrie NIMIC in data.json; starea proprie sta in
// king-of-kings.json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits,
} from 'discord.js';
import store from './store.js';

const AICI = path.dirname(fileURLToPath(import.meta.url));
const RADACINA = process.env.DATA_DIR || path.join(AICI, '..');
const CALE = path.join(RADACINA, 'king-of-kings.json');

try { fs.mkdirSync(RADACINA, { recursive: true }); } catch { /* exista deja */ }

const NUME_ROL = '👑 Regele Regilor';
const INTERVAL_MS = 5 * 60 * 1000;
const RACIRE_ANUNT_MS = 60 * 60 * 1000;
const RACIRE_BUTON_MS = 15 * 1000;

export let ALERTA_ROL = null;

let stare = { mesajId: null, canalId: null, regeId: null, ultimulAnunt: 0 };
const racireButon = new Map();

function citesteStarea() {
  try { stare = { ...stare, ...JSON.parse(fs.readFileSync(CALE, 'utf8')) }; } catch { /* prima pornire */ }
}

function salveazaStarea() {
  const tmp = CALE + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(stare, null, 2));
    fs.renameSync(tmp, CALE);
  } catch (e) {
    console.error('[kok] nu am putut salva starea:', e.message);
  }
}

// Clasamentul dupa soldul curent (decizia lui Victor: avere, nu total castigat).
// Respecta exclusi.js prin store.clasament.
export function clasament(limita = 10) {
  return store.clasament(limita);
}

function culoareLoc(k) {
  return k === 0 ? '[1;33m' : k === 1 ? '[1;37m' : k === 2 ? '[0;33m' : '[0m';
}

async function numeleLui(guild, id) {
  try { return (await guild.members.fetch(id)).displayName; } catch { return `plecat (${id})`; }
}

async function construiesteEmbed(guild, cfg) {
  const top = clasament(10);
  const M = cfg.moneda ?? '◈';

  let corp;
  if (top.length === 0) {
    corp = 'Inca nu are cine sa fie rege. Intra pe voce sau raspunde la trivia.';
  } else {
    const linii = ['```ansi'];
    for (let k = 0; k < top.length; k++) {
      const nume = await numeleLui(guild, top[k].id);
      const loc = String(k + 1).padStart(2, ' ');
      const n = nume.length > 24 ? nume.slice(0, 23) + '…' : nume.padEnd(24, ' ');
      const v = String(top[k].valoare).padStart(7, ' ');
      linii.push(`${culoareLoc(k)}${loc}. ${n} ${v} ${M}[0m`);
    }
    linii.push('```');
    corp = linii.join('\n');
  }

  const e = new EmbedBuilder()
    .setColor(0xF1C40F)
    .setTitle('👑 King of Kings')
    .setDescription(corp)
    .setFooter({ text: 'Se actualizeaza la 5 minute · adminii nu concureaza' })
    .setTimestamp(new Date());

  if (ALERTA_ROL) {
    e.addFields({ name: '⚠️ Coroana nu se poate muta', value: ALERTA_ROL });
  }
  return e;
}

function butoane() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('kok:unde').setLabel('📍 Unde sunt eu?').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('kok:refresh').setLabel('🔄 Actualizeaza').setStyle(ButtonStyle.Primary),
  )];
}

async function asiguraCanal(guild, cfg) {
  const spec = cfg.canale?.kingOfKings ?? 'king-of-kings';
  let canal = guild.channels.cache.get(String(spec))
    ?? guild.channels.cache.find((c) => c.name === String(spec) && c.type === 0);
  if (canal) return canal;

  // Capcana 1: nu cere la creare biti pe care botul insusi nu-i are.
  // Capcana 2: daca inchizi SendMessages pentru @everyone, pune-ti intai exceptia ta.
  try {
    canal = await guild.channels.create({
      name: String(spec),
      type: 0,
      reason: 'King of Kings',
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] },
        {
          id: guild.members.me.id,
          allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.EmbedLinks],
        },
      ],
    });
    return canal;
  } catch (e) {
    console.error('[kok] nu am putut crea canalul:', e.message);
    return null;
  }
}

async function asiguraRol(guild) {
  let rol = guild.roles.cache.find((r) => r.name === NUME_ROL);
  if (rol) return rol;
  try {
    const alMeu = guild.members.me.roles.highest;
    rol = await guild.roles.create({
      name: NUME_ROL,
      color: 0xF1C40F,
      hoist: true,
      reason: 'King of Kings',
      position: Math.max(1, alMeu.position - 1),
    });
    return rol;
  } catch (e) {
    ALERTA_ROL = `Nu pot crea rolul ${NUME_ROL}: ${e.message}`;
    return null;
  }
}

async function mutaCoroana(guild, noulRegeId) {
  const rol = await asiguraRol(guild);
  if (!rol) return false;

  const alMeu = guild.members.me.roles.highest;
  if (rol.position >= alMeu.position) {
    ALERTA_ROL = [
      `Rolul **${NUME_ROL}** e mai sus decat rolul botului, deci Discord nu ma lasa sa-l mut.`,
      'Fix: Server Settings → Roles → trage rolul **Curierul Xel\'Naga** deasupra coroanei → Save Changes.',
    ].join('\n');
    return false;
  }
  if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    ALERTA_ROL = 'Imi lipseste permisiunea **Manage Roles**, deci nu pot muta coroana.';
    return false;
  }

  try {
    for (const m of rol.members.values()) {
      if (m.id !== noulRegeId) await m.roles.remove(rol);
    }
    if (noulRegeId) {
      const m = await guild.members.fetch(noulRegeId);
      if (!m.roles.cache.has(rol.id)) await m.roles.add(rol);
    }
    ALERTA_ROL = null;
    return true;
  } catch (e) {
    ALERTA_ROL = `Nu am putut muta coroana: ${e.message}`;
    return false;
  }
}

async function anuntaDetronarea(guild, cfg, vechiId, nouId) {
  if (Date.now() - (stare.ultimulAnunt || 0) < RACIRE_ANUNT_MS) return;
  const spec = cfg.canale?.general ?? 'general';
  const canal = guild.channels.cache.get(String(spec))
    ?? guild.channels.cache.find((c) => c.name === String(spec) && c.type === 0);
  if (!canal) return;
  const nou = await numeleLui(guild, nouId);
  const text = vechiId
    ? `👑 Coroana s-a mutat: **${await numeleLui(guild, vechiId)}** a fost detronat de **${nou}**.`
    : `👑 Cetatea are primul ei rege: **${nou}**.`;
  canal.send({ content: text }).catch(() => {});
  stare.ultimulAnunt = Date.now();
  salveazaStarea();
}

async function tick(client, cfg) {
  const guild = client.guilds.cache.get(cfg.guild) ?? client.guilds.cache.first();
  if (!guild) return;

  const canal = await asiguraCanal(guild, cfg);
  if (!canal) return;

  const top = clasament(1);
  const noulRege = top[0]?.id ?? null;

  if (noulRege && noulRege !== stare.regeId) {
    const mutat = await mutaCoroana(guild, noulRege);
    if (mutat) {
      await anuntaDetronarea(guild, cfg, stare.regeId, noulRege);
      stare.regeId = noulRege;
      salveazaStarea();
    }
  } else if (noulRege) {
    await mutaCoroana(guild, noulRege);
  }

  const embed = await construiesteEmbed(guild, cfg);

  let mesaj = null;
  if (stare.mesajId && stare.canalId === canal.id) {
    mesaj = await canal.messages.fetch(stare.mesajId).catch(() => null);
  }
  if (mesaj) {
    await mesaj.edit({ embeds: [embed], components: butoane() }).catch(() => {});
  } else {
    const nou = await canal.send({ embeds: [embed], components: butoane() }).catch(() => null);
    if (nou) {
      stare.mesajId = nou.id;
      stare.canalId = canal.id;
      salveazaStarea();
    }
  }
}

async function peButon(i, cfg) {
  const ultim = racireButon.get(i.user.id) ?? 0;
  if (Date.now() - ultim < RACIRE_BUTON_MS) {
    return i.reply({ content: 'Mai incet. Incearca peste cateva secunde.', ephemeral: true });
  }
  racireButon.set(i.user.id, Date.now());

  if (i.customId === 'kok:unde') {
    const tot = store.clasament(1000);
    const loc = tot.findIndex((r) => r.id === i.user.id);
    const u = store.utilizator(i.user.id);
    const M = cfg.moneda ?? '◈';
    if (loc < 0) {
      return i.reply({ content: `Nu esti in clasament (sold ${M}${u.sold}).`, ephemeral: true });
    }
    const sus = loc > 0 ? tot[loc - 1].valoare - u.sold : 0;
    const coada = loc > 0 ? ` · pana la locul ${loc}: ${M}${sus}` : ' · esti pe tron';
    return i.reply({ content: `Locul **${loc + 1}** cu ${M}${u.sold}${coada}`, ephemeral: true });
  }

  await i.deferUpdate().catch(() => {});
  return tick(i.client, cfg);
}

export function porneste(client, cfg) {
  citesteStarea();

  client.on('interactionCreate', (i) => {
    if (i.isButton() && i.customId.startsWith('kok:')) {
      peButon(i, cfg).catch((e) => console.error('[kok buton]', e.message));
    }
  });

  client.once('clientReady', () => {
    setTimeout(() => tick(client, cfg).catch((e) => console.error('[kok]', e.message)), 8_000);
    setInterval(() => tick(client, cfg).catch((e) => console.error('[kok]', e.message)), INTERVAL_MS);
  });
}

export const _intern = { clasament, mutaCoroana, NUME_ROL };
export default { porneste, clasament, _intern };
