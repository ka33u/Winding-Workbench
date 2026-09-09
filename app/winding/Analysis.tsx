'use client';
// Inline quantitative SVGs require the image role for their accessible chart descriptions.
/* eslint-disable jsx-a11y/prefer-tag-over-role */
import { useEffect, useId, useMemo, useState } from 'react';
import { Pause, Play, Waves } from 'lucide-react';
import { Harmonics } from './Harmonics';
import { useAnimationVisibility } from './useAnimationVisibility';
import { Slider } from '@/components/ui/slider';
import { mmf, COLORS, type Phase, type Winding } from '@/lib/winding';

export function Analysis({
  design,
  phase,
}: {
  design: Winding;
  phase: Phase | 'all';
}) {
  const angleLabelId = useId();
  const [angle, setAngle] = useState(0),
    [playing, setPlaying] = useState(false);
  const { target, visible } = useAnimationVisibility<HTMLElement>();
  useEffect(() => {
    if (!playing || !visible) return;
    let frame = 0,
      last = 0;
    const tick = (now: number) => {
      if (last) setAngle((t) => (t + Math.min(now - last, 50) * 0.035) % 360);
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, visible]);
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
  return (
    <div className="analysis-grid">
      <Harmonics design={design} phase={phase} />
      <section ref={target} className="panel analysis-panel">
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
          <span id={angleLabelId}>电流相角</span>
          <Slider
            value={[angle]}
            min={0}
            max={360}
            step={1}
            aria-labelledby={angleLabelId}
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
