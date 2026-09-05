// Curierul Xel'Naga - economia si trivia Cetatii Xel'Naga.
// Reconstruit pe 4 septembrie 2026, dupa ce gazduirea veche a sters deployment-ul.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Client, GatewayIntentBits, Partials, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits,
} from 'discord.js';

import store from './store.js';
import { DEFINITII } from './comenzi.js';
import { BANCA } from './intrebari.js';
import { creeazaCicluPersistent, pregatesteRunda } from './trivia.js';
import { cardPilot, rangul } from './profil.js';
import { porneste as pornesteKingOfKings } from './kingofkings.js';
import { porneste as pornesteTitluri } from './titluri.js';
import * as vitrina from './vitrina.js';
import * as warpin from './warpin.js';
import * as intrebareaZilei from './intrebarea-zilei.js';
import * as anuntLansare from './anunt-lansare.js';
import * as buletin from './buletin.js';
import * as camere from './camere.js';
import * as pilon from './pilon.js';
import * as paznicRadio from './paznic-radio.js';
import * as social from './social.js';
import * as replay from './replay.js';

// Modulele de sine statatoare: fiecare exporta porneste(client, cfg) si DEFINITII.
const MODULE = { vitrina, warpin, intrebareaZilei, anuntLansare, buletin, camere, pilon, paznicRadio, social, replay };

const AICI = path.dirname(fileURLToPath(import.meta.url));

function citesteConfig() {
  for (const c of [path.join(AICI, '..', 'config.json'), path.join(AICI, 'config.json')]) {
    try { return JSON.parse(fs.readFileSync(c, 'utf8')); } catch { /* mergem pe implicite */ }
  }
  return {};
}

const cfgFisier = citesteConfig();

const cfg = {
  guild: '1540003384042590339',
  moneda: '◈',
  canale: {
    general: 'general',
    bunVenit: 'general',
    trivia: '1540428231495262258',
    kingOfKings: 'king-of-kings',
  },
  puncte: {
    peMinutVoce: 2,
    peMinutStream: 10,
    plafonZilnic: 600,
  },
  magazin: [
    { cod: 'culoare-rosu',   nume: 'Culoare: Rosu Tal\'darim', pret: 800,  tip: 'rol', culoare: '#E74C3C' },
    { cod: 'culoare-auriu',  nume: 'Culoare: Auriu Khalai',    pret: 800,  tip: 'rol', culoare: '#F1C40F' },
    { cod: 'culoare-vernil', nume: 'Culoare: Verde Creep',     pret: 800,  tip: 'rol', culoare: '#27AE60' },
    { cod: 'replay-review',  nume: 'Replay review cu un om',   pret: 1500, tip: 'manual' },
    { cod: 'coach',          nume: 'Antrenament cu coach',     pret: 3000, tip: 'manual' },
  ],
  ...cfgFisier,
};
cfg.canale = { ...{ general: 'general', bunVenit: 'general', trivia: '1540428231495262258', kingOfKings: 'king-of-kings' }, ...(cfgFisier.canale ?? {}) };
cfg.puncte = { ...{ peMinutVoce: 2, peMinutStream: 10, plafonZilnic: 600 }, ...(cfgFisier.puncte ?? {}) };

// ---------------------------------------------------------------------------
// Constantele economiei
// ---------------------------------------------------------------------------

const TRIVIA = {
  premiu: 25,
  plafonZilnic: 1200,
  cooldownSecunde: 45,
  timpSecunde: 59,
  ...(cfgFisier.trivia ?? {}),
};

const AUTOTRIVIA = {
  canal: cfg.canale.trivia,
  intervalMinute: 1,
  doarCandELume: false,
  ...(cfgFisier.trivia?.auto ?? {}),
};

const VIATA = {
  bonusBunVenit: 50,
  picMinSuma: 300,
  picMaxSuma: 300,
  picMinOre: 2,
  picMaxOre: 6,
  picExpirareSecunde: 90,
  ...(cfgFisier.viata ?? {}),
};

