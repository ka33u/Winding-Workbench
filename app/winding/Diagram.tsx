'use client';
// Preserve interactive SVG descendants in the accessibility tree.
/* eslint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-tabindex */
import { useMemo, useState, type KeyboardEvent } from 'react';
import { moveGraphicFocus } from './keyboard';
import { unrolledLayout } from '@/lib/unrolled';
import { LinearWinding } from './LinearWinding';
import {
  COLORS,
  PHASES,
  coilVector,
  netlist,
  type Winding,
  type Phase,
  type Coil,
} from '@/lib/winding';

export type View = 'linear' | 'circuit' | 'radial' | 'phasor';
export type DiagramProps = {
  design: Winding;
  phase: Phase | 'all';
  view?: View;
  path?: number;
  layerPair?: number;
  selected?: string | null;
  onSelect?: (id: string) => void;
  zoom?: number;
  animate?: boolean;
  showConnections?: boolean;
  showDirections?: boolean;
};
export const VIEWS: [View, string][] = [
  ['linear', '绕组展开'],
  ['circuit', '电气接线'],
  ['radial', '径向分布'],
  ['phasor', '电势相量'],
];
export function visibleCoils(
  d: Winding,
  phase: Phase | 'all',
  path = 0,
  pair = 0,
) {
  return d.coils.filter(
    (c) =>
      (phase === 'all' || c.phase === phase) &&
      (!path || c.path === path) &&
      (!pair || Math.ceil(c.goLayer / 2) === pair),
  );
}
const label = (c: Coil) =>
  `${c.id}：${c.go}槽第${c.goLayer}层 → ${c.back}槽第${c.backLayer}层，${c.turns}匝，${c.phase}相第${c.path}路第${c.order}个线圈`;
