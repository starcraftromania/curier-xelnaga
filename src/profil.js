// Cardul de pilot: un bloc ANSI desenat cu caractere, afisat de /profil.

export const RANGURI = [
  { nume: 'SCV',        prag: 0 },
  { nume: 'Marine',     prag: 250 },
  { nume: 'Reaper',     prag: 750 },
  { nume: 'Ghost',      prag: 1500 },
  { nume: 'Thor',       prag: 3000 },
  { nume: 'Banshee',    prag: 6000 },
  { nume: 'Raven',      prag: 10000 },
  { nume: 'Archon',     prag: 18000 },
  { nume: "Xel'Naga",   prag: 30000 },
];

export function rangul(totalCastigat) {
  let i = 0;
  for (let k = 0; k < RANGURI.length; k++) if (totalCastigat >= RANGURI[k].prag) i = k;
  const actual = RANGURI[i];
  const urmator = RANGURI[i + 1] ?? null;
  const jos = actual.prag;
  const sus = urmator ? urmator.prag : actual.prag;
  const progres = urmator ? Math.min(1, Math.max(0, (totalCastigat - jos) / (sus - jos))) : 1;
  return { actual, urmator, progres };
}

function bara(progres, latime = 22) {
  const pline = Math.round(progres * latime);
  return '█'.repeat(pline) + '░'.repeat(latime - pline);
}

function pad(text, n) {
  const t = String(text);
  return t.length >= n ? t.slice(0, n) : t + ' '.repeat(n - t.length);
}

function padStanga(text, n) {
  const t = String(text);
  return t.length >= n ? t.slice(0, n) : ' '.repeat(n - t.length) + t;
}

function ore(minute) {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

// Culori ANSI acceptate de Discord: 30-37 text, 40-47 fundal, 1 bold.
const R = '[0m';
const GALBEN = '[1;33m';
const CYAN = '[1;36m';
const VERDE = '[1;32m';
const GRI = '[0;37m';
const ALB = '[1;37m';

export function cardPilot({ nume, u, moneda = '◈', titluri = [] }) {
  const { actual, urmator, progres } = rangul(u.totalCastigat || 0);
  const L = 46;
  const linii = [];

  linii.push(`${CYAN}╔${'═'.repeat(L)}╗${R}`);
  linii.push(`${CYAN}║${R} ${ALB}${pad('PILOT: ' + nume, L - 2)}${R} ${CYAN}║${R}`);
  linii.push(`${CYAN}╠${'═'.repeat(L)}╣${R}`);
  linii.push(`${CYAN}║${R} ${GALBEN}${pad('RANG: ' + actual.nume, L - 2)}${R} ${CYAN}║${R}`);
  linii.push(`${CYAN}║${R} ${GRI}${pad(bara(progres) + '  ' + (urmator ? `${u.totalCastigat}/${urmator.prag}` : 'MAXIM'), L - 2)}${R} ${CYAN}║${R}`);
  if (urmator) {
    linii.push(`${CYAN}║${R} ${GRI}${pad('urmatorul: ' + urmator.nume, L - 2)}${R} ${CYAN}║${R}`);
  }
  linii.push(`${CYAN}╠${'═'.repeat(L)}╣${R}`);
  linii.push(`${CYAN}║${R} ${VERDE}${pad('Sold', 22)}${R}${padStanga(u.sold + ' ' + moneda, L - 24)} ${CYAN}║${R}`);
  linii.push(`${CYAN}║${R} ${pad('Total castigat', 22)}${padStanga(u.totalCastigat + ' ' + moneda, L - 24)} ${CYAN}║${R}`);
  linii.push(`${CYAN}║${R} ${pad('Victorii trivia', 22)}${padStanga(u.triviaCastigate || 0, L - 24)} ${CYAN}║${R}`);
  linii.push(`${CYAN}║${R} ${pad('Dueluri V / I', 22)}${padStanga(`${u.dueluriV || 0} / ${u.dueluriP || 0}`, L - 24)} ${CYAN}║${R}`);
  linii.push(`${CYAN}║${R} ${pad('Timp pe voce', 22)}${padStanga(ore(u.minuteVoice || 0), L - 24)} ${CYAN}║${R}`);
  linii.push(`${CYAN}║${R} ${pad('Timp pe stream', 22)}${padStanga(ore(u.minuteStream || 0), L - 24)} ${CYAN}║${R}`);
  linii.push(`${CYAN}║${R} ${pad('Streak /daily', 22)}${padStanga((u.streakDaily || 0) + ' zile', L - 24)} ${CYAN}║${R}`);
  if (titluri.length) {
    linii.push(`${CYAN}╠${'═'.repeat(L)}╣${R}`);
    linii.push(`${CYAN}║${R} ${GALBEN}${pad(titluri.join(' · '), L - 2)}${R} ${CYAN}║${R}`);
  }
  linii.push(`${CYAN}╚${'═'.repeat(L)}╝${R}`);

  return '```ansi\n' + linii.join('\n') + '\n```';
}