const DAILY = {
  baza: 25,
  pasStreak: 5,
  zileMaxime: 7,
  ...(cfgFisier.daily ?? {}),
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [Partials.GuildMember],
});
client.setMaxListeners(40); // fiecare modul isi pune ascultatorii lui

pornesteKingOfKings(client, cfg);
pornesteTitluri(client, cfg);
for (const [nume, m] of Object.entries(MODULE)) {
  try { m.porneste(client, cfg); } catch (e) { console.error(`[boot] modulul ${nume} nu a pornit:`, e.message); }
}
const TOATE_COMENZILE = [...DEFINITII, ...Object.values(MODULE).flatMap((m) => m.DEFINITII ?? [])];

const M = cfg.moneda;
const cicluIntrebari = creeazaCicluPersistent(BANCA.length);

// ---------------------------------------------------------------------------
// Ajutoare
// ---------------------------------------------------------------------------

function gasesteCanal(guild, spec, tip = 0) {
  if (!guild || !spec) return null;
  const dupaId = guild.channels.cache.get(String(spec));
  if (dupaId) return dupaId;
  return guild.channels.cache.find(
    (c) => c.name === String(spec).replace(/^#/, '') && (tip === null || c.type === tip),
  ) ?? null;
}

function guildul() {
  return client.guilds.cache.get(cfg.guild) ?? client.guilds.cache.first() ?? null;
}

async function numeleLui(guild, id) {
  try {
    const m = await guild.members.fetch(id);
    return m.displayName;
  } catch {
    return `necunoscut (${id})`;
  }
}

function intre(min, max) {
  return min + Math.random() * (max - min);
}

// ---------------------------------------------------------------------------
// Economia de voce si stream: un tick pe minut
// ---------------------------------------------------------------------------

function tickVoce() {
  const guild = guildul();
  if (!guild) return;
  for (const canal of guild.channels.cache.values()) {
    if (canal.type !== 2 && canal.type !== 13) continue;       // voce sau stage
    if (guild.afkChannelId && canal.id === guild.afkChannelId) continue;
    const oameni = [...canal.members.values()].filter((m) => !m.user.bot);
    if (oameni.length === 0) continue;
    for (const m of oameni) {
      const st = m.voice;
      const daStream = (st.streaming || st.selfVideo) && oameni.length >= 2;
      const u = store.utilizator(m.id);
      if (daStream) {
        u.minuteStream += 1;
        store.acorda(m.id, cfg.puncte.peMinutStream, cfg.puncte.plafonZilnic);
      } else {
        u.minuteVoice += 1;
        store.acorda(m.id, cfg.puncte.peMinutVoce, cfg.puncte.plafonZilnic);
      }
    }
  }
  store.salveaza();
}

// ---------------------------------------------------------------------------
// Trivia
// ---------------------------------------------------------------------------

const runde = new Map();     // messageId -> { indexCorect, raspunsuri:Set, gata:boolean }
const cooldownTrivia = new Map(); // userId -> timestamp

function embedRunda(textIntrebare, optiuni, stare = null) {
  const e = new EmbedBuilder()
    .setColor(stare === 'gata' ? 0x555555 : 0x2ECC71)
    .setTitle('Trivia StarCraft II')
    .setDescription(textIntrebare)
    .setFooter({ text: `Primul raspuns corect ia ${M}${TRIVIA.premiu} · ${TRIVIA.timpSecunde} secunde` });
  if (stare && stare !== 'gata') e.addFields({ name: '​', value: stare });
  return e;
}

function butoaneRunda(optiuni, dezactivate = false, indexCorect = -1) {
  const litere = ['A', 'B', 'C', 'D'];
  const randuri = [];
  for (let i = 0; i < optiuni.length; i += 2) {
    const rand = new ActionRowBuilder();
    for (let k = i; k < Math.min(i + 2, optiuni.length); k++) {
      let stil = ButtonStyle.Secondary;
      if (dezactivate && k === indexCorect) stil = ButtonStyle.Success;
      rand.addComponents(
        new ButtonBuilder()
          .setCustomId(`trivia:${k}`)
          .setLabel(`${litere[k]}. ${optiuni[k]}`.slice(0, 80))
          .setStyle(stil)
          .setDisabled(dezactivate),
      );
    }
    randuri.push(rand);
  }
  return randuri;
}

async function porneteRunda(canal) {
  if (!canal) return null;
  const intrebare = BANCA[cicluIntrebari()];
  const { intrebare: text, optiuni, indexCorect } = pregatesteRunda(intrebare);

  let mesaj;
  try {
    mesaj = await canal.send({
      embeds: [embedRunda(text, optiuni)],
      components: butoaneRunda(optiuni),
    });
  } catch (e) {
    console.error('[trivia] nu am putut posta runda:', e.message);
    return null;
  }

  runde.set(mesaj.id, { indexCorect, optiuni, text, gata: false, raspunsuri: new Set() });

  setTimeout(async () => {
    const r = runde.get(mesaj.id);
    if (!r || r.gata) return;
    r.gata = true;
    runde.delete(mesaj.id);
    // rundele expirate editeaza doar embedul, fara reply - canalul nu se umple
    try {
      await mesaj.edit({
        embeds: [embedRunda(text, optiuni, 'gata').setDescription(
          `${text}\n\n**Raspuns corect: ${optiuni[indexCorect]}**\nNimeni nu a nimerit.`,
        )],
        components: butoaneRunda(optiuni, true, indexCorect),
      });
    } catch { /* mesajul poate fi sters intre timp */ }
  }, TRIVIA.timpSecunde * 1000);

  return mesaj;
}

async function peButonTrivia(interactiune) {
  const r = runde.get(interactiune.message.id);
  if (!r) {
    return interactiune.reply({ content: 'Runda asta s-a incheiat deja.', ephemeral: true });
  }
  if (r.raspunsuri.has(interactiune.user.id)) {
    return interactiune.reply({ content: 'Ai raspuns deja la runda asta.', ephemeral: true });
  }
  r.raspunsuri.add(interactiune.user.id);

  const ales = Number(interactiune.customId.split(':')[1]);
  if (ales !== r.indexCorect) {
    return interactiune.reply({ content: 'Nu e bine. Asteapta runda urmatoare.', ephemeral: true });
  }
  if (r.gata) {
    return interactiune.reply({ content: 'Cineva a fost mai rapid.', ephemeral: true });
  }

  r.gata = true;
  runde.delete(interactiune.message.id);

  const dat = store.acordaTrivia(interactiune.user.id, TRIVIA.premiu, TRIVIA.plafonZilnic);
  const u = store.utilizator(interactiune.user.id);
  const simbolic = dat < TRIVIA.premiu;

  try {
    await interactiune.message.edit({
      embeds: [embedRunda(r.text, r.optiuni, 'gata').setDescription(
        `${r.text}\n\n**Raspuns corect: ${r.optiuni[r.indexCorect]}**\nPrimul: <@${interactiune.user.id}>`,
      )],
      components: butoaneRunda(r.optiuni, true, r.indexCorect),
    });
  } catch { /* nimic */ }

  const coada = simbolic
    ? ` (plafonul zilnic e atins, deci ${M}${dat} simbolic - victoria se numara oricum)`
    : '';
  return interactiune.reply({
    content: `Corect. **+${M}${dat}**${coada} · sold: ${M}${u.sold} · victorii trivia: ${u.triviaCastigate}`,
  });
}

async function triviaAutomata() {
  const guild = guildul();
  if (!guild) return;
  const canal = gasesteCanal(guild, AUTOTRIVIA.canal);
  if (!canal) return;
  if (AUTOTRIVIA.doarCandELume) {
    const cinevaPeVoce = guild.channels.cache.some(
      (c) => c.type === 2 && [...c.members.values()].some((m) => !m.user.bot),
    );
    if (!cinevaPeVoce) return;
  }
  await porneteRunda(canal);
}

// ---------------------------------------------------------------------------
// Picaturile-surpriza (pachetul Medivac)
// ---------------------------------------------------------------------------

function programeazaPicatura() {
  const ore = intre(VIATA.picMinOre, VIATA.picMaxOre);
  const ms = Math.round(ore * 3600 * 1000);
  console.log(`[picatura] urmatoarea in ${(ms / 3600000).toFixed(2)} h`);
  setTimeout(async () => {
    try { await aratapicatura(); } catch (e) { console.error('[picatura]', e.message); }
    programeazaPicatura();
  }, ms);
}

const picaturi = new Map(); // messageId -> { suma, luata }

async function aratapicatura() {
  const guild = guildul();
  if (!guild) return;
  const canal = gasesteCanal(guild, cfg.canale.general);
  if (!canal) return;

  const suma = Math.round(intre(VIATA.picMinSuma, VIATA.picMaxSuma + 1));
  const e = new EmbedBuilder()
    .setColor(0x3498DB)
    .setTitle('Pachet Medivac')
    .setDescription(`Un Medivac a scapat un pachet peste Cetate.\nPrimul care il ridica ia **${M}${suma}**.`)
    .setFooter({ text: `Expira in ${VIATA.picExpirareSecunde} de secunde` });

  const rand = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('picatura').setLabel('Ridica pachetul').setStyle(ButtonStyle.Primary),
  );

  const mesaj = await canal.send({ embeds: [e], components: [rand] });
  picaturi.set(mesaj.id, { suma, luata: false });

  setTimeout(async () => {
    const p = picaturi.get(mesaj.id);
    if (!p || p.luata) return;
    picaturi.delete(mesaj.id);
    try {
      await mesaj.edit({
        embeds: [e.setColor(0x555555).setDescription('Pachetul s-a pierdut in cenusa. Nimeni nu l-a ridicat.')],
        components: [],
      });
    } catch { /* nimic */ }
  }, VIATA.picExpirareSecunde * 1000);
}

