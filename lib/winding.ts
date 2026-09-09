export type Phase = 'U' | 'V' | 'W';
export const PHASES: Phase[] = ['U', 'V', 'W'];
export const COLORS: Record<Phase, string> = {
  U: '#d93642',
  V: '#148846',
  W: '#245bd8',
};
export type Params = {
  slots: number;
  poles: number;
  paths: number;
  layers: number;
  pitch: number;
  turns: number;
  connection: 'star' | 'delta';
  sequence: 'UVW' | 'UWV';
  frequency: number;
  current: number;
};
export type Coil = {
  id: string;
  phase: Phase;
  path: number;
  order: number;
  go: number;
  back: number;
  goLayer: number;
  backLayer: number;
  turns: number;
};
export type Issue = {
  code: string;
  message: string;
  reason: string;
  fix: string;
  field?: keyof Params;
  severity: 'error' | 'warning';
};
export type Vec = { re: number; im: number };
export type PhaseStats = {
  phase: Phase;
  count: number;
  turns: number;
  kw: number;
  angle: number;
  vector: Vec;
  branchError: number;
};
export type Winding = {
  params: Params;
  coils: Coil[];
  phases: PhaseStats[];
  harmonics: { order: number; U: number; V: number; W: number }[];
  issues: Issue[];
  possiblePaths: number[];
  balanceError: number;
  angleError: number;
  elapsed: number;
};
export type Result =
  | { ok: true; design: Winding }
  | { ok: false; issues: Issue[] };
export const DEFAULTS: Params = {
  slots: 36,
  poles: 4,
  paths: 2,
  layers: 2,
  pitch: 8,
  turns: 12,
  connection: 'star',
  sequence: 'UVW',
  frequency: 50,
  current: 10,
};
export const PRESETS = [
  { name: '经典分布式', note: '36 槽 · 4 极 · 短距', params: DEFAULTS },
  {
    name: '分数槽集中式',
    note: '12 槽 · 10 极 · 齿绕',
    params: { ...DEFAULTS, slots: 12, poles: 10, pitch: 1, paths: 2 },
  },
  {
    name: '单层短距',
    note: '24 槽 · 4 极 · 单层',
    params: { ...DEFAULTS, slots: 24, poles: 4, pitch: 5, layers: 1, paths: 1 },
  },
  {
    name: '高槽数分布式',
    note: '72 槽 · 8 极 · 4 路',
    params: { ...DEFAULTS, slots: 72, poles: 8, paths: 4, pitch: 8 },
  },
];
const TAU = Math.PI * 2;
export const mod = (n: number, d: number) => ((n % d) + d) % d;
export function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : Math.abs(a);
}
const mag = (v: Vec) => Math.hypot(v.re, v.im);
const degrees = (v: Vec) => mod((Math.atan2(v.im, v.re) * 180) / Math.PI, 360);
const angleDistance = (a: number, b: number) =>
  Math.abs(mod(a - b + 180, 360) - 180);
const issue = (
  code: string,
  message: string,
  reason: string,
  fix: string,
  field?: keyof Params,
  severity: 'error' | 'warning' = 'error',
): Issue => ({ code, message, reason, fix, field, severity });

