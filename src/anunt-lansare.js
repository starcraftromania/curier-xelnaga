// Anuntul oficial de relansare - o singura data per versiune.
// La ~45 s dupa boot, daca anunturi.json nu are versiunea curenta, posteaza in
// #general un embed cu tot ce face Curierul v2 si incearca sa-l fixeze (pin).
// Stare: anunturi.json { versiune, mesajId, cand }.

import { EmbedBuilder } from 'discord.js';
import { citesteJson, scrieJson, guildul, gasesteCanal } from './comun.js';

export const DEFINITII = [];

export const IMPLICIT = {
  versiune: 'v2-relansare',
  ping: 'none',          // 'none' | 'here' | 'everyone' | <id de rol>
  fixeaza: true,
  intarziereSecunde: 45,
};

const FISIER_STARE = 'anunturi.json';

function textPing(ping) {
  if (!ping || ping === 'none') return null;
  if (ping === 'here') return '@here';
  if (ping === 'everyone') return '@everyone';
  return `<@&${ping}>`;
}

export function construiesteEmbed(cfg, c = IMPLICIT) {
  const M = cfg?.moneda ?? '◈';
  const peMinut = cfg?.puncte?.peMinutVoce ?? 2;
  const plafon = cfg?.puncte?.plafonZilnic ?? 600;
  const w = { ora: 18, durataMinute: 120, bonusPeMinut: 2, ...(cfg?.warpin ?? {}) };
  const oraIz = cfg?.intrebareaZilei?.ora ?? 19;
  const oraSfarsit = w.ora + Math.floor(w.durataMinute / 60);

  return new EmbedBuilder()
    .setColor(0x1ABC9C)
    .setTitle('Curierul Xel\'Naga s-a intors')
    .setDescription([
      'Dupa ce gazduirea veche a sters tot, Curierul a fost reconstruit de la zero si e din nou pe post.',
      `Creditele (${M}) curg la fel: ${peMinut} ${M}/minut pe voce, plafon ${plafon} ${M}/zi din voce si stream.`,
    ].join('\n'))
    .addFields(
      {
        name: 'Trivia in regim de concurs',
        value: `O intrebare pe minut in <#trivia>. Primul raspuns corect ia **${M}25**, plafon **${M}1200/zi**. Peste plafon victoriile se numara oricum.`,
      },
      {
        name: 'Pachetele Medivac si /daily',
        value: `Pachetele Medivac cad singure in #general, la ore aleatoare: primul care da click ia **${M}300**. \`/daily\` da bonus zilnic care creste cu streak-ul.`,
      },
      {
        name: 'King of Kings si titlurile',
        value: 'Clasamentul live in #king-of-kings. Titlurile se muta singure: 👑 Regele Regilor (locul 1) · 🗡️ Marele Uzurpator (2) · 💠 Boierul de Vespene (3) · 🧠 Mintea Roiului (trivia) · 🎙️ Gura Cetatii (voce).',
      },
      {
        name: `Intrebarea zilei, la ${oraIz}:00`,
        value: 'In fiecare seara, un poll cu o dilema StarCraft: unitati, rase, patch-uri, scena, comunitate. Fara raspuns corect, doar pareri.',
      },
      {
        name: `Marele Warp-in: sambata si duminica, ${w.ora}:00-${oraSfarsit}:00`,
        value: `Doua ore de voce impreuna. Toti cei prezenti iau **+${w.bonusPeMinut} ${M}/minut** bonus, pe langa ce iau oricum. Preanunt cu o ora inainte.`,
      },
      {
        name: 'Buletinul de ladder',
        value: '`/leaga-contul` cu BattleTag-ul tau si Curierul iti urmareste MMR-ul: promovari, serii, meciuri notabile, direct pe server. Datele vin de la SC2 Pulse.',
      },
      {
        name: 'Comenzile',
        value: '`/puncte` `/profil` `/clasament` `/magazin` `/cumpara` `/trivia` `/daily` `/leaga-contul` `/ghid`',
      },
      {
        name: 'Esti nou? Primii 3 pasi',
        value: [
          '**1.** Alege-ti rasa din Channels & Roles si da `/daily`.',
          '**2.** Intra pe voce cand e cineva acolo (sau la Warp-in) - creditele vin singure.',
          '**3.** Raspunde la trivia in <#trivia> si vezi-ti locul cu `/clasament`.',
        ].join('\n'),
      },
    )
    .setFooter({ text: `Curierul Xel'Naga v2 · ${c.versiune}` })
    .setTimestamp(new Date());
}

// Posteaza anuntul daca versiunea nu e deja marcata. Intoarce mesajul sau null.
export async function posteaza(client, cfg) {
  const c = { ...IMPLICIT, ...(cfg?.anuntLansare ?? {}) };
  const stare = citesteJson(FISIER_STARE, {});
  if (stare.versiune === c.versiune) return null;

  const guild = guildul(client, cfg);
  if (!guild) return null;
  const canal = gasesteCanal(guild, cfg?.canale?.general ?? 'general');
  if (!canal) return null;

  // #trivia ca mentiune reala, daca il gasim
  let embed = construiesteEmbed(cfg, c);
  const trivia = gasesteCanal(guild, cfg?.canale?.trivia ?? 'trivia');
  if (trivia) {
    const json = embed.toJSON();
    json.fields = json.fields.map((f) => ({ ...f, value: f.value.replaceAll('<#trivia>', `<#${trivia.id}>`) }));
    embed = EmbedBuilder.from(json);
  }

  const continut = { embeds: [embed] };
  const ping = textPing(c.ping);
  if (ping) continut.content = ping;

  let mesaj;
  try {
    mesaj = await canal.send(continut);
  } catch (e) {
    console.error('[anunt-lansare] nu am putut posta anuntul:', e.message);
    return null;
  }

  if (c.fixeaza) {
    try { await mesaj.pin(); } catch (e) { console.warn('[anunt-lansare] nu am putut fixa anuntul:', e.message); }
  }

  scrieJson(FISIER_STARE, { versiune: c.versiune, mesajId: mesaj.id, cand: new Date().toISOString() });
  console.log(`[anunt-lansare] anuntul ${c.versiune} postat`);
  return mesaj;
}

export function porneste(client, cfg) {
  const c = { ...IMPLICIT, ...(cfg?.anuntLansare ?? {}) };
  client.once('clientReady', () => {
    setTimeout(() => posteaza(client, cfg).catch((e) => console.error('[anunt-lansare]', e.message)), c.intarziereSecunde * 1000);
  });
}

export const _intern = { construiesteEmbed, posteaza, FISIER_STARE };
export default { porneste, DEFINITII, _intern };
