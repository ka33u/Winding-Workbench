import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, DEFAULTS, PRESETS } from '../lib/winding.ts';
import { unrolledLayout } from '../lib/unrolled.ts';

test('short, long and crowded end turns retain correctly directed arrows for every visible coil', () => {
  const cases = [
    ...PRESETS.map((p) => p.params),
    { ...DEFAULTS, slots: 54, poles: 8, paths: 2, pitch: 6 },
    {
      ...DEFAULTS,
      slots: 360,
      poles: 12,
      paths: 12,
      pitch: 39,
      windingType: 'concentric',
    },
  ];
  for (const params of cases) {
    const design = generate(params).design;
    for (const phase of ['all', 'U']) {
      const layout = unrolledLayout(
        design,
        design.coils.filter((c) => phase === 'all' || c.phase === phase),
      );
      for (const kind of ['roof', 'return']) {
        const centers = [];
        for (const { coil, pieces, returnPieces } of layout.coils) {
          const segments = (kind === 'roof' ? pieces : returnPieces)
            .flatMap((p) => p.slice(1).map((b, i) => ({ a: p[i], b })))
            .filter(
              (s) =>
                kind === 'return' ||
                (s.a.y <= layout.top && s.b.y <= layout.top),
            );
          const arrows = layout[`${kind}Arrows`][coil.id];
          assert.ok(
            arrows.length > 0,
            `${params.slots}/${params.poles}/${phase}/${coil.id}: missing ${kind} arrows`,
          );
          for (const arrow of arrows) {
            const angle = (arrow.angle * Math.PI) / 180,
              scale = arrow.scale ?? 1;
            const center = {
              x: arrow.x - 2 * scale * Math.cos(angle),
              y: arrow.y - 2 * scale * Math.sin(angle),
            };
            assert.ok(
              segments.some(({ a, b }) => {
                const dx = b.x - a.x,
                  dy = b.y - a.y,
                  length = Math.hypot(dx, dy);
                const t =
                  ((center.x - a.x) * dx + (center.y - a.y) * dy) /
                  (length * length);
                return (
                  t > 0 &&
                  t < 1 &&
                  Math.hypot(center.x - a.x - t * dx, center.y - a.y - t * dy) <
                    1e-6 &&
                  Math.abs(Math.cos(angle) - dx / length) < 1e-6 &&
                  Math.abs(Math.sin(angle) - dy / length) < 1e-6
                );
              }),
              'arrow follows its own conductor direction',
            );
            for (const previous of centers)
              assert.ok(
                Math.hypot(previous.x - center.x, previous.y - center.y) >=
                  10 - 1e-6,
                'arrow glyphs never overlap each other',
              );
            centers.push(center);
          }
        }
      }
    }
  }
});
