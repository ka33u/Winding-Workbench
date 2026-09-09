import {
  DEFAULTS,
  generate,
  type Params,
  type Phase,
  type Result,
} from './winding.ts';
import { generateAuto } from './autopitch.ts';
export type WindingActions = {
  apply: (p: Params, r: Result, automaticPitch: boolean) => void;
  read: () => { result: Result; phase: Phase | 'all' };
  showPhase: (p: Phase | 'all') => void;
};
export type BrowserTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};
export type ModelContext = {
  registerTool: (
    tool: BrowserTool,
    options?: { signal: AbortSignal },
  ) => void | Promise<void>;
};
export function windingTools(actions: WindingActions): BrowserTool[] {
  return [
    {
      name: 'generate_winding',
      title: '生成电机绕组',
      description:
        '校验参数并在工作台生成线圈及电气连接；省略 pitch 时自动选择节距。失败时返回错误码，不覆盖当前有效方案。',
      inputSchema: {
        type: 'object',
        properties: {
          slots: { type: 'integer', minimum: 3, maximum: 360 },
          poles: { type: 'integer', minimum: 2, maximum: 240 },
          paths: { type: 'integer', minimum: 1, maximum: 120 },
          layers: { type: 'integer', enum: [1, 2] },
          windingType: { type: 'string', enum: ['lap', 'concentric'] },
          pitch: { type: 'integer' },
          turns: { type: 'integer' },
          connection: { type: 'string', enum: ['star', 'delta'] },
          sequence: { type: 'string', enum: ['UVW', 'UWV'] },
          frequency: { type: 'number' },
          current: { type: 'number' },
        },
        required: ['slots', 'poles', 'paths', 'layers'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input))
          return { ok: false, code: 'E_INPUT' };
        const values = input as Record<string, unknown>;
        if (
          Object.keys(values).some((k) => !(k in DEFAULTS)) ||
          ['slots', 'poles', 'paths', 'layers'].some((k) => !(k in values))
        )
          return { ok: false, code: 'E_INPUT_SCHEMA' };
        const p = { ...DEFAULTS, ...values } as Params,
          automaticPitch = !Object.hasOwn(values, 'pitch'),
          r = automaticPitch ? generateAuto(p) : generate(p);
        if (!r.ok) return r;
        actions.apply(r.design.params, r, automaticPitch);
        return {
          ok: true,
          params: r.design.params,
          coils: r.design.coils.length,
          kw1: r.design.phases.map((s) => s.kw),
          possiblePaths: r.design.possiblePaths,
        };
      },
    },
    {
      name: 'get_winding',
      title: '读取当前绕组',
      description: '读取当前已生成方案的参数、检查结果和显示相别。',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute() {
        const state = actions.read();
        return state.result.ok
          ? {
              ok: true,
              params: state.result.design.params,
              phases: state.result.design.phases,
              coils: state.result.design.coils.length,
              phase: state.phase,
            }
          : state.result;
      },
    },
    {
      name: 'show_winding_phase',
      title: '切换绕组相别',
      description: '切换线路图、线圈表和分析中的相别过滤。',
      inputSchema: {
        type: 'object',
        properties: { phase: { type: 'string', enum: ['all', 'U', 'V', 'W'] } },
        required: ['phase'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        const phase =
          input && typeof input === 'object'
            ? (input as { phase?: unknown }).phase
            : undefined;
        if (
          typeof phase !== 'string' ||
          !['all', 'U', 'V', 'W'].includes(phase)
        )
          return { ok: false, code: 'E_PHASE' };
        actions.showPhase(phase as Phase | 'all');
        return { ok: true, phase };
      },
    },
  ];
}
