// Definitiile comenzilor slash, ca JSON brut (forma pe care o cere Discord).
// Tipuri: 3 = string, 4 = intreg, 6 = utilizator.

export const DEFINITII = [
  {
    name: 'puncte',
    description: 'Cate credite ai (sau altcineva)',
    options: [
      { name: 'om', description: 'Al cui sold vrei sa-l vezi', type: 6, required: false },
    ],
  },
  {
    name: 'profil',
    description: 'Cardul tau de pilot: rang, sold, victorii',
    options: [
      { name: 'om', description: 'Al cui profil vrei sa-l vezi', type: 6, required: false },
    ],
  },
  {
    name: 'clasament',
    description: 'Topul Cetatii',
    options: [
      {
        name: 'categorie',
        description: 'Dupa ce se face topul',
        type: 3,
        required: false,
        choices: [
          { name: 'general (credite)', value: 'general' },
          { name: 'trivia', value: 'trivia' },
          { name: 'voce', value: 'voce' },
        ],
      },
    ],
  },
  {
    name: 'trivia',
    description: 'Porneste o runda de trivia SC2 aici',
  },
  {
    name: 'daily',
    description: 'Bonusul zilnic, cu streak',
  },
  {
    name: 'magazin',
    description: 'Ce se poate cumpara cu credite',
  },
  {
    name: 'cumpara',
    description: 'Cumpara ceva din magazin',
    options: [
      { name: 'articol', description: 'Codul articolului din /magazin', type: 3, required: true },
    ],
  },
  {
    name: 'ghid',
    description: 'Cum merge Cetatea: boti, credite, canale',
  },
  {
    name: 'puncte-adauga',
    description: 'Adauga credite cuiva (staff)',
    default_member_permissions: '32', // Manage Server
    options: [
      { name: 'om', description: 'Cui', type: 6, required: true },
      { name: 'suma', description: 'Cate credite', type: 4, required: true },
    ],
  },
  {
    name: 'puncte-scade',
    description: 'Scade credite cuiva (staff)',
    default_member_permissions: '32',
    options: [
      { name: 'om', description: 'Cui', type: 6, required: true },
      { name: 'suma', description: 'Cate credite', type: 4, required: true },
    ],
  },
];

export default DEFINITII;