export function validateParams(p: Params): Issue[] {
  if (!p || typeof p !== 'object')
    return [
      issue(
        'E_INPUT',
        '参数格式错误',
        '需要完整的参数对象。',
        '恢复默认参数。',
      ),
    ];
  const errors: Issue[] = [];
  const limits: [keyof Params, string, number, number, boolean][] = [
    ['slots', '槽数', 3, 360, true],
    ['poles', '极数', 2, 240, true],
    ['paths', '并联路数', 1, 120, true],
    ['layers', '层数', 1, 2, true],
    ['pitch', '节距', 1, 359, true],
    ['turns', '每线圈匝数', 1, 10000, true],
    ['frequency', '频率', 0.1, 5000, false],
    ['current', '相电流峰值', 0, 100000, false],
  ];
  for (const [field, label, min, max, integer] of limits) {
    const n = p[field];
    if (
      typeof n !== 'number' ||
      !Number.isFinite(n) ||
      (integer && !Number.isInteger(n)) ||
      n < min ||
      n > max
    )
      errors.push(
        issue(
          'E_RANGE_' + field.toUpperCase(),
          `${label}超出有效范围`,
          field === 'layers'
            ? '本工作台只支持单层（1）和双层（2）绕组。'
            : `${label}需要是 ${min}–${max} 的${integer ? '整数' : '数值'}。`,
          field === 'layers'
            ? '选择单层或双层后重新生成。'
            : `请输入有效的${label}。`,
          field,
        ),
      );
  }
  if (!['star', 'delta'].includes(p.connection))
    errors.push(
      issue(
        'E_CONNECTION',
        '接法无效',
        '支持星形 Y 和三角形 Δ。',
        '重新选择接法。',
        'connection',
      ),
    );
  if (!['UVW', 'UWV'].includes(p.sequence))
    errors.push(
      issue(
        'E_SEQUENCE',
        '相序无效',
        '支持 UVW 和 UWV。',
        '重新选择相序。',
        'sequence',
      ),
    );
  if (errors.length) return errors;
  if (p.poles % 2)
    errors.push(
      issue(
        'E_POLES_ODD',
        '极数必须为偶数',
        `当前 ${p.poles} 极不能构成完整的 N/S 极对。`,
        '使用 2、4、6… 极。',
        'poles',
      ),
    );
  if (p.pitch >= p.slots)
    errors.push(
      issue(
        'E_PITCH_SPAN',
        '节距必须小于槽数',
        `节距 ${p.pitch} 不能到达另一个有效槽位。`,
        `输入 1–${p.slots - 1} 槽。`,
        'pitch',
      ),
    );
  if (p.slots % 3)
    errors.push(
      issue(
        'E_PHASE_SLOT_COUNT',
        '无法均匀分配三相',
        `${p.slots} 槽无法按三相均匀分配等匝线圈。`,
        '使用 3 的倍数槽数；不等匝/空槽绕组需专用算法。',
        'slots',
      ),
    );
  if (p.layers === 1 && p.slots % 6)
    errors.push(
      issue(
        'E_SINGLE_COIL_COUNT',
        '单层线圈数不能均分三相',
        '单层每个线圈占两个槽，槽数需为 6 的倍数。',
        '调整槽数或改用双层。',
        'slots',
      ),
    );
  if (p.layers === 1 && p.pitch % 2 === 0)
    errors.push(
      issue(
        'E_SINGLE_PITCH',
        '自动单层需要奇数节距',
        '采用 Motor-CAD 常规自动单层的奇节距规则；不代表所有特殊偶节距设计均不可能。',
        '选择相邻奇数节距，或使用双层。',
        'pitch',
      ),
    );
  if (p.poles % 2 === 0 && p.slots % (3 * gcd(p.slots, p.poles / 2)))
    errors.push(
      issue(
        'E_SLOT_STAR_SYMMETRY',
        '槽电势星形图不满足三相对称条件',
        'Q / [3 × gcd(Q, P/2)] 不是整数，等匝常规对称绕组无法构成。',
        '调整槽极组合，例如 36槽4极、12槽10极。',
        'poles',
      ),
    );
  const count = (p.slots * p.layers) / 2;
  if (Number.isInteger(count) && count % (3 * p.paths))
    errors.push(
      issue(
        'E_PATH_COIL_COUNT',
        '线圈数不能均分支路',
        `${count} 个线圈分为 3 相，每相 ${Number((count / 3).toFixed(4))} 个；${p.paths} 路需要每路 ${Number((count / (3 * p.paths)).toFixed(4))} 个线圈，不是整数，等匝线圈无法均分。`,
        '选择能整除每相线圈数的路数，再检查各支路的串联匝数和电势。',
        'paths',
      ),
    );
  return errors;
}

