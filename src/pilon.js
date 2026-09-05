// Pilonul Cetatii - anti-server gol. Zero comenzi.
//  1. Aprinzatorul: primul om care intra pe voce e anuntat in #general (racire 45 min);
//     cand un canal ajunge la 3 oameni, "warp-in in masa" (racire 90 min). Fara credite.
//  2. Contorul de front: un canal de voce incuiat, necategorisit, al carui nume arata cati
//     sunt pe voce / in lupta si cate meciuri s-au jucat azi. Redenumit cel mult o data la
//     10 minute (Discord permite 2 redenumiri / 10 min - stam confortabil sub).
// Starea sta in pilon.json. Datele de ladder se citesc tolerant din buletin.json.

import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { citesteJson, scrieJson, guildul, gasesteCanal, trimite } from './comun.js';

export const DEFINITII = [];

const FISIER = 'pilon.json';
export const NUME_TURN = '⚔️ Turnul de veghe';
const FEREASTRA_LUPTA_MS = 20 * 60 * 1000;

const IMPLICIT = {
  activ: true,
  racireAprinzatorMin: 45,
  racireMasaMin: 90,
  pragMasa: 3,
  intervalContorMin: 10,
};

const VARIANTE_APRINZATOR = [
  (nume, canal) => `🔥 **${nume}** a pus un pilon in **${canal}**. Warp-in!`,
  (nume, canal) => `🔥 Pilonul s-a aprins in **${canal}**: **${nume}** e primul pe voce. Cine il urmeaza?`,
  (nume, canal) => `🔥 **${nume}** tine frontul singur in **${canal}**. Hai, ca un pilon nu face armata.`,
];

export const ceas = { acum: () => Date.now() };

let conf = { ...IMPLICIT };
let stare = { contorId: null, ultimulAprinzator: 0, ultimulMasa: 0, ultimaRedenumire: 0, ultimulNume: null };
let cfgGlobal = {};

function citesteStarea() {
  const d = citesteJson(FISIER, {});
  stare = {
    contorId: d.contorId ?? null,
    ultimulAprinzator: Number(d.ultimulAprinzator) || 0,
    ultimulMasa: Number(d.ultimulMasa) || 0,
    ultimaRedenumire: Number(d.ultimaRedenumire) || 0,
    ultimulNume: d.ultimulNume ?? null,
  };
}

function salveazaStarea() {
  scrieJson(FISIER, stare);
}

// ---------------------------------------------------------------------------
// Cine e pe voce (fara boti, fara AFK, fara portalul cu userLimit 1, fara contor)
// ---------------------------------------------------------------------------

function eVoce(canal) {
  return canal && (canal.type === ChannelType.GuildVoice || canal.type === ChannelType.GuildStageVoice);
}

export function canalEligibil(guild, canal) {
  if (!eVoce(canal)) return false;
  if (guild.afkChannelId && canal.id === guild.afkChannelId) return false;
  if (canal.userLimit === 1) return false;
  if (stare.contorId && canal.id === stare.contorId) return false;
  return true;
}

function oameniDin(canal) {
  if (!canal?.members) return [];
  return [...canal.members.values()].filter((m) => !m.user?.bot);
}