async function peButonPicatura(interactiune) {
  const p = picaturi.get(interactiune.message.id);
  if (!p || p.luata) {
    return interactiune.reply({ content: 'Pachetul asta a fost deja ridicat.', ephemeral: true });
  }
  p.luata = true;
  picaturi.delete(interactiune.message.id);
  // picatura urca DOAR soldul, nu si totalCastigat - deci nu misca rangul
  const sold = store.ajusteaza(interactiune.user.id, p.suma);
  try {
    await interactiune.message.edit({
      embeds: [new EmbedBuilder().setColor(0x2ECC71).setTitle('Pachet revendicat!')
        .setDescription(`<@${interactiune.user.id}> a ridicat pachetul: **${M}${p.suma}**.`)],
      components: [],
    });
  } catch { /* nimic */ }
  return interactiune.reply({ content: `Ai ridicat pachetul: **+${M}${p.suma}** · sold: ${M}${sold}`, ephemeral: true });
}

// ---------------------------------------------------------------------------
// Comenzile
// ---------------------------------------------------------------------------

const TEXT_GHID = () => [
  `**Cetatea Xel'Naga - pe scurt**`,
  ``,
  `**Credite (${M})** - moneda serverului.`,
  `· ${cfg.puncte.peMinutVoce} ${M} pe minut petrecut pe voce`,
  `· ${cfg.puncte.peMinutStream} ${M} pe minut de stream, daca te vede cineva`,
  `· plafon ${cfg.puncte.plafonZilnic} ${M} pe zi din voce si stream`,
  `· \`/daily\` - bonus zilnic, creste cu streak-ul`,
  `· trivia in #trivia: primul raspuns corect ia ${TRIVIA.premiu}, cate o intrebare pe minut, plafon ${TRIVIA.plafonZilnic} ${M}/zi`,
  `· pachetele Medivac cad singure in #general, la ore aleatoare - primul care da click ia tot`,
  ``,
  `**Comenzi**: \`/puncte\` \`/profil\` \`/clasament\` \`/magazin\` \`/cumpara\` \`/trivia\` \`/daily\` \`/duel\` \`/predictie\` \`/replay\` \`/camera\` \`/leaga-contul\` \`/cont\` \`/buletin\` \`/ladder\` \`/ghid\``,
  `· \`/leaga-contul Nume#1234\` - iti leaga contul de SC2: 8 ${M} pe victorie de ladder, anunt la promovare, buletin zilnic la 23:00, cursa saptamanala de MMR`,
  `· Marele Warp-in: sambata si duminica 18:00-20:00, fiecare minut pe voce valoreaza dublu`,
  `· Intrebarea zilei: in fiecare seara la 19:00, in #general`,
  `· \`/duel @om miza\` (10-100 ${M}), \`/replay fisier\` (30 ${M}), camere de voce proprii prin ➕ Creeaza camera`,
  ``,
  `**Titluri** - se muta singure, la 5 minute:`,
  `👑 Regele Regilor (locul 1 la credite) · 🗡️ Marele Uzurpator (locul 2) · 💠 Boierul de Vespene (locul 3)`,
  `🧠 Mintea Roiului (locul 1 la trivia) · 🎙️ Gura Cetatii (locul 1 la voce)`,
  ``,
  `Rasa ti-ai ales-o la intrare - o poti schimba oricand din Channels & Roles.`,
].join('\n');

