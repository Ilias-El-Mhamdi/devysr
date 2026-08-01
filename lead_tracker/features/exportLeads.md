# Étape 1 : Créer le report réutilisable

Va sur l'onglet Reports (App Launcher → tape "Reports")
Clique New Report
Choisis le type de rapport : Leads
Clique Continue / Start Report
Configure ce que tu veux voir :
Colonnes (Outline) : ajoute les champs que tu veux exporter (First Name, Last Name, Company, Email, Status, etc.)
Filtres si besoin (ex: uniquement les leads créés récemment)
Clique Save
Donne-lui un nom fixe et clair, ex : Export_Leads_Run
Choisis un dossier (par défaut "My Personal Custom Reports" ou un dossier partagé si plusieurs users doivent y accéder)
Run le report une fois pour vérifier qu'il affiche bien les leads que tu as importés

https://orgfarm-fec657de9c-dev-ed.develop.lightning.force.com/lightning/r/Report/00Ofj00000FxuDdEAJ/edit

---

# Étape 2 : Bouton "Lancer un export" — fonctionnel

Le dashboard expose une section "Exports" : un bouton déclenche côté back la récupération du
report Salesforce ci-dessus, sans jamais piloter de login/2FA — on réutilise une session Chrome
déjà loggée, connectée via CDP (Chrome DevTools Protocol). Le résultat est une liste de runs
(succès/échec/en cours), avec téléchargement à la demande et suppression.

## Infra — Chrome dédié

- Au lancement de l'app (`npm run start`), le back lance un **Chrome dédié**
  (`back/src/infra/openBrowser.ts`) avec `--remote-debugging-port=9222`, un `--user-data-dir`
  propre à l'outil (profil isolé du Chrome habituel de l'utilisateur), et une fenêtre en
  1920×1080 (`--start-maximized` + `--window-size`/`--window-position`, car `--start-maximized`
  seul est ignoré par Chromium sur macOS). Ce Chrome affiche directement le dashboard.
- Un Chrome lancé normalement n'expose pas CDP par défaut — le flag doit être présent **au
  lancement du process**, on ne peut pas se greffer après coup sur une instance déjà ouverte sans
  ce flag. D'où la nécessité que ce soit l'app elle-même qui lance ce Chrome.
- C'est dans cette même fenêtre que l'utilisateur se logge à Salesforce (bouton "Ouvrir
  Salesforce" du popup de connexion, simple `<a target="_blank">` → nouvel onglet dans ce même
  profil/process, donc même cookie jar — pas besoin de faire transiter ça par le back).
- La session ne survit pas à une fermeture complète de Chrome / extinction du PC (cookie de
  session, pas persistant) + timeout serveur Salesforce. Reconnexion manuelle attendue à chaque
  nouvelle session Chrome (typiquement 1x/jour) : c'est le flux normal, pas un cas d'erreur
  exceptionnel.

## Récupération des données — le vrai report Salesforce, exécuté via l'API Analytics

Deux approches plus simples ont été essayées et cassaient en pratique (gardées en note pour ne
pas les retenter) :
- **Cookie + `GET` direct sur l'URL d'export CSV legacy** (`?export=1&enc=UTF-8&xf=csv`) : ne
  fonctionne pas sur un org Lightning-only (comme un Developer Edition orgfarm, sans Salesforce
  Classic) — l'URL redirige silencieusement vers l'UI (`HTTP 200`, `content-type: text/html`).
- **Retraduire le describe du report en SOQL nous-mêmes** (matching par label sur les champs
  Lead) : cassé dès le premier vrai test — un report contient des colonnes cross-objet (`Lead
  Owner` → en réalité `Owner.Name`, pas `OwnerId`) et des en-têtes renommés par l'auteur du report
  indépendants du label réel du champ (`Company / Account` alors que le champ s'appelle
  `Company`). Un mauvais matching produit un export silencieusement faux plutôt qu'une erreur
  visible — inacceptable.

