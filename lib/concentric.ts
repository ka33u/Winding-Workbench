import type { Coil, Params } from './winding.ts';

const wrap = (slot: number, slots: number) =>
  ((((slot - 1) % slots) + slots) % slots) + 1;

/** Reverse return-side order inside contiguous, equally oriented phase belts.
 * This preserves signed slot ampere-turns while making each group concentric.
 * `pitch` is the largest resulting coil span, not the precursor lap pitch.
 */
export function makeConcentric(
  p: Params,
  makeBase: (p: Params) => Coil[] | null,
): Coil[] | null {
  // A phase/sign belt occupies at most one sixth of the consecutive slot circle.
  const maxGroup = Math.ceil(p.slots / 6);
  for (
    let pitch = p.pitch;
    pitch >= Math.max(1, p.pitch - maxGroup + 1);
    pitch--
  ) {
    const source = makeBase({ ...p, pitch });
    if (!source) continue;
    const buckets = new Map<string, Coil[]>();
    for (const c of source) {
      const key = `${c.phase}:${c.goLayer}:${c.backLayer}:${Math.sign(c.span)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(c);
    }
    const coils: Coil[] = [];
    let nested = false,
      valid = true;
    const groupCounts = new Map<string, number>();
    for (const bucket of buckets.values()) {
      const bySlot = new Map(bucket.map((c) => [c.go, c]));
      const starts = bucket
        .filter((c) => !bySlot.has(wrap(c.go - 1, p.slots)))
        .sort((a, b) => a.go - b.go);
      if (!starts.length) {
        valid = false;
        break;
      }
      for (const start of starts) {
        const group: Coil[] = [];
        let next: Coil | undefined = start;
        while (next) {
          group.push(next);
          next = bySlot.get(wrap(next.go + 1, p.slots));
        }
        const groupNumber = (groupCounts.get(start.phase) ?? 0) + 1;
        groupCounts.set(start.phase, groupNumber);
        const groupId = `${start.phase}-G${groupNumber}`;
        nested ||= group.length > 1;
        for (const [i, c] of group.entries()) {
          const partner = group[group.length - 1 - i];
          const span = c.span + group.length - 1 - 2 * i;
          if (
            !span ||
            Math.sign(span) !== Math.sign(c.span) ||
            Math.abs(span) >= p.slots
          )
            valid = false;
          coils.push({ ...c, back: partner.back, span, group: groupId });
        }
      }
    }
    if (
      valid &&
      nested &&
      coils.length === source.length &&
      Math.max(...coils.map((c) => Math.abs(c.span))) === p.pitch
    )
      return coils;
  }
  return null;
}
