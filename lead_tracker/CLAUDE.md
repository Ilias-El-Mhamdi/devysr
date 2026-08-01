# lead_tracker — Project Guide

Outil pour un directeur commercial qui pilote ~3000 leads répartis entre ~50 distributeurs.
Salesforce reste la **source de vérité**. 
Le pont entre Salesforce et les distributeurs se fait via des fichiers Excel (un par distributeur) et une base locale en JSON, 
avec Puppeteer pour automatiser Salesforce côté navigateur.

## Stack

- **Front** : React + TypeScript + Vite + Tailwind + React Query + React Router
- **Back** : Node.js + TypeScript + Express — serveur **local uniquement** (`localhost`, lancé par un script, ouvert dans le navigateur par défaut). Pas de packaging Electron pour l'instant.
- **Stockage** : fichiers **JSON** locaux (pas de base de données) + fichiers **Excel** (un par distributeur) + CSV d'export Salesforce en entrée.
- **Automatisation Salesforce** : Puppeteer, connecté via CDP à une session Chrome **déjà ouverte et déjà loggée** (`puppeteer.connect({ browserURL })`) — on ne pilote jamais un login/2FA, on réutilise la session en cours.


Monorepo trois packages : `front/`, `back/`, `shared/` (types + parsing purs communs aux deux côtés + une fonction `parse`).

---

## ⚡ À lire en premier

### Garde-fous à mettre en place dès le premier commit (ESLint)

Rien n'est encore codé — ces règles sont la **condition d'entrée**, pas un existant à respecter. Configure-les avant d'écrire la première feature, sinon la frontière core/infra se dilue dès les premiers fichiers.

| Règle | Pourquoi                                                                                                                    |
| --- |-----------------------------------------------------------------------------------------------------------------------------|
| `back/src/core/` ne dépend jamais de `back/src/infra/` (`import/no-restricted-paths`) | Le domaine (hash, règles de relance, assignation distributeur) doit être testable sans fichier, sans Puppeteer, sans Excel. |
| Code partagé via l'alias `shared/…`, jamais en relatif (`no-restricted-imports`) | Uune seule source de vérité pour les types Lead/Distributeur.                                                               |
| Une page front n'importe pas d'une autre page (`import/no-restricted-paths`) | Évite le couplage silencieux entre `dashboard/`, `zone/`, `distributeur/`, `lead/`.                                         |
| Imports de types en `import type` |  lisibilité du diff.                                                                                  |
| Pas de barrel (`lib/queries.ts`-like) | Chaque import pointe sa vraie source.                                                                                       |

### Pièges spécifiques à lead_tracker