export function coilVector(c: Coil, p: Params, harmonic = 1): Vec {
  const a = (TAU * (p.poles / 2) * harmonic) / p.slots;
  return {
    re: c.turns * (Math.cos(a * (c.go - 1)) - Math.cos(a * (c.back - 1))),
    im: c.turns * (Math.sin(a * (c.go - 1)) - Math.sin(a * (c.back - 1))),
  };
}
export function sumVector(coils: Coil[], p: Params, h = 1): Vec {
  return coils.reduce(
    (v, c) => {
      const w = coilVector(c, p, h);
      return { re: v.re + w.re, im: v.im + w.im };
    },
    { re: 0, im: 0 },
  );
}
export function windingFactor(coils: Coil[], p: Params, h = 1): number {
  const denominator = 2 * coils.reduce((n, c) => n + c.turns, 0);
  return denominator ? mag(sumVector(coils, p, h)) / denominator : 0;
}
function assign(
  go: number,
  back: number,
  goLayer: number,
  backLayer: number,
  p: Params,
  offset: number,
): Coil {
  const c: Coil = {
    id: '',
    phase: 'U',
    path: 1,
    order: 0,
    go,
    back,
    goLayer,
    backLayer,
    turns: p.turns,
  };
  const a = degrees(coilVector(c, p));
  let best = Infinity,
    sign = 1;
  const phases = p.sequence === 'UVW' ? PHASES : (['U', 'W', 'V'] as Phase[]);
  for (let i = 0; i < 3; i++)
    for (const s of [1, -1]) {
      const d = angleDistance(a, offset + i * 120 + (s === -1 ? 180 : 0));
      if (d < best - 1e-7) {
        best = d;
        c.phase = phases[i];
        sign = s;
      }
    }
  if (sign < 0) {
    [c.go, c.back] = [c.back, c.go];
    [c.goLayer, c.backLayer] = [c.backLayer, c.goLayer];
  }
  return c;
}
function symmetry(coils: Coil[], p: Params) {
  const groups = PHASES.map((ph) => coils.filter((c) => c.phase === ph));
  const vs = groups.map((g) => sumVector(g, p));
  const sizes = vs.map(mag),
    max = Math.max(...sizes, 1e-12);
  const balance = (Math.max(...sizes) - Math.min(...sizes)) / max;
  const sign = p.sequence === 'UVW' ? 1 : -1;
  const angle = Math.max(
    ...vs.map((v, i) =>
      angleDistance(degrees(v), degrees(vs[0]) + sign * i * 120),
    ),
  );
  const countError =
    Math.max(...groups.map((g) => g.length)) -
    Math.min(...groups.map((g) => g.length));
  return {
    balance,
    angle,
    countError,
    score: countError * 100 + balance * 100 + angle,
    valid:
      countError === 0 &&
      balance < 1e-8 &&
      angle < 1e-6 &&
      Math.min(...sizes) > 1e-8,
  };
}
function makeCoils(p: Params): Coil[] | null {
  const step = (360 * gcd(p.slots, p.poles / 2)) / p.slots;
  const offsets = [step / 4, 0, step / 2, 15, 30 - step / 4];
  if (p.layers === 2) {
    for (const offset of offsets) {
      const cs: Coil[] = [];
      for (let s = 1; s <= p.slots; s++)
        cs.push(assign(s, mod(s - 1 + p.pitch, p.slots) + 1, 1, 2, p, offset));
      if (symmetry(cs, p).valid) return cs;
    }
    return null;
  }
  // Equal-pitch matching is a union of cycles. Each even cycle has two perfect matchings.
  const cycles: number[][] = [],
    seen = new Set<number>();
  for (let s = 1; s <= p.slots; s++) {
    if (seen.has(s)) continue;
    const cycle: number[] = [];
    let k = s;
    while (!seen.has(k)) {
      seen.add(k);
      cycle.push(k);
      k = mod(k - 1 + p.pitch, p.slots) + 1;
    }
    if (cycle.length % 2) return null;
    cycles.push(cycle);
  }
  let seed = 4817;
  for (const offset of offsets) {
    const choices = cycles.map((cycle) =>
      [0, 1].map((parity) =>
        cycle
          .filter((_, i) => i % 2 === parity)
          .map((s) =>
            assign(s, mod(s - 1 + p.pitch, p.slots) + 1, 1, 1, p, offset),
          ),
      ),
    );
    const tries = cycles.length <= 10 ? 2 ** cycles.length : 256;
    for (let t = 0; t < tries; t++) {
      const cs = choices.flatMap((pair, i) => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const choice =
          t < 2 ? t : cycles.length <= 10 ? (t >> i) & 1 : seed >>> 31;
        return pair[choice];
      });
      if (symmetry(cs, p).valid) return cs.map((c) => ({ ...c }));
    }
  }
  return null;
}
function vectorGroups(coils: Coil[], p: Params): Coil[][] {
  const groups = new Map<string, Coil[]>();
  for (const c of coils) {
    const v = coilVector(c, p);
    const key = `${Math.round((v.re / c.turns) * 1e7)}:${Math.round((v.im / c.turns) * 1e7)}`;
    groups.set(key, [...(groups.get(key) || []), c]);
  }
  return [...groups.values()];
}
function connect(coils: Coil[], p: Params): number[] {
  const allGroups = PHASES.map((ph) =>
    vectorGroups(
      coils.filter((c) => c.phase === ph),
      p,
    ),
  );
  const multiplicity = allGroups.flat().reduce((n, g) => gcd(n, g.length), 0);
  const possible = Array.from(
    { length: Math.min(multiplicity, 120) },
    (_, i) => i + 1,
  ).filter((a) => multiplicity % a === 0);
  if (!possible.includes(p.paths)) return possible;
  for (const groups of allGroups)
    for (const g of groups)
      g.sort((a, b) => a.goLayer - b.goLayer || a.go - b.go).forEach((c, i) => {
        c.path = (i % p.paths) + 1;
      });
  for (const ph of PHASES)
    for (let path = 1; path <= p.paths; path++) {
      coils
        .filter((c) => c.phase === ph && c.path === path)
        .sort(
          (a, b) =>
            a.goLayer - b.goLayer ||
            Math.min(a.go, a.back) - Math.min(b.go, b.back),
        )
        .forEach((c, i) => {
          c.order = i + 1;
          c.id = `${ph}${path}-${i + 1}`;
        });
    }
  return possible;
}

