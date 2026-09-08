import { PHASES, type Phase, type Vec, type Winding } from './winding.ts';
export type HarmonicBasis = 'electrical' | 'mechanical';
export type HarmonicRow = {
  order: number;
  mechanicalOrder: number;
  electricalOrder: number;
  fundamental: boolean;
  U: number;
  V: number;
  W: number;
  sequence: 'same' | 'reverse' | 'zero' | 'mixed' | 'none';
};
export const SEQUENCE_LABELS: Record<HarmonicRow['sequence'], string> = {
  same: '与基波同序',
  reverse: '与基波反序',
  zero: '零序',
  mixed: '混合序',
  none: '无分量',
};
const multiply = (v: Vec, a: number): Vec => ({
  re: v.re * Math.cos(a) - v.im * Math.sin(a),
  im: v.re * Math.sin(a) + v.im * Math.cos(a),
});
const sum = (vs: Vec[]): Vec =>
  vs.reduce((a, b) => ({ re: a.re + b.re, im: a.im + b.im }), { re: 0, im: 0 });
const magnitude = (v: Vec) => Math.hypot(v.re, v.im);

/** A spatial Fourier spectrum. A mechanical order n corresponds to n pole pairs. */
export function spatialSpectrum(
  d: Winding,
  basis: HarmonicBasis,
  maximum: number,
): HarmonicRow[] {
  if (
    !['electrical', 'mechanical'].includes(basis) ||
    !Number.isInteger(maximum) ||
    maximum < 1 ||
    maximum > 240
  )
    throw new RangeError('E_SPECTRUM_RANGE：谐波上限需为1–240的整数。');
  const p = d.params.poles / 2,
    Q = d.params.slots;
  const amp = Object.fromEntries(
    PHASES.map((ph) => [ph, new Float64Array(Q)]),
  ) as Record<Phase, Float64Array>;
  const turns = { U: 0, V: 0, W: 0 };
  for (const c of d.coils) {
    amp[c.phase][c.go - 1] += c.turns;
    amp[c.phase][c.back - 1] -= c.turns;
    turns[c.phase] += c.turns;
  }
  return Array.from({ length: maximum }, (_, i) => {
    const order = i + 1,
      n = basis === 'mechanical' ? order : order * p;
    const vectors = PHASES.map((ph) => {
      let re = 0,
        im = 0;
      for (let s = 0; s < Q; s++) {
        const angle = (2 * Math.PI * n * s) / Q;
        re += amp[ph][s] * Math.cos(angle);
        im += amp[ph][s] * Math.sin(angle);
      }
      return { re: re / (2 * turns[ph]), im: im / (2 * turns[ph]) };
    });
    const forward =
      magnitude(
        sum([
          vectors[0],
          multiply(vectors[1], (-2 * Math.PI) / 3),
          multiply(vectors[2], (2 * Math.PI) / 3),
        ]),
      ) / 3;
    const backward =
      magnitude(
        sum([
          vectors[0],
          multiply(vectors[1], (2 * Math.PI) / 3),
          multiply(vectors[2], (-2 * Math.PI) / 3),
        ]),
      ) / 3;
    const zero = magnitude(sum(vectors)) / 3;
    const components =
      d.params.sequence === 'UVW'
        ? [forward, backward, zero]
        : [backward, forward, zero];
    const max = Math.max(...components),
      winner = components.indexOf(max);
    const sequence: HarmonicRow['sequence'] =
      max < 1e-10
        ? 'none'
        : components.some((v, j) => j !== winner && v > max * 1e-7)
          ? 'mixed'
          : (['same', 'reverse', 'zero'] as const)[winner];
    return {
      order,
      mechanicalOrder: n,
      electricalOrder: n / p,
      fundamental: n === p,
      U: magnitude(vectors[0]),
      V: magnitude(vectors[1]),
      W: magnitude(vectors[2]),
      sequence,
    };
  });
}
