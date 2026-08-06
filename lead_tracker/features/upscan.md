# Upscan — remonter les modifications des distributeurs vers Salesforce

Nouvelle section "Upscan" sur le dashboard : lit tous les fichiers Excel distributeurs, détecte
les leads dont un champ éditable a changé depuis le dernier import, et produit un CSV prêt à être
déposé dans le **Data Import Wizard** de Salesforce (mise à jour par "Lead ID"). Bouton
"Run upscan", téléchargeable comme un export.

## Prérequis : correction d'un bug d'architecture Excel

Avant cette feature, chaque lead existait en **deux copies indépendantes** dans l'Excel d'un
distributeur : la feuille "Leads" et la feuille de statut correspondante ("À traiter"/"En cours de
traitement"/"Traités"), chacune avec ses propres cellules éditables. Un distributeur modifiant le
statut ou l'email dans l'une des deux copies ne mettait pas à jour l'autre — aucune source unique
de vérité.

**Corrigé** : les feuilles de statut sont maintenant des **vues verrouillées, sans aucune colonne
éditable**, entièrement régénérées à chaque écriture à partir du contenu courant de "Leads" (seule
feuille éditable du fichier). Concrètement (`infra/excel/distributorWorkbook.ts`) :
- Les nouveaux leads sont toujours ajoutés (append-only) uniquement sur "Leads".
- À chaque écriture, tout le contenu actuel de "Leads" est relu (donc y compris d'éventuelles
  modifications déjà faites par le distributeur sur des lignes existantes), reclassé par statut,
  et les 3 feuilles de vue sont vidées puis reconstruites triées par date de création décroissante.
- Limite connue : si un distributeur ne reçoit aucun nouveau lead lors d'un import, son fichier
  n'est pas touché, donc ses vues de statut ne se remettent à jour qu'au prochain import qui le
  concerne (pas de rafraîchissement à la demande pour l'instant).

## Détection des modifications

Pour chaque fichier distributeur (`infra/excel/distributorWorkbook.ts § readDistributorLeadsSheet`),
uniquement la feuille "Leads" est lue (en-têtes propres au fichier + valeurs actuelles de chaque
ligne). Pour chaque lead :

1. **Lead ID inconnu** de `leads.json` → anomalie ("Unknown Lead ID"), ignoré.
2. **Hash recalculé sur les colonnes lecture seule** (même fonction `hashLeadValues` que
   l'import, cf. `core/domain/lead/lead.hash.ts`) comparé au hash stocké dans `leads.json` — s'il
   diffère, un champ verrouillé a été modifié malgré la protection Excel (contournée) → anomalie,
   **le lead est exclu du fichier de sortie** (on ne pousse jamais une valeur qu'on ne maîtrise
   pas).
3. Sinon, comparaison des **colonnes éditables** (Email, Phone, Description, Lead Status, etc. —
   même règle que l'import, `core/domain/lead/columnRules.ts`, partagée entre les deux usecases)
   entre la valeur actuelle dans l'Excel et celle enregistrée dans `leads.json` → si au moins une
   diffère, le lead est inclus dans le fichier de sortie avec ses valeurs éditables **actuelles**.

Upscan lui-même est **read-only vis-à-vis de `leads.json`** : il ne met rien à jour, il ne fait que
produire le CSV. La boucle se referme au moment du push (§ Push ci-dessous) : dès que le job Bulk
API est intégralement terminé, les valeurs éditables confirmées par Salesforce sont appliquées à
`leads.json` — pas besoin d'attendre le prochain cycle Export → Import complet pour voir l'état
local à jour.

## Fichier de sortie

CSV `Lead ID,<colonnes éditables du report courant...>`, une ligne par lead modifié — colonne
"Lead ID" comme clé de correspondance pour la mise à jour dans le Wizard Salesforce ("Update
Existing Records").

## Résumé du run

```json
{
  "nbFichiersLus": 26,
  "nbLeadModifies": 1,
  "anomalies": [
    { "leadId": "00Qfj...", "distributeur": "France", "raison": "..." }
  ]
}
```

Les anomalies sont affichées en détail sur le dashboard (pas juste un compteur) pour que le
directeur puisse aller vérifier manuellement le fichier concerné.

## Fichiers

```
back/src/
  core/
    domain/lead/columnRules.ts        ← déplacé depuis importFromSalesforce.uc.ts (partagé
                                          import + upscan) : buildColumnRules, editableHeadersFrom,
                                          requiredApiNamesFrom
    usecases/
      upscanFromDistributors.uc.ts     ← orchestre : describe report → columnRules → parcourt
                                          tous les distributeurs → diff → CSV
  infra/
    excel/distributorWorkbook.ts        ← + listDistributorNames, readDistributorLeadsSheet,
                                            rebuildStatusSheets (vues verrouillées)
    store/runs.store.ts                  ← + writeRunOutputFile
    http/controllers/upscan.controller.ts ← POST /api/upscan
  wiring.ts                              ← câblage

shared/
  formatting/csv.ts                     ← buildCsv déplacé depuis infra/salesforce/csv.ts (pur,
                                            réutilisé par export ET upscan)
  types/run.ts                          ← UpscanRun, UpscanRunResume, UpscanAnomalie

front/src/
  api/upscan.ts                          ← useUpscanRuns, useStartUpscan
  pages/dashboard/DashboardPage.tsx       ← section "Upscan" (bouton, liste runs, anomalies,
                                             téléchargement, suppression)
```

## Testé en conditions réelles

Simulation d'une modification distributeur (email changé sur un lead, "Lead Owner" trafiqué sur un
autre, directement dans le fichier Excel) → upscan sur 26 fichiers : 1 lead modifié correctement
détecté et inclus dans le CSV avec sa nouvelle valeur, 1 anomalie détectée et exclue du fichier de
sortie, comme attendu.

## Push vers Salesforce (Bulk API 2.0)

Section "Upload" séparée (même pattern qu'Export → Import), sur `back/src/core/usecases/pushToSalesforce.uc.ts`.
Prend le CSV lisible produit par un run upscan et le pousse via Bulk API 2.0 (`back/src/infra/salesforce/bulkApi.ts`),
même mécanisme sid-comme-bearer-token que le reste du projet.

### Deux bugs trouvés en test réel (avant que le job n'atteigne enfin `JobComplete`)

1. **`lineEnding` du job ne correspondait pas au CSV réel.** `shared/formatting/csv.ts` (`buildCsv`) sépare
   toujours les lignes par `\r\n` (CRLF), mais le job Bulk était créé avec `lineEnding: 'LF'` → Salesforce
   échouait à parser le CSV et le job tombait en `Failed` immédiatement (0 enregistrement traité). Fixé en
   déclarant `lineEnding: 'CRLF'` à la création du job.

2. **Champs composés Salesforce (`Name`, `Address`) génèrent des en-têtes CSV en double.** Le describe du
   report expose `entityColumnName` = `"Lead.Name"` pour *chacun* des sous-champs "First Name", "Last Name",
   "Salutation" (idem `"Lead.Address"` pour Street/City/State/Zip/Country) — pas le nom réel du sous-champ
   API. `editableApiNamesByHeader()` (`back/src/core/domain/lead/columnRules.ts`) détecte maintenant les
   `apiName` qui apparaissent plus d'une fois parmi les colonnes éditables et les exclut du mapping : ces
   champs restent éditables dans l'Excel et visibles dans le CSV upscan téléchargeable, mais **ne sont pas
   poussés automatiquement** vers Salesforce pour l'instant (pas de solution simple pour reconstruire les
   vrais noms de sous-champs à partir du describe du report).

3. **Cellules vides affichées `"-"` par le report Salesforce, reprises telles quelles.** Un report Salesforce
   affiche une cellule vide comme le texte `"-"`, qui se retrouve donc littéralement dans le CSV d'export,
   puis dans l'Excel distributeur. En repoussant une ligne modifiée vers Salesforce, ce `"-"` était renvoyé
   tel quel pour *tous* les champs éditables de la ligne (pas seulement le champ réellement modifié) :
   corruption silencieuse sur les champs texte (écrase la vraie valeur vide par le texte `"-"`), et échec de
   **tout le job** sur les champs numériques (`AnnualRevenue` → `INVALID_FIELD: '-' is not valid for the type
   xsd:double`). Fixé dans `buildBulkCsv()` (`pushToSalesforce.uc.ts`) : toute valeur strictement égale à
   `"-"` est convertie en chaîne vide avant l'envoi.

Test réel final (2 leads modifiés sur 2 distributeurs différents, avec des champs `"-"` non touchés dans la
même ligne) → job `JobComplete`, 2 traités, 0 échec.

## Application du diff dans `leads.json` (fermeture de la boucle)

Dès qu'un job Bulk API est **intégralement traité** (`etatSalesforce === 'JobComplete'` et
`nbEnregistresEnEchec === 0`), les valeurs éditables du CSV upscan poussé sont appliquées à
`leads.json` (`applyUpscanDiffToLeads.uc.ts`) : même mécanisme que l'import (hash recalculé,
`dateDerniereModification` mise à jour, une ligne par champ changé dans `leads_historique.jsonl`
via `upsertLead`). Seules les colonnes éditables du describe de report courant sont écrites — jamais
les colonnes en lecture seule.

**Ce point est délibérément ignoré si le job a des enregistrements en échec** : `JobComplete` avec
`nbEnregistresEnEchec > 0` mélange des lignes acceptées et refusées par Salesforce, qu'on ne sait
pas distinguer sans un appel Bulk API supplémentaire (`failedResults`, pas implémenté) — dans ce
cas rien n'est appliqué à `leads.json`, plutôt que de risquer d'y écrire une valeur que Salesforce a
en fait refusée. Le directeur garde alors le cycle Export → Import habituel comme filet de sécurité.

Deux points d'entrée selon la vitesse du job, tous deux protégés par le flag `leadsAppliques` du
run push pour ne jamais appliquer le même diff deux fois :
- `pushToSalesforce.uc.ts` — si le job est déjà `JobComplete` dès le premier `getJobStatus` (job
  rapide, peu de lignes).
- `refreshPushStatus.uc.ts` — sinon, à la première réponse `JobComplete` obtenue via le bouton
  "Refresh status" (le job Bulk API continue de traiter les enregistrements de façon asynchrone
  après la soumission, cf. § Push).