export function auditCoils(coils: Coil[], p: Params): Issue[] {
  const issues: Issue[] = [],
    occupied = new Set<string>(),
    ids = new Set<string>();
  for (const c of coils) {
    if (
      !PHASES.includes(c.phase) ||
      !Number.isInteger(c.turns) ||
      c.turns < 1 ||
      c.turns > 10000 ||
      !Number.isInteger(c.path) ||
      c.path < 1 ||
      c.path > p.paths ||
      !Number.isInteger(c.order) ||
      c.order < 1 ||
      c.go === c.back
    )
      return [
        issue(
          'E_COIL_DATA',
          '线圈数据无效',
          `线圈 ${c.id} 的相别、匝数、路数、顺序或槽位不合法。`,
          '检查线圈参数。',
        ),
      ];
    if (ids.has(c.id))
      return [
        issue(
          'E_COIL_ID',
          '线圈编号重复',
          `编号 ${c.id} 出现多次。`,
          '每个线圈必须有独立编号。',
        ),
      ];
    ids.add(c.id);
    for (const [slot, layer] of [
      [c.go, c.goLayer],
      [c.back, c.backLayer],
    ]) {
      if (
        !Number.isInteger(slot) ||
        slot < 1 ||
        slot > p.slots ||
        !Number.isInteger(layer) ||
        layer < 1 ||
        layer > p.layers
      )
        return [
          issue(
            'E_SLOT_RANGE',
            '线圈边超出槽层范围',
            `线圈 ${c.id} 使用了槽 ${slot} / 层 ${layer}。`,
            '使用有效槽号和层号。',
          ),
        ];
      const key = `${slot}:${layer}`;
      if (occupied.has(key))
        return [
          issue(
            'E_SLOT_COLLISION',
            '槽层位置重复占用',
            `槽 ${slot} 的第 ${layer} 层有多个线圈边。`,
            '修改去回槽或层号。',
          ),
        ];
      occupied.add(key);
    }
  }
  if (occupied.size !== p.slots * p.layers)
    issues.push(
      issue(
        'E_SLOT_EMPTY',
        '槽层未完全填满',
        `${p.slots * p.layers - occupied.size} 个槽层位置缺少线圈边。`,
        '补齐线圈；本模型不使用空槽。',
      ),
    );
  const sy = symmetry(coils, p);
  if (!sy.valid)
    issues.push(
      issue(
        'E_PHASE_UNBALANCED',
        '三相电势不对称',
        `幅值偏差 ${(sy.balance * 100).toFixed(4)}%，相轴偏差 ${sy.angle.toFixed(4)}°。`,
        '检查相别、方向和匝数。',
      ),
    );
  for (const ph of PHASES) {
    const groups = Array.from({ length: p.paths }, (_, i) =>
      coils.filter((c) => c.phase === ph && c.path === i + 1),
    );
    const reference = sumVector(groups[0], p),
      norm = Math.max(mag(reference), 1e-12);
    const turns = groups.map((g) => g.reduce((s, c) => s + c.turns, 0));
    const branchError = Math.max(
      ...groups.map((g) => {
        const v = sumVector(g, p);
        return Math.hypot(v.re - reference.re, v.im - reference.im) / norm;
      }),
    );
    if (
      groups.some((g) => !g.length) ||
      new Set(turns).size > 1 ||
      branchError > 1e-8
    )
      issues.push(
        issue(
          'E_BRANCH_EMF',
          `${ph} 相并联支路不等势`,
          `支路电势偏差 ${(branchError * 100).toFixed(4)}% 或串联匝数不一致。`,
          '重新分配线圈或减少并联路数。',
          'paths',
        ),
      );
    if (
      groups.some((g) =>
        g
          .map((c) => c.order)
          .sort((a, b) => a - b)
          .some((n, i) => n !== i + 1),
      )
    )
      issues.push(
        issue(
          'E_BRANCH_ORDER',
          `${ph} 相线圈顺序不连续`,
          '每条支路的线圈顺序应从1连续编号且不重复。',
          '重新排序线圈。',
        ),
      );
  }
  return issues;
}

