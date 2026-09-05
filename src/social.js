// Social: dueluri intre membri si predictii ale staff-ului.
// Duelurile stau in store.dueluri, predictia in store.predictie() (ambele persistate in data.json).
// Creditele se misca DOAR prin store.ajusteaza (escrow la provocare/pariu, plata la final).

import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits,
} from 'discord.js';
import store from './store.js';

const IMPLICIT = {
  mizaMin: 10,
  mizaMax: 100,
  expirareDuelMs: 15 * 60_000,
  tickMs: 60_000,
  pariuMin: 10,
  minuteImplicite: 10,
  racireEmbedMs: 5_000,
};

export const DEFINITII = [
  {
    name: 'duel',
    description: 'Provoaca pe cineva la duel pe credite (castigatorul ia tot)',
    options: [
      { name: 'om', description: 'Pe cine provoci', type: 6, required: true },
      { name: 'miza', description: 'Miza fiecaruia (10-100)', type: 4, required: true, min_value: 10, max_value: 100 },
    ],
  },
  {
    name: 'predictie',
    description: 'Predictii ale Cetatii (staff)',
    default_member_permissions: '32', // Manage Server
    options: [
      {
        name: 'start', description: 'Porneste o predictie cu doua variante', type: 1,
        options: [
          { name: 'intrebare', description: 'Ce se prezice', type: 3, required: true, max_length: 200 },
          { name: 'a', description: 'Varianta A', type: 3, required: true, max_length: 60 },
          { name: 'b', description: 'Varianta B', type: 3, required: true, max_length: 60 },
          { name: 'minute', description: 'Cate minute se poate paria (implicit 10)', type: 4, required: false, min_value: 1, max_value: 1440 },
        ],
      },
      { name: 'inchide', description: 'Opreste parierea (rezultatul vine mai tarziu)', type: 1 },
      {
        name: 'rezolva', description: 'Anunta castigatorul si imparte potul', type: 1,
        options: [
          {
            name: 'castigator', description: 'Care varianta a castigat', type: 3, required: true,
            choices: [{ name: 'A', value: 'a' }, { name: 'B', value: 'b' }],
          },
        ],
      },
      { name: 'anuleaza', description: 'Anuleaza predictia si da banii inapoi', type: 1 },
    ],
  },
];

// Injectabil in teste.
export const _intern = {
  acum: () => Date.now(),
};

let M = '◈';

// ---------------------------------------------------------------------------
// Ajutoare
// ---------------------------------------------------------------------------

function idNou() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function eStaff(i) {
  try { return Boolean(i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)); } catch { return false; }
}

async function raspunde(i, continut, efemer = true) {
  const opt = typeof continut === 'string' ? { content: continut } : { ...continut };
  if (efemer) opt.ephemeral = true;
  try {
    if (i.deferred || i.replied) return await i.followUp(opt);
    return await i.reply(opt);
  } catch (e) {
    console.error('[social] raspuns:', e.message);
    return null;
  }
}

async function idMesajulRaspunsului(i) {
  try { const m = await i.fetchReply?.(); return m?.id ?? null; } catch { return null; }
}

async function editeazaMesajul(client, canalId, mesajId, continut) {
  if (!canalId || !mesajId) return false;
  try {
    const canal = await client.channels.fetch(canalId);
    const m = await canal.messages.fetch(mesajId);
    await m.edit(continut);
    return true;
  } catch (e) {
    console.error('[social] editare mesaj:', e.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Dueluri
// ---------------------------------------------------------------------------

function duelulActivAlLui(userId) {
  return Object.entries(store.dueluri).find(([, d]) => d.a === userId || d.b === userId) ?? null;
}

function butoaneProvocare(id) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`duel:accepta:${id}`).setLabel('Accept').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`duel:refuza:${id}`).setLabel('Refuz').setStyle(ButtonStyle.Secondary),
  )];
}

function butoaneVot(id) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`duel:eu:${id}`).setLabel('Am castigat eu').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`duel:el:${id}`).setLabel('A castigat el').setStyle(ButtonStyle.Secondary),
  )];
}

