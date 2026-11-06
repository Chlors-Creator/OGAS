import type { Rng } from '../../core/rng';
import { nextRange } from '../../core/rng';
import {
  CHEM_IMPORT_PRICE,
  END_YEAR,
  SECTOR_IDS,
  SECTOR_MAP,
  STEEL_IMPORT_PRICE,
  buildReport,
  demandAt,
  emptyRecord,
  interestDue,
  politicalTargets,
  type Ending,
  type HistoryPoint,
  type PlanState,
  type SectorId,
  type YearResult,
} from './model';

export interface PlanDecision {
  targets: Record<SectorId, number>;
  importSteel: number;
  importChem: number;
  invest: 'heavy' | 'light' | 'none';
}

const RES_KEYS = ['power', 'steel', 'chem', 'labor'] as const;

const RESOURCE_LABEL: Record<string, string> = {
  power: '电力',
  steel: '钢材',
  chem: '化工原料',
  labor: '劳动力',
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function evaluateEnding(state: PlanState): Ending | null {
  if (state.political <= 0) {
    return {
      id: 'dismissed',
      title: '解职',
      body: '政治局对你的工作失去了耐心。任命书上写着"因健康原因另有任用"，你的名字从计划委员会的名单上消失了。接任者在三个月内恢复了旧指标——那些你已经证明做不出来的指标。',
      tone: 'collapse',
    };
  }
  if (state.discontent >= 100) {
    return {
      id: 'exodus',
      title: '出走',
      body: '这一年，经匈牙利开放边境离境的人数超过了统计局的记录能力。你提交的最后一期报表上，劳动力一栏是空的。计划仍在继续，只是没有人来执行它。',
      tone: 'collapse',
    };
  }
  if (state.trueResources.fx < -400) {
    return {
      id: 'debt',
      title: '债务',
      body: '西方银行团拒绝了展期请求。外汇账户在一个周二上午被冻结，进口合同全部作废。你曾经用贷款买来的钢材，现在成了账面上无法解释的数字。',
      tone: 'collapse',
    };
  }
  return null;
}

function finalEnding(state: PlanState): Ending {
  const growth = state.history.length > 1
    ? state.history[state.history.length - 1].output / Math.max(1, state.history[0].output) - 1
    : 0;
  if (state.discontent < 35 && state.trueResources.fx > 0) {
    return {
      id: 'long-road',
      title: '长路',
      body: `1989 年 11 月，柏林。你负责的四个品类在这一年全部达标，民怨停留在 ${state.discontent.toFixed(0)}。隔壁办公室的人在讨论一种新的计算方法，说它不需要计划指标，价格自己会说话。你没有参与讨论。你只是把最后一年的报表归档，编号 S-1989-04。走廊尽头的电视机整夜开着。`,
      tone: 'survive',
    };
  }
  if (state.trueResources.fx <= 0) {
    return {
      id: 'fiction',
      title: '账面的国家',
      body: `1989 年，外汇储备实际已经耗尽，但报表上仍然平衡——差额被记在一笔"待核销"里，没有人敢追问。十八年，${growth > 0 ? '产出增长了' : '产出下降了'} ${Math.abs(growth * 100).toFixed(0)}%，民怨 ${state.discontent.toFixed(0)}。你做了所有能做的事，除了一件：让数据说真话。`,
      tone: 'ambiguous',
    };
  }
  return {
    id: 'quiet-collapse',
    title: '安静的崩溃',
    body: `1989 年秋。民怨指数 ${state.discontent.toFixed(0)}，外汇勉强为正，所有政治指标都完成了。没有人庆祝。三十八万人在这一年离开。你的计划在纸面上是成立的——这个国家在纸面上也成立。`,
    tone: 'ambiguous',
  };
}

export function resolveYear(state: PlanState, decision: PlanDecision): PlanState {
  const rng: Rng = { state: state.rng };
  const notes: string[] = [];

  const fxBefore = state.trueResources.fx;
  const importSteel = clamp(Math.floor(decision.importSteel || 0), 0, 999);
  const importChem = clamp(Math.floor(decision.importChem || 0), 0, 999);
  const importCost = importSteel * STEEL_IMPORT_PRICE + importChem * CHEM_IMPORT_PRICE;

  const pool = {
    power: state.trueResources.power,
    steel: state.trueResources.steel + importSteel,
    chem: state.trueResources.chem + importChem,
    labor: state.trueResources.labor,
  };

  const desired = emptyRecord();
  for (const id of SECTOR_IDS) {
    const s = SECTOR_MAP[id];
    const target = Math.max(0, decision.targets[id] || 0);
    const capacity = state.capacity[id];
    desired[id] = Math.min(target, capacity);
    if (target > capacity * 1.001) {
      notes.push(`${s.name}的指标超出实际产能，按产能封顶。`);
    }
  }

  const totals = { power: 0, steel: 0, chem: 0, labor: 0 };
  for (const id of SECTOR_IDS) {
    const s = SECTOR_MAP[id];
    totals.power += s.input.power * desired[id];
    totals.steel += s.input.steel * desired[id];
    totals.chem += s.input.chem * desired[id];
    totals.labor += s.input.labor * desired[id];
  }

  const avail = pool;
  let scale = 1;
  let bindingKey = '';
  for (let k = 0; k < RES_KEYS.length; k++) {
    const key = RES_KEYS[k];
    if (totals[key] > avail[key] + 1e-9 && totals[key] > 0) {
      const ratio = avail[key] / totals[key];
      if (ratio < scale) {
        scale = ratio;
        bindingKey = key;
      }
    }
  }

  const produced = emptyRecord();
  const cut = emptyRecord();
  for (const id of SECTOR_IDS) {
    produced[id] = desired[id] * scale;
    cut[id] = desired[id] - produced[id];
  }

  if (scale < 0.999) {
    notes.push(
      `${RESOURCE_LABEL[bindingKey]}不足，全部指标按 ${(scale * 100).toFixed(0)}% 执行。`,
    );
  }

  let exportRevenue = 0;
  for (const id of SECTOR_IDS) {
    exportRevenue += produced[id] * SECTOR_MAP[id].fxExport;
  }

  const interest = interestDue(state.year);
  let fx = fxBefore - importCost + exportRevenue - interest;

  let machinesLeft = produced.machines;
  const capacity = { ...state.capacity };
  if (decision.invest === 'heavy') {
    if (machinesLeft >= 2 && fx >= 45) {
      machinesLeft -= 2;
      fx -= 45;
      capacity.cars *= 1.06;
      capacity.machines *= 1.06;
      notes.push('重工业扩建完成：汽车与机床产能各提高 6%。');
    } else {
      notes.push('重工业扩建未获批准：机床或外汇不足。');
    }
  } else if (decision.invest === 'light') {
    if (machinesLeft >= 1 && fx >= 18) {
      machinesLeft -= 1;
      fx -= 18;
      capacity.butter *= 1.05;
      capacity.clothing *= 1.05;
      notes.push('轻工业扩建完成：黄油与服装产能各提高 5%。');
    } else {
      notes.push('轻工业扩建未获批准：机床或外汇不足。');
    }
  }

  let totalDemand = 0;
  let totalShort = 0;
  const shortage = emptyRecord();
  for (const id of SECTOR_IDS) {
    const need = demandAt(id, state.year);
    if (need > 0) {
      totalDemand += need;
      const gap = Math.max(0, need - produced[id]);
      shortage[id] = gap;
      totalShort += gap;
    }
  }
  const shortRate = totalDemand > 0 ? totalShort / totalDemand : 0;
  let discontentDelta = shortRate * 120;
  if (shortRate < 0.01) discontentDelta -= 1.5;

  const req = politicalTargets(state.year);
  let politicalDelta = 0;
  const carsOk = produced.cars >= req.cars * 0.98;
  const machinesOk = produced.machines >= req.machines * 0.98;
  if (carsOk) politicalDelta += 6;
  else {
    politicalDelta -= 6;
    notes.push(`汽车未达政治局指标（${req.cars.toFixed(1)}），政治资本 -6。`);
  }
  if (machinesOk) politicalDelta += 5;
  else {
    politicalDelta -= 5;
    notes.push(`机床未达政治局指标（${req.machines.toFixed(1)}），政治资本 -5。`);
  }

  const discontent = clamp(state.discontent + discontentDelta, 0, 100);
  const political = clamp(state.political + politicalDelta - 1, 0, 100);

  let labor = state.trueResources.labor;
  if (discontent > 80) {
    labor *= 0.95;
    notes.push('民怨过高，劳动力流失 5%。');
  } else if (discontent > 55) {
    labor *= 0.98;
    notes.push('民怨上升，劳动力流失 2%。');
  }

  const grown = 1 + nextRange(rng, 0.004, 0.012);
  const trueResources = {
    power: state.trueResources.power * grown,
    steel: state.trueResources.steel * (1 + nextRange(rng, 0.0, 0.008)),
    chem: state.trueResources.chem * (1 + nextRange(rng, 0.0, 0.01)),
    labor: Math.round(labor),
    fx,
  };

  const result: YearResult = {
    year: state.year,
    targets: { ...decision.targets },
    produced,
    trueCapacity: { ...state.capacity },
    trueResources: { ...state.trueResources },
    reportedResources: { ...state.report.resources },
    reportedCapacity: Object.fromEntries(
      SECTOR_IDS.map((id) => [id, state.report.sectors[id].capacity]),
    ) as Record<SectorId, number>,
    cut,
    shortage,
    exports: exportRevenue,
    imports: importCost,
    interest,
    fxDelta: fx - fxBefore,
    discontentDelta,
    politicalDelta,
    laborDelta: labor - state.trueResources.labor,
    notes,
  };

  const output = SECTOR_IDS.reduce((acc, id) => acc + produced[id] * SECTOR_MAP[id].political * 10, 0);
  const point: HistoryPoint = {
    year: state.year,
    discontent,
    fx,
    political,
    output,
    cars: produced.cars,
    butter: produced.butter,
  };

  const next: PlanState = {
    ...state,
    year: state.year + 1,
    rng: rng.state,
    trueResources,
    capacity,
    political,
    discontent,
    history: [...state.history, point],
    lastResult: result,
    log: [...state.log, ...notes].slice(-40),
    status: 'playing',
    ending: null,
    report: state.report,
  };

  const ending = evaluateEnding(next);
  if (ending) {
    next.status = 'ended';
    next.ending = ending;
    return next;
  }

  if (next.year > END_YEAR) {
    next.status = 'ended';
    next.ending = finalEnding(next);
    return next;
  }

  next.report = buildReport(next, rng);
  next.rng = rng.state;
  return next;
}
