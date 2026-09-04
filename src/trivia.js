// Ciclul de intrebari: o permutare a intregii banci, parcursa pana la capat,
// deci nicio intrebare nu se repeta pana nu au trecut toate.
//
// Varianta PERSISTENTA salveaza permutarea si pozitia pe disc, ca un restart
// sa nu reia intrebari deja puse (bug-ul din 22-23 august).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AICI = path.dirname(fileURLToPath(import.meta.url));
const RADACINA = process.env.DATA_DIR || path.join(AICI, '..');
const CALE_CICLU = path.join(RADACINA, 'trivia-ciclu.json');

try { fs.mkdirSync(RADACINA, { recursive: true }); } catch { /* exista deja */ }

export function amesteca(n, rnd = Math.random) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Ciclu pur, doar in memorie. Ramane pentru teste.
export function creeazaCiclu(n, rnd = Math.random) {
  if (!Number.isInteger(n) || n <= 0) throw new Error('banca goala');
  let ordine = amesteca(n, rnd);
  let pozitie = 0;
  return function urmatoarea() {
    if (pozitie >= ordine.length) {
      const ultima = ordine[ordine.length - 1];
      do { ordine = amesteca(n, rnd); } while (n > 1 && ordine[0] === ultima);
      pozitie = 0;
    }
    return ordine[pozitie++];
  };
}

function scrieAtomic(stare) {
  const tmp = CALE_CICLU + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(stare));
    fs.renameSync(tmp, CALE_CICLU);
  } catch (e) {
    console.error('[trivia] nu am putut salva ciclul:', e.message);
  }
}

function stareValida(s, n) {
  if (!s || typeof s !== 'object') return false;
  if (s.marime !== n) return false;
  if (!Array.isArray(s.ordine) || s.ordine.length !== n) return false;
  if (!Number.isInteger(s.pozitie) || s.pozitie < 0 || s.pozitie > n) return false;
  const vazute = new Uint8Array(n);
  for (const v of s.ordine) {
    if (!Number.isInteger(v) || v < 0 || v >= n || vazute[v]) return false;
    vazute[v] = 1;
  }
  return true;
}

// Ciclu persistent. Se auto-invalideaza daca banca isi schimba marimea sau
// daca fisierul e corupt: porneste pur si simplu un ciclu proaspat.
export function creeazaCicluPersistent(n, rnd = Math.random) {
  if (!Number.isInteger(n) || n <= 0) throw new Error('banca goala');

  let stare = null;
  try {
    stare = JSON.parse(fs.readFileSync(CALE_CICLU, 'utf8'));
  } catch { stare = null; }

  if (!stareValida(stare, n)) {
    stare = { marime: n, ordine: amesteca(n, rnd), pozitie: 0 };
    scrieAtomic(stare);
  }

  return function urmatoarea() {
    if (stare.pozitie >= stare.ordine.length) {
      const ultima = stare.ordine[stare.ordine.length - 1];
      let noua;
      do { noua = amesteca(n, rnd); } while (n > 1 && noua[0] === ultima);
      stare = { marime: n, ordine: noua, pozitie: 0 };
    }
    const idx = stare.ordine[stare.pozitie];
    stare.pozitie += 1;
    scrieAtomic(stare);
    return idx;
  };
}

export function caleaCiclului() {
  return CALE_CICLU;
}

// Amesteca optiunile unei intrebari si spune care e cea corecta.
// In banca, prima optiune e mereu cea buna.
export function pregatesteRunda(intrebare, rnd = Math.random) {
  const corect = intrebare.o[0];
  const optiuni = [...intrebare.o];
  for (let i = optiuni.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [optiuni[i], optiuni[j]] = [optiuni[j], optiuni[i]];
  }
  return { intrebare: intrebare.q, optiuni, indexCorect: optiuni.indexOf(corect) };
}
