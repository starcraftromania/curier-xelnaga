// Intrebarea zilei - o dilema StarCraft II pe zi, la 19:00, in #general, ca poll
// nativ Discord. Daca poll-ul esueaza, cade singur pe un embed cu reactii 1..N.
// Punga: o permutare a tuturor dilemelor, fara repetitie pana nu trec toate si
// fara repetitie la granita (prima din punga noua != ultima din cea veche).
// Stare: intrebarea-zilei.json { punga: [indici], pozitie, ultimaZi: 'YYYY-MM-DD' }.

import { EmbedBuilder } from 'discord.js';
import { DILEME } from './dileme.js';
import { citesteJson, scrieJson, oraLocala, guildul, gasesteCanal, pad } from './comun.js';

export const DEFINITII = [];

export const IMPLICIT = {
  ora: 19,
  minut: 0,
  oraLimita: 22,        // dupa ora asta nu mai postam pe ziua respectiva
  pollNativ: true,
  canal: null,          // implicit cfg.canale.general
  durataOre: 24,
};

const FISIER_STARE = 'intrebarea-zilei.json';
const CIFRE = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

// ---------------------------------------------------------------------------
// Punga - functii pure
// ---------------------------------------------------------------------------

export function amesteca(n, rnd = Math.random) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pungaValida(s, n) {
  if (!s || !Array.isArray(s.punga) || s.punga.length !== n) return false;
  if (!Number.isInteger(s.pozitie) || s.pozitie < 0 || s.pozitie > n) return false;
  const vazute = new Uint8Array(n);
  for (const v of s.punga) {
    if (!Number.isInteger(v) || v < 0 || v >= n || vazute[v]) return false;
    vazute[v] = 1;
  }
  return true;
}

// Scoate urmatorul indice din stare (o muteaza) si il intoarce.
export function urmatorulIndex(stare, n = DILEME.length, rnd = Math.random) {
  if (!pungaValida(stare, n)) {
    stare.punga = amesteca(n, rnd);
    stare.pozitie = 0;
  }
  if (stare.pozitie >= stare.punga.length) {
    const ultima = stare.punga[stare.punga.length - 1];
    let noua;
    do { noua = amesteca(n, rnd); } while (n > 1 && noua[0] === ultima);
    stare.punga = noua;
    stare.pozitie = 0;
  }
  const idx = stare.punga[stare.pozitie];
  stare.pozitie += 1;
  return idx;
}

// ---------------------------------------------------------------------------
// Stare pe disc
// ---------------------------------------------------------------------------

function citesteStarea() {
  return { punga: [], pozitie: 0, ultimaZi: null, ...citesteJson(FISIER_STARE, {}) };
}

// E momentul sa postam? Intre ora:minut si oraLimita, si nu am postat azi.
export function eMomentul(stare, acum, c = IMPLICIT) {
  const l = oraLocala(acum);
  if (stare.ultimaZi === l.data) return false;
  const m = l.ora * 60 + l.minut;
  return m >= c.ora * 60 + c.minut && m < c.oraLimita * 60;
}

// ---------------------------------------------------------------------------
// Postarea
// ---------------------------------------------------------------------------

export function embedDilema(d, zi) {
  const linii = d.o.map((o, k) => `${CIFRE[k]} ${o}`);
  return new EmbedBuilder()
    .setColor(0xE67E22)
    .setTitle('Intrebarea zilei')
    .setDescription(`**${d.q}**\n\n${linii.join('\n')}`)
    .setFooter({ text: `Voteaza cu reactia · ${zi}` });
}

export function corpPoll(d, c = IMPLICIT) {
  return {
    poll: {
      question: { text: d.q.slice(0, 300) },
      answers: d.o.map((o) => ({ text: o.slice(0, 55) })),
      duration: c.durataOre,
      allowMultiselect: false,
    },
  };
}

// Posteaza dilema in canal. Intoarce { mesaj, mod: 'poll'|'embed' } sau null.
export async function posteazaDilema(canal, d, c = IMPLICIT, zi = '') {
  if (!canal) return null;
  if (c.pollNativ) {
    try {
      const mesaj = await canal.send(corpPoll(d, c));
      return { mesaj, mod: 'poll' };
    } catch (e) {
      console.error('[intrebarea-zilei] poll-ul nativ a esuat, cad pe embed cu reactii:', e.message);
    }
  }
  try {
    const mesaj = await canal.send({ embeds: [embedDilema(d, zi)] });
    for (let k = 0; k < d.o.length && k < CIFRE.length; k++) {
      try { await mesaj.react(CIFRE[k]); } catch (e) { console.error('[intrebarea-zilei] reactie:', e.message); }
    }
    return { mesaj, mod: 'embed' };
  } catch (e) {
    console.error('[intrebarea-zilei] nu am putut posta:', e.message);
    return null;
  }
}

// Tick (la 60 s). `acum` se poate injecta pentru teste. Intoarce rezultatul postarii sau null.
export async function tick(client, cfg, acum = new Date()) {
  const c = { ...IMPLICIT, ...(cfg?.intrebareaZilei ?? {}) };
  const stare = citesteStarea();
  if (!eMomentul(stare, acum, c)) return null;

  const guild = guildul(client, cfg);
  if (!guild) return null;
  const canal = gasesteCanal(guild, c.canal ?? cfg?.canale?.general ?? 'general');
  if (!canal) return null;

  const l = oraLocala(acum);
  // scoatem indicele dintr-o copie: daca postarea esueaza, punga ramane neatinsa
  const copie = { punga: [...stare.punga], pozitie: stare.pozitie };
  const idx = urmatorulIndex(copie, DILEME.length);
  const d = DILEME[idx];

  const rez = await posteazaDilema(canal, d, c, l.data);
  if (!rez) return null;

  scrieJson(FISIER_STARE, { punga: copie.punga, pozitie: copie.pozitie, ultimaZi: l.data });
  console.log(`[intrebarea-zilei] postata (${rez.mod}) #${idx}: ${d.q.slice(0, 60)}`);
  return { ...rez, idx, dilema: d };
}

export function porneste(client, cfg) {
  const c = { ...IMPLICIT, ...(cfg?.intrebareaZilei ?? {}) };
  client.once('clientReady', () => {
    console.log(`[intrebarea-zilei] ${DILEME.length} dileme, zilnic la ${pad(c.ora)}:${pad(c.minut)}`);
    const ruleaza = () => tick(client, cfg).catch((e) => console.error('[intrebarea-zilei]', e.message));
    setTimeout(ruleaza, 30_000);
    setInterval(ruleaza, 60_000);
  });
}

export const _intern = { urmatorulIndex, amesteca, eMomentul, embedDilema, corpPoll, posteazaDilema, tick, FISIER_STARE, CIFRE };
export default { porneste, DEFINITII, _intern };
