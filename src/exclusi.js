// Handicapul de admin: cine e aici nu apare in NICIUN clasament si nu primeste
// niciun titlu. Punctele nu se pierd - /puncte, /profil, magazinul merg normal.
// Ca sa scoti sau sa adaugi pe cineva: editezi lista si dai restart.

export const EXCLUSI = new Set([
  '1272997404391637067', // Snac (fondator)
]);

export function eExclus(id) {
  return EXCLUSI.has(String(id));
}
