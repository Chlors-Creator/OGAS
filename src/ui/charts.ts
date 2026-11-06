export interface Series {
  values: number[];
  color: string;
}

export function spark(values: number[], w: number, h: number, color: string, fill = false): string {
  if (values.length < 2) {
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="#C9C3B2" stroke-width="0.5" stroke-dasharray="2 3"/></svg>`;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = 1 + (i / (values.length - 1)) * (w - 2);
    const y = h - 1 - ((v - min) / span) * (h - 2);
    return [x, y];
  });
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ');
  const area = `${d} L${pts[pts.length - 1][0].toFixed(2)} ${h} L${pts[0][0].toFixed(2)} ${h} Z`;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${
    fill ? `<path d="${area}" fill="${color}" opacity="0.12"/>` : ''
  }<path d="${d}" fill="none" stroke="${color}" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
}

export function bars(values: number[], w: number, h: number, color: string, max?: number): string {
  if (values.length === 0) return '';
  const top = max ?? Math.max(...values, 1);
  const gap = 2;
  const bw = (w - gap * (values.length - 1)) / values.length;
  const rects = values
    .map((v, i) => {
      const bh = Math.max(1, (v / top) * (h - 1));
      return `<rect x="${(i * (bw + gap)).toFixed(2)}" y="${(h - bh).toFixed(2)}" width="${bw.toFixed(2)}" height="${bh.toFixed(2)}" fill="${color}"/>`;
    })
    .join('');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${rects}</svg>`;
}