**Ce qui tourne aujourd'hui** : toujours zéro login/2FA piloté, toujours le sid-comme-bearer-token
(pas de Connected App OAuth), mais en laissant **Salesforce exécuter le vrai report** — il résout
nativement toutes les colonnes (cross-objet, renommées, etc.), pas nous.

1. Lire le cookie `sid` via CDP (`infra/salesforce/puppeteerSession.ts`), le transformer en Bearer
   token (`infra/salesforce/sidToken.ts`).
2. `GET /services/data/v61.0/analytics/reports/<reportId>/describe` (Bearer) —
   `infra/salesforce/reportDescribe.ts` — récupère :
   - `reportMetadata.detailColumns` + `reportExtendedMetadata.detailColumnInfo` : colonnes
     affichées et leurs en-têtes ;
   - `reportMetadata.reportFilters` / `reportBooleanFilter` : filtres existants du report ;
   - `reportTypeMetadata.categories[].columns` : catalogue complet des champs disponibles pour ce
     type de report, avec leurs labels **standards** Salesforce (indépendants d'un éventuel
     renommage d'en-tête) — sert à retrouver la colonne "Created Date" pour le chunking.
3. `POST /services/data/v61.0/analytics/reports/<reportId>` avec le `reportMetadata` du describe
   en body (`infra/salesforce/reportRun.ts`) → exécute le report tel quel **sans le sauvegarder**
   ("execute report with changes, without saving"). La réponse contient les lignes déjà formatées
   par Salesforce (`factMap["T!T"].rows[].dataCells[].label`) — identique à ce qu'affiche l'UI,
   donc à un export "Details Only" manuel.
4. **Chunking par plage de `CreatedDate`** pour dépasser la limite de 2000 lignes du run
   synchrone :
   - premier run sans filtre supplémentaire ; si `allData: false` (plus de 2000 lignes), on lit
     les bornes min/max de `CreatedDate` sur `Lead` (une requête SOQL `MIN`/`MAX`, sûre car elle
     ne touche à aucune colonne ambiguë du report) ;
   - découpage récursif par dichotomie sur l'intervalle de dates : chaque run ajoute un filtre
     `CreatedDate >= début AND CreatedDate < fin` à la définition du report (sans toucher aux
     colonnes ni aux filtres existants) ; tout sous-intervalle encore trop plein est redécoupé en
     deux, jusqu'à tenir dans la limite ;
   - garde-fous : profondeur de récursion max, erreur explicite (plutôt qu'une troncature
     silencieuse) si un intervalle non divisible contient encore plus de 2000 leads.
5. Construction du CSV (`infra/salesforce/csv.ts`) à partir des lignes déjà formatées + des
   en-têtes du describe — pas de mapping de champs à faire nous-mêmes.

Alternatives toujours écartées :
- **Bulk API / SOQL direct sans passer par la définition du report** : perdrait la possibilité
  pour le directeur de choisir colonnes/filtres depuis le Report Builder Salesforce sans toucher
  au code.
- **Connected App OAuth** : le sid-comme-bearer suffit et évite toute configuration admin.
- **Automatisation complète du login** (remplissage user/password) : contredit le principe "jamais
  de login/2FA piloté", et de toute façon bloquée par le MFA obligatoire sur les logins UI
  Salesforce.

## Maintien de la session — keep-alive piloté par le front

Le cookie de session Salesforce n'a pas de mécanisme de refresh token : juste un idle timeout
glissant côté serveur. Tant que le cookie est utilisé avant expiration du timeout, la session est
prolongée. D'où une boucle de vérification pilotée par le **front** (pas de job périodique côté
back) :

- Query React Query (`front/src/api/salesforceSession.ts`) : `refetchInterval: 10 * 60 * 1000`,
  montée à la racine de l'app (`SalesforceConnectionGate` dans `main.tsx`) donc active dès le
  lancement, tant que l'app est ouverte.
