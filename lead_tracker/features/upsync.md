# Upsync — remonter les modifications des distributeurs vers Salesforce

Nouvelle section "Upsync" sur le dashboard : lit tous les fichiers Excel distributeurs, détecte
les leads dont un champ éditable a changé depuis le dernier import, et produit un CSV prêt à être
déposé dans le **Data Import Wizard** de Salesforce (mise à jour par "Lead ID"). Bouton
"Run upsync", téléchargeable comme un export.

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

Upsync est **read-only vis-à-vis de `leads.json`** : il ne met rien à jour lui-même. La boucle se
referme naturellement via le cycle Export → Import habituel, une fois que le directeur a
effectivement déposé le CSV dans le Import Wizard Salesforce.

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
                                          import + upsync) : buildColumnRules, editableHeadersFrom,
                                          requiredApiNamesFrom
    usecases/
      upsyncFromDistributors.uc.ts     ← orchestre : describe report → columnRules → parcourt
                                          tous les distributeurs → diff → CSV
  infra/
    excel/distributorWorkbook.ts        ← + listDistributorNames, readDistributorLeadsSheet,
                                            rebuildStatusSheets (vues verrouillées)
    store/runs.store.ts                  ← + writeRunOutputFile
    http/controllers/upsync.controller.ts ← POST /api/upsync
  wiring.ts                              ← câblage

shared/
  formatting/csv.ts                     ← buildCsv déplacé depuis infra/salesforce/csv.ts (pur,
                                            réutilisé par export ET upsync)
  types/run.ts                          ← UpsyncRun, UpsyncRunResume, UpsyncAnomalie

front/src/
  api/upsync.ts                          ← useUpsyncRuns, useStartUpsync
  pages/dashboard/DashboardPage.tsx       ← section "Upsync" (bouton, liste runs, anomalies,
                                             téléchargement, suppression)
```

## Testé en conditions réelles

Simulation d'une modification distributeur (email changé sur un lead, "Lead Owner" trafiqué sur un
autre, directement dans le fichier Excel) → upsync sur 26 fichiers : 1 lead modifié correctement
détecté et inclus dans le CSV avec sa nouvelle valeur, 1 anomalie détectée et exclue du fichier de
sortie, comme attendu.