export function generate(p: Params): Result {
  const start = performance.now(),
    issues = validateParams(p);
  if (issues.length) return { ok: false, issues };
  const coils = makeCoils(p);
  if (!coils)
    return {
      ok: false,
      issues: [
        issue(
          'E_LAYOUT_NOT_FOUND',
          '未找到对称等节距排列',
          '当前槽极、节距与层数在本生成器的相带及匹配搜索中未找到通过验证的方案；这不是所有特殊绕组不存在的证明。',
          '尝试相邻奇数节距、双层或示例参数。',
          'pitch',
        ),
      ],
    };
  const possiblePaths = connect(coils, p);
  if (!possiblePaths.includes(p.paths))
    return {
      ok: false,
      issues: [
        issue(
          'E_PATH_PARTITION',
          '当前路数未找到等势分组',
          '线圈数可均分，但等电势线圈类别不能平均分入每条支路。',
          `已验证可用路数：${possiblePaths.join('、')}。`,
          'paths',
        ),
      ],
    };
  const audit = auditCoils(coils, p);
  if (audit.length) return { ok: false, issues: audit };
  const sy = symmetry(coils, p);
  const phases: PhaseStats[] = PHASES.map((phase) => {
    const cs = coils.filter((c) => c.phase === phase),
      v = sumVector(cs, p);
    const ref = sumVector(
      cs.filter((c) => c.path === 1),
      p,
    );
    const branchError = Math.max(
      ...Array.from({ length: p.paths }, (_, i) => {
        const bv = sumVector(
          cs.filter((c) => c.path === i + 1),
          p,
        );
        return (
          Math.hypot(bv.re - ref.re, bv.im - ref.im) / Math.max(mag(ref), 1e-12)
        );
      }),
    );
    return {
      phase,
      count: cs.length,
      turns: cs.reduce((n, c) => n + c.turns, 0) / p.paths,
      kw: windingFactor(cs, p),
      angle: degrees(v),
      vector: v,
      branchError,
    };
  });
  const harmonics = Array.from({ length: 25 }, (_, n) => ({
    order: n + 1,
    ...Object.fromEntries(
      PHASES.map((ph) => [
        ph,
        windingFactor(
          coils.filter((c) => c.phase === ph),
          p,
          n + 1,
        ),
      ]),
    ),
  })) as Winding['harmonics'];
  if (phases[0].kw < 0.8)
    issues.push(
      issue(
        'W_LOW_FACTOR',
        '基波绕组系数偏低',
        `kw1=${phases[0].kw.toFixed(4)}，同匝数下基波耦合较低。`,
        '比较节距和槽极组合。',
        'pitch',
        'warning',
      ),
    );
  if (p.pitch > p.slots / p.poles)
    issues.push(
      issue(
        'W_LONG_PITCH',
        '节距超过一极距',
        '长距绕组可能增加端部长度，需要结合制造条件确认。',
        '优先比较不超过极距的节距。',
        'pitch',
        'warning',
      ),
    );
  // Odd harmonics of nominally equal branches must also agree, not just the fundamental.
  for (const ph of PHASES)
    for (const h of [3, 5, 7, 9, 11, 13, 17, 19, 23, 25]) {
      const base = coils.filter((c) => c.phase === ph && c.path === 1),
        ref = sumVector(base, p, h),
        scale = 2 * base.reduce((n, c) => n + c.turns, 0);
      for (let path = 2; path <= p.paths; path++) {
        const v = sumVector(
          coils.filter((c) => c.phase === ph && c.path === path),
          p,
          h,
        );
        if (Math.hypot(v.re - ref.re, v.im - ref.im) / scale > 1e-8)
          return {
            ok: false,
            issues: [
              issue(
                'E_BRANCH_HARMONICS',
                '并联支路谐波电势不同',
                `${ph} 相第 ${h} 次空间谐波不一致，可能形成环流。`,
                '减少并联路数。',
                'paths',
              ),
            ],
          };
      }
    }
  return {
    ok: true,
    design: {
      params: { ...p },
      coils,
      phases,
      harmonics,
      issues,
      possiblePaths,
      balanceError: sy.balance,
      angleError: sy.angle,
      elapsed: performance.now() - start,
    },
  };
}

