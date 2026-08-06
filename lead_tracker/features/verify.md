# Verify — vérifier que leads.json est à jour avec un export Salesforce

Bouton "Verify" sur le dashboard, à côté de "Import" sur chaque run d'export réussi. Lance un
nouveau run (type `verify`) qui compare `leads.json` à l'export choisi, uniquement sur les colonnes
**éditables par le distributeur** (mêmes règles que l'upscan et l'import,
`core/domain/lead/columnRules.ts`) — pas les colonnes en lecture seule, dont la fraîcheur est déjà
garantie par le prochain import complet.

## Pourquoi

Un écart détecté ici signale soit :
- un push (§ Upload, cf. `features/upscan.md`) qui n'a pas (encore) été appliqué à `leads.json`
  (job pas encore `JobComplete`, ou terminé avec des échecs — cf. § Application du diff dans
  `leads.json` de `features/upscan.md`) ;
- une modification faite directement dans Salesforce en dehors du cycle upscan → push.

## Détection

`back/src/core/usecases/verify.uc.ts` — pour chaque ligne de l'export référencé (`exportRunId`,
même fichier CSV que celui produit par un run d'export) dont le Lead ID est connu de `leads.json` :
comparaison des valeurs actuelles de l'export avec `leads.json` sur les colonnes éditables (mêmes
noms de colonnes, report label). Au moins une différence → le lead est inclus dans le rapport et
dans le fichier de sortie.

Verify est **read-only vis-à-vis de `leads.json`** (comme l'upscan) : il ne corrige rien lui-même,
il ne fait que rapporter les écarts.

## Rapport du run

```json
{
  "exportRunId": "<id du run d'export utilisé comme référence>",
  "nbLeadEcart": 2,
  "nbDistributeursImpactes": 2
}
```

Le fichier de sortie téléchargeable (`verify.csv`) contient `Lead ID,<colonnes éditables du report
courant...>` — une ligne par lead en écart, avec les valeurs actuelles de l'export (celles que
`leads.json` devrait avoir).

## Fichiers

```
back/src/
  core/
    usecases/
      verify.uc.ts                      ← orchestre : lit l'export référencé → columnRules → diff → CSV
  infra/
    http/controllers/verify.controller.ts ← POST /api/verify
  wiring.ts                                ← câblage

shared/
  types/run.ts                            ← VerifyRun, VerifyRunInput, VerifyRunOutput, VerifyRunResume

front/src/
  api/verify.ts                            ← useVerifyRuns, useStartVerify
  pages/dashboard/DashboardPage.tsx         ← bouton "Verify" (à côté d'Import) + section "Verifications"
```
