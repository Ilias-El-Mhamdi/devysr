// Génère un jeu de données FICTIF (aucune donnée client réelle) dans demo_data/, pour enregistrer
// une vidéo de présentation de la page Stats sans jamais toucher à data/ (données clients réelles).
//
// Usage : node scripts/generate_demo_data.mjs
// Puis  : DATA_DIR=<repo>/demo_data npm run dev   (dans back/)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'demo_data');

// Seed simple et déterministe pour des résultats reproductibles d'un run à l'autre.
let seed = 42;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function pick(arr) {
  return arr[Math.floor(rand() * arr.length)];
}
function weightedPick(entries) {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = rand() * total;
  for (const [value, w] of entries) {
    r -= w;
    if (r <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

// Répartition volontairement rééquilibrée : la France reste un gros marché mais ne domine plus le
// graphe (elle pesait ~50% des leads réels, ce qui écrasait tous les autres distributeurs à l'écran).
const COUNTRY_WEIGHTS = [
  ['United States', 15],
  ['Germany', 12],
  ['United Kingdom', 10],
  ['France', 9],
  ['Spain', 8],
  ['Italy', 7],
  ['Netherlands', 6],
  ['Canada', 6],
  ['Switzerland', 5],
  ['Belgium', 5],
  ['Brazil', 4],
  ['Japan', 3],
  ['Poland', 3],
  ['Sweden', 2],
  ['Australia', 2],
  ['Mexico', 1],
  ['India', 1],
  ['Portugal', 1],
  ['Ireland', 1],
  ['China', 1],
  ['Tunisia', 1],
  ['Morocco', 1],
  ['Senegal', 1],
  ['Algeria', 1],
  ['United Arab Emirates', 1],
  ["Cote d'Ivoire", 1],
];

const LEAD_SOURCES = ['Web', 'Phone Inquiry', 'Partner Referral', 'Purchased List', 'Trade Show', 'Other'];
const PRODUCTS = ['GC1000 series', 'GC1020 series', 'GC3000 series', 'GC5000 series'];
const FIRST_NAMES = ['Alex', 'Sam', 'Jordan', 'Chris', 'Morgan', 'Taylor', 'Jamie', 'Casey', 'Robin', 'Drew'];
const LAST_NAMES = ['Martin', 'Bernard', 'Dubois', 'Smith', 'Johnson', 'Müller', 'Rossi', 'Garcia', 'Silva', 'Nakamura'];
const COMPANY_SUFFIX = ['Industries', 'Group', 'Solutions', 'Manufacturing', 'Corp', 'Technologies', 'Partners', 'Systems'];

const STATUS_WEIGHTS = [
  ['Open - Not Contacted', 35],
  ['Working - Contacted', 25],
  ['Closed - Converted', 22],
  ['Closed - Not Converted', 18],
];

const TOTAL_LEADS = 1000;
const NOW = new Date('2026-08-11T09:00:00Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function fmtDate(d) {
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function addDays(d, days) {
  return new Date(d.getTime() + days * MS_PER_DAY);
}

// Étale les créations sur ~26 semaines, avec un léger biais vers le récent (pour peupler "New 7/30j").
function randomCreateDate() {
  const maxAgeDays = 182;
  const skewed = Math.pow(rand(), 1.6) * maxAgeDays;
  return addDays(NOW, -Math.round(skewed));
}

function makeId(index) {
  return `00Q${String(index).padStart(15, '0')}`;
}

function makeLead(index) {
  const country = weightedPick(COUNTRY_WEIGHTS);
  const targetStatus = weightedPick(STATUS_WEIGHTS);
  const createDate = randomCreateDate();

  const historyEntries = [];
  let lastModifiedDate = createDate;
  let currentStatus = 'Open - Not Contacted';

  const advanceTo = (nextStatus, minDays, maxDays) => {
    const daysAfter = minDays + rand() * (maxDays - minDays);
    let date = addDays(lastModifiedDate, daysAfter);
    if (date > NOW) date = NOW;
    historyEntries.push({ champ: 'Lead Status', avant: currentStatus, apres: nextStatus, date: date.toISOString() });
    currentStatus = nextStatus;
    lastModifiedDate = date;
  };

  if (targetStatus === 'Working - Contacted') {
    advanceTo('Working - Contacted', 1, 12);
  } else if (targetStatus === 'Closed - Converted' || targetStatus === 'Closed - Not Converted') {
    const viaWorking = rand() < 0.6;
    if (viaWorking) {
      advanceTo('Working - Contacted', 1, 10);
      advanceTo(targetStatus, 2, 30);
    } else {
      advanceTo(targetStatus, 3, 25);
    }
  }
  // targetStatus === 'Open - Not Contacted' : aucune transition, le lead reste tel quel.

  const first = pick(FIRST_NAMES);
  const last = pick(LAST_NAMES);
  const company = `${pick(LAST_NAMES)} ${pick(COMPANY_SUFFIX)}`;
  const source = weightedPick(LEAD_SOURCES.map((s) => [s, 1]));
  const product = rand() < 0.75 ? pick(PRODUCTS) : '-';

  const lead = {
    id: makeId(index),
    valeurs: {
      'Lead ID': makeId(index),
      'First Name': first,
      'Last Name': last,
      'Company / Account': company,
      Email: `${first}.${last}@${company.toLowerCase().replace(/[^a-z]/g, '')}.com`,
      Country: country,
      'Lead Status': currentStatus,
      'Lead Source': source,
      'Product Interest': product,
      'Create Date': fmtDate(createDate),
      'Last Modified': fmtDate(lastModifiedDate),
    },
    distributeur: country,
    hash: `demo-${index}`,
    dateImport: createDate.toISOString(),
    dateDerniereModification: lastModifiedDate.toISOString(),
  };

  return { lead, historyEntries: historyEntries.map((e) => ({ ...e, leadId: lead.id })) };
}

const leads = {};
const historique = [];

for (let i = 1; i <= TOTAL_LEADS; i++) {
  const { lead, historyEntries } = makeLead(i);
  leads[lead.id] = lead;
  historique.push(...historyEntries);
}

historique.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

const distributeurs = Object.fromEntries(
  COUNTRY_WEIGHTS.map(([country]) => [country, { nom: country, mail: '', zone: country }]),
);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'leads.json'), JSON.stringify(leads, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'leads_historique.jsonl'), historique.map((e) => JSON.stringify(e)).join('\n') + '\n');
fs.writeFileSync(path.join(OUT_DIR, 'distributeurs.json'), JSON.stringify(distributeurs, null, 2));

console.log(`Généré ${TOTAL_LEADS} leads fictifs dans ${OUT_DIR}`);
console.log('Lance le back avec :  DATA_DIR=' + OUT_DIR + ' npm run dev   (depuis back/)');