function textProvocare(d) {
  return `<@${d.b}>, <@${d.a}> te provoaca la duel pe **${M}${d.miza}** fiecare. Ai 15 minute sa raspunzi.`;
}

function textAcceptat(d) {
  return `**Duel acceptat!** <@${d.a}> vs <@${d.b}> pe ${M}${d.miza} fiecare. `
    + `Jucati meciul, apoi apasati amandoi cine a castigat (aveti 15 minute de la provocare).`;
}

async function peComandaDuel(i, c) {
  const a = i.user.id;
  const tinta = i.options.getUser('om');
  const miza = i.options.getInteger('miza');

  if (!tinta || tinta.bot) return raspunde(i, 'Botii nu se dueleaza. Alege un om.');
  if (tinta.id === a) return raspunde(i, 'Nu te poti duela cu tine insuti.');
  if (!Number.isInteger(miza) || miza < c.mizaMin || miza > c.mizaMax) {
    return raspunde(i, `Miza trebuie sa fie intre ${c.mizaMin} si ${c.mizaMax}.`);
  }
  if (duelulActivAlLui(a)) return raspunde(i, 'Ai deja un duel in desfasurare. Termina-l intai.');
  if (duelulActivAlLui(tinta.id)) return raspunde(i, `<@${tinta.id}> are deja un duel in desfasurare.`);
  const u = store.utilizator(a);
  if (u.sold < miza) return raspunde(i, `Nu ai miza: ai ${M}${u.sold}, iti trebuie ${M}${miza}.`);

  const id = idNou();
  store.ajusteaza(a, -miza); // escrow
  const d = {
    a, b: tinta.id, miza, stare: 'provocat', voturi: {},
    canalId: i.channelId ?? i.channel?.id ?? null, mesajId: null, creat: _intern.acum(),
  };
  store.dueluri[id] = d;
  store.salveaza();

  const trimis = await raspunde(i, { content: textProvocare(d), components: butoaneProvocare(id) }, false);
  if (trimis === null && !(i.replied || i.deferred)) {
    // nu am putut posta provocarea: banii inapoi
    store.ajusteaza(a, miza);
    delete store.dueluri[id];
    store.salveaza();
    return null;
  }
  d.mesajId = await idMesajulRaspunsului(i);
  store.salveaza();
  return trimis;
}

async function peButonDuel(i, c) {
  const [, actiune, id] = i.customId.split(':');
  const d = store.dueluri[id];
  if (!d) return raspunde(i, 'Duelul asta nu mai exista (expirat sau incheiat).');
  const eu = i.user.id;

  if (actiune === 'accepta' || actiune === 'refuza') {
    if (eu !== d.b) return raspunde(i, 'Doar cel provocat poate raspunde.');
    if (d.stare !== 'provocat') return raspunde(i, 'Duelul e deja acceptat.');

    if (actiune === 'refuza') {
      store.ajusteaza(d.a, d.miza);
      delete store.dueluri[id];
      store.salveaza();
      return actualizeaza(i, { content: `<@${d.b}> a refuzat duelul. <@${d.a}> si-a primit miza inapoi.`, components: [] });
    }

    const u = store.utilizator(eu);
    if (u.sold < d.miza) return raspunde(i, `Nu ai miza: ai ${M}${u.sold}, iti trebuie ${M}${d.miza}.`);
    store.ajusteaza(eu, -d.miza); // escrow
    d.stare = 'acceptat';
    d.voturi = {};
    store.salveaza();
    return actualizeaza(i, { content: textAcceptat(d), components: butoaneVot(id) });
  }

  if (actiune === 'eu' || actiune === 'el') {
    if (d.stare !== 'acceptat') return raspunde(i, 'Duelul nu a fost acceptat inca.');
    if (eu !== d.a && eu !== d.b) return raspunde(i, 'Nu esti in duelul asta.');
    const cheie = eu === d.a ? 'a' : 'b';
    const celalalt = cheie === 'a' ? 'b' : 'a';
    if (d.voturi[cheie]) return raspunde(i, 'Ai votat deja. Asteapta-l pe celalalt.');
    d.voturi[cheie] = actiune === 'eu' ? cheie : celalalt;
    store.salveaza();

    if (!d.voturi.a || !d.voturi.b) {
      await raspunde(i, 'Vot inregistrat. Cand voteaza si celalalt, se imparte potul.');
      return null;
    }
    return incheieDuel(i, id, d);
  }

  return raspunde(i, 'Buton necunoscut.');
}

