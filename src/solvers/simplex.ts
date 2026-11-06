export type ConstraintOp = '<=' | '>=' | '=';

export interface LPConstraint {
  id: string;
  coeffs: number[];
  op: ConstraintOp;
  rhs: number;
}

export interface LPModel {
  n: number;
  c: number[];
  sense: 'max' | 'min';
  constraints: LPConstraint[];
}

export interface LPSolution {
  status: 'optimal' | 'infeasible' | 'unbounded';
  x: number[];
  objective: number;
  duals: number[];
  basisValue: number[];
}

const EPS = 1e-9;
const PIVOT_EPS = 1e-8;

function pivot(T: number[][], obj: number[], basis: number[], row: number, col: number): void {
  const w = T[row].length;
  const p = T[row][col];
  for (let j = 0; j < w; j++) T[row][j] /= p;
  for (let i = 0; i < T.length; i++) {
    if (i === row) continue;
    const f = T[i][col];
    if (Math.abs(f) > 1e-12) {
      for (let j = 0; j < w; j++) T[i][j] -= f * T[row][j];
    }
  }
  const fo = obj[col];
  if (Math.abs(fo) > 1e-12) {
    for (let j = 0; j < w; j++) obj[j] -= fo * T[row][j];
  }
  basis[row] = col;
}

function runSimplex(
  T: number[][],
  obj: number[],
  basis: number[],
  canEnter: (j: number) => boolean,
): 'optimal' | 'unbounded' {
  const m = T.length;
  const w = obj.length;
  const limit = 8000;

  for (let iter = 0; iter < limit; iter++) {
    let enter = -1;
    for (let j = 0; j < w - 1; j++) {
      if (canEnter(j) && obj[j] > PIVOT_EPS) {
        enter = j;
        break;
      }
    }
    if (enter < 0) return 'optimal';

    let leave = -1;
    let bestRatio = Infinity;
    for (let i = 0; i < m; i++) {
      const a = T[i][enter];
      if (a > PIVOT_EPS) {
        const ratio = T[i][w - 1] / a;
        if (ratio < bestRatio - 1e-12) {
          bestRatio = ratio;
          leave = i;
        } else if (Math.abs(ratio - bestRatio) <= 1e-12 && leave >= 0 && basis[i] < basis[leave]) {
          leave = i;
        }
      }
    }
    if (leave < 0) return 'unbounded';
    pivot(T, obj, basis, leave, enter);
  }
  return 'optimal';
}

export function solveLP(model: LPModel): LPSolution {
  const n = model.n;
  const m = model.constraints.length;
  const sign = model.sense === 'max' ? 1 : -1;
  const c = model.c.map((v) => v * sign);

  const rows = model.constraints.map((con) => {
    let a = con.coeffs.slice(0, n);
    if (a.length < n) a = a.concat(new Array(n - a.length).fill(0));
    let b = con.rhs;
    let op: ConstraintOp = con.op;
    if (b < -EPS) {
      a = a.map((v) => -v);
      b = -b;
      op = op === '<=' ? '>=' : op === '>=' ? '<=' : '=';
    }
    return { a, b, op };
  });

  const slackCols: number[] = new Array(m).fill(-1);
  const artCols: number[] = new Array(m).fill(-1);
  let cols = n;

  for (let i = 0; i < m; i++) {
    if (rows[i].op !== '=') slackCols[i] = cols++;
  }
  const artStart = cols;
  for (let i = 0; i < m; i++) {
    if (rows[i].op !== '<=') artCols[i] = cols++;
  }

  const w = cols + 1;
  const T: number[][] = [];
  const basis: number[] = [];

  for (let i = 0; i < m; i++) {
    const row = new Array(w).fill(0);
    for (let j = 0; j < n; j++) row[j] = rows[i].a[j];
    row[w - 1] = rows[i].b;
    if (rows[i].op === '<=') {
      row[slackCols[i]] = 1;
      basis.push(slackCols[i]);
    } else if (rows[i].op === '>=') {
      row[slackCols[i]] = -1;
      row[artCols[i]] = 1;
      basis.push(artCols[i]);
    } else {
      row[artCols[i]] = 1;
      basis.push(artCols[i]);
    }
    T.push(row);
  }

  const hasArt = cols > artStart;

  if (hasArt) {
    const obj = new Array(w).fill(0);
    for (let j = artStart; j < cols; j++) obj[j] = -1;
    for (let i = 0; i < m; i++) {
      const bv = basis[i];
      const f = obj[bv];
      if (Math.abs(f) > EPS) {
        for (let j = 0; j < w; j++) obj[j] -= f * T[i][j];
      }
    }
    const canEnterPhase1 = (j: number) => j < artStart;
    runSimplex(T, obj, basis, canEnterPhase1);
    if (Math.abs(obj[w - 1]) > 1e-6) {
      return { status: 'infeasible', x: new Array(n).fill(0), objective: NaN, duals: new Array(m).fill(0), basisValue: [] };
    }
  }

  const obj = new Array(w).fill(0);
  for (let j = 0; j < n; j++) obj[j] = c[j];
  for (let i = 0; i < m; i++) {
    const bv = basis[i];
    const f = obj[bv];
    if (Math.abs(f) > EPS) {
      for (let j = 0; j < w; j++) obj[j] -= f * T[i][j];
    }
  }

  const canEnterPhase2 = (j: number) => j < artStart;
  const status = runSimplex(T, obj, basis, canEnterPhase2);

  if (status === 'unbounded') {
    return { status: 'unbounded', x: new Array(n).fill(0), objective: Infinity * sign, duals: new Array(m).fill(0), basisValue: [] };
  }

  const x = new Array(n).fill(0);
  for (let i = 0; i < m; i++) {
    if (basis[i] < n) x[basis[i]] = Math.max(0, T[i][w - 1]);
  }

  const objective = sign * -obj[w - 1];

  const duals = new Array(m).fill(0);
  for (let i = 0; i < m; i++) {
    const sc = slackCols[i];
    if (sc < 0) continue;
    const raw = -obj[sc];
    duals[i] = sign * (rows[i].op === '>=' ? -raw : raw);
  }

  const basisValue: number[] = [];
  for (let i = 0; i < m; i++) basisValue.push(T[i][w - 1]);

  return { status: 'optimal', x, objective, duals, basisValue };
}
