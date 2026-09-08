import test from 'node:test';
import assert from 'node:assert/strict';
import { windingTools } from '../lib/webmcp.ts';
import { generate, DEFAULTS } from '../lib/winding.ts';
test('WebMCP contract changes the same design state only after validated generation', () => {
  let result = generate(DEFAULTS),
    phase = 'all',
    automatic = false;
  const tools = windingTools({
    apply: (p, r, auto) => {
      assert.deepEqual(p, r.design.params);
      result = r;
      automatic = auto;
    },
    read: () => ({ result, phase }),
    showPhase: (p) => {
      phase = p;
    },
  });
  assert.deepEqual(
    tools.map((t) => t.name),
    ['generate_winding', 'get_winding', 'show_winding_phase'],
  );
  const out = tools[0].execute({
    slots: 12,
    poles: 10,
    paths: 2,
    layers: 2,
    pitch: 1,
  });
  assert.equal(out.ok, true);
  assert.equal(automatic, false);
  assert.equal(tools[1].execute({}).params.slots, 12);
  const before = result;
  assert.deepEqual(tools[0].inputSchema.properties.layers.enum, [1, 2]);
  for (const layers of [3, 4, 6, 8]) {
    const rejected = tools[0].execute({ ...DEFAULTS, layers });
    assert.equal(rejected.ok, false);
    assert.ok(rejected.issues.some((i) => i.code === 'E_RANGE_LAYERS'));
    assert.equal(result, before);
  }
  assert.equal(
    tools[0].execute({ slots: 11, poles: 10, paths: 2, layers: 2, pitch: 1 })
      .ok,
    false,
  );
  assert.equal(result, before);
  for (const bad of [
    null,
    [],
    { slots: 12 },
    'test',
    { ...DEFAULTS, unexpected: 1 },
  ])
    assert.equal(tools[0].execute(bad).ok, false);
  assert.equal(tools[2].execute({ phase: 'W' }).ok, true);
  assert.equal(tools[1].execute({}).phase, 'W');
  assert.equal(tools[2].execute({ phase: 'X' }).ok, false);
  assert.equal(phase, 'W');
  assert.equal(tools[1].annotations.readOnlyHint, true);
  const inferred = tools[0].execute({
    slots: 36,
    poles: 4,
    paths: 2,
    layers: 2,
  });
  assert.equal(inferred.ok, true);
  assert.equal(inferred.params.pitch, 9);
  assert.equal(automatic, true);
  const beforeInvalidPitch = result;
  assert.equal(
    tools[0].execute({ slots: 36, poles: 4, paths: 2, layers: 2, pitch: null })
      .ok,
    false,
  );
  assert.equal(result, beforeInvalidPitch);
});