async function actualizeaza(i, continut) {
  try { return await i.update(continut); } catch (e) {
    console.error('[social] update:', e.message);
    return raspunde(i, continut);
  }
}

async function incheieDuel(i, id, d) {
  delete store.dueluri[id];
  if (d.voturi.a === d.voturi.b) {
    const castigator = d.voturi.a === 'a' ? d.a : d.b;
    const invins = castigator === d.a ? d.b : d.a;
    store.ajusteaza(castigator, 2 * d.miza);
    store.utilizator(castigator).dueluriV += 1;
    store.utilizator(invins).dueluriP += 1;
    store.salveaza();
    return actualizeaza(i, {
      content: `**Duel incheiat.** <@${castigator}> l-a invins pe <@${invins}> si ia **${M}${2 * d.miza}**.`,
      components: [],
    });
  }
  store.ajusteaza(d.a, d.miza);
  store.ajusteaza(d.b, d.miza);
  store.salveaza();
  return actualizeaza(i, {
    content: `**Dezacord.** <@${d.a}> si <@${d.b}> sustin fiecare ca a castigat. Mizele s-au intors la amandoi. Data viitoare, un replay.`,
    components: [],
  });
}

// Refund pentru duelurile mai vechi de 15 minute (fara raspuns sau fara ambele voturi).
async function expiraDueluri(client, c) {
  const acum = _intern.acum();
  const expirate = [];
  for (const [id, d] of Object.entries(store.dueluri)) {
    if (acum - (d.creat ?? 0) < c.expirareDuelMs) continue;
    store.ajusteaza(d.a, d.miza);
    if (d.stare === 'acceptat') store.ajusteaza(d.b, d.miza);
    delete store.dueluri[id];
    expirate.push(d);
  }
  if (expirate.length === 0) return 0;
  store.salveaza();
  for (const d of expirate) {
    const motiv = d.stare === 'acceptat' ? 'nu au votat amandoi' : `<@${d.b}> nu a raspuns`;
    await editeazaMesajul(client, d.canalId, d.mesajId, {
      content: `Duelul <@${d.a}> vs <@${d.b}> a expirat (${motiv}). Mizele s-au intors.`, components: [],
    });
  }
  return expirate.length;
}

// ---------------------------------------------------------------------------
// Predictii
// ---------------------------------------------------------------------------

function sumarPredictie(p) {
  const s = { a: { total: 0, n: 0 }, b: { total: 0, n: 0 } };
  for (const pariu of Object.values(p.pariuri ?? {})) {
    const parte = s[pariu.parte];
    if (!parte) continue;
    parte.total += pariu.suma;
    parte.n += 1;
  }
  return s;
}

function embedPredictie(p, stare = null) {
  const s = sumarPredictie(p);
  const pot = s.a.total + s.b.total;
  const e = new EmbedBuilder()
    .setTitle(`Predictie: ${p.intrebare}`.slice(0, 256))
    .setColor(stare === 'rezolvata' ? 0x2ECC71 : stare === 'anulata' ? 0x95A5A6 : 0x9B59B6)
    .addFields(
      { name: `A: ${p.a}`.slice(0, 256), value: `${M}${s.a.total} · ${s.a.n} pariori`, inline: true },
      { name: `B: ${p.b}`.slice(0, 256), value: `${M}${s.b.total} · ${s.b.n} pariori`, inline: true },
    );
  let jos = `Pot total: ${M}${pot}. `;
  if (stare === 'rezolvata') jos += 'Rezolvata.';
  else if (stare === 'anulata') jos += 'Anulata, toti si-au primit banii inapoi.';
  else if (!p.deschisa) jos += 'Parierea s-a inchis. Asteptam rezultatul.';
  else jos += `Poti paria pana <t:${Math.floor(p.inchidereLa / 1000)}:R>. Un singur pariu de om, minim ${M}${IMPLICIT.pariuMin}.`;
  e.setDescription(jos);
  return e;
}

