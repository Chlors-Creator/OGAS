import { spark } from '../../ui/charts';
import {
  SECTOR_IDS,
  SECTOR_MAP,
  START_YEAR,
  CHEM_IMPORT_PRICE,
  STEEL_IMPORT_PRICE,
  demandAt,
  interestDue,
  politicalTargets,
  type PlanState,
  type SectorId,
} from './model';
import { advisePlan, type PlanAdvice } from './optimizer';
import type { PlanDecision } from './sim';

export interface PlanHandlers {
  onSubmit(decision: PlanDecision): void;
  onRestart(): void;
}

let draft: PlanDecision | null = null;
let draftYear = -1;
let acknowledged = -1;

const RES_KEYS = ['power', 'steel', 'chem', 'labor'] as const;
const RES_NAMES: Record<string, string> = {
  power: '电力',
  steel: '钢材',
  chem: '化工原料',
  labor: '劳动力',
};

function f(n: number, d = 1): string {
  return Number.isFinite(n) ? n.toFixed(d) : '—';
}

function defaultDraft(state: PlanState): PlanDecision {
  const req = politicalTargets(state.year);
  const round = (v: number) => Math.round(v * 10) / 10;
  return {
    targets: {
      cars: round(Math.min(state.report.sectors.cars.capacity, req.cars)),
      machines: round(Math.min(state.report.sectors.machines.capacity, req.machines)),
      butter: round(demandAt('butter', state.year)),
      clothing: round(demandAt('clothing', state.year)),
    },
    importSteel: 0,
    importChem: 0,
    invest: 'none',
  };
}

function available(state: PlanState, key: (typeof RES_KEYS)[number]): number {
  const base = state.report.resources[key];
  if (key === 'steel') return base + (draft?.importSteel ?? 0);
  if (key === 'chem') return base + (draft?.importChem ?? 0);
  return base;
}

function header(state: PlanState): string {
  return `
  <header class="sheet-head">
    <div class="crest">
      <div class="crest-title">德意志民主共和国</div>
      <div class="crest-sub">国家计划委员会 · 综合平衡处</div>
    </div>
    <div class="docno">
      <div class="docno-line">年度计划表</div>
      <div class="docno-year">${state.year}</div>
      <div class="docno-line">编号 S-${state.year}-04</div>
    </div>
    <div class="stamp">机密</div>
  </header>`;
}

function vitals(state: PlanState): string {
  const fx = state.trueResources.fx;
  return `
  <div class="vitals">
    <div class="vital">
      <div class="vital-label">政治资本</div>
      <div class="vital-value">${f(state.political, 0)}</div>
      <div class="bar"><i class="bar-pol" style="width:${state.political}%"></i></div>
    </div>
    <div class="vital">
      <div class="vital-label">民怨</div>
      <div class="vital-value ${state.discontent > 55 ? 'warn' : ''}">${f(state.discontent, 0)}</div>
      <div class="bar"><i class="bar-dis" style="width:${state.discontent}%"></i></div>
    </div>
    <div class="vital">
      <div class="vital-label">外汇储备</div>
      <div class="vital-value ${fx < 100 ? 'warn' : ''}">${f(fx, 0)}<span class="dim">M</span></div>
      <div class="vital-note">年息 ${f(interestDue(state.year), 0)}M</div>
    </div>
    <div class="vital">
      <div class="vital-label">可用劳动力</div>
      <div class="vital-value">${f(state.trueResources.labor, 0)}<span class="dim">千</span></div>
      <div class="vital-note">${state.year > START_YEAR + 8 ? '持续外流' : '基本稳定'}</div>
    </div>
  </div>`;
}

