import { spatialSpectrum } from './harmonics.ts';
import {
  DEFAULTS,
  generate,
  netlist,
  validateParams,
  type Params,
  type Winding,
} from './winding.ts';
export const PROJECT_SCHEMA = 'winding-studio/v2';
export function encodeProject(d: Winding): string {
  return JSON.stringify(
    {
      schema: PROJECT_SCHEMA,
      generatedAt: new Date().toISOString(),
      params: d.params,
      coils: d.coils,
      netlist: netlist(d),
      analysis: {
        phases: d.phases,
        harmonics: d.harmonics,
        mechanicalHarmonics: spatialSpectrum(
          d,
          'mechanical',
          Math.max(25, d.params.poles / 2),
        ),
      },
      conventions: {
        slotNumbering: '1-based clockwise',
        layerNumbering: '1-based',
        pitch:
          d.params.windingType === 'concentric'
            ? 'maximum absolute coil span in slots'
            : 'difference in slots',
        coilSpan: 'signed unwrapped return slot minus go slot',
        current: 'phase peak amperes',
        factor: 'absolute spatial winding factor',
        model:
          d.params.windingType === 'concentric'
            ? 'three-phase equal-turn concentric groups'
            : 'three-phase equal-turn equal-pitch',
      },
    },
    null,
    2,
  );
}
export function decodeProject(text: string): Params {
  if (text.length > 1_000_000)
    throw new Error('E_FILE_SIZE：设计文件超过 1 MB。');
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new Error('E_FILE_JSON：文件不是有效的 JSON。');
  }
  if (
    !doc ||
    typeof doc !== 'object' ||
    Array.isArray(doc) ||
    ![PROJECT_SCHEMA, 'winding-studio/v1'].includes(doc.schema) ||
    !doc.params ||
    typeof doc.params !== 'object'
  )
    throw new Error(
      'E_FILE_SCHEMA：请选择本工作台导出的 winding-studio/v1 或 v2 文件。',
    );
  if (
    doc.schema === 'winding-studio/v1' &&
    Object.hasOwn(doc.params, 'windingType') &&
    doc.params.windingType !== 'lap'
  )
    throw new Error(
      'E_FILE_SCHEMA：同心式方案需要 v2 格式，避免旧版将最大节距误解为等节距。',
    );
  const p = Object.fromEntries(
    Object.keys(DEFAULTS).map((k) => [
      k,
      k === 'windingType' && doc.schema === 'winding-studio/v1'
        ? 'lap'
        : doc.params[k],
    ]),
  ) as Params;
  const errors = validateParams(p);
  if (errors.length) throw new Error(`${errors[0].code}：${errors[0].reason}`);
  const result = generate(p);
  if (!result.ok)
    throw new Error(`${result.issues[0].code}：${result.issues[0].reason}`);
  return p;
}
export function coilCSV(d: Winding, phase = 'all', path = 0): string {
  const rows = [
    [
      'CoilID',
      'Phase',
      'Path',
      'Order',
      'GoSlot',
      'GoLayer',
      'ReturnSlot',
      'ReturnLayer',
      'Turns',
      'NodeFrom',
      'NodeTo',
      'SpanSlots',
      'CoilGroup',
    ],
  ];
  for (const b of netlist(d).branches)
    if ((phase === 'all' || b.phase === phase) && (!path || b.path === path))
      for (const c of b.coils)
        rows.push(
          [
            c.id,
            c.phase,
            c.path,
            c.order,
            c.go,
            c.goLayer,
            c.back,
            c.backLayer,
            c.turns,
            c.from,
            c.to,
            c.span,
            c.group ?? '',
          ].map(String),
        );
  return (
    '\uFEFF' +
    rows
      .map((r) =>
        r.map((cell) => '"' + cell.replaceAll('"', '""') + '"').join(','),
      )
      .join('\r\n')
  );
}
export function download(content: string, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