export function mmf(
  d: Winding,
  timeAngle: number,
  phase: Phase | 'all' = 'all',
): number[] {
  const p = d.params,
    slots = Array(p.slots).fill(0) as number[];
  const angle0 = d.phases[0].angle;
  for (const c of d.coils) {
    if (phase !== 'all' && c.phase !== phase) continue;
    const axis = d.phases.find((s) => s.phase === c.phase)!.angle;
    const amps =
      (p.current / p.paths) *
      Math.cos(((timeAngle - (axis - angle0)) * Math.PI) / 180) *
      c.turns;
    slots[c.go - 1] += amps;
    slots[c.back - 1] -= amps;
  }
  let sum = 0;
  const values = slots.map((n) => (sum += n));
  const mean = values.reduce((a, b) => a + b, 0) / p.slots;
  return values.map((n) => n - mean);
}

export function netlist(d: Winding) {
  const branches = PHASES.flatMap((phase, i) =>
    Array.from({ length: d.params.paths }, (_, k) => {
      const coils = d.coils
        .filter((c) => c.phase === phase && c.path === k + 1)
        .sort((a, b) => a.order - b.order);
      const start = `L${i + 1}`,
        end = d.params.connection === 'star' ? 'N' : `L${((i + 1) % 3) + 1}`;
      return {
        phase,
        path: k + 1,
        start,
        end,
        coils: coils.map((c, n) => ({
          ...c,
          from: n === 0 ? start : `${phase}${k + 1}:n${n}`,
          to: n === coils.length - 1 ? end : `${phase}${k + 1}:n${n + 1}`,
        })),
      };
    }),
  );
  return {
    connection: d.params.connection,
    terminals:
      d.params.connection === 'star'
        ? ['L1', 'L2', 'L3', 'N']
        : ['L1', 'L2', 'L3'],
    branches,
  };
}