function butoanePredictie(p) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('predictie:a').setLabel(`A: ${p.a}`.slice(0, 80)).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('predictie:b').setLabel(`B: ${p.b}`.slice(0, 80)).setStyle(ButtonStyle.Danger),
  )];
}

let ultimaActualizareEmbed = 0;
let actualizareProgramata = null;

// Editeaza embedul, dar nu mai des de o data la 5 s; ultima stare ajunge oricum pe mesaj.
function programeazaActualizareEmbed(client, c, stare = null, imediat = false) {
  const p = store.predictie();
  if (!p) return;
  const scrie = () => {
    ultimaActualizareEmbed = _intern.acum();
    actualizareProgramata = null;
    const pp = store.predictie() ?? p;
    editeazaMesajul(client, pp.canalId, pp.mesajId, {
      embeds: [embedPredictie(pp, stare)],
      components: stare || !pp.deschisa ? [] : butoanePredictie(pp),
    });
  };
  const ramas = c.racireEmbedMs - (_intern.acum() - ultimaActualizareEmbed);
  if (imediat || ramas <= 0) {
    if (actualizareProgramata) { clearTimeout(actualizareProgramata); actualizareProgramata = null; }
    scrie();
    return;
  }
  if (actualizareProgramata) return;
  actualizareProgramata = setTimeout(scrie, ramas);
  actualizareProgramata.unref?.();
}

async function peComandaPredictie(i, client, c) {
  if (!eStaff(i)) return raspunde(i, 'Comanda e pentru staff (Manage Server).');
  const sub = i.options.getSubcommand();

  if (sub === 'start') {
    if (store.predictie()) return raspunde(i, 'Exista deja o predictie activa. Rezolv-o sau anuleaz-o intai.');
    const intrebare = String(i.options.getString('intrebare') ?? '').trim().slice(0, 200);
    const a = String(i.options.getString('a') ?? '').trim().slice(0, 60);
    const b = String(i.options.getString('b') ?? '').trim().slice(0, 60);
    const minute = i.options.getInteger('minute') ?? c.minuteImplicite;
    if (!intrebare || !a || !b) return raspunde(i, 'Trebuie intrebarea si ambele variante.');
    if (!Number.isInteger(minute) || minute < 1 || minute > 1440) return raspunde(i, 'Minutele trebuie sa fie intre 1 si 1440.');

    const p = {
      intrebare, a, b, pariuri: {}, deschisa: true,
      canalId: i.channelId ?? i.channel?.id ?? null, mesajId: null,
      inchidereLa: _intern.acum() + minute * 60_000,
    };
    const trimis = await raspunde(i, { embeds: [embedPredictie(p)], components: butoanePredictie(p) }, false);
    if (trimis === null && !(i.replied || i.deferred)) return null;
    p.mesajId = await idMesajulRaspunsului(i);
    store.predictie(p);
    return trimis;
  }

  const p = store.predictie();
  if (!p) return raspunde(i, 'Nu e nicio predictie activa. Porneste una cu `/predictie start`.');

  if (sub === 'inchide') {
    if (!p.deschisa) return raspunde(i, 'Parierea e deja inchisa.');
    p.deschisa = false;
    store.predictie(p);
    programeazaActualizareEmbed(client, c, null, true);
    return raspunde(i, 'Parierea s-a inchis. Anunta rezultatul cu `/predictie rezolva`.', false);
  }

  if (sub === 'anuleaza') {
    for (const [userId, pariu] of Object.entries(p.pariuri)) store.ajusteaza(userId, pariu.suma);
    store.predictie(null);
    await editeazaMesajul(client, p.canalId, p.mesajId, { embeds: [embedPredictie(p, 'anulata')], components: [] });
    return raspunde(i, `Predictia a fost anulata. ${Object.keys(p.pariuri).length} pariori si-au primit banii inapoi.`, false);
  }

  if (sub === 'rezolva') {
    const castigator = i.options.getString('castigator');
    if (castigator !== 'a' && castigator !== 'b') return raspunde(i, 'Castigatorul e `a` sau `b`.');
    const rezultat = rezolvaPredictie(p, castigator);
    store.predictie(null);
    p.deschisa = false;
    await editeazaMesajul(client, p.canalId, p.mesajId, { embeds: [embedPredictie(p, 'rezolvata')], components: [] });
    const eticheta = castigator === 'a' ? p.a : p.b;
    let text = `**Predictie rezolvata:** ${p.intrebare}\nA castigat **${castigator.toUpperCase()}: ${eticheta}**. Pot total ${M}${rezultat.pot}.`;
    if (rezultat.platiti.length === 0) {
      text += rezultat.refund ? '\nNimeni nu a pariat pe varianta castigatoare; toti si-au primit banii inapoi.' : '\nNu a pariat nimeni.';
    } else {
      text += `\n${rezultat.platiti.length} castigatori. Top:`;
      rezultat.platiti.slice(0, 3).forEach((r, k) => { text += `\n${k + 1}. <@${r.id}> +${M}${r.castig} (miza ${M}${r.suma})`; });
    }
    return raspunde(i, text, false);
  }

  return raspunde(i, 'Subcomanda necunoscuta.');
}

