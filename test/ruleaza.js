// Verificari locale, fara Discord. Se ruleaza cu: node test/ruleaza.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

let trecute = 0; let picate = 0;
function ok(nume, conditie, detaliu = '') {
  if (conditie) { trecute++; }
  else { picate++; console.error(`  PICAT: ${nume} ${detaliu}`); }
}

// --- ciclul de trivia, in directoare temporare izolate -------------------
function cuDirectorNou(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cetatea-'));
  try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

function ruleazaInProces(dir, cod) {
  return execFileSync(process.execPath, ['--input-type=module', '-e', cod], {
    env: { ...process.env, DATA_DIR: dir },
    encoding: 'utf8',
  }).trim();
}

const RAD = path.resolve('src');

// 1. o permutare completa, fara repetitii
cuDirectorNou((dir) => {
  const out = ruleazaInProces(dir, `
    import { creeazaCicluPersistent } from '${RAD}/trivia.js';
    const c = creeazaCicluPersistent(50);
    const v = []; for (let i=0;i<50;i++) v.push(c());
    console.log(new Set(v).size, Math.min(...v), Math.max(...v));
  `);
  ok('ciclu: permutare completa de 50', out === '50 0 49', `(${out})`);
});

// 2. reluarea exacta dupa restart
cuDirectorNou((dir) => {
  const a = ruleazaInProces(dir, `
    import { creeazaCicluPersistent } from '${RAD}/trivia.js';
    const c = creeazaCicluPersistent(100);
    const v = []; for (let i=0;i<10;i++) v.push(c());
    console.log(JSON.stringify(v));
  `);
  const b = ruleazaInProces(dir, `
    import { creeazaCicluPersistent } from '${RAD}/trivia.js';
    const c = creeazaCicluPersistent(100);
    const v = []; for (let i=0;i<10;i++) v.push(c());
    console.log(JSON.stringify(v));
  `);
  const primele = JSON.parse(a); const urmatoarele = JSON.parse(b);
  const suprapuneri = urmatoarele.filter((x) => primele.includes(x));
  ok('ciclu: restartul NU reia intrebari deja puse', suprapuneri.length === 0, `(${suprapuneri.length} suprapuneri)`);
});

// 3. fisier corupt -> ciclu proaspat, fara sa crape
cuDirectorNou((dir) => {
  fs.writeFileSync(path.join(dir, 'trivia-ciclu.json'), '{ nu e json valid');
  const out = ruleazaInProces(dir, `
    import { creeazaCicluPersistent } from '${RAD}/trivia.js';
    const c = creeazaCicluPersistent(30);
    console.log(typeof c());
  `);
  ok('ciclu: fisier corupt -> reia curat', out === 'number', `(${out})`);
});

// 4. banca isi schimba marimea -> starea se invalideaza singura
cuDirectorNou((dir) => {
  ruleazaInProces(dir, `
    import { creeazaCicluPersistent } from '${RAD}/trivia.js';
    const c = creeazaCicluPersistent(40); c(); c();
  `);
  const out = ruleazaInProces(dir, `
    import { creeazaCicluPersistent } from '${RAD}/trivia.js';
    import fs from 'node:fs';
    const c = creeazaCicluPersistent(60); c();
    const s = JSON.parse(fs.readFileSync(process.env.DATA_DIR + '/trivia-ciclu.json','utf8'));
    console.log(s.marime, s.ordine.length);
  `);
  ok('ciclu: banca redimensionata -> stare noua', out === '60 60', `(${out})`);
});

// 5. granita de ciclu: prima din ciclul nou != ultima din cel vechi
cuDirectorNou((dir) => {
  const out = ruleazaInProces(dir, `
    import { creeazaCiclu } from '${RAD}/trivia.js';
    let rele = 0;
    for (let k=0;k<200;k++) {
      const c = creeazaCiclu(6);
      const v = []; for (let i=0;i<7;i++) v.push(c());
      if (v[6] === v[5]) rele++;
    }
    console.log(rele);
  `);
  ok('ciclu: nicio repetitie peste granita ciclului', out === '0', `(${out})`);
});

// --- store ---------------------------------------------------------------
cuDirectorNou((dir) => {
  const out = ruleazaInProces(dir, `
    import store from '${RAD}/store.js';
    const id = '111';
    const a = store.acorda(id, 400, 600);
    const b = store.acorda(id, 400, 600);
    const c = store.acorda(id, 400, 600);
    const u = store.utilizator(id);
    console.log(JSON.stringify([a,b,c,u.sold,u.totalCastigat,u.castigatAzi]));
  `);
  ok('store: plafonul zilnic taie exact la 600', out === '[400,200,0,600,600,600]', `(${out})`);
});

cuDirectorNou((dir) => {
  const out = ruleazaInProces(dir, `
    import store from '${RAD}/store.js';
    const id='222';
    let ultim=0, victorii=0;
    for (let i=0;i<50;i++) ultim = store.acordaTrivia(id, 25, 1200);
    const u = store.utilizator(id);
    console.log(JSON.stringify([ultim, u.triviaCastigate, u.triviaAzi]));
  `);
  ok('store: dupa plafonul de trivia da 1 simbolic si tot numara victoria',
    out === '[1,50,1202]', `(${out})`);
});

cuDirectorNou((dir) => {
  const out = ruleazaInProces(dir, `
    import store from '${RAD}/store.js';
    const id='333';
    store.acorda(id, 100, 600);
    store.ajusteaza(id, 300);
    const u = store.utilizator(id);
    console.log(JSON.stringify([u.sold, u.totalCastigat]));
  `);
  ok('store: ajusteaza urca DOAR soldul, nu si totalCastigat (rangul nu se misca)',
    out === '[400,100]', `(${out})`);
});

cuDirectorNou((dir) => {
  const out = ruleazaInProces(dir, `
    import store from '${RAD}/store.js';
    store.acorda('1272997404391637067', 5000, 99999); // Snac, exclus
    store.acorda('444', 100, 99999);
    console.log(JSON.stringify(store.clasament(10).map(r=>r.id)));
  `);
  ok('store: adminul exclus nu apare in clasament', out === '["444"]', `(${out})`);
});

cuDirectorNou((dir) => {
  const out = ruleazaInProces(dir, `
    import store from '${RAD}/store.js';
    store.utilizator('a'); store.utilizator('b');
    store.acordaTrivia('a', 25, 1200); store.acordaTrivia('a', 25, 1200);
    console.log(JSON.stringify(store.clasamentDupa('triviaCastigate',10)));
  `);
  ok('store: clasamentDupa ignora valorile zero', out === '[{"id":"a","valoare":2}]', `(${out})`);
});

cuDirectorNou((dir) => {
  const out = ruleazaInProces(dir, `
    import store from '${RAD}/store.js';
    console.log(store.flagODataSingura('x'), store.flagODataSingura('x'));
  `);
  ok('store: fanionul se ridica o singura data', out === 'true false', `(${out})`);
});

cuDirectorNou((dir) => {
  const out = ruleazaInProces(dir, `
    import store from '${RAD}/store.js';
    import fs from 'node:fs';
    store.acorda('555', 10, 600);
    const d = JSON.parse(fs.readFileSync(store.undeSalvez(),'utf8'));
    console.log(Object.keys(d).sort().join(','), d.utilizatori['555'].sold);
  `);
  ok('store: forma fisierului data.json e cea asteptata',
    out === 'dueluri,flags,predictie,utilizatori 10', `(${out})`);
});

// --- profil --------------------------------------------------------------
{
  const { rangul, cardPilot } = await import('../src/profil.js');
  ok('profil: 0 castigat -> SCV', rangul(0).actual.nume === 'SCV');
  ok('profil: 300 castigat -> Marine', rangul(300).actual.nume === 'Marine');
  ok('profil: 40000 castigat -> Xel\'Naga, fara urmator', rangul(40000).actual.nume === "Xel'Naga" && rangul(40000).urmator === null);
  const card = cardPilot({ nume: 'Test', u: { sold: 10, totalCastigat: 10, triviaCastigate: 1, minuteVoice: 90 } });
  ok('profil: cardul e un bloc ansi', card.startsWith('```ansi') && card.endsWith('```'));
  ok('profil: cardul arata orele corect', card.includes('1h 30min'));
}

// --- trivia: pregatirea rundei ------------------------------------------
{
  const { pregatesteRunda } = await import('../src/trivia.js');
  const { BANCA } = await import('../src/intrebari.js');
  ok('banca: exact 825 de intrebari', BANCA.length === 825, `(${BANCA.length})`);
  let gresite = 0;
  for (const intrebare of BANCA) {
    const r = pregatesteRunda(intrebare);
    if (r.optiuni[r.indexCorect] !== intrebare.o[0]) gresite++;
    if (r.optiuni.length !== 4) gresite++;
  }
  ok('trivia: raspunsul corect ramane corect dupa amestecare', gresite === 0, `(${gresite} gresite)`);
  const eticheteLungi = BANCA.flatMap((i) => i.o).filter((o, k) => `A. ${o}`.length > 80);
  ok('trivia: nicio eticheta de buton nu depaseste 80 de caractere', eticheteLungi.length === 0, `(${eticheteLungi.length})`);
}

console.log(`\n${trecute} verificari trecute, ${picate} picate`);
process.exit(picate === 0 ? 0 : 1);