function resourcePanel(state: PlanState): string {
  const last = state.lastResult;
  const rows = RES_KEYS.map((key) => {
    const reported = state.report.resources[key];
    let prior = '';
    if (last) {
      const actual = last.trueResources[key];
      const diff = reported > 0 ? (reported - actual) / actual : 0;
      prior = `<td class="num ${Math.abs(diff) > 0.02 ? 'gap' : 'dim'}">${diff > 0 ? '+' : ''}${f(diff * 100, 1)}%</td>`;
    } else {
      prior = `<td class="num dim">—</td>`;
    }
    return `<tr><td>${RES_NAMES[key]}</td><td class="num">${f(reported, 1)}</td>${prior}</tr>`;
  }).join('');

  return `
  <section class="panel">
    <div class="panel-head">物资平衡表 <span class="tag">报表值</span></div>
    <table class="data-table">
      <thead><tr><th>项目</th><th class="num">本期</th><th class="num">对上期实际</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="hint">报表由联合企业汇总上报。以上数据未经独立核验。</p>
  </section>`;
}

function sectorTable(state: PlanState): string {
  const req = politicalTargets(state.year);
  const rows = SECTOR_IDS.map((id) => {
    const s = SECTOR_MAP[id];
    const cap = state.report.sectors[id].capacity;
    const val = draft?.targets[id] ?? 0;
    const need = demandAt(id, state.year);
    const needTag = need > 0 ? `<span class="need">需 ${f(need)}</span>` : '';
    return `
    <tr data-row="${id}">
      <td class="name">${s.name}<span class="unit">${s.unit}</span>${needTag}</td>
      <td class="num dim">${f(cap)}</td>
      <td class="entry"><input type="number" data-target="${id}" value="${val}" min="0" step="0.5"></td>
      <td class="num" data-foot="${id}-power">—</td>
      <td class="num" data-foot="${id}-steel">—</td>
      <td class="num" data-foot="${id}-chem">—</td>
      <td class="num" data-foot="${id}-labor">—</td>
    </tr>`;
  }).join('');

  const foot = RES_KEYS.map(
    (key) => `<td class="num sum" data-sumcell="${key}"><span data-sum="${key}">—</span></td>`,
  ).join('');

  return `
  <section class="panel panel-main">
    <div class="panel-head">生产指标分配 <span class="tag">Kennziffer</span></div>
    <div class="politics">
      <span class="politics-label">政治局本年指标</span>
      <span class="politics-item" data-req="cars">汽车 ≥ ${f(req.cars)}</span>
      <span class="politics-item" data-req="machines">机床 ≥ ${f(req.machines)}</span>
      <span class="politics-note">未达标按项扣减政治资本</span>
    </div>
    <table class="plan-table">
      <thead>
        <tr>
          <th>部门</th><th class="num">产能</th><th class="entry">指标</th>
          <th class="num">电力</th><th class="num">钢材</th><th class="num">化工</th><th class="num">劳动力</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr class="total-row">
          <td>合计 / 可用</td><td colspan="2"></td>${foot}
        </tr>
      </tfoot>
    </table>
    <p class="hint">指标一经批准即为法令。超出资源的部分将在执行时按政治优先序削减。</p>
  </section>`;
}

function shadowPanel(advice: PlanAdvice): string {
  const hasBinding = RES_KEYS.some((k) => advice.shadow[k] > 0.001);
  const max = Math.max(...RES_KEYS.map((k) => advice.shadow[k]), 0.0001);
  const items = RES_KEYS.map((key) => {
    const v = advice.shadow[key];
    const pct = Math.max(0, Math.min(100, (v / max) * 100));
    return `
    <li>
      <span class="shadow-name">${RES_NAMES[key]}</span>
      <span class="shadow-val ${v > 0.001 ? '' : 'dim'}">${v.toFixed(2)}</span>
      <span class="shadow-bar"><i style="width:${pct}%"></i></span>
    </li>`;
  }).join('');

  const best = SECTOR_IDS.map((id) => `${SECTOR_MAP[id].name} ${f(advice.targets[id])}`).join('，');

  return `
  <section class="panel">
    <div class="panel-head">边际价值 <span class="tag">对偶解</span></div>
    <ul class="shadow-list">${items}</ul>
    <p class="hint">${
      hasBinding
        ? '每多一单位资源可增加的加权产出。为零表示该资源有富余。'
        : '当前全部资源均有富余，没有任何一项构成瓶颈。'
    }</p>
    <div class="advice-box">
      <div class="advice-title">计算中心建议</div>
      <div class="advice-text">${best}</div>
      <div class="advice-src">依据本期报表计算，未经核验</div>
      <button class="ghost" id="use-advice">采用此方案</button>
    </div>
  </section>`;
}