- ❌ Lire/écrire `data/*.json` ou un `.xlsx` en dehors de `infra/store/` ou `infra/excel/` → toute autre couche (usecases, controllers, front) passe **par ces modules**, jamais par `fs`/`xlsx` directement.
- ❌ Calculer un hash de lead à deux endroits différents → **une seule** fonction (`core/domain/lead/lead.hash.ts`), utilisée à l'import ET à l'export, sur la **même liste figée de champs** (cf. § Hash d'un lead).
- ❌ Décider la règle de relance (`> 2 semaines && dateRelance > 1 semaine`) dans le `.uc.ts` → la règle vit dans `core/domain/relance/relanceRule.ts`, le use case ne fait que **brancher** dessus.

### Definition of Done

- [ ] `npm run lint` vert des deux côtés touchés.
- [ ] Build OK (`tsc -b` front, `tsc -p` ou équivalent back).
- [ ] Si nouveau use case (`.uc.ts`) ou controller HTTP : câblé dans `back/src/wiring.ts` (cf. « Composition root »).
- [ ] Si nouvelle page front : route enregistrée dans `main.tsx`.
- [ ] Aucune frontière core/infra contournée par `eslint-disable`.
- [ ] Toute action qui modifie un lead ou envoie une relance écrit une ligne dans `observability/actions.jsonl` (cf. § Observabilité) — sinon le rapport d'écarts et le suivi de relance mentent.

---

## Commands

```bash
# Back (cd back)
npm run dev            # serveur Express local en watch (localhost only)
npm run build           # tsc
npm run lint             # ESLint

# Front (cd front)
npm run dev             # Vite dev server
npm run build            # tsc -b && vite build
npm run lint              # ESLint

# Lancer l'outil complet en local (équivalent "double-clic" pour le directeur)
npm run start            # démarre back + ouvre le navigateur sur le front buildé
```

### Tests

Pas de tests pour l'instant : Jest câblable plus tard côté back, mais aucun `*.spec.ts` tant que ce n'est pas explicitement demandé.

---

## Stockage local — `data/`

Pas de base de données : un jeu de fichiers, gitignorés (ce sont des données clients réelles), régénérables à partir de Salesforce en cas de perte.

```
data/
  leads.json                    ← { <leadId>: LeadRecord } — état courant, SOURCE DE VÉRITÉ LOCALE
  leads_historique.jsonl        ← append-only, une ligne par changement de champ (jamais réécrit)
  distributeurs.json            ← { <distributeurName>: { mail, zone, ... } }
  distributeurs/
    <distributeurName>.xlsx     ← fichier de suivi partagé avec le distributeur
  runs/
    <runId>/                    ← un dossier par exécution (import/export/verif/relance), horodaté
      run.json                  ← type, date début/fin, statut, résumé { nbLead, nbDistributeur }
      input/                    ← snapshot des inputs consommés (ex. CSV Salesforce brut)
      output/                   ← résultats produits (rapport d'écarts, logs de cette exécution)
  observability/
    activities.jsonl            ← { nomActivite, nbLead, nbDistributeur, date }
    actions.jsonl                ← { nomAction, idLead, idDistributeur, date }
```

**Règle.** Un seul module par fichier a le droit d'en faire l'I/O :

| Fichier/dossier | Seul lecteur/écrivain autorisé |
| --- | --- |
| `leads.json`, `leads_historique.jsonl` | `infra/store/leads.store.ts` |
| `distributeurs.json` | `infra/store/distributeurs.store.ts` |
| `distributeurs/*.xlsx` | `infra/excel/distributorWorkbook.ts` |
| `runs/*` | `infra/store/runs.store.ts` |
| `observability/*.jsonl` | `infra/store/observability.store.ts` |

Tout le reste du code (use cases, controllers, front) passe par ces modules — jamais de `fs.readFile`/`XLSX.readFile` ailleurs.


---

## Backend Architecture

```
back/src/
  main.ts                        ← bootstrap Express (localhost only)
  wiring.ts                       ← composition root : instancie stores + usecases + controllers
  core/
    domain/                       ← logique pure, zéro I/O, zéro import infra
      lead/
        lead.hash.ts
        lead.staleness.ts         ← règle "dernière modif > 2 semaines"
        leadIdentity.ts           ← cf. § Hypothèses
      distributeur/
        distributeurAssignment.ts ← cf. § Hypothèses
      relance/
        relanceRule.ts            ← règle "> 2 semaines && dateRelance > 1 semaine"
    usecases/                     ← équivalent .uc.ts  : orchestrent, ne calculent pas
      importFromSalesforce.uc.ts
      exportToSalesforce.uc.ts
      verify.uc.ts
      relance.uc.ts
      partage.uc.ts
  infra/
    store/                        ← seule couche qui touche data/*.json (cf. tableau ci-dessus)
    excel/
      distributorWorkbook.ts      ← lecture/écriture d'un fichier Excel distributeur
    salesforce/
      puppeteerSession.ts         ← connexion CDP à la session Chrome existante
      exportJob.ts                ← déclenche l'export Salesforce
      dataImportWizard.ts         ← automation Data Import Wizard (création/màj de leads)
    email/
      draftBuilder.ts             ← génère le contenu du brouillon (mailto/.eml), n'envoie rien
    http/
      controllers/
        refresh.controller.ts
        export.controller.ts
        verify.controller.ts
        relance.controller.ts
        leads.controller.ts       ← expose les vues (par lead / par distributeur / par zone)
```

### Règle de couche

| Couche | Règle |
| --- | --- |
| `core/domain/` | TS pur. Aucun import de `infra/`. Testable sans fichier ni navigateur. |
| `core/usecases/` | Orchestre stores + infra + domain. Ne calcule jamais de règle métier lui-même — délègue à `core/domain/`. |
| `infra/` | Tout ce qui touche le monde extérieur (fichiers, Excel, Puppeteer, HTTP). Zéro règle métier. |

### Composition root (`wiring.ts`)

Pas de framework DI (pas de NestJS ici — trop de cérémonie pour la taille du projet) : `wiring.ts` instancie explicitement les stores, les injecte dans les usecases, puis les usecases dans les controllers, et enregistre les routes Express. **Un seul endroit** à modifier quand on ajoute un usecase ou un controller

| Tu ajoutes… | Où |
| --- | --- |
| Un store (`infra/store/`) | instancié une fois dans `wiring.ts`, passé aux usecases qui en ont besoin |
| Un usecase (`.uc.ts`) | instancié dans `wiring.ts` avec ses dépendances, passé au(x) controller(s) |
| Un controller | route Express enregistrée dans `wiring.ts` |

---

## Frontend Architecture

```
front/src/
  main.tsx              ← routes (BrowserRouter + <Routes>)
  api/                   ← queries React Query (leads, distributeurs, runs, écarts) — lecture seule
  pages/
    dashboard/            ← vue statistiques globales, boutons Rafraîchir/Export/Relance/Vérif
    zone/                 ← vue par zone
    distributeur/          ← vue par distributeur
    lead/                  ← vue par lead
  components/             ← partagé entre ≥2 pages (badges de statut, tableaux de leads, etc.)
```

 Colocation par défaut (une mutation/hook colocalisé avec sa page tant qu'un seul consommateur), 
 remontée en `components/` seulement au 2ᵉ consommateur, une page n'importe pas d'une autre page. 
 Pas de `hooks/` séparé tant qu'un hook générique UI n'apparaît pas réellement — ne pas créer le dossier en prévision.

---

## Types partagés — `shared/`

```
shared/
  types/
    lead.ts              ← type Lead (champs Salesforce + champs internes : distributeur, hash, dateDerniereModification)
    distributeur.ts       ← type Distributeur (nom, mail, zone, dateRelance)
    run.ts                ← type de run + statut + résumé
    observability.ts      ← types Activity / Action
  parsing/
    salesforceCsv.ts       ← parse l'export brut Salesforce → Lead[]
```

Un seul consommateur type-safe des deux côtés (même process TS, pas de frontière réseau publique à valider), 
donc un `type` + une fonction `parse` explicite suffisent. 
Réintroduire une validation runtime le jour où `salesforceCsv.ts` 
doit tolérer un export Salesforce dont les colonnes bougent sans prévenir — probable à moyen terme, à surveiller.

---

## Observabilité

Deux logs append-only, jamais réécrits, un objet JSON par ligne :

- `observability/activities.jsonl` — une ligne par **exécution** (`{ nomActivite, nbLead, nbDistributeur, date }`), écrite par le usecase concerné à la fin de son run.
- `observability/actions.jsonl` — une ligne par **changement unitaire** (`{ nomAction, idLead, idDistributeur, date }`), écrite à chaque modification de lead ou relance envoyée.

Un `runId` (dossier sous `runs/`) regroupe le contexte complet d'une exécution : ce qui a été lu en entrée, ce qui a été produit en sortie, pour pouvoir rejouer un debug sans dépendre de l'état courant de `data/`.


---

## Gestion des erreurs

- **Back** : les controllers HTTP catchent au niveau du routeur Express (middleware d'erreur unique), pas de `try/catch` d'affichage dispersé. Une erreur Puppeteer (session Salesforce absente/expirée) doit produire un message actionnable ("Ouvre Chrome et connecte-toi à Salesforce avant de rafraîchir"), pas une stack trace brute.
- **Front** : `onError` sur les mutations → toast (`lib/toast.ts` à réintroduire tel quel si utile).

---

## Naming conventions

- Dossiers front : `camelCase`. Composants : `PascalCase`. Hooks : `useXxx`.
- Back : base name en `camelCase`, suffixe de rôle en segments pointés — `lead.hash.ts`, `importFromSalesforce.uc.ts`, `leads.store.ts`, `distributorWorkbook.ts`, `puppeteerSession.ts`.
- `shared/` : mêmes règles que le back.

---

## Git

Ne jamais créer de commit sans que l'utilisateur l'ait explicitement demandé dans le message courant.