async function cmdPuncte(i) {
  const tinta = i.options.getUser('om') ?? i.user;
  const u = store.utilizator(tinta.id);
  return i.reply({ content: `**${tinta.username}**: ${M}${u.sold} (total castigat: ${M}${u.totalCastigat})` });
}

async function cmdProfil(i) {
  const tinta = i.options.getUser('om') ?? i.user;
  const u = store.utilizator(tinta.id);
  let nume = tinta.username;
  try { nume = (await i.guild.members.fetch(tinta.id)).displayName; } catch { /* nimic */ }
  return i.reply({ content: cardPilot({ nume, u, moneda: M }) });
}

async function cmdClasament(i) {
  const categorie = i.options.getString('categorie') ?? 'general';
  let randuri; let titlu; let purtator;
  if (categorie === 'trivia') {
    randuri = store.clasamentDupa('triviaCastigate', 10);
    titlu = 'Top trivia';
    purtator = '🧠 Mintea Roiului';
  } else if (categorie === 'voce') {
    randuri = store.clasamentDupa('minuteVoice', 10);
    titlu = 'Top voce';
    purtator = '🎙️ Gura Cetatii';
  } else {
    randuri = store.clasament(10);
    titlu = 'Top credite';
    purtator = '👑 Regele Regilor';
  }

  if (randuri.length === 0) {
    return i.reply({ content: 'Inca nu are cine sa fie in clasament.' });
  }

  const linii = [];
  for (let k = 0; k < randuri.length; k++) {
    const r = randuri[k];
    const nume = await numeleLui(i.guild, r.id);
    let valoare;
    if (categorie === 'trivia') valoare = `${r.valoare} victorii`;
    else if (categorie === 'voce') {
      const h = Math.floor(r.valoare / 60); const m = r.valoare % 60;
      valoare = h > 0 ? `${h}h ${m}min pe voce` : `${m}min pe voce`;
    } else valoare = `${M}${r.valoare}`;
    const eticheta = k === 0 ? ` ${purtator}` : '';
    linii.push(`**${k + 1}.** ${nume}${eticheta} — ${valoare}`);
  }

  const e = new EmbedBuilder()
    .setColor(0xF1C40F)
    .setTitle(titlu)
    .setDescription(linii.join('\n'))
    .setFooter({ text: 'Adminii nu concureaza (handicap de fondator).' });
  return i.reply({ embeds: [e] });
}