- Chaque tick appelle `POST /api/salesforce/session/check` (endpoint **stateless** côté back : il
  relit le cookie via CDP + ping léger l'API REST (`GET /services/data/v61.0/limits`, Bearer sid)
  + retourne le statut — pas de cache/état en mémoire côté back, pas de setInterval côté back).
- Popup bloquant global (`SalesforceConnectionGate`) tant que `status !== 'connecte'` :
  - bouton **"Ouvrir Salesforce"** → `<a target="_blank">` vers l'URL du report (redirige vers le
    login si pas connecté) — aucun appel back.
  - bouton **"Vérifier"** → `refetch()` sur la même query (réinitialise aussi le timer des 10 min) :
    - succès (`connecte`) → toast succès, popup se ferme
    - requête OK mais toujours `deconnecte` → toast erreur, popup reste affiché
    - requête en échec (back/CDP injoignable) → toast erreur distinct, popup reste affiché

## Stockage — un dossier par run d'export

Cf. convention générale du projet (`data/runs/<runId>/`, sous `back/data/`, gitignoré) :

```
data/runs/
  <runId>/
    run.json              ← métadonnées + résultat du run
    input/
      request.json         ← snapshot de la requête : reportId, url, dateLancement
    output/
      export.csv            ← fichier récupéré depuis Salesforce (absent si échec)
```

`run.json` :

```json
{
  "id": "<runId>",
  "type": "export",
  "statut": "succes",
  "dateDebut": "2026-08-01T10:12:00.000Z",
  "dateFin": "2026-08-01T10:12:04.000Z",
  "resume": { "nbLead": 2847, "tailleFichierOctets": 512340 },
  "input": {
    "reportId": "00Ofj00000FxuDdEAJ",
    "reportUrl": "https://orgfarm-fec657de9c-dev-ed.develop.lightning.force.com/lightning/r/Report/00Ofj00000FxuDdEAJ/edit"
  },
  "output": { "fichier": "export.csv" },
  "erreur": null
}
```

En échec : `statut: "echec"`, `output.fichier: null`, `erreur` = message actionnable (inclut le
code HTTP et le détail de la réponse Salesforce le cas échéant, pour rester diagnosticable).

Seul lecteur/écrivain de `runs/*` : `infra/store/runs.store.ts` (règle générale du projet — jamais
de `fs` directement ailleurs).

## Backend — fichiers

```
back/src/
  config.ts                    ← reportId, instanceHost, reportUrl, port CDP (surchargeables par env)
  core/usecases/
    exportToSalesforce.uc.ts     ← crée le run, refuse (409) si un export est déjà en_cours,
                                     appelle exportJob, met à jour le statut, log activities.jsonl
    checkSalesforceSession.uc.ts ← lit le cookie via puppeteerSession, ping léger Salesforce,
                                     retourne connecte/deconnecte
  infra/
    openBrowser.ts              ← lance le Chrome dédié (CDP + profil isolé + fenêtre 1920×1080)
    salesforce/
      puppeteerSession.ts         ← connexion CDP (puppeteer.connect browserURL) + lecture du cookie sid
      sidToken.ts                   ← extrait le token Bearer du cookie sid
      sessionCheck.ts                ← ping léger API REST (Bearer sid) pour le check de connexion
      reportDescribe.ts               ← describe du report (colonnes, filtres, catalogue de champs)
      reportRun.ts                     ← exécute le vrai report + chunking par plage de CreatedDate
      csv.ts                             ← construit le CSV à partir des lignes déjà formatées
      exportJob.ts                        ← orchestre describe → run(s) → CSV →
                                              runs/<runId>/output/export.csv
    store/
      runs.store.ts                ← CRUD runs (createRun, completeRun, failRun, listRuns, getRun,
                                       deleteRun) — seul lecteur/écrivain de data/runs/*
      observability.store.ts        ← append-only vers data/observability/activities.jsonl
    http/controllers/
      export.controller.ts
        POST   /api/export                  → démarre un run (409 si déjà en_cours)
        GET    /api/runs?type=export         → liste des runs (contenu direct des run.json)
        GET    /api/runs/:id/download         → sert le fichier (404 si statut != succes)
        DELETE /api/runs/:id                  → supprime run + fichier (409 si en_cours)
      salesforceSession.controller.ts
        POST   /api/salesforce/session/check → check à la demande (utilisé par la boucle front)
  wiring.ts                          ← câblage des stores/usecases/controllers (injection de
                                         dépendances : core/ n'importe jamais infra/ directement,
                                         cf. règle ESLint import/no-restricted-paths)
```

