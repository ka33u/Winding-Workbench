'use client';
import type { SVGProps } from 'react';
import { COLORS, type Coil, type Winding } from '@/lib/winding';
import { polylinePath, type Point, type UnrolledLayout } from '@/lib/unrolled';
import { bridgePath } from '@/lib/route-clearance';

function color(c: Coil) {
  const rgb = COLORS[c.phase]
    .slice(1)
    .match(/../g)!
    .map((s) => parseInt(s, 16));
  const tint = ((c.path - 1) % 3) * 0.16;
  return `rgb(${rgb.map((n) => Math.round(n + (255 - n) * tint)).join(',')})`;
}
function Arrow({
  x,
  y,
  angle,
  stroke,
}: Point & { angle: number; stroke: string }) {
  return (
    <path
      d="M-4,3 L0,0 L-4,-3"
      transform={`translate(${x},${y}) rotate(${angle})`}
      fill="none"
      stroke={stroke}
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      pointerEvents="none"
    />
  );
}
export function LinearWinding({
  design,
  layout,
  selected,
  hit,
  animate,
  showConnections = true,
  showDirections = true,
}: {
  design: Winding;
  layout: UnrolledLayout;
  selected?: string | null;
  hit: (c: Coil) => SVGProps<SVGGElement>;
  animate: boolean;
  showConnections?: boolean;
  showDirections?: boolean;
}) {
  const { left, right, step, top, bottom, width, height } = layout;
  const fade = (...ids: string[]) =>
    selected && !ids.includes(selected) ? 0.13 : 1;
  const wire = (points: Point[], stroke: string, heavy = false) => (
    <path
      d={polylinePath(points)}
      fill="none"
      stroke={stroke}
      strokeWidth={heavy ? 2.7 : 1.45}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  );
  return (
    <>
      <text x={left} y={25} fill="#607086" fontSize={11}>
        槽号从左向右递增 · 槽内从左向右 L1–L{design.params.layers}
      </text>
      <text x={right} y={25} textAnchor="end" fill="#607086" fontSize={11}>
        U 红 / V 绿 / W 蓝 · 同相浅色区分并联支路
      </text>
      {Array.from({ length: design.params.slots }, (_, i) => (
        <g key={i} data-slot={i + 1}>
          <rect
            x={left + (i + 0.5) * step - layout.slotWidth / 2}
            y={top + 9}
            width={layout.slotWidth}
            height={bottom - top - 18}
            fill="#fbe6ea"
          />
        </g>
      ))}
      {[left, right].map((x) => (
        <path
          key={x}
          d={`M${x},${top - 116} V${bottom + 10}`}
          stroke="#dce3ed"
          strokeDasharray="3 5"
        />
      ))}
      {showConnections &&
        layout.links.map((link) => (
          <g
            key={`${link.from.id}:${link.to.id}`}
            data-series-from={link.from.id}
            data-series-to={link.to.id}
            data-node={link.node}
            opacity={fade(link.from.id, link.to.id)}
          >
            <title>{`${link.from.id} 回边 → ${link.to.id} 去边 · ${link.node}`}</title>
            {link.pieces.map((points, i) => (
              <g key={i}>
                {wire(
                  points,
                  color(link.from),
                  selected === link.from.id || selected === link.to.id,
                )}
              </g>
            ))}
          </g>
        ))}
      {showConnections &&
        layout.leads.map((lead) => {
          const stroke = color(lead.coil);
          return (
            <g
              key={`${lead.coil.id}-${lead.side}`}
              data-lead-coil={lead.coil.id}
              data-lead-side={lead.side}
              data-lead-kind={lead.kind}
              data-node={lead.node}
              opacity={fade(lead.coil.id)}
            >
              <title>{`${lead.coil.id} ${lead.side === 'go' ? '去边' : '回边'} · ${lead.caption} · ${lead.detail}`}</title>
              {wire(lead.points, stroke, selected === lead.coil.id)}
            </g>
          );
        })}
      {showConnections && (
        <g data-layer="connection-bridges" pointerEvents="none">
          {layout.links.flatMap((link) =>
            layout.decorations[link.node].bridges.map((bridge, i) => (
              <g
                key={`${link.node}:${i}`}
                data-jump-route={link.node}
                data-jump-crossings={bridge.crossings.length}
              >
                <rect
                  x={bridge.x1 - 1}
                  y={bridge.y - 8}
                  width={bridge.x2 - bridge.x1 + 2}
                  height={12}
                  fill="white"
                />
                <path
                  d={bridgePath(bridge)}
                  fill="none"
                  stroke={color(link.from)}
                  strokeWidth={
                    selected === link.from.id || selected === link.to.id
                      ? 2.7
                      : 1.45
                  }
                  opacity={fade(link.from.id, link.to.id)}
                />
              </g>
            )),
          )}
        </g>
      )}
      {layout.coils.map(({ coil, pieces, go, back }) => (
        <g key={coil.id} {...hit(coil)} opacity={fade(coil.id)}>
          <title>{`${coil.id}：${coil.go}槽 L${coil.goLayer} → ${coil.back}槽 L${coil.backLayer}，${coil.turns}匝`}</title>
          <rect
            data-coil-anchor={coil.id}
            x={go.x - 4}
            y={top + 12}
            width={8}
            height={bottom - top - 24}
            fill="transparent"
          />
          {pieces.map((points, i) => (
            <g key={i}>
              <path
                d={polylinePath(points)}
                stroke="transparent"
                strokeWidth={8}
                fill="none"
              />
              <path
                d={polylinePath(points)}
                stroke="white"
                strokeWidth={3.6}
                fill="none"
              />
              {wire(points, color(coil), selected === coil.id)}
              {animate && (!selected || selected === coil.id) && (
                <path
                  d={polylinePath(points)}
                  fill="none"
                  stroke="white"
                  strokeWidth={1.6}
                  strokeDasharray="3 22"
                  className="trace-line"
                  pointerEvents="none"
                />
              )}
              {selected === coil.id &&
                points
                  .filter(
                    (p) =>
                      Math.abs(p.x - left) < 0.01 ||
                      Math.abs(p.x - right) < 0.01,
                  )
                  .map((p, j) => (
                    <g key={j} pointerEvents="none">
                      <circle cx={p.x} cy={p.y} r={3} fill={color(coil)} />
                      <text
                        x={Math.abs(p.x - left) < 0.01 ? left - 7 : right + 7}
                        y={p.y + 4}
                        textAnchor={
                          Math.abs(p.x - left) < 0.01 ? 'end' : 'start'
                        }
                        fontSize={10}
                        fill={color(coil)}
                        paintOrder="stroke"
                        stroke="white"
                        strokeWidth={3}
                      >
                        {coil.id}
                      </text>
                    </g>
                  ))}
            </g>
          ))}
          {[go, back].map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={1.65} fill={color(coil)} />
          ))}
        </g>
      ))}
      {Array.from({ length: design.params.slots }, (_, i) => (
        <text
          key={i}
          x={left + (i + 0.5) * step}
          y={(top + bottom) / 2 + 4}
          textAnchor="middle"
          fill="#4b4650"
          fontSize={11}
          fontWeight={600}
          stroke="#fbe6ea"
          strokeWidth={4}
          paintOrder="stroke"
          pointerEvents="none"
        >
          {i + 1}
        </text>
      ))}
      <g data-layer="direction-and-terminal-overlay" pointerEvents="none">
        {showDirections &&
          layout.coils.map(({ coil, go, back }) => (
            <g key={coil.id} opacity={fade(coil.id)}>
              {[top + 42, bottom - 35].map((y) => (
                <g key={y} data-direction-coil={coil.id}>
                  <Arrow x={go.x} y={y} angle={-90} stroke={color(coil)} />
                  <Arrow x={back.x} y={y} angle={90} stroke={color(coil)} />
                </g>
              ))}
            </g>
          ))}
        {showConnections &&
          showDirections &&
          layout.links.map((link) => (
            <g key={link.node} opacity={fade(link.from.id, link.to.id)}>
              {layout.decorations[link.node].arrows.map((arrow, i) => (
                <g key={i} data-route-arrow={link.node}>
                  <Arrow {...arrow} stroke={color(link.from)} />
                </g>
              ))}
            </g>
          ))}
        {showConnections &&
          layout.leads.map((lead) => {
            const end = lead.points.at(-1)!;
            const stroke = color(lead.coil);
            return (
              <g
                key={`${lead.coil.id}:${lead.side}`}
                opacity={fade(lead.coil.id)}
              >
                {lead.kind === 'start' ? (
                  <path
                    d={`M${end.x},${end.y - 9} l-7,10 h4 v12 h6 v-12 h4 Z`}
                    stroke={stroke}
                    fill={stroke}
                    fillOpacity={0.18}
                  />
                ) : lead.kind === 'end' ? (
                  <rect
                    x={end.x - 11}
                    y={end.y - 2}
                    width={22}
                    height={4}
                    stroke={stroke}
                    fill={stroke}
                    fillOpacity={0.16}
                  />
                ) : (
                  <path
                    d={`M${end.x},${end.y - 6} l6,6 l-6,6 l-6,-6 Z`}
                    stroke={stroke}
                    fill="white"
                  />
                )}
                <text
                  x={end.x}
                  y={end.y + 37}
                  textAnchor="middle"
                  fill={stroke}
                  fontSize={11}
                  fontWeight={600}
                >
                  {lead.caption}
                </text>
                <text
                  x={end.x}
                  y={end.y + 53}
                  textAnchor="middle"
                  fill="#6a7789"
                  fontSize={10}
                >
                  {lead.detail}
                </text>
              </g>
            );
          })}
      </g>
      <text
        x={left}
        y={(showConnections ? height : bottom + 62) - 21}
        fill="#718093"
        fontSize={11}
      >
        箭头为参考绕向 · 跨接拱桥表示跨线不相连 · 跨界线圈选中后显示续接编号
      </text>
      {showConnections && (
        <text
          x={width - left}
          y={height - 21}
          textAnchor="end"
          fill="#718093"
          fontSize={11}
        >
          ↑ 首端 / ━ 尾端 · 同名节点相连 · ◇ 接隐藏层对
        </text>
      )}
    </>
  );
}
