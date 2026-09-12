import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { generate, DEFAULTS, PRESETS, branchColor } from '../lib/winding.ts';
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
test('fit zoom uses the intrinsic SVG width, including enlargement with continuous development off', () => {
  for (const params of [
    PRESETS[5].params,
    PRESETS[6].params,
    PRESETS[7].params,
  ]) {
    const design = generate(params).design;
    for (const periodicContext of [false, true]) {
      const render = (zoom) =>
        renderToStaticMarkup(
          React.createElement(Diagram, {
            design,
            phase: 'U',
            view: 'linear',
            periodicContext,
            zoom,
          }),
        );
      const width = Number(render(1).match(/viewBox="[^ ]+ [^ ]+ ([^ ]+)/)[1]);
      for (const viewport of [320, 900, 1700]) {
        const html = render(viewport / width);
        const style = html.match(/<svg[^>]*style="([^"]+)"/)[1];
        const pixelWidth = Number(
          style.match(/(?:^|;)width:([^;]+)px(?:;|$)/)?.[1],
        );
        assert.ok(Math.abs(pixelWidth - viewport) < 1e-6);
        assert.doesNotMatch(style, /width:[^;]*%/);
      }
    }
  }
});

test('crowded end-turn markers export a white underlay and respect the direction toggle', () => {
  const design = generate(DEFAULTS).design;
  for (const showDirections of [true, false]) {
    const html = renderToStaticMarkup(
      React.createElement(Diagram, {
        design,
        phase: 'all',
        view: 'linear',
        showDirections,
      }),
    );
    if (showDirections)
      assert.match(html, /data-arrow-isolated="true"><path[^>]*stroke="white"/);
    else
      assert.doesNotMatch(
        html,
        /data-arrow-isolated=|data-return-arrow=|data-roof-arrow=|data-route-arrow=/,
      );
  }
});

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
  assert.ok(overlay > html.lastIndexOf('data-coil-return='));
  assert.ok(html.indexOf('data-route-arrow=') > overlay);
  assert.ok(html.includes('跨接拱桥表示跨线不相连'));
});

test('rear coil loops toggle independently, retain phase/path selection and export their crossing mask', () => {
  const d = generate(DEFAULTS).design;
  const expected = d.coils.filter((c) => c.phase === 'U' && c.path === 1);
  for (const showCoilReturns of [true, false])
    for (const showConnections of [true, false])
      for (const showDirections of [true, false]) {
        const html = renderToStaticMarkup(
          React.createElement(Diagram, {
            design: d,
            phase: 'U',
            path: 1,
            view: 'linear',
            selected: expected[0].id,
            showCoilReturns,
            showConnections,
            showDirections,
          }),
        );
        assert.equal(
          (html.match(/data-coil-return=/g) || []).length,
          showCoilReturns ? expected.length : 0,
        );
        assert.equal(
          (html.match(/data-series-from=/g) || []).length,
          showConnections ? expected.length - 1 : 0,
        );
        assert.equal(
          (html.match(/data-lead-coil=/g) || []).length,
          showConnections ? 2 : 0,
        );
        assert.equal(
          (html.match(/data-coil-anchor=/g) || []).length,
          expected.length,
        );
        for (const c of d.coils)
          assert.equal(
            html.includes(`data-coil-return="${c.id}"`),
            showCoilReturns && expected.includes(c),
          );
        if (!showDirections || !showCoilReturns)
          assert.doesNotMatch(html, /data-return-arrow=/);
        else assert.match(html, /data-return-arrow=/);
        if (showCoilReturns) {
          const loops = html.slice(
            html.indexOf('data-layer="coil-returns"'),
            html.indexOf('data-layer="direction-and-terminal-overlay"'),
          );
          assert.match(loops, /stroke-width="1"/);
          assert.match(loops, /stroke-width="1.3"/);
          assert.match(loops, /opacity="0.13"/);
        }
        const masks = [...html.matchAll(/mask="url\(#([^)]+)\)"/g)];
        assert.equal(masks.length, showCoilReturns && showConnections ? 1 : 0);
        for (const [, id] of masks)
          assert.ok(
            html.includes(`<mask id="${id}"`),
            'standalone SVG contains its own clearance mask',
          );
        assert.equal(
          html.includes('<mask '),
          showCoilReturns && showConnections,
        );
      }
  for (const view of ['circuit', 'radial', 'phasor']) {
    const html = renderToStaticMarkup(
      React.createElement(Diagram, { design: d, phase: 'U', view }),
    );
    assert.doesNotMatch(html, /data-coil-return=|data-return-arrow=/);
  }
});

test('continuous development repeats only neighboring context and exports self-contained SVG references', () => {
  const d = generate({
    ...DEFAULTS,
    slots: 18,
    poles: 4,
    paths: 1,
    pitch: 4,
  }).design;
  for (const periodicContext of [true, false]) {
    const html = renderToStaticMarkup(
      React.createElement(Diagram, {
        design: d,
        phase: 'U',
        view: 'linear',
        periodicContext,
      }),
    );
    assert.equal((html.match(/data-coil-anchor=/g) || []).length, 6);
    assert.equal((html.match(/data-series-from=/g) || []).length, 5);
    assert.equal(
      (html.match(/<g tabindex="0" role="button"/g) || []).length,
      1,
    );
    assert.equal(
      (html.match(/data-periodic-context=/g) || []).length,
      periodicContext ? 2 : 0,
    );
    const uses = [...html.matchAll(/<use href="#([^"]+)"/g)];
    assert.equal(uses.length, periodicContext ? 2 : 0);
    for (const [, target] of uses) assert.ok(html.includes(`id="${target}"`));
    if (periodicContext) assert.match(html, /相邻周延续，不计入线圈数/);
    assert.ok(
      html.indexOf('data-layer="terminal-captions"') >
        html.lastIndexOf('<use '),
      'terminal labels belong to the real period, so neighboring copies never show clipped or duplicate captions',
    );
  }
});

test('three reference branches keep distinct saturated colours, six terminals and fifteen true series links in SVG', () => {
  const d = generate({
    ...DEFAULTS,
    slots: 54,
    poles: 24,
    pitch: 2,
    paths: 3,
    turns: 50,
  }).design;
  assert.equal(new Set([1, 2, 3].map((p) => branchColor('U', p))).size, 3);
  for (const path of [0, 1, 2, 3]) {
    const html = renderToStaticMarkup(
      React.createElement(Diagram, {
        design: d,
        phase: 'U',
        path,
        view: 'linear',
      }),
    );
    assert.equal(
      (html.match(/data-coil-anchor=/g) || []).length,
      path ? 6 : 18,
    );
    assert.equal(
      (html.match(/data-series-from=/g) || []).length,
      path ? 5 : 15,
    );
    assert.equal(
      (html.match(/data-lead-kind="start"/g) || []).length,
      path ? 1 : 3,
    );
    assert.equal(
      (html.match(/data-lead-kind="end"/g) || []).length,
      path ? 1 : 3,
    );
    assert.match(html, /data-layer="branch-legend"/);
    for (const p of path ? [path] : [1, 2, 3])
      assert.ok(html.includes(`stroke="${branchColor('U', p)}"`));
  }
});
