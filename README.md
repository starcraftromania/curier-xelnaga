# Curierul Xel'Naga

Botul de economie si trivia al **Cetatii Xel'Naga**, serverul Discord al comunitatii
StarCraft II din Romania — https://starcraftromania.github.io/

Node.js, ESM, discord.js 14. Ruleaza ca serviciu systemd pe un VM, langa Radio Xel'Naga.

## Ce face

- economie: 2 credite/minut pe voce, 10/minut de stream cu spectator, plafon 600/zi
- trivia SC2 in #trivia: o intrebare pe minut, 25 credite primului raspuns corect,
  plafon 1200/zi, banca de 825 de intrebari parcursa fara repetitii
- pachete Medivac: 300 de credite cad in #general la 2-6 h, primul care da click le ia
- `/daily` cu streak, magazin cu roluri de culoare si servicii
- King of Kings: clasament live in #king-of-kings, rolul 👑 Regele Regilor mutat automat
- titluri: 🗡️ Marele Uzurpator, 💠 Boierul de Vespene, 🧠 Mintea Roiului, 🎙️ Gura Cetatii
- buletinul de ladder (SC2 Pulse): `/leaga-contul`, 8 credite/victorie, anunt la promovare,
  buletin zilnic la 23:00, cursa saptamanala de MMR cu rolul 📈 Ascensiunea Saptamanii
- Marele Warp-in: sambata si duminica 18:00-20:00, +2 credite/minut pe voce, eveniment Discord
- Intrebarea zilei: poll nativ la 19:00 in #general, 105 dileme fara repetitie
- camere de voce proprii (join-to-create prin ➕ Creeaza camera), `/camera`
- Pilonul: anunt cand intra primul om pe voce, contorul de front
- dueluri (`/duel`), predictii (`/predictie`), carduri de replay (`/replay`)
- vitrina: publica `clasament.json` pe site la 10 minute (cere GITHUB_TOKEN in .env)
- paznicul radioului: alerta daca farul din #off-topic tace 20 de minute

## Instalare

```
git clone https://github.com/starcraftromania/curier-xelnaga.git /opt/curier-xelnaga
bash /opt/curier-xelnaga/instaleaza.sh
```

Apoi pui tokenul in `/opt/curier-xelnaga/.env` (vezi `.env.exemplu`) si:

```
systemctl restart curier-xelnaga
journalctl -u curier-xelnaga -f
```

Update: `git pull && systemctl restart curier-xelnaga`.

## Teste

```
npm test
```
(434 de verificari, fara Discord real)

## Atentie la ierarhia rolurilor

Rolul **Curierul Xel'Naga** trebuie sa stea in Discord DEASUPRA lui 👑 Regele Regilor si a
celor patru titluri. Altfel coroana si titlurile ingheata, fara niciun mesaj de eroare.