// Imparte potul proportional cu miza intre castigatori (rotunjit in jos).
// Daca nimeni nu a pariat pe castigator, toti primesc refund.
function rezolvaPredictie(p, castigator) {
  const intrari = Object.entries(p.pariuri ?? {});
  const pot = intrari.reduce((s, [, x]) => s + x.suma, 0);
  const castigatori = intrari.filter(([, x]) => x.parte === castigator);
  const mizaCastigatori = castigatori.reduce((s, [, x]) => s + x.suma, 0);
  if (castigatori.length === 0) {
    for (const [id, x] of intrari) store.ajusteaza(id, x.suma);
    return { pot, platiti: [], refund: intrari.length > 0 };
  }
  const platiti = castigatori.map(([id, x]) => {
    const castig = Math.floor((pot * x.suma) / mizaCastigatori);
    store.ajusteaza(id, castig);
    return { id, suma: x.suma, castig };
  }).sort((x, y) => y.castig - x.castig);
  return { pot, platiti, refund: false };
}

function predictiaDeschisa(p) {
  return Boolean(p && p.deschisa && _intern.acum() < p.inchidereLa);
}

async function peButonPredictie(i) {
  const parte = i.customId.split(':')[1];
  const p = store.predictie();
  if (!p || (parte !== 'a' && parte !== 'b')) return raspunde(i, 'Nu e nicio predictie activa.');
  if (!predictiaDeschisa(p)) return raspunde(i, 'Parierea s-a inchis.');
  if (p.pariuri[i.user.id]) {
    const al = p.pariuri[i.user.id];
    return raspunde(i, `Ai pariat deja ${M}${al.suma} pe ${al.parte.toUpperCase()}. Un singur pariu de om.`);
  }
  const u = store.utilizator(i.user.id);
  if (u.sold < IMPLICIT.pariuMin) return raspunde(i, `Iti trebuie cel putin ${M}${IMPLICIT.pariuMin}; ai ${M}${u.sold}.`);
  const eticheta = parte === 'a' ? p.a : p.b;
  const modal = new ModalBuilder()
    .setCustomId(`predictie:modal:${parte}`)
    .setTitle(`Pariu pe ${parte.toUpperCase()}: ${eticheta}`.slice(0, 45))
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('suma')
        .setLabel(`Suma (${IMPLICIT.pariuMin}..${u.sold})`.slice(0, 45))
        .setStyle(TextInputStyle.Short).setRequired(true).setMinLength(1).setMaxLength(7)
        .setPlaceholder(String(Math.min(u.sold, 50))),
    ));
  try { return await i.showModal(modal); } catch (e) { console.error('[social] modal:', e.message); return null; }
}

