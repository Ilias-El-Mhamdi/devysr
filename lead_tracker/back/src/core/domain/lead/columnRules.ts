const LEAD_ENTITY_PREFIX = 'Lead.';

// Champs Lead "système" (audit, intégration, drapeaux gérés par Salesforce) : jamais éditables
// même s'ils sont directement sur Lead, contrairement aux champs "métier" (Status, Description,
// Email, Phone, Rating...) — cf. features/importDistributeurs.md § Lecture seule vs éditable.
const READ_ONLY_LEAD_API_NAMES = new Set([
  'Id',
  'CreatedDate',
  'LastModifiedDate',
  'LastActivityDate',
  'IsConverted',
  'IsUnreadByOwner',
  'Jigsaw',
  'CleanStatus',
  'EmailBouncedReason',
  'EmailBouncedDate',
]);

// Sous-ensemble de READ_ONLY_LEAD_API_NAMES qui change tout seul côté Salesforce entre deux
// imports (visite du lead, bounce d'un email...), sans aucune action du distributeur — contrairement
// à Id/CreatedDate qui sont figés à la création. Les garder dans le hash produirait un faux positif
// d'anomalie UpScan ("champ verrouillé modifié dans Excel") à chaque fois que Salesforce fait
// évoluer un de ces champs tout seul : l'Excel n'a pas bougé, c'est le hash de référence qui est
// devenu obsolète. Cf. § Hash d'un lead (features.md) — cette liste doit rester documentée à la
// main, ce n'est pas déductible de READ_ONLY_LEAD_API_NAMES.
const VOLATILE_LEAD_API_NAMES = new Set(['LastModifiedDate', 'LastActivityDate', 'IsUnreadByOwner', 'EmailBouncedReason', 'EmailBouncedDate']);

export interface ReportDescribeLike {
  reportMetadata: { detailColumns: string[] };
  reportExtendedMetadata: {
    detailColumnInfo: Record<
      string,
      {
        label: string;
        dataType?: string;
        entityColumnName?: string;
        filterValues?: { apiName: string; label: string }[];
      }
    >;
  };
}

export interface LeadFieldMetaLike {
  name: string;
  nillable: boolean;
}

export interface ColumnRuleLike {
  picklistValues: string[];
  required: boolean;
  editable: boolean;
  // Nom API du champ Lead (ex. "Status" pour la colonne affichée "Lead Status"), quand la colonne
  // pointe directement sur Lead — null pour les colonnes cross-objet (Owner.Name, User.Alias...).
  // Sert à reconstruire un CSV compatible Bulk API (qui attend des noms de champs, pas des labels).
  apiName: string | null;
}

// Une colonne est éditable par le distributeur si elle correspond à un champ "métier" directement
// sur Lead (pas un champ système comme CreatedDate/Id/CleanStatus, cf. READ_ONLY_LEAD_API_NAMES) —
// les colonnes "propriétaire" (Lead Owner, Created By, Owner Role...) pointent vers un autre objet
// (`entityColumnName` du style "Owner.Name", "User.Alias", "UserRole.Name" — pas "Lead.xxx") et
// restent donc automatiquement en lecture seule, sans liste à maintenir à la main.
function isEditableColumn(entityColumnName: string | undefined): boolean {
  if (!entityColumnName || !entityColumnName.startsWith(LEAD_ENTITY_PREFIX)) {
    return false;
  }
  const apiName = entityColumnName.slice(LEAD_ENTITY_PREFIX.length);
  return !READ_ONLY_LEAD_API_NAMES.has(apiName);
}

