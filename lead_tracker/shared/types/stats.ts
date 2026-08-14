export interface StatsKpis {
  totalLeads: number;
  totalDistributeurs: number;
  open: number;
  working: number;
  won: number;
  lost: number;
  winRate: number | null;
  createdLast7Days: number;
  createdLast30Days: number;
  staleLeads: number;
  avgDaysToClose: number | null;
}

export interface StatsCount {
  label: string;
  count: number;
}

export interface DistributeurStat {
  distributeur: string;
  total: number;
  active: number;
  open: number;
  working: number;
  won: number;
  lost: number;
  winRate: number | null;
  conversionRate: number | null;
  avgDaysToClose: number | null;
  daysToCloseCount: number;
  createdLast7Days: number;
  createdLast30Days: number;
  staleLeads: number;
  lastUpdateDaysAgo: number | null;
  avgDaysToFirstUpdate: number | null;
  daysToFirstUpdateCount: number;
}

export interface StatsTrend {
  weeks: string[];
  total: number[];
  byDistributeur: Array<{ distributeur: string; counts: number[] }>;
}

export interface ProductsByDistributeur {
  products: string[];
  distributeurs: string[];
  counts: Record<string, number[]>;
}


export interface StatusByDistributeur {
  statuses: string[];
  distributeurs: string[];
  counts: Record<string, number[]>;
}

export interface SourceByDistributeur {
  sources: string[];
  distributeurs: string[];
  counts: Record<string, number[]>;
}

export interface StageTransition {
  from: string;
  to: string;
}

export interface StageVelocityEntry extends StageTransition {
  count: number;
  medianDays: number | null;
  avgDays: number | null;
}

export interface DistributeurStageVelocity {
  distributeur: string;
  transitions: StageVelocityEntry[];
}

export interface StageVelocity {
  statuses: string[];
  transitions: StageTransition[];
  byDistributeur: DistributeurStageVelocity[];
}

export interface StatsResponse {
  kpis: StatsKpis;
  statusBreakdown: StatsCount[];
  sourceBreakdown: StatsCount[];
  productBreakdown: StatsCount[];
  distributeurs: DistributeurStat[];
  trend: StatsTrend;
  productsByDistributeur: ProductsByDistributeur;
  productConversionByDistributeur: ProductsByDistributeur;
  statusByDistributeur: StatusByDistributeur;
  sourceByDistributeur: SourceByDistributeur;
  stageVelocity: StageVelocity;
  // Regroupement par zone continentale (cf. back/src/core/domain/stats/region.ts) — mêmes formes que
  // les champs "ByDistributeur" ci-dessus, mais la clé de groupe est un nom de zone plutôt qu'un nom
  // de distributeur. `regionByDistributeur` permet au front de traduire une sélection de zones en
  // ensemble de distributeurs pour le filtre (qui reste toujours exprimé en noms de distributeurs).
  regionByDistributeur: Record<string, string>;
  regions: DistributeurStat[];
  productsByRegion: ProductsByDistributeur;
  productConversionByRegion: ProductsByDistributeur;
  statusByRegion: StatusByDistributeur;
  sourceByRegion: SourceByDistributeur;
  stageVelocityByRegion: StageVelocity;
}