async function cmdTrivia(i) {
  const ultima = cooldownTrivia.get(i.user.id) ?? 0;
  const ramas = Math.ceil((ultima + TRIVIA.cooldownSecunde * 1000 - Date.now()) / 1000);
  if (ramas > 0) {
    return i.reply({ content: `Mai asteapta ${ramas} secunde.`, ephemeral: true });
  }
  cooldownTrivia.set(i.user.id, Date.now());
  await i.reply({ content: 'Runda vine imediat.', ephemeral: true });
  await porneteRunda(i.channel);
}

async function cmdDaily(i) {
  const u = store.utilizator(i.user.id);
  const azi = store.ziCurenta();
  if (u.ziDaily === azi) {
    return i.reply({ content: 'Ai luat deja bonusul azi. Revino maine.', ephemeral: true });
  }
  const ieri = store.ziCurenta(new Date(Date.now() - 24 * 3600 * 1000));
  u.streakDaily = u.ziDaily === ieri ? Math.min(DAILY.zileMaxime, (u.streakDaily || 0) + 1) : 1;
  u.ziDaily = azi;
  const suma = DAILY.baza + (u.streakDaily - 1) * DAILY.pasStreak;
  u.sold += suma;
  u.totalCastigat += suma;
  store.salveaza();
  const varf = u.streakDaily >= DAILY.zileMaxime ? ' (streak la maxim)' : '';
  return i.reply({ content: `Bonus zilnic: **+${M}${suma}** · streak ${u.streakDaily} ${u.streakDaily === 1 ? 'zi' : 'zile'}${varf} · sold: ${M}${u.sold}` });
}

