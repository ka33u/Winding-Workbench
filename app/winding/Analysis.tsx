'use client';
// Inline quantitative SVGs require the image role for their accessible chart descriptions.
/* eslint-disable jsx-a11y/prefer-tag-over-role */
import { useEffect, useMemo, useState } from 'react';
import { Activity, Pause, Play, Waves } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { mmf, COLORS, PHASES, type Phase, type Winding } from '@/lib/winding';

export function Analysis({
  design,
  phase,
}: {
  design: Winding;
  phase: Phase | 'all';
}) {
  const [angle, setAngle] = useState(0),
    [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    let frame = 0,
      last = 0;
    const tick = (now: number) => {
      if (last) setAngle((t) => (t + Math.min(now - last, 50) * 0.035) % 360);
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => {
      if (mq.matches) setPlaying(false);
    };
    mq.addEventListener('change', stop);
    return () => mq.removeEventListener('change', stop);
  }, []);
  const values = useMemo(
    () => mmf(design, angle, phase),
    [design, angle, phase],
  );
  const bound = Math.max(
    1,
    design.phases[0].turns * design.params.current * 1.7,
  );
  const chartPath = values
    .map(
      (v, i) =>
        `${i ? 'H' : 'M'}${45 + (i / values.length) * 590}${i ? ' V' : ','}${146 - (v / bound) * 100} H${45 + ((i + 1) / values.length) * 590}`,
    )
    .join(' ');
  const phaseList = phase === 'all' ? PHASES : [phase];
  const harmonics = design.harmonics.filter((h) => h.order % 2 === 1);
  return (
    <div className="analysis-grid">
      <section className="panel analysis-panel">
        <div className="panel-title">
          <h3>
            <Activity size={17} />
            空间谐波绕组系数
          </h3>
          <span>|kwν|</span>
        </div>
        <svg
          viewBox="0 0 680 282"
          role="img"
          aria-label="1至25次奇次电气空间谐波绕组系数柱状图"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <g key={v}>
              <path
                d={`M45,${232 - v * 190} H645`}
                stroke="#e6ebf3"
                strokeDasharray="3 4"
              />
              <text
                x={31}
                y={237 - v * 190}
                textAnchor="end"
                fill="#8c99ac"
                fontSize={12}
              >
                {v}
              </text>
            </g>
          ))}
          {harmonics.map((h, i) => (
            <g key={h.order}>
              {phaseList.map((ph, j) => (
                <rect
                  key={ph}
                  x={52 + i * 45 + j * 9}
                  y={232 - h[ph] * 190}
                  width={phaseList.length === 1 ? 19 : 7}
                  height={Math.max(0.4, h[ph] * 190)}
                  fill={COLORS[ph]}
                  rx={2}
                >
                  <title>{`${ph} 相 ν=${h.order}，kw=${h[ph].toFixed(6)}`}</title>
                </rect>
              ))}
              <text
                x={63 + i * 45}
                y={255}
                textAnchor="middle"
                fill="#8c99ac"
                fontSize={12}
              >
                {h.order}
              </text>
            </g>
          ))}
        </svg>
        <p className="analysis-note">
          ν 为电气空间谐波次数；此图展示幅值，不是电压
          THD。非整数电气次谐波需机械阶次分析。
        </p>
      </section>
      <section className="panel analysis-panel">
        <div className="panel-title">
          <h3>
            <Waves size={17} />
            理想磁动势
          </h3>
          <button
            className="icon-button"
            aria-label={playing ? '暂停磁动势动画' : '播放磁动势动画'}
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
        </div>
        <svg
          viewBox="0 0 680 282"
          role="img"
          aria-label={`${phase === 'all' ? '三相合成' : phase + '相'}磁动势，电流相角${angle.toFixed(0)}度`}
        >
          {[46, 96, 146, 196, 246].map((y) => (
            <path
              key={y}
              d={`M45,${y} H635`}
              stroke="#e6ebf3"
              strokeDasharray="3 4"
            />
          ))}
          <text x={44} y={24} fill="#7c8ba3" fontSize={12}>
            安匝（At）
          </text>
          <text x={40} y={51} textAnchor="end" fill="#8c99ac" fontSize={12}>
            {Math.round(bound)}
          </text>
          <text x={36} y={151} textAnchor="end" fill="#8c99ac" fontSize={12}>
            0
          </text>
          <text x={40} y={251} textAnchor="end" fill="#8c99ac" fontSize={12}>
            −{Math.round(bound)}
          </text>
          <path
            d={chartPath}
            stroke={phase === 'all' ? '#4b79c6' : COLORS[phase]}
            strokeWidth={2}
            fill="none"
          />
          {[0, 90, 180, 270, 360].map((v) => (
            <text
              key={v}
              x={45 + (v / 360) * 590}
              y={273}
              textAnchor="middle"
              fill="#8c99ac"
              fontSize={12}
            >
              {v}°
            </text>
          ))}
        </svg>
        <div className="angle-control">
          <span>电流相角</span>
          <Slider
            value={[angle]}
            min={0}
            max={360}
            step={1}
            aria-label="电流相角"
            onValueChange={(v) => {
              setPlaying(false);
              setAngle(Array.isArray(v) ? v[0] : v);
            }}
          />
          <output>{angle.toFixed(0)}°</output>
        </div>
        <p className="analysis-note">
          机械角横轴 · 相电流峰值 {design.params.current} A ·
          按各路分流。未考虑磁饱和、漏磁与槽口宽度。
        </p>
      </section>
    </div>
  );
}