export function oameniPeVoce(guild) {
  let n = 0;
  for (const c of guild.channels.cache.values()) {
    if (canalEligibil(guild, c)) n += oameniDin(c).length;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Aprinzatorul
// ---------------------------------------------------------------------------

function canalulGeneral(guild) {
  return gasesteCanal(guild, cfgGlobal?.canale?.general ?? 'general');
}

async function peVoice(vechi, nou) {
  if (!conf.activ) return;
  const member = nou?.member ?? vechi?.member;
  if (!member || member.user?.bot) return;
  const nouId = nou?.channelId ?? null;
  if (!nouId || nouId === (vechi?.channelId ?? null)) return;   // doar intrari, nu mute/deafen

  const guild = member.guild;
  const canal = nou.channel ?? guild.channels.cache.get(nouId);
  if (!canalEligibil(guild, canal)) return;

  const acum = ceas.acum();
  const total = oameniPeVoce(guild);
  const inCanal = oameniDin(canal).length;
  const nume = member.displayName ?? member.user?.username ?? 'cineva';

  if (total === 1 && acum - stare.ultimulAprinzator >= conf.racireAprinzatorMin * 60_000) {
    const f = VARIANTE_APRINZATOR[Math.floor(Math.random() * VARIANTE_APRINZATOR.length)];
    await trimite(canalulGeneral(guild), f(nume, canal.name));
    stare.ultimulAprinzator = acum;
    salveazaStarea();
  }

  if (inCanal === conf.pragMasa && acum - stare.ultimulMasa >= conf.racireMasaMin * 60_000) {
    await trimite(canalulGeneral(guild), `⚡ Warp-in in masa in **${canal.name}**: ${inCanal} piloti.`);
    stare.ultimulMasa = acum;
    salveazaStarea();
  }
}

// ---------------------------------------------------------------------------
// Datele de ladder, citite tolerant din buletin.json
// ---------------------------------------------------------------------------

function caTimp(v) {
  if (v == null) return NaN;
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  const t = Date.parse(v);
  return Number.isNaN(t) ? NaN : t;
}

function numar(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function citesteLadder(acum = ceas.acum()) {
  const b = citesteJson('buletin.json', null);
  if (!b || typeof b !== 'object') return null;
  const echipe = Array.isArray(b.echipe) ? b.echipe : Object.values(b.echipe ?? {});
  if (echipe.length === 0) return null;

  let inLupta = 0;
  let meciuriAzi = 0;
  for (const e of echipe) {
    if (!e || typeof e !== 'object') continue;
    const t = caTimp(e.lastPlayed);
    if (!Number.isNaN(t) && acum - t >= 0 && acum - t <= FEREASTRA_LUPTA_MS) inLupta++;

    const curente = numar(e.wins) + numar(e.losses);
    const cheie = e.legacyUid ?? e.id ?? e.teamId ?? null;
    let snap = e.snapshotZi ?? (cheie != null && b.snapshotZi && typeof b.snapshotZi === 'object' ? b.snapshotZi[cheie] : undefined);
    if (snap && typeof snap === 'object') snap = numar(snap.wins) + numar(snap.losses);
    else snap = numar(snap);
    if (curente > snap) meciuriAzi += curente - snap;
  }
  return { inLupta, meciuriAzi };
}

// ---------------------------------------------------------------------------
// Contorul de front
// ---------------------------------------------------------------------------

export function numeContor(guild, ladder) {
  const voce = oameniPeVoce(guild);
  if (ladder && (voce > 0 || ladder.inLupta > 0 || ladder.meciuriAzi > 0)) {
    return `⚔️ In lupta: ${voce + ladder.inLupta} · azi: ${ladder.meciuriAzi} meciuri`;
  }
  if (voce > 0) return `🔊 In voice: ${voce}`;
  return NUME_TURN;
}

async function asiguraContor(guild) {
  let canal = stare.contorId ? guild.channels.cache.get(stare.contorId) : null;
  if (!canal) {
    canal = guild.channels.cache.find(
      (c) => eVoce(c) && !c.parentId && (c.name === NUME_TURN || (stare.ultimulNume && c.name === stare.ultimulNume)),
    ) ?? null;
  }
  if (!canal) {
    const optiuni = {
      type: ChannelType.GuildVoice,
      name: NUME_TURN,
      reason: 'Pilonul Cetatii: contorul de front',
    };
    try {
      canal = await guild.channels.create({
        ...optiuni,
        permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] }],
      });
    } catch (e) {
      console.error('[pilon] contor cu incuietoare a picat, incerc fara:', e.message);
      try { canal = await guild.channels.create(optiuni); } catch (e2) {
        console.error('[pilon] nu am putut crea contorul:', e2.message);
        return null;
      }
    }
    stare.ultimulNume = NUME_TURN;   // crearea nu e redenumire, nu consuma din limita
  }
  if (stare.contorId !== canal.id) {
    stare.contorId = canal.id;
    salveazaStarea();
  }
  return canal;
}

async function tickContor(client) {
  if (!conf.activ) return null;
  const guild = guildul(client, cfgGlobal);
  if (!guild) return null;
  const canal = await asiguraContor(guild);
  if (!canal) return null;

  const acum = ceas.acum();
  const nume = numeContor(guild, citesteLadder(acum));
  const numeCurent = stare.ultimulNume ?? canal.name;
  if (nume === numeCurent && nume === canal.name) return nume;
  if (acum - stare.ultimaRedenumire < conf.intervalContorMin * 60_000) return numeCurent;

  try {
    await canal.setName(nume, 'Pilonul Cetatii: contorul de front');
    stare.ultimulNume = nume;
    stare.ultimaRedenumire = acum;
    salveazaStarea();
  } catch (e) {
    console.error('[pilon] setName:', e.message);
  }
  return stare.ultimulNume;
}

// ---------------------------------------------------------------------------
// Pornire
// ---------------------------------------------------------------------------

export function porneste(client, cfg) {
  cfgGlobal = cfg ?? {};
  conf = { ...IMPLICIT, ...(cfg?.pilon ?? {}) };
  citesteStarea();
  if (!conf.activ) return;

  client.on('voiceStateUpdate', (vechi, nou) => {
    peVoice(vechi, nou).catch((e) => console.error('[pilon voice]', e.message));
  });

  client.once('clientReady', () => {
    const ruleaza = () => tickContor(client).catch((e) => console.error('[pilon]', e.message));
    setTimeout(ruleaza, 15_000).unref?.();
    setInterval(ruleaza, conf.intervalContorMin * 60_000).unref?.();
  });
}

export const _intern = {
  ceas, peVoice, tickContor, numeContor, citesteLadder, oameniPeVoce, asiguraContor,
  starea: () => stare, NUME_TURN,
};
export default { porneste, DEFINITII, _intern };
