export interface Rng {
  state: number;
}

export function createRng(seed: number): Rng {
  return { state: (seed >>> 0) || 1 };
}

export function nextFloat(rng: Rng): number {
  let t = (rng.state + 0x6d2b79f5) >>> 0;
  rng.state = t;
  let r = t;
  r = Math.imul(r ^ (r >>> 15), r | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
}

export function nextRange(rng: Rng, min: number, max: number): number {
  return min + nextFloat(rng) * (max - min);
}

export function nextNormal(rng: Rng, mean: number, sd: number): number {
  const u = Math.max(nextFloat(rng), 1e-9);
  const v = nextFloat(rng);
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function nextInt(rng: Rng, min: number, max: number): number {
  return Math.floor(nextRange(rng, min, max + 1));
}
