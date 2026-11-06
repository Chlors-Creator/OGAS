import { solveLP, type LPConstraint } from '../../solvers/simplex';
import { SECTOR_IDS, SECTOR_MAP, demandAt, type PlanReport, type SectorId } from './model';

export interface PlanAdvice {
  status: 'optimal' | 'infeasible' | 'unbounded';
  targets: Record<SectorId, number>;
  shadow: { power: number; steel: number; chem: number; labor: number };
  capacityShadow: Record<SectorId, number>;
  objective: number;
  binding: string[];
}

const RES = ['power', 'steel', 'chem', 'labor'] as const;

export function advisePlan(report: PlanReport): PlanAdvice {
  const n = SECTOR_IDS.length;
  const c = SECTOR_IDS.map((id) => {
    const s = SECTOR_MAP[id];
    return s.political * 10 + (demandAt(id, report.year) > 0 ? 3 : 0);
  });

  const constraints: LPConstraint[] = [];

  for (const key of RES) {
    constraints.push({
      id: `res_${key}`,
      coeffs: SECTOR_IDS.map((id) => SECTOR_MAP[id].input[key]),
      op: '<=',
      rhs: report.resources[key],
    });
  }

  for (const id of SECTOR_IDS) {
    constraints.push({
      id: `cap_${id}`,
      coeffs: SECTOR_IDS.map((sid) => (sid === id ? 1 : 0)),
      op: '<=',
      rhs: report.sectors[id].capacity,
    });
  }

  const sol = solveLP({ n, c, sense: 'max', constraints });

  const targets = {} as Record<SectorId, number>;
  SECTOR_IDS.forEach((id, i) => {
    targets[id] = sol.status === 'optimal' ? Math.max(0, sol.x[i]) : 0;
  });

  const shadow = { power: 0, steel: 0, chem: 0, labor: 0 };
  RES.forEach((key, i) => {
    shadow[key] = sol.duals[i] ?? 0;
  });

  const capacityShadow = {} as Record<SectorId, number>;
  SECTOR_IDS.forEach((id, i) => {
    capacityShadow[id] = sol.duals[RES.length + i] ?? 0;
  });

  const binding: string[] = [];
  constraints.forEach((con) => {
    const lhs = con.coeffs.reduce((acc, a, j) => acc + a * (sol.x[j] ?? 0), 0);
    if (con.rhs - lhs < 0.01 && con.rhs > 0) binding.push(con.id);
  });

  return { status: sol.status, targets, shadow, capacityShadow, objective: sol.objective, binding };
}
