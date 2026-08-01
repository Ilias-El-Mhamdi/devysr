# Étape 1  : Créer le report réutilisable

Va sur l'onglet Reports (App Launcher → tape "Reports")
Clique New Report
Choisis le type de rapport : Leads
Clique Continue / Start Report
Configure ce que tu veux voir :
Colonnes (Outline) : ajoute les champs que tu veux exporter (LeadId Name, Company, Email, Status, etc.)
Filtres si besoin (ex: uniquement les leads créés récemment)
Clique Save
Donne-lui un nom fixe et clair, ex : Export_Leads_Run
Choisis un dossier (par défaut "My Personal Custom Reports" ou un dossier partagé si plusieurs users doivent y accéder)
Run le report une fois pour vérifier qu'il affiche bien les leads que tu as importés

https://orgfarm-fec657de9c-dev-ed.develop.lightning.force.com/lightning/r/Report/00Ofj00000FxuDdEAJ/edit

---

# Étape 2 : Bouton "Download Export" — plan technique

## Principe général

Le front expose une section "Exports" avec un bouton qui déclenche côté back une récupération du
report Salesforce ci-dessus, sans jamais piloter un login/2FA : on réutilise une session Chrome
déjà loggée, connectée via CDP (Chrome DevTools Protocol).

## Infra — Chrome dédié

- Au lancement de l'app (`npm run start`), le back lance un **Chrome dédié** avec
  `--remote-debugging-port=9222` et un `--user-data-dir` propre à l'outil (profil isolé du Chrome
  habituel de l'utilisateur). Ce Chrome affiche directement le dashboard.
- Un Chrome lancé normalement (double-clic icône) n'expose pas CDP par défaut — le flag doit être
  présent **au lancement du process**, on ne peut pas se greffer après coup sur une instance déjà
  ouverte sans ce flag. D'où la nécessité que ce soit l'app elle-même qui lance ce Chrome.
- C'est dans cette même fenêtre que l'utilisateur se logge à Salesforce (bouton "Ouvrir Salesforce"
  dans le popup de connexion, simple `<a target="_blank">` → nouvel onglet dans ce même profil/process,
  donc même cookie jar — pas besoin de faire transiter ça par le back).
- La session ne survit pas à une fermeture complète de Chrome / extinction du PC (cookie de session,
  pas persistant) + timeout serveur Salesforce. Reconnexion manuelle attendue à chaque nouvelle
  session Chrome (typiquement 1x/jour), pas un cas d'erreur exceptionnel.

## Récupération des données — cookie + GET direct (pas de clic UI)

Plutôt que de piloter le clic "Export" dans l'UI Lightning (fragile : Shadow DOM des Lightning Web
Components, dialogues de format, race condition sur le téléchargement, casse à chaque refonte UI
Salesforce) :

1. Lire le cookie de session (`sid`) directement depuis le profil Chrome via CDP
   (`Network.getAllCookies`, filtré par domaine de l'org) — pas besoin de naviguer vers Salesforce,
   le cookie est dans le profil dès que l'utilisateur s'est loggé une fois dans ce Chrome.
2. Faire un `GET` direct depuis le back Node vers l'URL d'export CSV legacy de Salesforce :
   `https://<instance>.salesforce.com/<reportId>?export=1&enc=UTF-8&xf=csv`
   avec le cookie en header `Cookie`.
3. Le format `xf=csv` donne un CSV **"Details Only"** par nature (le CSV ne supporte pas les
   regroupements/fusions de cellules d'un "Formatted Report" — cette distinction n'existe que pour
   l'export XLS). Donc aucun dialogue de format à gérer.
4. Si la réponse n'est pas un CSV mais du HTML (page de login) → cookie expiré → erreur actionnable
   ("Session Salesforce expirée, reconnecte-toi").

Alternatives écartées : Analytics REST API / Bulk API / SOQL direct (plus robustes mais demandent un
Connected App OAuth côté admin Salesforce — hors scope pour un outil interne mono-utilisateur).
Automatisation complète du login (remplissage user/password) écartée aussi : va à l'encontre du
principe "jamais de login/2FA piloté", et de toute façon bloquée par le MFA obligatoire sur les
logins UI Salesforce.

## Maintien de la session — keep-alive piloté par le front

Le cookie de session Salesforce n'a pas de mécanisme de refresh token : juste un idle timeout
glissant côté serveur. Tant que le cookie est utilisé avant expiration du timeout, la session est
prolongée. D'où une boucle de vérification pilotée par le **front** (pas de job périodique côté
back) :

- Query React Query (`front/src/api/salesforceSession.ts`) : `refetchInterval: 10 * 60 * 1000`,
  montée à la racine de l'app (donc active dès le lancement, tant que l'app est ouverte).
- Chaque tick appelle `POST /api/salesforce/session/check` (endpoint **stateless** : relit le
  cookie via CDP + ping léger Salesforce + retourne le statut — pas de cache/état en mémoire côté
  back, pas de setInterval côté back).
