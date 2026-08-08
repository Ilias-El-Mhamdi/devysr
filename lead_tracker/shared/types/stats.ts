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

export interface StatsResponse {
  kpis: StatsKpis;
  statusBreakdown: StatsCount[];
  sourceBreakdown: StatsCount[];
  productBreakdown: StatsCount[];
  distributeurs: DistributeurStat[];
  trend: StatsTrend;
  productsByDistributeur: ProductsByDistributeur;
  statusByDistributeur: StatusByDistributeur;
  sourceByDistributeur: SourceByDistributeur;
}
