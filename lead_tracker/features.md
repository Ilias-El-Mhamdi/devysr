
### Hash d'un lead

Le hash sert à détecter si un distributeur a modifié une ligne dans son Excel.
Il doit être calculé sur une **liste figée et documentée** de champs (pas tout l'objet — sinon un simple recalcul de vue casse le diff).
Définir cette liste comme une constante exportée dans `core/domain/lead/lead.hash.ts`,
commentée avec la raison de chaque inclusion/exclusion.
Ajouter un champ à `Lead`
sans se poser la question de son inclusion dans le hash est le bug le plus probable de ce projet.

# Front
Les boutons Rafraîchir/Export/Relance/Vérif déclenchent une action **longue** (Puppeteer, lecture de 50 fichiers Excel) :
les modéliser comme des mutations qui retournent un `runId`,
avec un polling léger sur le statut du run (`GET /runs/:id`) plutôt qu'une requête bloquante —
sinon le front freeze pendant l'automatisation Salesforce.

## Rapport d'écarts (§ Vérification)

Format minimal demandé par le besoin : `{ leadId, distributeur, date }`. Étendre dès l'implémentation avec le détail du champ en désaccord (`champ`, `valeurJson`, `valeurExcel`, `valeurSalesforce`) — sans ça le rapport dit *qu'il y a* un écart mais pas *lequel*, ce qui le rend inexploitable pour le directeur. Écrit dans `runs/<runId>/output/ecarts.json` par `verify.uc.ts`.

`data/` (JSON + Excel générés, données clients réelles) doit être dans `.gitignore` dès le premier commit — ne jamais versionner de leads réels.