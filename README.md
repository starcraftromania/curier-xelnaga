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
node test/ruleaza.js
```

## Atentie la ierarhia rolurilor

Rolul **Curierul Xel'Naga** trebuie sa stea in Discord DEASUPRA lui 👑 Regele Regilor si a
celor patru titluri. Altfel coroana si titlurile ingheata, fara niciun mesaj de eroare.