async function peModalPredictie(i, client, c) {
  const parte = i.customId.split(':')[2];
  const p = store.predictie();
  if (!p || (parte !== 'a' && parte !== 'b')) return raspunde(i, 'Nu e nicio predictie activa.');
  if (!predictiaDeschisa(p)) return raspunde(i, 'Parierea s-a inchis intre timp.');
  if (p.pariuri[i.user.id]) return raspunde(i, 'Ai pariat deja. Un singur pariu de om.');

  let brut = '';
  try { brut = String(i.fields.getTextInputValue('suma') ?? ''); } catch { brut = ''; }
  const suma = Number(brut.replace(/[^\d]/g, ''));
  const u = store.utilizator(i.user.id);
  if (!Number.isInteger(suma) || suma < IMPLICIT.pariuMin) return raspunde(i, `Suma minima e ${M}${IMPLICIT.pariuMin}.`);
  if (suma > u.sold) return raspunde(i, `Ai doar ${M}${u.sold}.`);

  store.ajusteaza(i.user.id, -suma); // escrow
  p.pariuri[i.user.id] = { parte, suma };
  store.predictie(p);
  programeazaActualizareEmbed(client, c);
  const eticheta = parte === 'a' ? p.a : p.b;
  return raspunde(i, `Pariu inregistrat: ${M}${suma} pe **${parte.toUpperCase()}: ${eticheta}**. Sold ramas: ${M}${u.sold}.`);
}

// Inchide parierea cand expira durata.
function verificaInchidereaPredictiei(client, c) {
  const p = store.predictie();
  if (!p || !p.deschisa || _intern.acum() < p.inchidereLa) return false;
  p.deschisa = false;
  store.predictie(p);
  programeazaActualizareEmbed(client, c, null, true);
  return true;
}

// ---------------------------------------------------------------------------
// Rutare si pornire
// ---------------------------------------------------------------------------

async function trateaza(i, client, c) {
  if (i.isChatInputCommand?.()) {
    if (i.commandName === 'duel') return peComandaDuel(i, c);
    if (i.commandName === 'predictie') return peComandaPredictie(i, client, c);
    return null;
  }
  if (i.isButton?.()) {
    if (i.customId.startsWith('duel:')) return peButonDuel(i, c);
    if (i.customId === 'predictie:a' || i.customId === 'predictie:b') return peButonPredictie(i);
    return null;
  }
  if (i.isModalSubmit?.() && i.customId.startsWith('predictie:modal:')) return peModalPredictie(i, client, c);
  return null;
}

async function tick(client, c) {
  try { await expiraDueluri(client, c); } catch (e) { console.error('[social] expirare dueluri:', e.message); }
  try { verificaInchidereaPredictiei(client, c); } catch (e) { console.error('[social] inchidere predictie:', e.message); }
}

export function porneste(client, cfg = {}) {
  const c = { ...IMPLICIT, ...(cfg.social ?? {}) };
  M = cfg.moneda ?? M;

  client.on('interactionCreate', (i) => {
    trateaza(i, client, c).catch((e) => {
      console.error('[social]', e.message);
      raspunde(i, 'Ceva a crapat la mine. Incearca din nou.').catch(() => {});
    });
  });

  client.once('clientReady', () => {
    setTimeout(() => tick(client, c), 5_000).unref?.();
    setInterval(() => tick(client, c), c.tickMs).unref?.();
  });

  _intern.tick = () => tick(client, c);
  _intern.config = c;
  return c;
}

Object.assign(_intern, { expiraDueluri, rezolvaPredictie, sumarPredictie, embedPredictie, verificaInchidereaPredictiei, IMPLICIT });

export default { porneste, DEFINITII, _intern };
