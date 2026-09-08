import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { generate, DEFAULTS, PRESETS } from '../lib/winding.ts';
const result = await build({
  entryPoints: ['app/winding/Diagram.tsx'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  packages: 'external',
  tsconfig: 'tsconfig.json',
});
await mkdir('.test-output', { recursive: true });
await writeFile('.test-output/diagram.mjs', result.outputFiles[0].text);
const { Diagram } = await import('../.test-output/diagram.mjs');
test('SVG serialization contains correct coil targets for every view and phase filter', () => {
  for (const preset of PRESETS) {
    const r = generate(preset.params);
    assert.ok(r.ok);
    const d = r.design;
    for (const view of ['linear', 'circuit', 'radial', 'phasor'])
      for (const phase of ['all', 'U', 'V', 'W']) {
        const html = renderToStaticMarkup(
          React.createElement(Diagram, { design: d, phase, view }),
        );
        assert.match(html, /<svg/);
        assert.match(html, /<svg[^>]*role="group"/);
        assert.equal(
          (html.match(/<g tabindex="0" role="button"/g) || []).length,
          1,
          `${view}/${phase}: one coil entry point for keyboard navigation`,
        );
        assert.doesNotMatch(html, /NaN|Infinity|undefined/);
        for (const c of d.coils) {
          const present = html.includes(`aria-label="${c.id}：`);
          assert.equal(
            present,
            phase === 'all' || c.phase === phase,
            `${view}/${phase}/${c.id}`,
          );
        }
        assert.match(html, /aria-label=/);
      }
  }
});
test('phase and path filters retain complete series branches in both wiring views', () => {
  const r = generate(DEFAULTS);
  assert.ok(r.ok);
  for (const view of ['linear', 'circuit']) {
    const html = renderToStaticMarkup(
      React.createElement(Diagram, {
        design: r.design,
        phase: 'V',
        path: 1,
        view,
      }),
    );
    for (const c of r.design.coils) {
      const expected = c.phase === 'V' && c.path === 1;
      assert.equal(html.includes(`aria-label="${c.id}：`), expected);
    }
  }
});
test('delta and star electrical view end nodes match exported netlist', () => {
  for (const connection of ['star', 'delta']) {
    const r = generate({ ...DEFAULTS, connection });
    assert.ok(r.ok);
    const html = renderToStaticMarkup(
      React.createElement(Diagram, {
        design: r.design,
        phase: 'all',
        view: 'circuit',
      }),
    );
    for (const [phase, next] of [
      ['U', 'L2'],
      ['V', 'L3'],
      ['W', 'L1'],
    ])
      assert.ok(
        html.includes(`${phase}2 / ${connection === 'star' ? 'N' : next}`),
      );
  }
});

test('unrolled export exposes real connections and supports clean conductor-only display', () => {
  const d = generate(DEFAULTS).design;
  const full = renderToStaticMarkup(
    React.createElement(Diagram, { design: d, phase: 'U', view: 'linear' }),
  );
  assert.equal((full.match(/data-series-from=/g) || []).length, 10);
  assert.equal((full.match(/data-lead-kind="start"/g) || []).length, 2);
  assert.equal((full.match(/data-lead-kind="end"/g) || []).length, 2);
  assert.equal((full.match(/data-coil-anchor=/g) || []).length, 12);
  assert.ok(full.includes('data-direction-coil='));
  const minimal = renderToStaticMarkup(
    React.createElement(Diagram, {
      design: d,
      phase: 'U',
      view: 'linear',
      showConnections: false,
      showDirections: false,
    }),
  );
  assert.doesNotMatch(
    minimal,
    /data-series-from=|data-lead-kind=|data-direction-coil=/,
  );
  assert.equal((minimal.match(/data-coil-anchor=/g) || []).length, 12);
});

test('direction and terminal symbols are painted after all base wires and crossing bridges', () => {
  const d = generate(DEFAULTS).design;
  const html = renderToStaticMarkup(
    React.createElement(Diagram, { design: d, phase: 'all', view: 'linear' }),
  );
  const overlay = html.indexOf('data-layer="direction-and-terminal-overlay"');
  assert.ok(overlay > html.lastIndexOf('data-series-from='));
  assert.ok(overlay > html.lastIndexOf('data-lead-coil='));
  assert.ok(overlay > html.lastIndexOf('data-jump-route='));
  assert.ok(html.indexOf('data-route-arrow=') > overlay);
  assert.ok(html.includes('跨接拱桥表示跨线不相连'));
});
