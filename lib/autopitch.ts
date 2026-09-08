import {
  generate,
  validateParams,
  type Params,
  type Result,
  type Issue,
} from './winding.ts';

/** A conservative convenience search, not an electromagnetic optimization. */
export function autoPitchCandidates(p: Params): number[] {
  // Use an admissible pitch to check all pitch-independent constraints first.
  if (validateParams({ ...p, pitch: 1 }).length) return [];
  const maximum = Math.max(1, Math.floor(p.slots / p.poles));
  return Array.from({ length: maximum }, (_, i) => maximum - i).filter(
    (pitch) => p.layers !== 1 || pitch % 2 === 1,
  );
}

export function generateAuto(p: Params): Result {
  const start = performance.now();
  const errors = validateParams({ ...p, pitch: 1 });
  if (errors.length) return { ok: false, issues: errors };
  const candidates = autoPitchCandidates(p);
  const failures = new Map<string, { issue: Issue; pitches: number[] }>();
  for (const pitch of candidates) {
    const result = generate({ ...p, pitch });
    if (result.ok) {
      result.design.elapsed = performance.now() - start;
      return result;
    }
    for (const issue of result.issues) {
      const failure = failures.get(issue.code);
      if (failure) failure.pitches.push(pitch);
      else failures.set(issue.code, { issue, pitches: [pitch] });
    }
  }
  return {
    ok: false,
    issues: [
      {
        code: 'E_AUTO_PITCH_NOT_FOUND',
        message: '自动节距范围内未找到有效连接',
        reason: `已从 ${candidates[0]} 槽向下检查 ${candidates.length} 个${p.layers === 1 ? '奇数' : '整槽'}节距，均未通过当前生成器的校验。搜索范围有限，不代表所有特殊绕组均不存在。`,
        fix: '切换手动节距比较其他方案，或调整槽极、层数、路数。',
        field: 'pitch',
        severity: 'error',
      },
      ...Array.from(failures.values(), ({ issue, pitches }) => ({
        ...issue,
        reason: `节距 ${pitches.slice(0, 8).join('、')} 槽${pitches.length > 8 ? `等 ${pitches.length} 个候选` : ''}出现此问题。以节距 ${pitches[0]} 槽为例：${issue.reason}`,
        fix: `节距 ${pitches[0]} 槽的建议：${issue.fix}`,
      })),
    ],
  };
}
