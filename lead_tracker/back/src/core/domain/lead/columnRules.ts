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
// Calcul pur (aucune I/O) : partagé entre l'import (construction de l'Excel) et l'upsync
// (détection des modifications) — cf. features/upsync.md.
export function buildColumnRules(describe: ReportDescribeLike, requiredApiNames: Set<string>): Record<string, ColumnRuleLike> {
  const result: Record<string, ColumnRuleLike> = {};
  for (const key of describe.reportMetadata.detailColumns) {
    const info = describe.reportExtendedMetadata.detailColumnInfo[key];
    if (!info) continue;

    const apiName = info.entityColumnName?.startsWith(LEAD_ENTITY_PREFIX) ? info.entityColumnName.slice(LEAD_ENTITY_PREFIX.length) : null;
    const picklistValues = info.dataType === 'picklist' ? (info.filterValues ?? []).map((value) => value.apiName) : [];
    const required = apiName ? requiredApiNames.has(apiName) : false;
    const editable = isEditableColumn(info.entityColumnName);

    result[info.label] = { picklistValues, required, editable, apiName };
  }
  return result;
}

// Ex. { "Lead Status": "Status", "Email": "Email" } — uniquement les colonnes éditables (les
// seules qu'on pousse jamais vers Salesforce, cf. features/upsync.md).
//
// Piège découvert en test réel : pour les sous-champs d'un champ composé (ex. "First Name",
// "Last Name", "Salutation" sur Lead), `entityColumnName` pointe vers le champ composé parent
// ("Lead.Name"), pas vers le sous-champ réel — donc plusieurs colonnes du report se retrouvent
// mappées vers le même `apiName` ("Name"), idem pour "Street"/"City"/"State"/... → "Address". Un
// CSV avec des en-têtes en double n'est pas fiable pour l'API Bulk (Salesforce ne peut pas savoir
// laquelle des colonnes en double fait foi). On exclut donc tout `apiName` qui apparaît plus d'une
// fois : ces champs restent éditables dans l'Excel, juste pas poussés automatiquement pour
// l'instant — cf. features/upsync.md.
export function editableApiNamesByHeader(columnRules: Record<string, ColumnRuleLike>): Record<string, string> {
  const editableEntries = Object.entries(columnRules).filter(([, rule]) => rule.editable && rule.apiName);

  const occurrences = new Map<string, number>();
  for (const [, rule] of editableEntries) {
    occurrences.set(rule.apiName!, (occurrences.get(rule.apiName!) ?? 0) + 1);
  }

  const result: Record<string, string> = {};
  for (const [header, rule] of editableEntries) {
    if (occurrences.get(rule.apiName!) === 1) {
      result[header] = rule.apiName!;
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

export function requiredApiNamesFrom(leadFields: LeadFieldMetaLike[]): Set<string> {
  return new Set(leadFields.filter((field) => !field.nillable).map((field) => field.name));
}