async function cmdMagazin(i) {
  const linii = cfg.magazin.map((a) => `\`${a.cod}\` — **${a.nume}** · ${M}${a.pret}`);
  const e = new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle('Magazinul Cetatii')
    .setDescription(linii.join('\n'))
    .setFooter({ text: 'Cumperi cu /cumpara articol:<cod>' });
  return i.reply({ embeds: [e] });
}

async function cmdCumpara(i) {
  const cod = i.options.getString('articol');
  const articol = cfg.magazin.find((a) => a.cod === cod);
  if (!articol) {
    return i.reply({ content: 'Nu exista articolul asta. Vezi `/magazin`.', ephemeral: true });
  }
  const u = store.utilizator(i.user.id);
  if (u.sold < articol.pret) {
    return i.reply({ content: `Iti trebuie ${M}${articol.pret}, ai ${M}${u.sold}.`, ephemeral: true });
  }

  if (articol.tip === 'rol') {
    let rol = i.guild.roles.cache.find((r) => r.name === articol.nume);
    try {
      if (!rol) {
        rol = await i.guild.roles.create({ name: articol.nume, color: articol.culoare, reason: 'Magazinul Cetatii' });
      }
      await i.member.roles.add(rol);
    } catch (e) {
      return i.reply({ content: `Nu am putut da rolul (${e.message}). Nu ti-am luat credite.`, ephemeral: true });
    }
  }

  store.ajusteaza(i.user.id, -articol.pret);
  u.inventar.push({ cod: articol.cod, cand: new Date().toISOString() });
  store.salveaza();

  const coada = articol.tip === 'manual' ? '\nUn om din staff te contacteaza ca sa-l onoreze.' : '';
  return i.reply({ content: `Ai cumparat **${articol.nume}** pentru ${M}${articol.pret}. Sold: ${M}${u.sold}.${coada}` });
}

async function cmdGhid(i) {
  return i.reply({ content: TEXT_GHID(), ephemeral: true });
}

async function cmdPuncteAdauga(i, semn) {
  if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return i.reply({ content: 'Comanda e pentru staff.', ephemeral: true });
  }
  const tinta = i.options.getUser('om');
  const suma = Math.abs(i.options.getInteger('suma')) * semn;
  const sold = store.ajusteaza(tinta.id, suma);
  return i.reply({ content: `${semn > 0 ? 'Am adaugat' : 'Am scazut'} ${M}${Math.abs(suma)} pentru **${tinta.username}**. Sold nou: ${M}${sold}.` });
}