// Construit, pour chaque en-tête du report, les règles Excel (dropdown, obligatoire, éditable) à
// partir du describe du report lui-même (`entityColumnName`, ex. "Lead.Status" → champ réel
// "Status", et `filterValues` → valeurs du picklist) plutôt que de matcher par label sur le
// describe de Lead — les en-têtes du report peuvent être renommés par son auteur (ex. "Company /
// Account" pour le champ "Company") et un matching par label peut rater silencieusement une
// colonne. `entityColumnName` donne le champ réel, fiable, indépendamment du renommage.
// Calcul pur (aucune I/O) : partagé entre l'import (construction de l'Excel) et l'upscan
// (détection des modifications) — cf. features/upscan.md.
//
// Piège découvert en test réel : pour les sous-champs d'un champ composé (ex. "First Name",
// "Last Name", "Salutation" sur Lead), `entityColumnName` pointe vers le champ composé parent
// ("Lead.Name"), pas vers le sous-champ réel — donc plusieurs colonnes du report se retrouvent
// mappées vers le même `apiName` réel ("Name"), idem pour "Street"/"City"/"State"/... → "Address".
// Un CSV avec des en-têtes en double n'est pas fiable pour l'API Bulk (Salesforce ne peut pas
// savoir laquelle des colonnes en double fait foi), donc ces colonnes ne sont **pas éditables** :
// les laisser éditables sans jamais pouvoir les synchroniser a provoqué une boucle infinie
// UpScan → Push → DownSync → UpScan (le distributeur modifie une colonne composée dans Excel,
// jamais poussée à Salesforce, donc jamais réellement à jour — cf. § Hash d'un lead, features.md).
// Verrouillées ici, dès la génération de l'Excel (`distributorWorkbook.ts` s'appuie sur `editable`
// pour la protection de cellule) et dans le hash (`hashExcludedHeadersFrom` ne les exclut plus).
export function buildColumnRules(describe: ReportDescribeLike, requiredApiNames: Set<string>): Record<string, ColumnRuleLike> {
  const apiNameOccurrences = new Map<string, number>();
  for (const key of describe.reportMetadata.detailColumns) {
    const info = describe.reportExtendedMetadata.detailColumnInfo[key];
    if (!info || !isEditableColumn(info.entityColumnName)) continue;
    const apiName = info.entityColumnName!.slice(LEAD_ENTITY_PREFIX.length);
    apiNameOccurrences.set(apiName, (apiNameOccurrences.get(apiName) ?? 0) + 1);
  }

  const result: Record<string, ColumnRuleLike> = {};
  for (const key of describe.reportMetadata.detailColumns) {
    const info = describe.reportExtendedMetadata.detailColumnInfo[key];
    if (!info) continue;

    const apiName = info.entityColumnName?.startsWith(LEAD_ENTITY_PREFIX) ? info.entityColumnName.slice(LEAD_ENTITY_PREFIX.length) : null;
    const picklistValues = info.dataType === 'picklist' ? (info.filterValues ?? []).map((value) => value.apiName) : [];
    const required = apiName ? requiredApiNames.has(apiName) : false;
    const editable = isEditableColumn(info.entityColumnName) && apiNameOccurrences.get(apiName!) === 1;

    result[info.label] = { picklistValues, required, editable, apiName };
  }
  return result;
}

// Ex. { "Lead Status": "Status", "Email": "Email" } — uniquement les colonnes éditables, donc déjà
// synchronisables 1:1 (cf. le dédoublonnage par apiName fait en amont dans buildColumnRules).
export function editableApiNamesByHeader(columnRules: Record<string, ColumnRuleLike>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [header, rule] of Object.entries(columnRules)) {
    if (rule.editable && rule.apiName) {
      result[header] = rule.apiName;
    }
  }
  return result;
}

export function editableHeadersFrom(columnRules: Record<string, ColumnRuleLike>): Set<string> {
  return new Set(
    Object.entries(columnRules)
      .filter(([, rule]) => rule.editable)
      .map(([header]) => header),
  );
}

// Champs à exclure du hash (cf. lead.hash.ts) : les colonnes éditables par le distributeur (leur
// modification est attendue, jamais une anomalie) + les colonnes verrouillées mais volatiles côté
// Salesforce (VOLATILE_LEAD_API_NAMES) — distinct de editableHeadersFrom, qui ne sert lui qu'à
// déterminer ce qui est effectivement écrit dans l'Excel/poussé vers Salesforce. Toujours calculé
// au moment de l'import ET de la vérification à partir du même describe, pour rester cohérent avec
// le hash de référence stocké dans leads.json.
export function hashExcludedHeadersFrom(columnRules: Record<string, ColumnRuleLike>): Set<string> {
  return new Set(
    Object.entries(columnRules)
      .filter(([, rule]) => rule.editable || (rule.apiName !== null && VOLATILE_LEAD_API_NAMES.has(rule.apiName)))
      .map(([header]) => header),
  );
}

export function requiredApiNamesFrom(leadFields: LeadFieldMetaLike[]): Set<string> {
  return new Set(leadFields.filter((field) => !field.nillable).map((field) => field.name));
}