export function Diagram({
  design,
  phase,
  view = 'linear',
  path = 0,
  layerPair = 0,
  selected,
  onSelect,
  zoom = 1,
  animate = false,
  showConnections = true,
  showDirections = true,
}: DiagramProps) {
  const cs = useMemo(
    () => visibleCoils(design, phase, path, view === 'circuit' ? 0 : layerPair),
    [design, phase, path, view, layerPair],
  );
  const linear = useMemo(
    () => (view === 'linear' ? unrolledLayout(design, cs) : null),
    [design, cs, view],
  );
  const { slots, layers } = design.params;
  const [focused, setFocused] = useState<string | null>(null);
  const tabCoil =
    cs.find((c) => c.id === focused)?.id ??
    cs.find((c) => c.id === selected)?.id ??
    cs[0]?.id;
  const hit = (c: Coil) => ({
    tabIndex: c.id === tabCoil ? 0 : -1,
    role: 'button' as const,
    'data-coil-id': c.id,
    'aria-label': label(c),
    'aria-pressed': selected === c.id,
    onFocus: () => setFocused(c.id),
    onClick: () => onSelect?.(c.id),
    onKeyDown: (e: KeyboardEvent<SVGGElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect?.(c.id);
      } else if (e.key === 'Escape' && selected) {
        e.preventDefault();
        onSelect?.(selected);
      } else {
        moveGraphicFocus(e, 'data-coil-id');
      }
    },
    className: 'coil-hit',
  });
  const opacity = (c: Coil) => (selected && selected !== c.id ? 0.17 : 1);
  const stroke = (c: Coil) => (selected === c.id ? 3 : 1.8);
  const trace = (c: Coil, d: string) =>
    animate && (!selected || selected === c.id) ? (
      <path
        d={d}
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeDasharray="3 22"
        className="trace-line"
        pointerEvents="none"
      />
    ) : null;
  let width = 1080,
    height = 440,
    content: React.ReactNode;
  if (view === 'linear') {
    width = linear!.width;
    height = showConnections ? linear!.height : linear!.bottom + 62;
    content = (
      <LinearWinding
        design={design}
        layout={linear!}
        selected={selected}
        hit={hit}
        animate={animate}
        showConnections={showConnections}
        showDirections={showDirections}
      />
    );
  } else if (view === 'circuit') {
    const branches = netlist(design).branches.filter(
      (b) =>
        (phase === 'all' || b.phase === phase) && (!path || b.path === path),
    );
    const maxCount = Math.max(...branches.map((b) => b.coils.length));
    width = Math.max(1080, maxCount * 135 + 270);
    height = Math.max(420, branches.length * 115 + 190);
    const left = 95,
      right = width - 95,
      startY = 135;
    const phaseYs = PHASES.map((ph) => ({
      ph,
      ys: branches
        .map((b, i) => (b.phase === ph ? startY + i * 115 : NaN))
        .filter(Number.isFinite),
    })).filter((x) => x.ys.length);
    content = (
      <>
        <text x={45} y={40} fill="#3a506d" fontSize={16}>
          {design.params.connection === 'star' ? 'Y 星形连接' : 'Δ 三角形连接'}{' '}
          · 同名节点电气相连
        </text>
        <text x={45} y={66} fill="#7e8da2" fontSize={12}>
          线圈按去边 → 回边串接；黑点表示连接节点。相电流分配至各并联支路。
        </text>
        {phaseYs.map(({ ph, ys }) => (
          <g key={ph}>
            <path
              d={`M${left},${ys[0]} V${ys.at(-1)}`}
              stroke={COLORS[ph]}
              strokeWidth={2}
            />
            <text
              x={left - 14}
              y={ys[0] - 27}
              textAnchor="middle"
              fill={COLORS[ph]}
              fontSize={14}
            >
              {ph}1 / L{PHASES.indexOf(ph) + 1}
            </text>
            <path
              d={`M${right},${ys[0]} V${ys.at(-1)}`}
              stroke={
                design.params.connection === 'star' ? '#52677c' : COLORS[ph]
              }
              strokeWidth={2}
            />
            <text
              x={right}
              y={ys[0] - 27}
              textAnchor="middle"
              fill="#52677c"
              fontSize={14}
            >
              {ph}2 /{' '}
              {design.params.connection === 'star'
                ? 'N'
                : `L${((PHASES.indexOf(ph) + 1) % 3) + 1}`}
            </text>
          </g>
        ))}
        {design.params.connection === 'star' && (
          <path
            d={`M${right},${startY} V${startY + (branches.length - 1) * 115}`}
            stroke="#52677c"
            strokeWidth={2}
          />
        )}
        {branches.map((b, i) => {
          const y = startY + i * 115,
            step = (right - left) / b.coils.length;
          return (
            <g key={b.phase + b.path}>
              <path
                d={`M${left},${y} H${right}`}
                stroke={COLORS[b.phase]}
                strokeWidth={1.8}
              />
              <circle cx={left} cy={y} r={3} fill={COLORS[b.phase]} />
              <circle cx={right} cy={y} r={3} fill="#52677c" />
              <text
                x={left - 25}
                y={y + 5}
                fill={COLORS[b.phase]}
                fontSize={12}
                textAnchor="end"
              >
                {b.path}路
              </text>
              {b.coils.map((c, j) => {
                const x = left + step * (j + 0.5),
                  d = `M${x - 31},${y} H${x - 24} q0,-22 8,-22 q8,0 8,22 q0,-22 8,-22 q8,0 8,22 q0,-22 8,-22 q8,0 8,22 H${x + 36}`;
                return (
                  <g key={c.id} {...hit(c)} opacity={opacity(c)}>
                    <title>{label(c)}</title>
                    <rect
                      x={x - 30}
                      y={y - 35}
                      width={65}
                      height={51}
                      fill="#fcfdff"
                      rx={5}
                      stroke={selected === c.id ? COLORS[c.phase] : 'none'}
                    />
                    <path
                      d={d}
                      stroke={COLORS[c.phase]}
                      strokeWidth={stroke(c)}
                      fill="none"
                    />
                    {trace(c, d)}
                    <text
                      x={x}
                      y={y + 28}
                      textAnchor="middle"
                      fill={COLORS[c.phase]}
                      fontSize={12}
                    >
                      {c.id}
                    </text>
                    <text
                      x={x}
                      y={y + 48}
                      textAnchor="middle"
                      fill="#687b94"
                      fontSize={12}
                    >
                      {c.go}L{c.goLayer} → {c.back}L{c.backLayer}
                    </text>
                    <text
                      x={x}
                      y={y - 42}
                      textAnchor="middle"
                      fill="#8090a5"
                      fontSize={12}
                    >
                      {c.turns} 匝
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
        <text x={45} y={height - 25} fill="#7e8da2" fontSize={12}>
          {path
            ? '当前显示支路子集；其余并联支路已隐藏。'
            : '全部支路按同相首尾母线并联。'}{' '}
          内部串联线与线圈表顺序一致。
        </text>
      </>
    );
  } else if (view === 'radial') {
    width = 900;
    height = 650;
    const cx = 450,
      cy = 316,
      outer = 246,
      inner = 200;
    const point = (s: number, r: number) => {
      const a = ((s - 1) / slots) * Math.PI * 2 - Math.PI / 2;
      return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
    };
    content = (
      <>
        <circle cx={cx} cy={cy} r={outer} fill="#eff3f8" stroke="#dfe6f0" />
        <circle
          cx={cx}
          cy={cy}
          r={inner - 15}
          fill="#fcfdff"
          stroke="#dfe6f0"
        />
        {Array.from({ length: slots }, (_, i) => {
          const a = point(i + 1, inner),
            b = point(i + 1, outer),
            t = point(i + 1, outer + 22);
          return (
            <g key={i}>
              <path
                d={`M${a.x},${a.y} L${b.x},${b.y}`}
                stroke="#d4deec"
                strokeWidth={slots > 90 ? 2 : 8}
              />
              {(slots <= 90 || i % Math.ceil(slots / 90) === 0) && (
                <text
                  x={t.x}
                  y={t.y + 4}
                  textAnchor="middle"
                  fill="#8392a8"
                  fontSize={12}
                >
                  {i + 1}
                </text>
              )}
            </g>
          );
        })}
        {cs.map((c) => {
          const a = point(
              c.go,
              inner + 8 + (c.goLayer - 1) * Math.min(6, 35 / layers),
            ),
            b = point(
              c.back,
              inner + 8 + (c.backLayer - 1) * Math.min(6, 35 / layers),
            );
          const d = `M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`;
          return (
            <g key={c.id} {...hit(c)} opacity={opacity(c)}>
              <title>{label(c)}</title>
              <path d={d} stroke="transparent" strokeWidth={10} fill="none" />
              <path
                d={d}
                stroke={COLORS[c.phase]}
                strokeWidth={selected === c.id ? 3 : 1.3}
                opacity={0.75}
                fill="none"
              />
              {trace(c, d)}
              <circle cx={a.x} cy={a.y} r={3} fill={COLORS[c.phase]} />
              <circle
                cx={b.x}
                cy={b.y}
                r={3}
                stroke={COLORS[c.phase]}
                fill="white"
              />
            </g>
          );
        })}
        <rect
          x={cx - 61}
          y={cy - 29}
          width={122}
          height={58}
          rx={29}
          fill="#fcfdfff2"
          stroke="#e5ebf4"
        />
        <text
          x={cx}
          y={cy - 3}
          textAnchor="middle"
          fill="#294361"
          fontSize={18}
        >
          {slots} 槽 / {design.params.poles} 极
        </text>
        <text
          x={cx}
          y={cy + 17}
          textAnchor="middle"
          fill="#90a0b6"
          fontSize={12}
        >
          定子端视 · 示意
        </text>
        <text x={45} y={620} fill="#7e8da2" fontSize={12}>
          槽号顺时针递增 · 圆内连线只表示配对，不表示实际端部形状
        </text>
      </>
    );
  } else {
    width = 1080;
    height = 550;
    const cx = 360,
      cy = 267,
      r = 194;
    const sums = design.phases.filter(
      (s) => phase === 'all' || phase === s.phase,
    );
    const max = Math.max(
      ...sums.map((s) => Math.hypot(s.vector.re, s.vector.im)),
      1,
    );
    content = (
      <>
        {[0.25, 0.5, 0.75, 1].map((s) => (
          <circle
            key={s}
            cx={cx}
            cy={cy}
            r={r * s}
            fill="none"
            stroke="#e0e7f1"
            strokeDasharray="3 5"
          />
        ))}
        <path
          d={`M${cx - r - 25},${cy} H${cx + r + 25} M${cx},${cy - r - 25} V${cy + r + 25}`}
          stroke="#cfd9e7"
        />
        {[0, 90, 180, 270].map((a) => (
          <text
            key={a}
            x={cx + (r + 40) * Math.cos((a * Math.PI) / 180)}
            y={cy - (r + 40) * Math.sin((a * Math.PI) / 180) + 5}
            textAnchor="middle"
            fill="#8493a8"
            fontSize={12}
          >
            {a}°
          </text>
        ))}
        {cs.map((c) => {
          const v = coilVector(c, design.params),
            m = Math.max(Math.hypot(v.re, v.im), 1e-12);
          return (
            <g key={c.id} {...hit(c)} opacity={opacity(c)}>
              <title>{label(c)}</title>
              <path
                d={`M${cx},${cy} L${cx + (v.re / m) * r},${cy - (v.im / m) * r}`}
                stroke={COLORS[c.phase]}
                strokeWidth={selected === c.id ? 3 : 1}
                opacity={selected === c.id ? 1 : 0.16}
              />
            </g>
          );
        })}
        {sums.map((s) => {
          const cs2 = cs.filter((c) => c.phase === s.phase);
          const v = cs2.reduce(
            (v, c) => {
              const a = coilVector(c, design.params);
              return { re: v.re + a.re, im: v.im + a.im };
            },
            { re: 0, im: 0 },
          );
          const x = cx + (v.re / max) * r,
            y = cy - (v.im / max) * r;
          return (
            <g key={s.phase}>
              <path
                d={`M${cx},${cy} L${x},${y}`}
                stroke={COLORS[s.phase]}
                strokeWidth={3}
              />
              <circle cx={x} cy={y} r={4} fill={COLORS[s.phase]} />
              <text x={x + 12} y={y - 7} fill={COLORS[s.phase]} fontSize={16}>
                {s.phase}
              </text>
            </g>
          );
        })}
        <text x={660} y={100} fill="#2d4461" fontSize={18}>
          基波相电势向量
        </text>
        <text x={660} y={128} fill="#8997aa" fontSize={12}>
          实线：所显示线圈的向量和
        </text>
        <text x={660} y={150} fill="#8997aa" fontSize={12}>
          细线：各线圈方向（单位化）
        </text>
        {sums.map((s, i) => (
          <g key={s.phase}>
            <text x={660} y={210 + i * 69} fill={COLORS[s.phase]} fontSize={16}>
              {s.phase} 相
            </text>
            <text x={730} y={210 + i * 69} fill="#526780" fontSize={16}>
              {s.angle.toFixed(2)}°
            </text>
            <text x={660} y={233 + i * 69} fill="#8997aa" fontSize={12}>
              全相 kw₁ = {s.kw.toFixed(6)}
            </text>
          </g>
        ))}
        <text x={45} y={520} fill="#7e8da2" fontSize={12}>
          电势为单位磁场下的相对量；此图不提供实际反电动势电压。
        </text>
      </>
    );
  }
  return (
    <div
      className="diagram-scroll"
      tabIndex={0}
      role="region"
      aria-label="线路图，可横向和纵向滚动"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="winding-svg"
        data-export-diagram="true"
        viewBox={`0 0 ${width} ${height}`}
        style={{
          width: `${zoom * 100}%`,
          minWidth:
            (view === 'linear'
              ? width
              : view === 'radial'
                ? 700
                : Math.min(width, 1500)) * zoom,
        }}
        role="group"
        aria-label={`${design.params.slots}槽${design.params.poles}极${VIEWS.find((x) => x[0] === view)?.[1]}，${phase === 'all' ? '全部相' : phase + '相'}`}
      >
        <title>{`${design.params.slots}槽${design.params.poles}极 ${VIEWS.find((x) => x[0] === view)?.[1]}`}</title>
        <desc>方向键切换线圈，Home / End 跳至首尾，回车或空格选择，Esc 取消选择，Tab 离开图形。</desc>
        <defs>
          <pattern
            id={`grid-${view}`}
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r=".65" fill="#d9e1ec" />
          </pattern>
        </defs>
        <rect
          width={width}
          height={height}
          fill={view === 'linear' ? '#fff' : '#fcfdff'}
        />
        {view !== 'linear' && (
          <rect width={width} height={height} fill={`url(#grid-${view})`} />
        )}
        {content}
      </svg>
    </div>
  );
}
