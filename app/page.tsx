'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Activity,
  ArrowRight,
  BookOpen,
  Check,
  CircleHelp,
  CircuitBoard,
  Cpu,
  Layers3,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Zap,
  FolderOpen,
  Save,
  AlertTriangle,
} from 'lucide-react';
import { Choice } from './winding/Choice';
import { WorkspacePanel } from './winding/WorkspacePanel';
import { Analysis } from './winding/Analysis';
import { decodeProject, encodeProject } from '@/lib/project';
import { generateAuto } from '@/lib/autopitch';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { windingTools, type ModelContext } from '@/lib/webmcp';
const storageSubscribe = (onChange: () => void) => {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
};
const savedSnapshot = () => {
  try {
    return Boolean(localStorage.getItem('winding-studio.saved.v1'));
  } catch {
    return false;
  }
};
import {
  DEFAULTS,
  PRESETS,
  COLORS,
  generate,
  type Params,
  type Phase,
} from '@/lib/winding';

export default function Home() {
  const [result, setResult] = useState(() => generateAuto(DEFAULTS));
  const [params, setParams] = useState<Params>(() =>
    result.ok ? result.design.params : { ...DEFAULTS },
  );
  const [automaticPitch, setAutomaticPitch] = useState(true);
  const [phase, setPhase] = useState<Phase | 'all'>('all');
  const [changed, setChanged] = useState(false);
  const [notice, setNotice] = useState('');
  const saved = useSyncExternalStore(
    storageSubscribe,
    savedSnapshot,
    () => false,
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const resultRef = useRef(result);
  resultRef.current = result;
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(id);
  }, [notice]);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const actions = {
      apply: (p: Params, r: ReturnType<typeof generate>, automatic: boolean) =>
        flushSync(() => {
          setParams(p);
          setResult(r);
          setAutomaticPitch(automatic);
          setChanged(false);
        }),
      read: () => ({ result: resultRef.current, phase: phaseRef.current }),
      showPhase: (p: Phase | 'all') => flushSync(() => setPhase(p)),
    };
    for (const tool of windingTools(actions)) {
      try {
        Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    }
    return () => lifecycle.abort();
  }, []);
  function save() {
    if (!result.ok) return;
    try {
      localStorage.setItem(
        'winding-studio.saved.v1',
        encodeProject(result.design),
      );
      window.dispatchEvent(new Event('storage'));
      setNotice('已保存到本设备；下次可恢复。');
    } catch {
      setNotice('浏览器未允许本地存储，请导出完整方案文件。');
    }
  }
  function restore() {
    try {
      const s = localStorage.getItem('winding-studio.saved.v1');
      if (s) {
        run(decodeProject(s));
        setNotice('已恢复本设备保存的参数，并重新校验连接。');
      }
    } catch (e) {
      setNotice(String(e));
    }
  }

  const design = result.ok ? result.design : null;
  function update<K extends keyof Params>(k: K, v: Params[K]) {
    setParams((p) => ({ ...p, [k]: v }));
    setChanged(true);
  }
  function run(p = params, automatic = false) {
    const next = automatic ? generateAuto(p) : generate(p);
    setParams(next.ok ? next.design.params : { ...p });
    setResult(next);
    setAutomaticPitch(automatic);
    setChanged(false);
  }
  return (
    <div className="studio">
      <header className="topbar">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <CircuitBoard size={23} />
          </span>
          <span>
            绕组工作台<small>WINDING STUDIO</small>
          </span>
        </Link>
        <div className="top-caption">
          <span className="live-dot" /> 电机设计 / 绕组与连接
        </div>
        <div className="header-actions">
          <input
            ref={fileInput}
            name="winding-project"
            type="file"
            accept=".json,application/json"
            className="sr-only"
            aria-label="导入绕组方案"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              if (file.size > 1_000_000) {
                setNotice('E_FILE_SIZE：文件超过1 MB。');
                return;
              }
              try {
                run(decodeProject(await file.text()));
                setNotice('已读取参数并重新生成，文件中的派生结果不参与计算。');
              } catch (err) {
                setNotice(String(err));
              }
            }}
          />
          <button
            className="quiet-button"
            aria-label="打开方案"
            title="打开方案"
            onClick={() => fileInput.current?.click()}
          >
            <FolderOpen size={16} />
            <span>打开方案</span>
          </button>
          <button
            className="quiet-button"
            aria-label="保存方案"
            title="保存方案"
            onClick={save}
            disabled={!result.ok || changed}
          >
            <Save size={16} />
            <span>保存</span>
          </button>
          <a className="quiet-button" href="#method">
            <BookOpen size={16} />
            设计依据
          </a>
        </div>
      </header>
      <div className="workspace">
        <aside className="parameters">
          <div className="section-heading">
            <span className="eyebrow">DESIGN INPUT</span>
            <SlidersHorizontal size={17} />
          </div>
          <h1>从参数，到线路。</h1>
          <p className="intro">构建、检查与探索你的电机绕组。</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(params, automaticPitch);
            }}
            noValidate
          >
            <div className="form-section">
              <h2>
                <Cpu size={16} />
                电机参数
              </h2>
              <div className="field-grid">
                {(
                  [
                    ['poles', '电机极数', 'P'],
                    ['slots', '定子槽数', 'Q'],
                    ['paths', '并联路数', 'a'],
                    ['layers', '绕组层数', 'L'],
                  ] as const
                ).map(([k, label, symbol]) => (
                  <label key={k} className="field">
                    <span>
                      {label}
                      <i>{symbol}</i>
                    </span>
                    {k === 'layers' ? (
                      <Choice
                        label={label}
                        value={String(params[k])}
                        options={[
                          ['1', '单层'],
                          ['2', '双层'],
                        ]}
                        onChange={(v) => update(k, Number(v))}
                      />
                    ) : (
                      <input
                        type="number"
                        name={k}
                        inputMode="numeric"
                        value={Number.isNaN(params[k]) ? '' : params[k]}
                        onChange={(e) =>
                          update(
                            k,
                            e.target.value === ''
                              ? NaN
                              : Number(e.target.value),
                          )
                        }
                        aria-invalid={
                          !result.ok && result.issues.some((i) => i.field === k)
                        }
                      />
                    )}
                  </label>
                ))}
              </div>
            </div>
            <div className="form-section">
              <h2>
                <Layers3 size={16} />
                绕组配置
              </h2>
              <div className="field full">
                <span>绕组形式</span>
                <Choice
                  label="绕组形式"
                  value={params.windingType}
                  options={[
                    ['lap', '叠绕 · 等节距'],
                    ['concentric', '同心式 · 线圈组'],
                  ]}
                  onChange={(v) => {
                    update('windingType', v as Params['windingType']);
                    setAutomaticPitch(true);
                  }}
                />
              </div>
              <div className="field full pitch-mode">
                <span>节距选择</span>
                <Choice
                  label="节距选择"
                  value={automaticPitch ? 'auto' : 'manual'}
                  options={[
                    [
                      'auto',
                      params.windingType === 'concentric'
                        ? '自动 · 按线圈组选择'
                        : '自动 · 接近一个极距',
                    ],
                    ['manual', '手动指定节距'],
                  ]}
                  onChange={(v) => {
                    setAutomaticPitch(v === 'auto');
                    setChanged(true);
                  }}
                />
              </div>
              <div className="field-grid">
                <label className="field">
                  <span>
                    {params.windingType === 'concentric'
                      ? '最大线圈节距'
                      : automaticPitch
                        ? '已生成节距'
                        : '线圈节距'}
                    <i>y</i>
                  </span>
                  <input
                    type="number"
                    disabled={automaticPitch}
                    name="pitch"
                    aria-describedby="pitch-guidance"
                    aria-invalid={
                      !result.ok &&
                      result.issues.some((i) => i.field === 'pitch')
                    }
                    value={
                      automaticPitch
                        ? (design?.params.pitch ?? '')
                        : Number.isNaN(params.pitch)
                          ? ''
                          : params.pitch
                    }
                    onChange={(e) =>
                      update(
                        'pitch',
                        e.target.value === '' ? NaN : Number(e.target.value),
                      )
                    }
                  />
                </label>
                <label className="field">
                  <span>
                    每线圈匝数<i>N</i>
                  </span>
                  <input
                    type="number"
                    value={Number.isNaN(params.turns) ? '' : params.turns}
                    name="turns"
                    onChange={(e) =>
                      update(
                        'turns',
                        e.target.value === '' ? NaN : Number(e.target.value),
                      )
                    }
                  />
                </label>
              </div>
              <p className="field-note" id="pitch-guidance">
                {params.windingType === 'concentric'
                  ? '最大节距指最外侧线圈的槽数跨度；同组线圈共中心、节距不同。各线圈实际节距见下方明细。自动按极距及相带宽度向下搜索。'
                  : automaticPitch
                    ? '从不超过一极距的最大整槽节距向下检查，采用首个有效方案；单层仅选奇数，极距不足一槽时试 1 槽。此规则不优化谐波或端部长度。'
                    : '节距按槽数之差计：1 → 9 为 8 槽。'}
              </p>
              <div className="field full">
                <span>端子接法</span>
                <Choice
                  label="端子接法"
                  value={params.connection}
                  options={[
                    ['star', 'Y · 星形连接'],
                    ['delta', 'Δ · 三角形连接'],
                  ]}
                  onChange={(v) =>
                    update('connection', v as Params['connection'])
                  }
                />
              </div>
              <div className="advanced-fields">
                <div className="field">
                  <span>空间相序</span>
                  <Choice
                    label="空间相序"
                    value={params.sequence}
                    options={[
                      ['UVW', 'U → V → W'],
                      ['UWV', 'U → W → V'],
                    ]}
                    onChange={(v) =>
                      update('sequence', v as Params['sequence'])
                    }
                  />
                </div>
                <div className="field-grid">
                  <label className="field">
                    <span>频率 / Hz</span>
                    <input
                      type="number"
                      name="frequency"
                      value={
                        Number.isNaN(params.frequency) ? '' : params.frequency
                      }
                      onChange={(e) =>
                        update(
                          'frequency',
                          e.target.value === '' ? NaN : Number(e.target.value),
                        )
                      }
                    />
                  </label>
                  <label className="field">
                    <span>相峰值 / A</span>
                    <input
                      type="number"
                      value={Number.isNaN(params.current) ? '' : params.current}
                      name="current"
                      onChange={(e) =>
                        update(
                          'current',
                          e.target.value === '' ? NaN : Number(e.target.value),
                        )
                      }
                    />
                  </label>
                </div>
              </div>
            </div>
            <button type="submit" className="generate-button">
              <Zap size={17} />
              生成绕组
              <ArrowRight size={17} />
            </button>
            <button
              type="button"
              className="reset-button"
              onClick={() => run(DEFAULTS, true)}
            >
              <RotateCcw size={14} />
              恢复默认参数
            </button>
            {saved && (
              <button
                type="button"
                className="restore-button"
                onClick={restore}
              >
                <FolderOpen size={14} />
                恢复本机保存方案
              </button>
            )}
          </form>
          <div className="preset-section">
            <h2>从经典方案开始</h2>
            {PRESETS.map((p, i) => (
              <button
                key={p.name}
                className="preset"
                onClick={() => run(p.params)}
              >
                <span className="preset-number">0{i + 1}</span>
                <span>
                  {p.name}
                  <small>{p.note}</small>
                </span>
                <ArrowRight size={15} />
              </button>
            ))}
          </div>
          <div className="sidebar-foot">
            <CircleHelp size={15} />
            <span>三相 · 等匝 · 单层 / 双层</span>
          </div>
        </aside>
        <main className="main-area">
          <div className="page-heading">
            <div>
              <div className="breadcrumb">
                设计工作区 <span>/</span> 绕组方案
              </div>
              <h2>
                {design
                  ? `${design.params.slots} 槽 / ${design.params.poles} 极`
                  : '检查设计参数'}
                <span className="title-tag">
                  {design?.params.layers === 1 ? '单层绕组' : '双层绕组'}
                </span>
              </h2>
            </div>
            <span className={changed ? 'state-badge pending' : 'state-badge'}>
              <span className="live-dot" />
              {changed
                ? '参数已修改，待生成'
                : design
                  ? '连接检查通过'
                  : '需要调整参数'}
            </span>
          </div>
          {design && (
            <div className="metrics">
              <div>
                <span>每极每相槽数</span>
                <strong>
                  {(design.params.slots / design.params.poles / 3).toFixed(3)}
                  <small>q</small>
                </strong>
                <em>
                  {design.params.slots % (3 * design.params.poles)
                    ? '分数槽绕组'
                    : '整数槽绕组'}
                </em>
              </div>
              <div>
                <span>基波绕组系数</span>
                <strong>
                  {design.phases[0].kw.toFixed(4)}
                  <small>kw₁</small>
                </strong>
                <em>由线圈边电势求和</em>
              </div>
              <div>
                <span>每相串联匝数</span>
                <strong>
                  {design.phases[0].turns}
                  <small>匝 / 路</small>
                </strong>
                <em>
                  {design.coils.length} 个线圈 · {design.params.paths}{' '}
                  条并联支路 / 相
                </em>
              </div>
              <div>
                <span>槽电角度</span>
                <strong>
                  {((180 * design.params.poles) / design.params.slots).toFixed(
                    2,
                  )}
                  <small>°</small>
                </strong>
                <em>三相轴差 120°</em>
              </div>
            </div>
          )}
          {!result.ok ? (
            <section className="error-panel" role="alert">
              <h3>暂不能生成有效连接</h3>
              {result.issues.map((i, n) => (
                <article key={n}>
                  <code>{i.code}</code>
                  <h4>{i.message}</h4>
                  <p>{i.reason}</p>
                  <p className="fix">建议：{i.fix}</p>
                </article>
              ))}
            </section>
          ) : (
            <WorkspacePanel
              key={JSON.stringify(result.design.params)}
              design={result.design}
              phase={phase}
              setPhase={setPhase}
              notify={setNotice}
            />
          )}
          {design && (
            <div className="summary-row">
              <section className="panel">
                <h3>
                  <Activity size={17} />
                  三相电势
                </h3>
                {design.phases.map((p) => (
                  <div className="phase-row" key={p.phase}>
                    <span style={{ color: COLORS[p.phase] }}>{p.phase} 相</span>
                    <span>{p.count} 线圈</span>
                    <span>kw₁ {p.kw.toFixed(4)}</span>
                    <span>{p.angle.toFixed(1)}°</span>
                  </div>
                ))}
              </section>
              <section className="panel">
                <h3>
                  <Check size={17} />
                  工程检查
                </h3>
                <p className="check-row">
                  <Check size={15} />
                  全部槽层占用完整，无重叠
                </p>
                <p className="check-row">
                  <Check size={15} />
                  三相电势对称，支路基波等势
                </p>
                <p className="check-row">
                  <Check size={15} />
                  并联路数可选 {design.possiblePaths.join(' / ')}
                </p>
                <p className="check-row">
                  <Check size={15} />
                  同步转速{' '}
                  {(
                    (120 * design.params.frequency) /
                    design.params.poles
                  ).toFixed(0)}{' '}
                  r/min
                </p>
              </section>
            </div>
          )}
          {design && design.issues.length > 0 && (
            <section className="warnings" aria-label="设计提示">
              {design.issues.map((i) => (
                <article key={i.code}>
                  <AlertTriangle size={17} />
                  <div>
                    <h4>
                      {i.message}
                      <code>{i.code}</code>
                    </h4>
                    <p>
                      {i.reason} {i.fix}
                    </p>
                  </div>
                </article>
              ))}
            </section>
          )}
          {design && (
            <Analysis
              key={`${design.params.slots}-${design.params.poles}-${design.params.current}`}
              design={design}
              phase={phase}
            />
          )}
          <section className="method" id="method">
            <Sparkles size={17} />
            <div>
              <h3>有依据的设计，可追溯的连接。</h3>
              <p>
                基于槽电势星形图与线圈边复数求和，参考{' '}
                <a
                  href="https://ansyshelp.ansys.com/public/Views/Secured/MotorCAD/v252/en/Motor-CAD_UG/MotorCAD/topics/windingfeasibility.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  Motor-CAD 绕组规则
                </a>
                及{' '}
                <a
                  href="https://swat-em.readthedocs.io/en/latest/theory.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  SWAT-EM 理论
                </a>
                。当前结果用于绕组连接与理想电势分析，商业软件一致性和制造工艺仍需进一步验证。
              </p>
            </div>
          </section>
        </main>
      </div>
      {notice && <output className="notice">{notice}</output>}
      <footer className="app-footer">
        <span>WINDING STUDIO</span>
        <span>让每一个线圈，都有清晰的去向。</span>
      </footer>
    </div>
  );
}
