import type { Rng } from '../../core/rng';
import { nextRange } from '../../core/rng';

export type SectorId = 'cars' | 'machines' | 'butter' | 'clothing';

export interface ResourceSet {
  power: number;
  steel: number;
  chem: number;
  labor: number;
}

export interface SectorSpec {
  id: SectorId;
  name: string;
  unit: string;
  group: 'heavy' | 'consumer';
  input: ResourceSet;
  capacity: number;
  demand: number;
  political: number;
  fxExport: number;
}

export interface Resources extends ResourceSet {
  fx: number;
}

export interface SectorReport {
  capacity: number;
  bias: number;
}

export interface PlanReport {
  resources: Resources;
  sectors: Record<SectorId, SectorReport>;
  year: number;
}

export interface YearResult {
  year: number;
  targets: Record<SectorId, number>;
  produced: Record<SectorId, number>;
  trueCapacity: Record<SectorId, number>;
  trueResources: Resources;
  reportedResources: Resources;
  reportedCapacity: Record<SectorId, number>;
  cut: Record<SectorId, number>;
  shortage: Record<SectorId, number>;
  exports: number;
  imports: number;
  interest: number;
  fxDelta: number;
  discontentDelta: number;
  politicalDelta: number;
  laborDelta: number;
  notes: string[];
}

export interface HistoryPoint {
  year: number;
  discontent: number;
  fx: number;
  political: number;
  output: number;
  cars: number;
  butter: number;
}

export interface PlanState {
  year: number;
  seed: number;
  rng: number;
  trueResources: Resources;
  capacity: Record<SectorId, number>;
  report: PlanReport;
  political: number;
  discontent: number;
  history: HistoryPoint[];
  lastResult: YearResult | null;
  status: 'playing' | 'ended';
  ending: Ending | null;
  log: string[];
}

export interface Ending {
  id: string;
  title: string;
  body: string;
  tone: 'collapse' | 'survive' | 'ambiguous';
}

export const START_YEAR = 1971;
export const END_YEAR = 1989;

export const SECTORS: SectorSpec[] = [
  {
    id: 'cars',
    name: '汽车',
    unit: '千辆',
    group: 'heavy',
    input: { power: 1.2, steel: 2.4, chem: 0.3, labor: 3.5 },
    capacity: 10,
    demand: 8,
    political: 0.9,
    fxExport: 8.5,
  },
  {
    id: 'machines',
    name: '机床',
    unit: '千台',
    group: 'heavy',
    input: { power: 1.8, steel: 1.8, chem: 0.4, labor: 4.0 },
    capacity: 8,
    demand: 0,
    political: 0.8,
    fxExport: 10,
  },
  {
    id: 'butter',
    name: '黄油',
    unit: '千吨',
    group: 'consumer',
    input: { power: 0.8, steel: 0.1, chem: 0.2, labor: 2.2 },
    capacity: 30,
    demand: 26,
    political: 0.2,
    fxExport: 0,
  },
  {
    id: 'clothing',
    name: '服装',
    unit: '百万件',
    group: 'consumer',
    input: { power: 0.4, steel: 0.03, chem: 0.15, labor: 2.4 },
    capacity: 85,
    demand: 70,
    political: 0.1,
    fxExport: 1.3,
  },
];

export const SECTOR_IDS: SectorId[] = ['cars', 'machines', 'butter', 'clothing'];
export const SECTOR_MAP: Record<SectorId, SectorSpec> = Object.fromEntries(
  SECTORS.map((s) => [s.id, s]),
) as Record<SectorId, SectorSpec>;

export const STEEL_IMPORT_PRICE = 6;
export const CHEM_IMPORT_PRICE = 9;

export const DEMAND_GROWTH: Record<SectorId, number> = {
  cars: 1.0,
  machines: 1.0,
  butter: 1.011,
  clothing: 1.01,
};

export function demandAt(id: SectorId, year: number): number {
  const s = SECTOR_MAP[id];
  if (s.demand <= 0) return 0;
  return s.demand * Math.pow(DEMAND_GROWTH[id], year - START_YEAR);
}

export function interestDue(year: number): number {
  return 85 + (year - START_YEAR) * 20;
}

export function politicalTargets(year: number): { cars: number; machines: number } {
  const k = year - START_YEAR;
  return { cars: 8 * Math.pow(1.03, k), machines: 6 * Math.pow(1.04, k) };
}

export function emptyRecord(): Record<SectorId, number> {
  return { cars: 0, machines: 0, butter: 0, clothing: 0 };
}

export function buildReport(state: PlanState, rng: Rng): PlanReport {
  const inflate = nextRange(rng, 0.02, 0.055);
  const resources: Resources = {
    power: state.trueResources.power * (1 + inflate * nextRange(rng, 0.6, 1.4)),
    steel: state.trueResources.steel * (1 + inflate * nextRange(rng, 0.6, 1.4)),
    chem: state.trueResources.chem * (1 + inflate * nextRange(rng, 0.5, 1.2)),
    labor: state.trueResources.labor * (1 + inflate * nextRange(rng, 0.2, 0.9)),
    fx: state.trueResources.fx,
  };
  const sectors = {} as Record<SectorId, SectorReport>;
  for (const id of SECTOR_IDS) {
    const bias = nextRange(rng, 1.0, 1.06);
    sectors[id] = { capacity: state.capacity[id] * bias, bias };
  }
  return { resources, sectors, year: state.year };
}

export function createInitialState(seed: number): PlanState {
  const rng: Rng = { state: (seed >>> 0) || 7 };
  const base: PlanState = {
    year: START_YEAR,
    seed,
    rng: rng.state,
    trueResources: { power: 85, steel: 45, chem: 26, labor: 340, fx: 800 },
    capacity: { cars: 10, machines: 8, butter: 30, clothing: 85 },
    report: {
      resources: { power: 85, steel: 45, chem: 26, labor: 340, fx: 800 },
      sectors: {
        cars: { capacity: 10, bias: 1 },
        machines: { capacity: 8, bias: 1 },
        butter: { capacity: 30, bias: 1 },
        clothing: { capacity: 85, bias: 1 },
      },
      year: START_YEAR,
    },
    political: 50,
    discontent: 12,
    history: [],
    lastResult: null,
    status: 'playing',
    ending: null,
    log: [],
  };
  base.rng = rng.state;
  base.report = buildReport(base, rng);
  base.rng = rng.state;
  return base;
}

export function footprint(targets: Record<SectorId, number>): ResourceSet {
  const total: ResourceSet = { power: 0, steel: 0, chem: 0, labor: 0 };
  for (const id of SECTOR_IDS) {
    const s = SECTOR_MAP[id];
    const q = targets[id] || 0;
    total.power += s.input.power * q;
    total.steel += s.input.steel * q;
    total.chem += s.input.chem * q;
    total.labor += s.input.labor * q;
  }
  return total;
}
