'use client';
// Interactive SVG bars remain individually accessible within the chart group.
/* eslint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-tabindex */
import { memo, useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import { COLORS, PHASES, type Winding, type Phase } from '@/lib/winding';
import {
  spatialSpectrum,
  SEQUENCE_LABELS,
  type HarmonicBasis,
} from '@/lib/harmonics';
import { Choice } from './Choice';
import { moveGraphicFocus } from './keyboard';

function HarmonicsPanel({
  design,
  phase,
}: {
  design: Winding;
  phase: Phase | 'all';
}) {
  const [basis, setBasis] = useState<HarmonicBasis>('electrical');
  const [maximum, setMaximum] = useState(25),
    [selected, setSelected] = useState(1);
  const rows = useMemo(
    () => spatialSpectrum(design, basis, maximum),
    [design, basis, maximum],
  );
  const phases = phase === 'all' ? PHASES : [phase],
    chosen = rows[Math.min(selected, maximum) - 1];
  const width = Math.max(680, maximum * 27 + 90),
    step = (width - 85) / maximum;
  const changeBasis = (v: string) => {
    const b = v as HarmonicBasis;
    setBasis(b);
    setSelected(b === 'mechanical' ? design.params.poles / 2 : 1);
    if (b === 'mechanical' && maximum < design.params.poles / 2)
      setMaximum(design.params.poles / 2 <= 60 ? 60 : 120);
  };
  return (
    <section className="panel analysis-panel">
      <div className="panel-title">
        <h3>
          <Activity size={17} />
          空间谐波绕组系数
        </h3>
        <span>|kw|</span>
      </div>
      <div className="spectrum-controls">
        <div className="small-choice">
          <Choice
            label="谐波阶次基准"
            value={basis}
            options={[
              ['electrical', '电气阶次 ν'],
              ['mechanical', '机械阶次 n'],
            ]}
            onChange={changeBasis}
          />
        </div>
        <div className="small-choice">
          <Choice
            label="谐波显示上限"
            value={String(maximum)}
            options={[
              ['25', '1–25 阶'],
              ['60', '1–60 阶'],
              ['120', '1–120 阶'],
              ['240', '1–240 阶'],
            ]}
            onChange={(v) => {
              setMaximum(Number(v));
              setSelected((n) => Math.min(n, Number(v)));
            }}
          />
        </div>
      </div>
      <div
        className="spectrum-scroll"
        tabIndex={0}
        aria-label="谐波图，可横向滚动"
      >
        <svg
          viewBox={`0 0 ${width} 282`}
          style={{ minWidth: width }}
          role="group"
          aria-label={`1至${maximum}次${basis === 'mechanical' ? '机械' : '电气'}空间谐波绕组系数`}
        >
          <desc>方向键切换谐波阶次，Home / End 跳至首尾，Tab 离开图形。</desc>
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <g key={v}>
              <path
                d={`M45,${232 - v * 190} H${width - 30}`}
                stroke="#e6ebf3"
                strokeDasharray="3 4"
              />
              <text
                x={31}
                y={237 - v * 190}
                textAnchor="end"
                fill="#63758e"
                fontSize={12}
              >
                {v}
              </text>
            </g>
          ))}
          {rows.map((row, i) => {
            const x = 45 + step * i;
            return (
              <g
                key={row.order}
                role="button"
                tabIndex={chosen.order === row.order ? 0 : -1}
                data-harmonic-order={row.order}
                aria-label={`${basis === 'mechanical' ? '机械' : '电气'}${row.order}阶，${SEQUENCE_LABELS[row.sequence]}`}
                aria-pressed={chosen.order === row.order}
                onClick={() => setSelected(row.order)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelected(row.order);
                  } else {
                    const order = moveGraphicFocus(e, 'data-harmonic-order');
                    if (order !== null) setSelected(Number(order));
                  }
                }}
                className="harmonic-bar"
              >
                <rect
                  x={x}
                  y={32}
                  width={step - 2}
                  height={202}
                  rx={3}
                  fill={
                    chosen.order === row.order
                      ? '#e9effd'
                      : row.fundamental
                        ? '#edf7f3'
                        : 'transparent'
                  }
                />
                {phases.map((ph, j) => (
                  <rect
                    key={ph}
                    x={x + 3 + (j * (step - 6)) / phases.length}
                    y={232 - row[ph] * 190}
                    width={Math.max(2, (step - 6) / phases.length - 2)}
                    height={Math.max(0.5, row[ph] * 190)}
                    fill={COLORS[ph]}
                    rx={1.5}
                  >
                    <title>{`${ph} 相 kw=${row[ph].toFixed(6)}，机械${row.mechanicalOrder}阶，电气${row.electricalOrder.toFixed(4)}阶`}</title>
                  </rect>
                ))}
                <text
                  x={x + step / 2}
                  y={253}
                  textAnchor="middle"
                  fill={row.fundamental ? '#277c69' : '#63758e'}
                  fontSize={12}
                >
                  {row.order}
                </text>
                {row.fundamental && (
                  <text
                    x={x + step / 2}
                    y={274}
                    textAnchor="middle"
                    fill="#277c69"
                    fontSize={11}
                  >
                    基波
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="spectrum-readout" aria-live="polite">
        <div>
          <strong>
            {basis === 'mechanical' ? 'n' : 'ν'} = {chosen.order}
          </strong>
          <span>{SEQUENCE_LABELS[chosen.sequence]}</span>
        </div>
        <div className="spectrum-phase-values">
          {phases.map((ph) => (
            <span key={ph} style={{ color: COLORS[ph] }}>
              {ph} {chosen[ph].toFixed(5)}
            </span>
          ))}
        </div>
        <p>
          机械 {chosen.mechanicalOrder} 阶 = 电气{' '}
          {Number(chosen.electricalOrder.toFixed(4))} 阶
          {chosen.fundamental ? ' · 工作基波' : ''}
        </p>
      </div>
      <p className="analysis-note">
        机械阶次 n = ν × 极对数；工作基波 n = {design.params.poles / 2}
        。机械图包含次谐波及偶次分量。相轴序列相对基波定义，不代表实际电压 THD
        或损耗。
        <a
          href="https://swat-em.readthedocs.io/en/latest/theory.html"
          target="_blank"
          rel="noreferrer"
        >
          计算依据
        </a>
      </p>
    </section>
  );
}

export const Harmonics = memo(HarmonicsPanel);
