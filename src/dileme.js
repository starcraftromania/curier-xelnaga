// Dilemele Cetatii - intrebarile zilei. Fara raspuns corect: doar pareri.
// Format: { q: 'intrebarea', o: ['optiune', ...] } cu 2-4 optiuni.
// Poll-urile native Discord taie: intrebarea la 300, optiunea la 55 de caractere.
// Aici: intrebari <= 250, optiuni <= 55, fara diacritice, zero duplicate.

export const DILEME = [
  // --- unitati preferate ---
  { q: 'Care e unitatea ta preferata din tot jocul, indiferent de rasa?', o: ['Siege Tank', 'Zealot', 'Zergling', 'Alta, o spun in chat'] },
  { q: 'Cea mai satisfacatoare unitate de controlat la micro?', o: ['Stalker (blink)', 'Marine (stutter step)', 'Mutalisk', 'Widow Mine'] },
  { q: 'Ce unitate ti se pare cea mai enervanta cand joci impotriva ei?', o: ['Disruptor', 'Widow Mine', 'Baneling', 'Liberator'] },
  { q: 'Daca ai putea sterge o unitate din SC2 pentru totdeauna, care ar fi?', o: ['Disruptor', 'Swarm Host', 'Battlecruiser', 'Niciuna, toate au rostul lor'] },
  { q: 'Care unitate merita cel mai mult un buff in patch-ul urmator?', o: ['Hydralisk', 'Thor', 'Carrier', 'Reaper (dupa deschidere)'] },
  { q: 'Cea mai frumoasa unitate ca design vizual?', o: ['Colossus', 'Battlecruiser', 'Brood Lord', 'Tempest'] },
  { q: 'Cel mai bun caster (unitate cu abilitati) din joc?', o: ['High Templar', 'Ghost', 'Infestor', 'Raven'] },
  { q: 'Unitatea pe care o construiesti prea des, desi stii ca nu e optim?', o: ['Battlecruiser', 'Carrier', 'Ultralisk', 'Dark Templar'] },
  { q: 'Cea mai subestimata unitate din ladder-ul de rang mediu?', o: ['Sentry', 'Hellbat', 'Overseer', 'Warp Prism'] },

  // --- rase ---
  { q: 'Ce rasa joci cel mai mult pe ladder?', o: ['Terran', 'Zerg', 'Protoss', 'Random'] },
  { q: 'Care rasa e cea mai grea de jucat la nivel inalt?', o: ['Terran', 'Zerg', 'Protoss', 'Toate la fel'] },
  { q: 'Care rasa e cea mai usoara pentru un incepator?', o: ['Terran', 'Zerg', 'Protoss'] },
  { q: 'Daca ar trebui sa schimbi rasa maine, pe care ai alege-o?', o: ['Terran', 'Zerg', 'Protoss', 'As ramane pe a mea'] },
  { q: 'Care rasa e favorizata de patch-ul curent, dupa parerea ta?', o: ['Terran', 'Zerg', 'Protoss', 'E echilibrat'] },
  { q: 'Ce rasa ai vrea sa vezi jucata mai des pe server?', o: ['Terran', 'Zerg', 'Protoss', 'Random'] },
  { q: 'Cea mai frumoasa baza de vazut de sus, la 200 supply?', o: ['Terran, cu tancurile in pozitie', 'Zerg, cu creep peste tot', 'Protoss, cu cannon-uri si pylon-uri'] },
  { q: 'Care rasa are cea mai buna poveste in campanie?', o: ['Terran (Wings of Liberty)', 'Zerg (Heart of the Swarm)', 'Protoss (Legacy of the Void)'] },
  { q: 'Ce rasa ar juca un Xel\'Naga daca ar cobori pe ladder?', o: ['Protoss, evident', 'Zerg, sunt creatia lor', 'Random, sa nu se plictiseasca'] },

  // --- matchup-uri ---
  { q: 'Care e cel mai placut matchup de urmarit la turnee?', o: ['TvZ', 'PvT', 'ZvP', 'Oglinda (TvT/ZvZ/PvP)'] },
  { q: 'Care oglinda e cea mai plictisitoare?', o: ['TvT', 'ZvZ', 'PvP'] },
  { q: 'Matchup-ul in care pierzi cel mai des, desi simti ca joci bine?', o: ['Contra Terran', 'Contra Zerg', 'Contra Protoss'] },
  { q: 'In TvZ, ce stil de Terran preferi sa vezi?', o: ['Bio cu Medivac si Widow Mine', 'Mech cu tancuri', 'Sky Terran (BC)'] },
  { q: 'In PvZ, care e planul tau preferat?', o: ['Chargelot Archon Immortal', 'Skytoss', 'Gateway all-in timpuriu', 'Disruptor si Colossus'] },
  { q: 'Cel mai greu matchup de invatat pentru un incepator?', o: ['ZvZ (baneling wars)', 'PvP (all-in fest)', 'TvT (tank lines)'] },
  { q: 'In ZvP, ce te enerveaza mai tare?', o: ['Cannon rush', 'Skytoss tarziu', 'Adept shade timpuriu', 'Storm-uri peste hydra'] },
  { q: 'In TvP, cine are avantaj in late game?', o: ['Terran, cu ghost si lib', 'Protoss, cu carrier si storm', 'Depinde doar de jucator'] },
  { q: 'Cel mai cinstit matchup din joc in momentul de fata?', o: ['TvZ', 'PvT', 'ZvP', 'Niciunul nu e cinstit'] },

  // --- mecanici si patch 5.0.16 ---
  { q: 'Startul cu 8 muncitori din patch-ul 5.0.16, fata de cei 12 de pana acum: mai bine sau mai rau?', o: ['Mai bine, deschiderile respira', 'Mai rau, jocul incepe prea lent', 'Nu-mi pasa, joc oricum la fel'] },
  { q: 'Rework-ul Ghost-ului din 5.0.16 a fost o idee buna?', o: ['Da, Ghost-ul era prea puternic', 'Nu, l-au stricat degeaba', 'Nu am observat diferenta'] },
  { q: 'Schimbarile la Warpgate din 5.0.16 au ajutat Protoss-ul?', o: ['Da, e mai usor de aparat', 'Nu, e doar cosmetic', 'Au facut PvP si mai ciudat'] },
  { q: 'Ce parere ai despre balance patch-urile facute de comunitate (Balance Council)?', o: ['Foarte bune, jocul traieste', 'Prea dese, nu apuc sa invat', 'Ar trebui sa decida Blizzard'] },
  { q: 'Ce mecanica ar merita cel mai mult un rework?', o: ['Creep spread', 'Warp-in', 'Mule', 'Nimic, jocul e bun asa'] },
  { q: 'Ar trebui sa aiba macro-ul mai putin din valoarea unui meci?', o: ['Da, micro-ul e spectacolul', 'Nu, macro-ul face jocul adanc', 'Sunt bine echilibrate'] },
  { q: 'Cea mai buna schimbare din istoria patch-urilor SC2?', o: ['Scoaterea Mothership Core', 'Nerf la Swarm Host', 'Startul cu 12 muncitori', 'Scoaterea Shield Battery overcharge'] },
  { q: 'Cea mai proasta schimbare din istoria patch-urilor SC2?', o: ['Introducerea Disruptor-ului', 'Rework-ul Battlecruiser (Tactical Jump)', 'Infestor cu Neural Parasite pe masive', 'Scoaterea Mothership Core'] },

  // --- ladder si mentalitate ---
  { q: 'Cate meciuri de ladder joci intr-o sesiune obisnuita?', o: ['1-2', '3-5', '6-10', 'Pana ma satur sau pierd de 3 ori la rand'] },
  { q: 'Ce faci dupa o infrangere frustranta?', o: ['Joc imediat inca una', 'Ma uit pe replay', 'Inchid jocul pe ziua aia', 'Intru pe voce sa ma plang'] },
  { q: 'Ladder anxiety: te tine departe de butonul Find Match?', o: ['Da, des', 'Uneori', 'Deloc, apas fara sa gandesc'] },
  { q: 'Ce te-ar ajuta cel mai mult sa urci o liga?', o: ['Un build order solid', 'Mai multe meciuri', 'Un coach sau replay review', 'Sa nu ma mai enervez'] },
  { q: 'Ce liga consideri "un jucator bun"?', o: ['Platinum', 'Diamond', 'Master', 'Doar Grandmaster'] },
  { q: 'Ce te motiveaza mai mult pe ladder?', o: ['MMR-ul care creste', 'Sa bat un stil anume', 'Sa joc frumos', 'Sa termin misiunile zilnice'] },
  { q: 'Cea mai buna metoda anti-tilt?', o: ['Pauza de 10 minute', 'Muzica in casti', 'Un meci cu prietenii', 'Joc unranked'] },
  { q: 'Cat de mult conteaza APM-ul la nivelul tau?', o: ['Enorm', 'Conteaza, dar nu decisiv', 'Deloc, deciziile bat viteza'] },

  // --- 2v2 si echipe ---
  { q: 'Cea mai buna combinatie de rase in 2v2?', o: ['Zerg + Protoss', 'Terran + Terran', 'Zerg + Zerg', 'Protoss + Terran'] },
  { q: 'In 2v2, cine ar trebui sa comande?', o: ['Cel cu MMR mai mare', 'Cel care vorbeste mai mult', 'Nimeni, se decide in mers'] },
  { q: 'Preferi 2v2 cu un partener fix sau random team?', o: ['Partener fix, cu voce', 'Random, e mai palpitant', 'Nu joc 2v2'] },
  { q: 'Cea mai buna strategie de 2v2 la nivel mediu?', o: ['All-in impreuna la 4 minute', 'Unul apara, altul face macro', 'Doua armate de aer'] },
  { q: 'Ce e mai important intr-o echipa de 2v2?', o: ['Comunicarea', 'Build-urile sincronizate', 'Sa nu te enervezi pe partener'] },
  { q: 'Archon Mode (doi oameni pe o singura baza) ar merita un turneu pe server?', o: ['Da, ar fi haos frumos', 'Nu, e prea de nisa', 'Doar ca eveniment de distractie'] },
  { q: 'Ce te enerveaza cel mai mult la partenerii random din 2v2?', o: ['Pleaca dupa primul atac', 'Nu scriu nimic', 'Fac cannon rush fara sa spuna'] },
  { q: 'Ai vrea o liga interna de 2v2 pe server, cu echipe fixe?', o: ['Da, ma inscriu', 'Da, dar doar ca spectator', 'Nu, prefer 1v1'] },

  // --- harti ---
  { q: 'Cea mai buna harta de ladder din toate timpurile?', o: ['Metalopolis', 'Daybreak', 'King Sejong Station', 'Alta, o spun in chat'] },
  { q: 'Preferi hartile mari, cu macro, sau cele mici, cu agresiune?', o: ['Mari, cu macro', 'Mici, cu agresiune', 'Un amestec sanatos'] },
  { q: 'Cate harti ar trebui sa aiba veto in ladder?', o: ['1', '2', '3', 'Toate, sa joc doar pe una'] },
  { q: 'Ce te enerveaza cel mai mult la o harta?', o: ['Naturalul greu de aparat', 'Prea multe intrari', 'Rocks peste tot', 'Baza a treia prea departe'] },
  { q: 'Hartile din pool-ul actual sunt mai bune decat cele din 2012?', o: ['Da, clar', 'Nu, cele vechi aveau caracter', 'Nu am jucat in 2012'] },
  { q: 'Cea mai frumoasa tema vizuala de harta?', o: ['Jungla', 'Spatiu si platforme', 'Oras terran', 'Desert'] },
  { q: 'Ai vrea o harta facuta de comunitatea romaneasca in turneele serverului?', o: ['Da, sa o proiectam impreuna', 'Nu, ramanem pe pool-ul oficial'] },
  { q: 'Cea mai proasta harta pe care ai jucat vreodata pe ladder?', o: ['Steppes of War', 'Blistering Sands', 'Lost Temple', 'Alta, o spun in chat'] },

  // --- scena competitiva ---
  { q: 'Cine e cel mai bun jucator din istoria SC2?', o: ['Serral', 'Maru', 'Rogue', 'Altul, il spun in chat'] },
  { q: 'Cine castiga finala visata Serral vs Clem, best of 7?', o: ['Serral', 'Clem', 'Depinde de harti'] },
  { q: 'Cel mai spectaculos jucator de urmarit?', o: ['Clem', 'herO', 'Maru', 'Reynor'] },
  { q: 'Cel mai bun Protoss din lume acum?', o: ['herO', 'MaxPax', 'Classic', 'Altul'] },
  { q: 'Cine merita mai mult titlul de GOAT?', o: ['Serral (cel mai constant)', 'Maru (cele mai multe GSL)', 'Nu se poate compara'] },
  { q: 'Care turneu e cel mai prestigios?', o: ['GSL', 'IEM Katowice', 'EWC (Esports World Cup)', 'DreamHack'] },
  { q: 'Cel mai bun meci de SC2 pe care l-ai vazut vreodata?', o: ['Serral vs Maru, orice', 'MVP vs Squirtle, 2012', 'Innovation vs Life', 'Altul, il spun in chat'] },
  { q: 'Ar trebui ca Romania sa aiba un jucator la un turneu mare in 2027?', o: ['Da, si va avea', 'Ar fi frumos, dar greu', 'Nu conteaza, ne uitam oricum'] },
  { q: 'Cel mai bun creator de continut SC2 pentru cine vrea sa invete?', o: ['PiG', 'Vibe', 'Harstem', 'uThermal'] },

  // --- nostalgie SC1 / Brood War ---
  { q: 'Ai jucat StarCraft 1 sau Brood War inainte de SC2?', o: ['Da, pe LAN in sali de net', 'Da, acasa', 'Nu, am inceput direct cu SC2'] },
  { q: 'Care e cea mai buna campanie: SC1, Brood War sau SC2?', o: ['SC1 original', 'Brood War', 'SC2, toate trei'] },
  { q: 'Ti-e dor de limita de 12 unitati selectate din Brood War?', o: ['Da, dadea skill', 'Nu, era doar chin', 'Nu am prins vremurile alea'] },
  { q: 'Cea mai iconica replica din SC1?', o: ['"You must construct additional pylons"', '"Nuclear launch detected"', '"My life for Aiur!"', '"Need a light?"'] },
  { q: 'Cel mai bun jucator din Brood War?', o: ['Flash', 'Jaedong', 'BoxeR', 'Bisu'] },
  { q: 'Muzica din care joc e mai buna?', o: ['SC1 / Brood War', 'SC2', 'Ambele, in playlist'] },
  { q: 'Care personaj din poveste ti-a placut cel mai mult?', o: ['Jim Raynor', 'Sarah Kerrigan', 'Zeratul', 'Artanis'] },
  { q: 'Ai juca o remasterizare completa a SC2 (grafica noua, acelasi joc)?', o: ['Da, pe loc', 'Numai daca ramane gratuit', 'Nu, e bine cum e'] },
  { q: 'Cea mai mare greseala din povestea SC2?', o: ['Finalul cu Amon', 'Ce s-a intamplat cu Kerrigan', 'Prea putin Zeratul', 'Nu a fost nicio greseala'] },

  // --- obiceiuri de joc ---
  { q: 'Joci cu muzica in casti sau cu sunetul jocului?', o: ['Sunetul jocului, e informatie', 'Muzica, ma calmeaza', 'Voce pe Discord peste joc'] },
  { q: 'Te uiti pe replay-uri dupa meciuri?', o: ['Da, dupa fiecare infrangere', 'Rar', 'Niciodata'] },
  { q: 'Cat de des joci SC2 in ultima vreme?', o: ['Zilnic', 'De cateva ori pe saptamana', 'Cateva meciuri pe luna', 'Doar ma uit la turnee'] },
  { q: 'Joci mai mult ladder, co-op sau harti custom?', o: ['Ladder 1v1', 'Ladder de echipa', 'Co-op', 'Arcade si custom'] },
  { q: 'Ai folosit vreodata un build order de pe Spawning Tool sau de la un pro?', o: ['Da, il stiu pe de rost', 'Am incercat, l-am uitat', 'Nu, improvizez'] },
  { q: 'Cel mai bun comandant de co-op?', o: ['Zagara', 'Karax', 'Stukov', 'Mengsk'] },
  { q: 'Ce faci in primele 10 secunde ale unui meci?', o: ['Scriu glhf', 'Trimit muncitorii si scout', 'Split pe muncitori, ca pro-ii', 'Ma uit cine e adversarul'] },
  { q: 'Pauza intre meciuri: cat dureaza la tine?', o: ['Zero, next imediat', 'Un minut sa respir', 'Cinci minute si o cafea'] },

  // --- comunitatea romaneasca ---
  { q: 'Ce lipseste cel mai mult pe serverul nostru de Discord?', o: ['Mai multa lume pe voce', 'Turnee regulate', 'Coaching pentru incepatori', 'Nimic, e bine asa'] },
  { q: 'Care e cea mai buna ora pentru evenimente pe server?', o: ['18:00', '20:00', '21:00', 'Weekend dupa-amiaza'] },
  { q: 'Ce format de turneu ai vrea pe server?', o: ['1v1 eliminare directa', '1v1 pe grupe si playoff', '2v2 cu echipe fixe', 'King of the Hill'] },
  { q: 'Cat de des ar trebui sa fie turneele interne?', o: ['Saptamanal', 'Lunar', 'O data la doua luni', 'Cand se aduna lumea'] },
  { q: 'Ce premiu ar face un turneu intern mai atragator?', o: ['Credite si un rol special', 'Coaching de la un jucator bun', 'Doar gloria si o poza pe site'] },
  { q: 'Cum ai aflat de Cetatea Xel\'Naga?', o: ['De pe site sau Google', 'De la un prieten', 'De pe Reddit sau Facebook', 'Din alt server de Discord'] },
  { q: 'Ce ti-ar placea sa vezi mai des in #general?', o: ['Replay-uri comentate', 'Meme-uri', 'Discutii de balans', 'Anunturi de meciuri live'] },
  { q: 'Ai participa la o seara de "learn to play" pentru incepatori?', o: ['Da, ca elev', 'Da, ca profesor', 'Doar ca sa ma uit'] },
  { q: 'Ce ar aduce mai multi romani pe server?', o: ['Turnee cu premii', 'Streameri romani activi', 'Promovare pe grupurile de Facebook', 'Un clan in joc'] },
  { q: 'Ar trebui sa avem un clan oficial in joc (tag [RO] sau similar)?', o: ['Da, cat mai repede', 'Da, dar doar pentru cei activi', 'Nu, e de ajuns Discord-ul'] },
  { q: 'Ce te-ar face sa intri mai des pe voce?', o: ['Sa fie deja cineva acolo', 'Un eveniment programat', 'Bonusuri mai mari', 'Nimic, sunt timid'] },

  // --- ipotetice ---
  { q: 'Daca ai putea juca un singur meci showmatch contra unui pro, pe cine ai alege?', o: ['Serral', 'Maru', 'herO', 'Clem'] },
  { q: 'Daca SC3 ar aparea maine, ce ar trebui sa pastreze neaparat din SC2?', o: ['Cele trei rase, neschimbate', 'Ladder-ul si MMR-ul', 'Editorul de harti', 'Co-op'] },
  { q: 'Daca ai castiga 1000 de credite pe server, pe ce le-ai da?', o: ['Culoare de rol', 'Replay review', 'Le tin pentru coaching', 'Le pastrez, sunt Boier'] },
  { q: 'Daca ai putea adauga o a patra rasa, ce ar fi?', o: ['Xel\'Naga', 'Hibrizi', 'Tal\'darim ca rasa separata', 'Nimic, trei e perfect'] },
  { q: 'Daca ai avea o singura ora pe zi pentru SC2, ce ai face?', o: ['Ladder', 'Replay-uri si studiu', 'Ma uit la turnee', 'Voce cu prietenii'] },
  { q: 'Daca Blizzard ar da SC2 unei alte firme, ar fi bine?', o: ['Da, oricine e mai bun decat abandonul', 'Nu, ar strica jocul', 'Depinde de firma'] },
  { q: 'Daca ai putea sterge un singur patch din istorie, care ar fi?', o: ['Cel cu Disruptor', 'Cel cu Infestor Broodlord', 'Cel cu Mothership Core', 'Niciunul'] },
  { q: 'Daca ai fi un Xel\'Naga, pe cine ai proteja?', o: ['Terranii, sunt subdogul', 'Zergii, sunt copiii mei', 'Protossii, sunt frumosi', 'Pe nimeni, ma uit de sus'] },
  { q: 'Daca serverul ar organiza un LAN in Romania, ai veni?', o: ['Da, oriunde', 'Da, daca e in orasul meu', 'Nu, dar ma uit online'] },
];

export default DILEME;
