'use client';
import { useId, type SVGProps } from 'react';
import { branchColor, type Coil, type Winding } from '@/lib/winding';
import { polylinePath, type Point, type UnrolledLayout } from '@/lib/unrolled';
import { bridgePath } from '@/lib/route-clearance';

function color(c: Coil) {
  return branchColor(c.phase, c.path);
}
function Arrow({
  x,
  y,
  angle,
  stroke,
  thin = false,
  scale = 1,
  isolated = false,
}: Point & {
  angle: number;
  stroke: string;
  thin?: boolean;
  scale?: number;
  isolated?: boolean;
}) {
  return (
    <g
      transform={`translate(${x},${y}) rotate(${angle}) scale(${scale})`}
      data-arrow-isolated={isolated || undefined}
    >
      {isolated && (
        <path
          d="M-4,3 L0,0 L-4,-3"
          fill="none"
          stroke="white"
          strokeWidth={4.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      <path
        d="M-4,3 L0,0 L-4,-3"
        fill="none"
        stroke={stroke}
        strokeWidth={thin ? 1 : 1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        pointerEvents="none"
      />
    </g>
  );
}
export function LinearWinding({
  design,
  layout,
  selected,
  hit,
  animate,
  showConnections = true,
  showCoilReturns = true,
  showDirections = true,
  contextWidth = 0,
}: {
  design: Winding;
  layout: UnrolledLayout;
  selected?: string | null;
  hit: (c: Coil) => SVGProps<SVGGElement>;
  animate: boolean;
  showConnections?: boolean;
  showCoilReturns?: boolean;
  showDirections?: boolean;
  contextWidth?: number;
}) {
  const { left, right, step, top, bottom, width, height } = layout;
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const periodId = `linear-period-${instanceId}`;
  const returnMaskId = `${periodId}-return-clearance`;
  const branches = [
    ...new Map(
      layout.coils.map(({ coil }) => [`${coil.phase}:${coil.path}`, coil]),
    ).values(),
  ].sort((a, b) => a.phase.localeCompare(b.phase) || a.path - b.path);
  const fade = (...ids: string[]) =>
    selected && !ids.includes(selected) ? 0.13 : 1;
  const wire = (points: Point[], stroke: string, heavy = false) => (
    <path
      d={polylinePath(points)}
      fill="none"
      stroke={stroke}
      strokeWidth={heavy ? 2.7 : 1.7}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  );
  return (
    <>
      <text x={left - contextWidth} y={25} fill="#607086" fontSize={12}>
        槽号从左向右递增 · 槽内从左向右 L1–L{design.params.layers}
      </text>
      <text
        x={right + contextWidth}
        y={25}
        textAnchor="end"
        fill="#607086"
        fontSize={12}
      >
        U 红系 / V 绿系 / W 蓝系 · 颜色与路号对应支路
      </text>
      <g data-layer="branch-legend" aria-label="支路颜色图例">
        {branches.slice(0, 9).map((c, i) => (
          <g
            key={`${c.phase}:${c.path}`}
            transform={`translate(${left - contextWidth + i * 108},49)`}
          >
            <path d="M0,0 H20" stroke={color(c)} strokeWidth={2} />
            <text x={27} y={4} fill={color(c)} fontSize={12}>
              {c.phase} / 第{c.path}路
            </text>
          </g>
        ))}
        {branches.length > 9 && (
          <text
            x={left - contextWidth + 9 * 108}
            y={53}
            fill="#607086"
            fontSize={12}
          >
            共 {branches.length} 条 · 可筛选支路
          </text>
        )}
      </g>
      {contextWidth > 0 && (
        <defs>
          {[-1, 1].map((side) => (
            <clipPath key={side} id={`${periodId}-clip-${side}`}>
              <rect
                x={side === -1 ? left - contextWidth : right}
                y={40}
                width={contextWidth}
                height={height - 75}
              />
            </clipPath>
          ))}
        </defs>
      )}
      {showCoilReturns && showConnections && (
        <defs>
          <mask
            id={returnMaskId}
            maskUnits="userSpaceOnUse"
            x={left}
            y={bottom - 1}
            width={right - left}
            height={22}
            style={{ maskType: 'luminance' }}
          >
            <rect
              x={left}
              y={bottom - 1}
              width={right - left}
              height={22}
              fill="white"
            />
            <g fill="none" stroke="black" strokeWidth={5.5}>
              {layout.links.flatMap((link) =>
                link.pieces.map((points, i) => (
                  <path key={`${link.node}:${i}`} d={polylinePath(points)} />
                )),
              )}
              {layout.leads.map((lead) => (
                <path
                  key={`${lead.coil.id}:${lead.side}`}
                  d={polylinePath(lead.points)}
                />
              ))}
            </g>
          </mask>
        </defs>
      )}
      <g id={periodId} data-layer="one-stator-period">
        {Array.from({ length: design.params.slots }, (_, i) => (
          <g key={i} data-slot={i + 1}>
            <rect
              x={left + (i + 0.5) * step - layout.slotWidth / 2}
              y={top + 9}
              width={layout.slotWidth}
              height={bottom - top - 18}
              fill="#f9dce2"
            />
          </g>
        ))}
        {!contextWidth &&
          [left, right].map((x) => (
            <path
              key={x}
              d={`M${x},40 V${bottom + 10}`}
              stroke="#dce3ed"
              strokeDasharray="3 5"
            />
          ))}
        {showCoilReturns && (
          <g
            data-layer="coil-returns"
            aria-label="线圈后端回路示意（细线）"
            pointerEvents="none"
            mask={showConnections ? `url(#${returnMaskId})` : undefined}
          >
            {layout.coils.map(({ coil, returnPieces }) => (
              <g
                key={coil.id}
                data-coil-return={coil.id}
                opacity={fade(coil.id)}
              >
                <title>{`${coil.id} 后端回路示意 · ${coil.back}槽 L${coil.backLayer} → ${coil.go}槽 L${coil.goLayer}`}</title>
                {returnPieces.map((points, i) => (
                  <g key={i}>
                    <path
                      d={polylinePath(points)}
                      fill="none"
                      stroke="white"
                      strokeWidth={3}
                    />
                    <path
                      d={polylinePath(points)}
                      fill="none"
                      stroke={color(coil)}
                      strokeWidth={selected === coil.id ? 1.3 : 1}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </g>
                ))}
              </g>
            ))}
          </g>
        )}
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
                        : 1.7
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
                {!contextWidth &&
                  selected === coil.id &&
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
            fontSize={12}
            fontWeight={600}
            stroke="#f9dce2"
            strokeWidth={4}
            paintOrder="stroke"
            pointerEvents="none"
          >
            {i + 1}
          </text>
        ))}
        <g data-layer="direction-and-terminal-overlay" pointerEvents="none">
          {showCoilReturns &&
            showDirections &&
            layout.coils.map(({ coil }) => (
              <g key={coil.id} opacity={fade(coil.id)}>
                {layout.returnArrows[coil.id].map((arrow, i) => (
                  <g key={i} data-return-arrow={coil.id}>
                    <Arrow {...arrow} stroke={color(coil)} thin />
                  </g>
                ))}
              </g>
            ))}
          {showDirections &&
            layout.coils.map(({ coil, go, back }) => (
              <g key={coil.id} opacity={fade(coil.id)}>
                {layout.roofArrows[coil.id].map((arrow, i) => (
                  <g key={`roof-${i}`} data-roof-arrow={coil.id}>
                    <Arrow {...arrow} stroke={color(coil)} />
                  </g>
                ))}
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
                </g>
              );
            })}
        </g>
      </g>
      {contextWidth > 0 &&
        [-1, 1].map((side) => (
          <g
            key={side}
            data-periodic-context={side}
            aria-hidden="true"
            pointerEvents="none"
            opacity={0.5}
            clipPath={`url(#${periodId}-clip-${side})`}
          >
            <use
              href={`#${periodId}`}
              transform={`translate(${side * (right - left)},0)`}
            />
          </g>
        ))}
      {showConnections && (
        <g data-layer="terminal-captions" pointerEvents="none">
          {layout.leads.map((lead) => {
            const end = lead.points.at(-1)!;
            return (
              <g
                key={`${lead.coil.id}:${lead.side}`}
                opacity={fade(lead.coil.id)}
              >
                <text
                  x={end.x}
                  y={end.y + 37 + lead.labelRow * 38}
                  textAnchor="middle"
                  fill={color(lead.coil)}
                  fontSize={12}
                  fontWeight={600}
                >
                  {lead.caption}
                </text>
                <text
                  x={end.x}
                  y={end.y + 53 + lead.labelRow * 38}
                  textAnchor="middle"
                  fill="#6a7789"
                  fontSize={12}
                >
                  {lead.detail}
                </text>
              </g>
            );
          })}
        </g>
      )}
      <text
        x={left - contextWidth}
        y={(showConnections ? height : bottom + 62) - 21}
        fill="#718093"
        fontSize={11}
      >
        {showCoilReturns && '细线为线圈后端回路示意 · '}
        箭头为参考绕向 · 跨接拱桥表示跨线不相连 ·{' '}
        {contextWidth
          ? '两侧浅色为相邻周延续，不计入线圈数'
          : '跨界线圈选中后显示续接编号'}
      </text>
      {showConnections && (
        <text
          x={width - left + contextWidth}
          y={height - 21}
          textAnchor="end"
          fill="#718093"
          fontSize={11}
        >
          ↑ 首端 / ━ 尾端 · 同名节点相连
        </text>
      )}
    </>
  );
}
