// Proces separat care parseaza un .SC2Replay cu @replaysremastered/sc2readerjs si trimite
// rezultatul prin process.send. Ruleaza cu memorie limitata; daca pica, procesul parinte
// il omoara la timeout si raporteaza curat.
// Folosire: node replay-worker.js <cale-fisier>

import { createRequire } from 'node:module';

const MUTARI_MAX = 14;
const MUNCITORI = new Set(['SCV', 'Probe', 'Drone']);
const ACTIUNI_BUILD = new Set(['train', 'build', 'warpIn', 'morph', 'upgradeTo', 'research', 'evolve', 'upgrade']);

function trimite(obiect) {
  if (typeof process.send === 'function') {
    process.send(obiect, () => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref?.();
  } else {
    console.log(JSON.stringify(obiect));
    process.exit(0);
  }
}

function eroare(mesaj) {
  trimite({ ok: false, eroare: String(mesaj).slice(0, 300) });
}

// Sc2readerjs e CommonJS: il incarcam prin require ca sa evitam surprizele ESM.
function incarcaParserul() {
  const require = createRequire(import.meta.url);
  const api = require('@replaysremastered/sc2readerjs');
  if (typeof api?.loadReplaySummary !== 'function') throw new Error('API-ul sc2readerjs nu are loadReplaySummary');
  return api;
}

function rezultatRo(r) {
  switch (r) {
    case 'win': return 'victorie';
    case 'loss': return 'infrangere';
    case 'tie': return 'egal';
    default: return 'necunoscut';
  }
}

async function parseaza(cale) {
  const api = incarcaParserul();
  // Biblioteca avertizeaza pe console.warn la build-uri necunoscute; nu e o eroare pentru noi.
  const avertismente = [];
  const warnVechi = console.warn;
  console.warn = (...a) => { avertismente.push(a.join(' ')); };
  let sumar; let build = null;
  try {
    sumar = await api.loadReplaySummary(cale);
    try {
      build = typeof api.loadBuildCommands === 'function' ? await api.loadBuildCommands(cale) : null;
    } catch (e) {
      avertismente.push(`build order: ${e.message}`);
    }
  } finally {
    console.warn = warnVechi;
  }
  if (!sumar || !Array.isArray(sumar.players)) throw new Error('sumarul replay-ului e gol');

  const jucatori = sumar.players.map((p) => ({
    nume: p.name ?? '?',
    rasa: p.race ?? '?',
    rezultat: rezultatRo(p.result),
    apm: Math.round(Number(p.apm) || 0),
    echipa: p.teamId ?? null,
  }));

  const mutari = [];
  for (const j of build?.players ?? []) {
    for (const cmd of j.commands ?? []) {
      if (!cmd || !cmd.product) continue;
      if (cmd.action && !ACTIUNI_BUILD.has(cmd.action)) continue;
      if (MUNCITORI.has(cmd.product)) continue;
      mutari.push({ secunda: Math.round(Number(cmd.seconds) || 0), jucator: j.name ?? '?', unitate: cmd.product });
    }
  }
  mutari.sort((x, y) => x.secunda - y.secunda);

  return {
    harta: sumar.mapTitle ?? 'harta necunoscuta',
    durataSecunde: Math.round(Number(sumar.durationSeconds) || 0),
    jucatori,
    build: mutari.slice(0, MUTARI_MAX),
    versiune: sumar.patchVersion ?? null,
    buildJoc: sumar.build ?? null,
    jucatLa: sumar.playedAt ?? null,
    avertismente: avertismente.slice(0, 3),
  };
}

const cale = process.argv[2];
if (!cale) {
  eroare('lipseste calea fisierului');
} else {
  parseaza(cale)
    .then((rezultat) => trimite({ ok: true, rezultat }))
    .catch((e) => {
      const m = e?.message ?? String(e);
      if (/protocol|baseBuild|Unsupported/i.test(m)) {
        eroare(`parserul nu suporta build-ul asta (${m})`);
      } else if (/MPQ|header|archive/i.test(m)) {
        eroare(`fisierul nu e un replay SC2 valid (${m})`);
      } else {
        eroare(m);
      }
    });
}