function historyPanel(state: PlanState): string {
  if (state.history.length === 0) {
    return `<section class="panel panel-hist"><div class="panel-head">历年趋势</div><div class="empty">尚无历史记录。第一份报表提交后开始记录。</div></section>`;
  }
  const dis = state.history.map((h) => h.discontent);
  const fx = state.history.map((h) => h.fx);
  const out = state.history.map((h) => h.output);
  return `
  <section class="panel panel-hist">
    <div class="panel-head">历年趋势</div>
    <div class="hist-grid">
      <div class="hist-cell"><div class="hist-label">民怨</div>${spark(dis, 220, 40, '#8E2B26', true)}<div class="hist-last">${f(dis[dis.length - 1], 0)}</div></div>
      <div class="hist-cell"><div class="hist-label">外汇</div>${spark(fx, 220, 40, '#2F4A3E', true)}<div class="hist-last">${f(fx[fx.length - 1], 0)}M</div></div>
      <div class="hist-cell"><div class="hist-label">加权产出</div>${spark(out, 220, 40, '#6B5B3E', true)}<div class="hist-last">${f(out[out.length - 1], 0)}</div></div>
    </div>
  </section>`;
}

function dispatchBar(): string {
  const steelCost = (draft?.importSteel ?? 0) * STEEL_IMPORT_PRICE;
  const chemCost = (draft?.importChem ?? 0) * CHEM_IMPORT_PRICE;
  const invest = draft?.invest ?? 'none';
  const seg = (value: string, label: string, title: string) =>
    `<button data-invest="${value}" class="${invest === value ? 'active' : ''}" title="${title}">${label}</button>`;

  return `
  <footer class="dispatch">
    <div class="field">
      <label>进口钢材</label>
      <input type="number" data-import="steel" value="${draft?.importSteel ?? 0}" min="0" step="1">
      <span class="cost">× ${STEEL_IMPORT_PRICE} M</span>
    </div>
    <div class="field">
      <label>进口化工</label>
      <input type="number" data-import="chem" value="${draft?.importChem ?? 0}" min="0" step="1">
      <span class="cost">× ${CHEM_IMPORT_PRICE} M</span>
    </div>
    <div class="field field-wide">
      <label>投资方向</label>
      <div class="seg">
        ${seg('none', '不投资', '保留机床用于出口')}
        ${seg('heavy', '重工业', '消耗 2 机床 + 45M，汽车与机床产能 +6%')}
        ${seg('light', '轻工业', '消耗 1 机床 + 18M，黄油与服装产能 +5%')}
      </div>
    </div>
    <div class="spend">
      <div class="spend-label">本年进口支出</div>
      <div class="spend-val" data-spend>${f(steelCost + chemCost, 0)}M</div>
    </div>
    <button class="submit" id="submit-plan">提交计划</button>
  </footer>`;
}

