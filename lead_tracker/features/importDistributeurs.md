# Import Salesforce → JSON + Excel distributeurs — fonctionnel

Bouton "Importer" sur chaque run d'export réussi (section Exports du dashboard). Prend le CSV de
cet export, met à jour `data/leads.json` + `data/leads_historique.jsonl`, assigne chaque nouveau
lead à un distributeur (par pays), et ajoute les nouveaux leads au fichier Excel du distributeur
correspondant (créé s'il n'existe pas encore).

## Décisions prises

- **Nouveau pays → nouveau distributeur automatique** : `mail` vide, `zone` = le pays. À compléter
  par le directeur ensuite (édition manuelle de `data/distributeurs.json` pour l'instant, pas
  d'UI dédiée).
- **Hash sur toutes les colonnes du report** : aucune colonne n'est encore "libre" pour le
  distributeur (pas de colonne commentaire/statut dédiée). Le jour où une colonne devient
  éditable par le distributeur, elle devra être explicitement exclue du hash.
- **Colonnes de l'Excel = exactement les colonnes du report Salesforce actuel** (celles produites
  par l'export), pas de liste curée séparée à maintenir.
- **Fichier `.xlsx` réel (ExcelJS), pas un CSV**, avec deux feuilles par distributeur :
  - **"Leads"** : table canonique, une ligne par lead.
  - **"À traiter"** : leads dont le `Lead Status` n'est pas `Closed - Converted` / `Closed - Not
    Converted`, le plus récent en haut.
- **Append-only, jamais destructif** : le fichier est partagé avec le distributeur (peut contenir
  des commentaires Excel ajoutés à la main). Les lignes déjà présentes ne sont jamais modifiées ni
  supprimées :
  - "Leads" : nouveaux leads ajoutés en bas.
  - "À traiter" : nouveaux leads insérés juste après l'en-tête (pas en bas), pour garder le plus
    récent en haut sans déplacer les lignes déjà présentes plus que nécessaire. Trié par date de
    création (best-effort, cf. limite ci-dessous) avant insertion.
  - Cette feature n'écrit **que** les leads nouvellement vus. Un lead déjà importé dont les
    données Salesforce changent est mis à jour dans `leads.json`/l'historique, **pas** dans
    l'Excel déjà distribué (pas de colonne "libre" distributeur à préserver pour l'instant, donc
    rien à réconcilier — à revoir avec la feature de vérification/écarts).
- **Dropdowns Salesforce + champs obligatoires appliqués dans l'Excel** (prépare la lecture future
  des modifications distributeur pour remonter vers Salesforce) :
  - Pour chaque colonne dont le libellé correspond à un champ Lead de type *picklist* → liste
    déroulante Excel avec les valeurs actives du picklist.
  - Pour chaque colonne correspondant à un champ Lead non nillable → validation "non vide".
  - Posées **une seule fois**, à la création du fichier, sur une plage large (jusqu'à la ligne
    5001) plutôt que ligne par ligne — une règle par colonne (`worksheet.dataValidations.add`),
    pas une règle par cellule (sinon fichiers de plusieurs centaines de Ko pour rien, testé et
    corrigé).
  - Si une colonne du report ne correspond à aucun champ Lead connu (colonne cross-objet type
    "Lead Owner Alias", ou libellé renommé) : servie sans validation, pas d'erreur.

## Limite connue

Le tri "plus récent en haut" de la feuille "À traiter" est **best-effort** : il cherche une colonne
dont le nom contient "date" et "creat"/"création", et essaie de parser sa valeur au format
`JJ/MM/AAAA`. Si aucune colonne de ce type n'est trouvée, ou si le format diffère, l'ordre retombe
sur l'ordre du CSV — pas d'erreur, juste un tri potentiellement imparfait.

## Backend — fichiers

```
back/src/
  core/
    domain/
      lead/lead.hash.ts                    ← hash SHA-256 sur toutes les valeurs (pur, sans I/O)
      distributeur/distributeurAssignment.ts ← règle "par pays", isolée pour rester remplaçable
    usecases/
      importFromSalesforce.uc.ts            ← orchestre tout (DI complète, cf. § architecture)
  infra/
    store/
      leads.store.ts                          ← seul lecteur/écrivain de leads.json +
                                                  leads_historique.jsonl
      distributeurs.store.ts                   ← seul lecteur/écrivain de distributeurs.json
    salesforce/
      leadFieldMeta.ts                          ← describe Lead → picklists + champs obligatoires
                                                    (best-effort, jamais bloquant)
    excel/
      distributorWorkbook.ts                     ← ExcelJS : append-only, 2 feuilles, validations
    http/controllers/
      import.controller.ts                        ← POST /api/import { exportRunId }
      runs.controller.ts                            ← générique, remplace l'ancien code spécifique
                                                        export dans export.controller.ts (GET
                                                        /runs, GET /runs/:id/download, DELETE
                                                        /runs/:id — sert export ET import)
  wiring.ts                                    ← câblage (+ app.use(express.json()) ajouté, requis
                                                   pour le body JSON de POST /api/import)
```

`shared/types/run.ts` généralisé en `Run<TInput, TOutput, TResume>` générique, avec des alias
`ExportRun`/`ImportRun` — un seul type de run ne suffisait plus avec deux types d'exécution aux
résumés différents.

`shared/parsing/salesforceCsv.ts` : parseur CSV pur (RFC4180), relit le fichier produit par
`exportJob.ts` — nécessaire puisque l'import est une action séparée dans le temps (potentiellement
après un redémarrage de l'app), pas une continuation en mémoire de l'export.

## Frontend — fichiers

```
front/src/
  api/
    runs.ts                         ← useDeleteRun (générique), runDownloadUrl
    export.ts                        ← inchangé fonctionnellement, retypé ExportRun
    import.ts                         ← useImportRuns, useStartImport(exportRunId)
  pages/dashboard/DashboardPage.tsx  ← section "Imports" (liste + résumé + suppression), bouton
                                         "Importer" sur chaque run d'export en succès (désactivé
                                         si un import est déjà en cours)
```

## Testé en conditions réelles

998 leads importés depuis un export réel → 998 nouveaux leads, 26 distributeurs créés
automatiquement (un par pays), fichiers Excel écrits avec les bonnes colonnes/valeurs (y compris
les colonnes cross-objet comme "Lead Owner" résolues en nom, pas en ID — héritage direct de
l'approche "vrai report Salesforce" retenue pour l'export).