// ---------------------------------------------------------------------------
// Evenimente
// ---------------------------------------------------------------------------

client.on('interactionCreate', async (i) => {
  try {
    if (i.isButton()) {
      if (i.customId.startsWith('trivia:')) return await peButonTrivia(i);
      if (i.customId === 'picatura') return await peButonPicatura(i);
      return;
    }
    if (!i.isChatInputCommand()) return;
    switch (i.commandName) {
      case 'puncte': return await cmdPuncte(i);
      case 'profil': return await cmdProfil(i);
      case 'clasament': return await cmdClasament(i);
      case 'trivia': return await cmdTrivia(i);
      case 'daily': return await cmdDaily(i);
      case 'magazin': return await cmdMagazin(i);
      case 'cumpara': return await cmdCumpara(i);
      case 'ghid': return await cmdGhid(i);
      case 'puncte-adauga': return await cmdPuncteAdauga(i, +1);
      case 'puncte-scade': return await cmdPuncteAdauga(i, -1);
      default: return;
    }
  } catch (e) {
    console.error('[interactiune]', e);
    if (i.isRepliable() && !i.replied && !i.deferred) {
      i.reply({ content: 'Ceva a crapat la mine. Incearca din nou.', ephemeral: true }).catch(() => {});
    }
  }
});

client.on('guildMemberAdd', async (membru) => {
  if (membru.user.bot) return;
  const u = store.utilizator(membru.id);
  let bonus = 0;
  if (store.flagODataSingura(`bunvenit-${membru.id}`)) {
    bonus = VIATA.bonusBunVenit;
    u.sold += bonus;
    u.totalCastigat += bonus;
    store.salveaza();
  }
  const canal = gasesteCanal(membru.guild, cfg.canale.bunVenit);
  if (!canal) return;
  const linii = [
    `Warp-in reusit: bine ai venit, <@${membru.id}>.`,
    bonus ? `Ai primit **${M}${bonus}** ca bonus de intrare.` : null,
    'Rasa ti-ai ales-o la intrare — o poti schimba oricand din Channels & Roles.',
    'Da `/ghid` ca sa vezi cum merge Cetatea.',
  ].filter(Boolean);
  canal.send({ content: linii.join('\n') }).catch(() => {});
});

client.once('clientReady', async () => {
  console.log(`[boot] conectat ca ${client.user.tag}, banca: ${BANCA.length} intrebari`);
  console.log(`[boot] date in ${store.undeSalvez()}`);

  try {
    await client.application.commands.set(TOATE_COMENZILE);
    console.log(`[boot] ${TOATE_COMENZILE.length} comenzi inregistrate: ${TOATE_COMENZILE.map((c) => '/' + c.name).join(' ')}`);
  } catch (e) {
    console.error('[boot] nu am putut inregistra comenzile:', e.message);
  }

  // ghidul, o singura data, in canalul de bun venit
  const guild = guildul();
  if (guild && store.flagODataSingura('ghid-boti-v2')) {
    const canal = gasesteCanal(guild, cfg.canale.bunVenit);
    if (canal) canal.send({ content: TEXT_GHID() }).catch(() => {});
  }

  setInterval(tickVoce, 60_000);

  setTimeout(triviaAutomata, 60_000);
  setInterval(triviaAutomata, Math.max(1, AUTOTRIVIA.intervalMinute) * 60_000);

  programeazaPicatura();
});

process.on('unhandledRejection', (e) => console.error('[unhandled]', e));
process.on('SIGTERM', () => { store.salveaza(); process.exit(0); });
process.on('SIGINT', () => { store.salveaza(); process.exit(0); });

if (!process.env.DISCORD_TOKEN) {
  console.error('[boot] lipseste DISCORD_TOKEN din .env');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN).catch((e) => {
  console.error('[boot] conectarea a esuat:', e.message);
  process.exit(1);
});