function resultOverlay(state: PlanState): string {
  const r = state.lastResult;
  if (!r) return '';

  const rows = SECTOR_IDS.map((id) => {
    const s = SECTOR_MAP[id];
    const target = r.targets[id] ?? 0;
    const got = r.produced[id] ?? 0;
    const cutAmt = r.cut[id] ?? 0;
    const gap = Math.max(0, s.demand - got);
    const flag =
      cutAmt > 0.05
        ? `<span class="flag-cut">削减 ${f(cutAmt)}</span>`
        : gap > 0.05
          ? `<span class="flag-gap">缺 ${f(gap)}</span>`
          : `<span class="flag-ok">达标</span>`;
    return `<tr><td class="name">${s.name}</td><td class="num">${f(target)}</td><td class="num">${f(got)}</td><td>${flag}</td></tr>`;
  }).join('');

  const reveal = RES_KEYS.map((key) => {
    const rep = r.reportedResources[key];
    const act = r.trueResources[key];
    const diff = act > 0 ? (rep - act) / act : 0;
    const cls = Math.abs(diff) > 0.02 ? 'gap' : 'dim';
    return `<tr><td>${RES_NAMES[key]}</td><td class="num">${f(rep)}</td><td class="num">${f(act)}</td><td class="num ${cls}">${diff > 0 ? '+' : ''}${f(diff * 100, 1)}%</td></tr>`;
  }).join('');

  const dPol = r.politicalDelta;
  const dDis = r.discontentDelta;
  const fxNow = state.trueResources.fx;

  return `
  <div class="overlay" id="overlay">
    <div class="verdict">
      <div class="verdict-head">
        <h2>${r.year} 年度执行报告</h2>
        <span class="seal">已核销</span>
      </div>

      <table class="data-table">
        <thead><tr><th>部门</th><th class="num">指标</th><th class="num">实际</th><th>结果</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="reveal">
        <div class="reveal-head">物资平衡表 · 复核</div>
        <table class="data-table">
          <thead><tr><th>资源</th><th class="num">报表</th><th class="num">实际</th><th class="num">偏差</th></tr></thead>
          <tbody>${reveal}</tbody>
        </table>
        <p class="hint">偏差为正表示报表高估了可用量。此项在原始报表中不予显示。</p>
      </div>

      <div class="delta-row">
        <div class="delta ${dPol >= 0 ? 'good' : 'bad'}"><span>政治资本</span><b>${dPol >= 0 ? '+' : ''}${f(dPol, 0)}</b></div>
        <div class="delta ${dDis <= 0 ? 'good' : 'bad'}"><span>民怨</span><b>${dDis >= 0 ? '+' : ''}${f(dDis, 1)}</b></div>
        <div class="delta ${r.fxDelta >= 0 ? 'good' : 'bad'}"><span>外汇</span><b>${r.fxDelta >= 0 ? '+' : ''}${f(r.fxDelta, 0)}M</b></div>
        <div class="delta"><span>余额</span><b>${f(fxNow, 0)}M</b></div>
      </div>

      ${r.notes.length ? `<ul class="notes">${r.notes.slice(0, 6).map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}

      <button class="submit wide" id="ack">继续至 ${r.year + 1} 年</button>
    </div>
  </div>`;
}

function endingOverlay(state: PlanState): string {
  const e = state.ending;
  if (!e) return '';
  const years = state.history.length;
  return `
  <div class="overlay" id="overlay">
    <div class="verdict ending-${e.tone}">
      <div class="verdict-head">
        <h2>${e.title}</h2>
        <span class="seal">结案</span>
      </div>
      <p class="ending-body">${e.body}</p>
      <div class="ending-stats">
        <div><span>执政年数</span><b>${years}</b></div>
        <div><span>最终民怨</span><b>${f(state.discontent, 0)}</b></div>
        <div><span>外汇</span><b>${f(state.trueResources.fx, 0)}M</b></div>
        <div><span>汽车产能</span><b>${f(state.capacity.cars)}</b></div>
      </div>
      <button class="submit wide" id="restart">重新开始</button>
    </div>
  </div>`;
}

function refreshMath(root: HTMLElement, state: PlanState): void {
  if (!draft) return;
  for (const id of SECTOR_IDS) {
    const s = SECTOR_MAP[id];
    const q = draft.targets[id] ?? 0;
    const set = (key: string, v: number) => {
      const el = root.querySelector<HTMLElement>(`[data-foot="${id}-${key}"]`);
      if (el) el.textContent = f(v);
    };
    set('power', s.input.power * q);
    set('steel', s.input.steel * q);
    set('chem', s.input.chem * q);
    set('labor', s.input.labor * q);
  }

  for (const key of RES_KEYS) {
    let total = 0;
    for (const id of SECTOR_IDS) total += SECTOR_MAP[id].input[key] * (draft.targets[id] ?? 0);
    const el = root.querySelector<HTMLElement>(`[data-sum="${key}"]`);
    const cell = root.querySelector<HTMLElement>(`[data-sumcell="${key}"]`);
    const avail = available(state, key);
    if (el) el.textContent = `${f(total)} / ${f(avail)}`;
    if (cell) {
      cell.classList.toggle('over', total > avail + 0.01);
      cell.title = total > avail + 0.01 ? `超出 ${f(total - avail)}` : '在可用范围内';
    }
  }

  const spend = (draft.importSteel ?? 0) * STEEL_IMPORT_PRICE + (draft.importChem ?? 0) * CHEM_IMPORT_PRICE;
  const spendEl = root.querySelector<HTMLElement>('[data-spend]');
  if (spendEl) spendEl.textContent = `${f(spend, 0)}M`;

  const req = politicalTargets(state.year);
  for (const id of ['cars', 'machines'] as const) {
    const el = root.querySelector<HTMLElement>(`[data-req="${id}"]`);
    if (el) el.classList.toggle('miss', (draft.targets[id] ?? 0) < req[id] * 0.98);
  }
}

function bind(root: HTMLElement, state: PlanState, handlers: PlanHandlers, advice: PlanAdvice): void {
  root.querySelectorAll<HTMLInputElement>('input[data-target]').forEach((input) => {
    input.addEventListener('input', () => {
      const id = input.dataset.target as SectorId;
      const v = Math.max(0, Number(input.value) || 0);
      if (draft) draft.targets[id] = v;
      refreshMath(root, state);
    });
  });

  root.querySelectorAll<HTMLInputElement>('input[data-import]').forEach((input) => {
    input.addEventListener('input', () => {
      const v = Math.max(0, Math.floor(Number(input.value) || 0));
      if (draft) {
        if (input.dataset.import === 'steel') draft.importSteel = v;
        else draft.importChem = v;
      }
      refreshMath(root, state);
    });
  });

  root.querySelectorAll<HTMLButtonElement>('button[data-invest]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!draft) return;
      draft.invest = btn.dataset.invest as PlanDecision['invest'];
      root.querySelectorAll<HTMLButtonElement>('button[data-invest]').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
    });
  });

  const useAdvice = root.querySelector('#use-advice');
  useAdvice?.addEventListener('click', () => {
    if (!draft) return;
    draft.targets = { ...advice.targets };
    render(root, state, handlers);
  });

  const submit = root.querySelector('#submit-plan');
  submit?.addEventListener('click', () => {
    if (!draft || state.status === 'ended') return;
    handlers.onSubmit({ ...draft, targets: { ...draft.targets } });
  });

  const ack = root.querySelector('#ack');
  ack?.addEventListener('click', () => {
    if (state.lastResult) {
      acknowledged = state.lastResult.year;
      render(root, state, handlers);
    }
  });

  const restart = root.querySelector('#restart');
  restart?.addEventListener('click', () => {
    acknowledged = -1;
    draftYear = -1;
    handlers.onRestart();
  });
}

export function render(root: HTMLElement, state: PlanState, handlers: PlanHandlers): void {
  const advice = advisePlan(state.report);

  if (state.history.length === 0 && state.year === START_YEAR) {
    acknowledged = -1;
  }

  if (draftYear !== state.year || draft === null) {
    draft = defaultDraft(state);
    draftYear = state.year;
  }

  const showResult = state.status === 'playing' && state.lastResult !== null && acknowledged < state.lastResult.year;

  root.innerHTML = `
    <div class="sheet">
      ${header(state)}
      ${vitals(state)}
      <div class="grid">
        <div class="col-left">${resourcePanel(state)}${historyPanel(state)}</div>
        <div class="col-mid">${sectorTable(state)}</div>
        <div class="col-right">${shadowPanel(advice)}</div>
      </div>
      ${dispatchBar()}
      ${state.status === 'ended' ? endingOverlay(state) : showResult ? resultOverlay(state) : ''}
    </div>
  `;

  bind(root, state, handlers, advice);
  refreshMath(root, state);
}