- Popup bloquant global (`SalesforceConnectionGate`) tant que `status !== 'connecte'` :
  - bouton **"Ouvrir Salesforce"** → `<a target="_blank">` vers l'URL du report (redirige vers le
    login si pas connecté) — aucun appel back.
  - bouton **"Vérifier"** → `refetch()` sur la même query (réinitialise aussi le timer des 10 min) :
    - succès (`connecte`) → toast succès, popup se ferme
    - requête OK mais toujours `deconnecte` → toast erreur, popup reste affiché
    - requête en échec (back/CDP injoignable) → toast erreur distinct, popup reste affiché

## Stockage — un dossier par run d'export

Cf. convention générale du projet (`data/runs/<runId>/`) :

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

En échec : `statut: "echec"`, `output.fichier: null`, `erreur` = message actionnable.

Seul lecteur/écrivain de `runs/*` : `infra/store/runs.store.ts` (règle générale du projet — jamais
de `fs` directement ailleurs).

## Backend — fichiers

```
back/src/
  core/usecases/
    exportToSalesforce.uc.ts     ← crée le run, refuse (409) si un export est déjà en_cours,
                                     appelle exportJob, met à jour le statut, log activities.jsonl
    checkSalesforceSession.uc.ts ← lit le cookie via puppeteerSession, ping léger Salesforce,
                                     retourne connecte/deconnecte
  infra/
    salesforce/
      puppeteerSession.ts        ← connexion CDP (puppeteer.connect browserURL) + lecture cookie
      exportJob.ts                ← GET direct vers l'URL d'export CSV avec le cookie, stream vers
                                     runs/<runId>/output/export.csv, détecte Content-Type HTML
    store/
      runs.store.ts                ← CRUD runs (createRun, completeRun, failRun, listRuns, getRun,
                                       deleteRun) — seul lecteur/écrivain de data/runs/*
    http/controllers/
      export.controller.ts
        POST   /api/export                  → démarre un run (409 si déjà en_cours)
        GET    /api/runs?type=export         → liste des runs (contenu direct des run.json)
        GET    /api/runs/:id/download         → sert le fichier (403/404 si statut != succes)
        DELETE /api/runs/:id                  → supprime run + fichier (refuse si en_cours)
      salesforceSession.controller.ts
        POST   /api/salesforce/session/check → check à la demande (utilisé par la boucle front)
  wiring.ts                          ← câblage des nouveaux stores/usecases/controllers
```

Config à externaliser (pas en dur) : `reportId`, domaine de l'instance Salesforce, `browserURL` CDP
(port du debug Chrome).

## Frontend — fichiers

```
front/src/
  main.tsx                            ← ajoute <SalesforceConnectionGate> autour de <Routes>
  api/
    salesforceSession.ts               ← useQuery('salesforce-session', refetchInterval: 10min)
    export.ts                          ← mutation POST /api/export
                                          query GET /api/runs (refetchInterval actif si un run en_cours)
                                          mutation DELETE /api/runs/:id
  components/
    SalesforceConnectionGate.tsx       ← popup bloquant global si status !== 'connecte'
    ConfirmModal.tsx                    ← modal générique de confirmation (réutilisé pour delete run)
  pages/dashboard/
    DashboardPage.tsx                   ← thème futuriste (fond sombre, accents néon, cartes
                                            glassmorphism, glow au survol) + section "Exports" :
        - bouton "Lancer un export" (désactivé si un run est en_cours)
        - liste des runs : date, statut (badge), résumé (nb leads), bouton Télécharger (actif si
          succes → lien vers /api/runs/:id/download), bouton Supprimer (poubelle → ConfirmModal)
  index.css / tailwind config          ← thème étendu (couleurs néon, halos, police mono titres)
```

Mapping `run.json` → affichage : `statut` → badge coloré, `dateDebut`/`dateFin` → date + durée,
`resume.nbLead` → "N leads exportés", `resume.tailleFichierOctets` → taille formatée,
`erreur` → sous-texte rouge si échec, `output.fichier !== null` → active le bouton Télécharger.

## Flux complet

```
Lancement de l'app
  → Chrome dédié s'ouvre (CDP actif) avec le dashboard
  → front monte SalesforceConnectionGate → premier check immédiat
  → si déconnecté : popup bloquant, boucle refetchInterval 10 min tant que l'app tourne

Connexion Salesforce
  → clic "Ouvrir Salesforce" → nouvel onglet dans le même Chrome (login + MFA manuels)
  → clic "Vérifier" → POST /api/salesforce/session/check → toast + popup se ferme si connecté

Export
  → clic "Lancer un export" (désactivé si déjà en_cours)
  → POST /api/export → back vérifie cookie via CDP → GET direct CSV avec cookie
  → fichier écrit dans runs/<runId>/output/export.csv, run.json mis à jour (succes/echec)
  → front poll GET /api/runs pendant que en_cours, affiche la liste mise à jour
  → téléchargement à la demande (pas auto) via /api/runs/:id/download
  → suppression via poubelle + confirmation → DELETE /api/runs/:id
```
