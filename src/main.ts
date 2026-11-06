import './styles.css';
import { createInitialState, type PlanState } from './levels/plan/model';
import { resolveYear } from './levels/plan/sim';
import { render as renderPlan } from './levels/plan/view';

const app = document.getElementById('app') as HTMLElement | null;
if (!app) throw new Error('missing #app');
const root = app;

let state: PlanState | null = null;

function bootScreen(): void {
  root.innerHTML = `
    <div class="boot">
      <div class="boot-grid"></div>
      <div class="boot-inner">
        <div class="boot-logo">
          <span class="boot-mark">O</span>
          <div>
            <div class="boot-name">OGAS</div>
            <div class="boot-sub">全苏自动化计算与信息处理系统 · 节点 07</div>
          </div>
        </div>

        <div class="boot-console">
          <div class="line"><span class="prompt">$</span> 挂载档案库</div>
          <div class="line dim">3 份档案已索引，1 份可用</div>
        </div>

        <div class="archive-list">
          <button class="archive available" data-archive="plan">
            <span class="archive-id">01</span>
            <span class="archive-body">
              <span class="archive-title">德意志民主共和国 · 国家计划委员会</span>
              <span class="archive-desc">1971–1989 · 年度物资平衡 · 四品类</span>
            </span>
            <span class="archive-go">载入</span>
          </button>
          <div class="archive locked">
            <span class="archive-id">02</span>
            <span class="archive-body">
              <span class="archive-title">平台运营 · 定价与库存</span>
              <span class="archive-desc">编目中 · 需要档案 01 的执行记录</span>
            </span>
            <span class="archive-go">—</span>
          </div>
          <div class="archive locked">
            <span class="archive-id">03</span>
            <span class="archive-body">
              <span class="archive-title">自营交易 · 组合与执行</span>
              <span class="archive-desc">编目中 · 需要档案 02 的执行记录</span>
            </span>
            <span class="archive-go">—</span>
          </div>
        </div>

        <div class="boot-note">
          提示：报表由下级单位汇总上报。系统的职责是计算，不是核实。
        </div>
      </div>
    </div>
  `;

  root.querySelector('[data-archive="plan"]')?.addEventListener('click', () => startPlan());
}

function startPlan(): void {
  state = createInitialState(Math.floor(Math.random() * 1e9));
  paint();
}

function paint(): void {
  if (!state) return;
  renderPlan(root, state, {
    onSubmit: (decision) => {
      if (!state) return;
      state = resolveYear(state, decision);
      paint();
    },
    onRestart: () => {
      state = createInitialState(Math.floor(Math.random() * 1e9));
      paint();
    },
  });
}

const params = new URLSearchParams(location.search);
if (params.get('archive') === 'plan') startPlan();
else bootScreen();