Config externalisée dans `config.ts` (surchargeable par variables d'env `SALESFORCE_REPORT_ID`,
`SALESFORCE_INSTANCE_HOST`, `SALESFORCE_REPORT_URL`, `CHROME_DEBUG_PORT`, `CHROME_USER_DATA_DIR`).

## Frontend — fichiers

```
front/src/
  main.tsx                            ← <SalesforceConnectionGate> autour de <Routes> + <ToastViewport>
  lib/
    toast.ts                          ← petit store pub-sub (toast.success/error), pas de lib externe
  api/
    salesforceSession.ts               ← useQuery('salesforce-session', refetchInterval: 10min)
    export.ts                          ← mutation POST /api/export
                                          query GET /api/runs (refetchInterval actif si un run en_cours)
                                          mutation DELETE /api/runs/:id
  components/
    SalesforceConnectionGate.tsx       ← popup bloquant global si status !== 'connecte'
    ConfirmModal.tsx                    ← modal générique de confirmation (réutilisé pour delete run)
    ToastViewport.tsx                    ← affiche les toasts (succès/erreur) en bas à droite
  pages/dashboard/
    DashboardPage.tsx                   ← thème futuriste (fond dégradé, accents néon, cartes
                                            glassmorphism, glow) + section "Exports" :
        - bouton "Lancer un export" (désactivé si un run est en_cours)
        - liste des runs : date, statut (badge), résumé (nb leads), bouton Télécharger (actif si
          succes → lien vers /api/runs/:id/download), bouton Supprimer (poubelle → ConfirmModal)
  index.css                            ← thème Tailwind étendu (couleurs néon, .glass-panel, .glow-*)
```

Mapping `run.json` → affichage : `statut` → badge coloré, `dateDebut`/`dateFin` → date + durée,
`resume.nbLead` → "N leads exportés", `resume.tailleFichierOctets` → taille formatée,
`erreur` → sous-texte rouge si échec, `output.fichier !== null` → active le bouton Télécharger.

## Flux complet

```
Lancement de l'app
  → Chrome dédié s'ouvre (CDP actif, 1920×1080) avec le dashboard
  → front monte SalesforceConnectionGate → premier check immédiat
  → si déconnecté : popup bloquant, boucle refetchInterval 10 min tant que l'app tourne

Connexion Salesforce
  → clic "Ouvrir Salesforce" → nouvel onglet dans le même Chrome (login + MFA manuels)
  → clic "Vérifier" → POST /api/salesforce/session/check → toast + popup se ferme si connecté

Export
  → clic "Lancer un export" (désactivé si déjà en_cours)
  → POST /api/export → back lit le cookie sid via CDP → describe du report → run(s) via l'API
    Analytics (chunké par CreatedDate si > 2000 lignes)
  → CSV écrit dans runs/<runId>/output/export.csv, run.json mis à jour (succes/echec)
  → front poll GET /api/runs pendant que en_cours, affiche la liste mise à jour
  → téléchargement à la demande (pas auto) via /api/runs/:id/download
  → suppression via poubelle + confirmation → DELETE /api/runs/:id
```
