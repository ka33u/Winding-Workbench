'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  Download,
  FileJson,
  Focus,
  Minus,
  Plus,
  Route,
  X,
  ScanLine,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
} from '@/components/ui/pagination';
import {
  PHASES,
  COLORS,
  branchColor,
  type Phase,
  type Winding,
} from '@/lib/winding';
import { coilCSV, download, encodeProject } from '@/lib/project';
import { Diagram, VIEWS, visibleCoils, type View } from './Diagram';
import { Choice } from './Choice';
import { useAnimationVisibility } from './useAnimationVisibility';

export function WorkspacePanel({
  design,
  phase,
  setPhase,
  notify,
}: {
  design: Winding;
  phase: Phase | 'all';
  setPhase: (v: Phase | 'all') => void;
  notify: (s: string) => void;
}) {
  const [view, setView] = useState<View>('linear'),
    [path, setPath] = useState(0),
    [zoom, setZoom] = useState(1),
    [fitToWidth, setFitToWidth] = useState(false),
    [animate, setAnimate] = useState(false),
    [showConnections, setShowConnections] = useState(true),
    [showCoilReturns, setShowCoilReturns] = useState(true),
    [showDirections, setShowDirections] = useState(true),
    [periodicContext, setPeriodicContext] = useState(true),
    [selected, setSelected] = useState<string | null>(null),
    [page, setPage] = useState(0);
  const { target: area, visible: diagramVisible } =
    useAnimationVisibility<HTMLDivElement>();
  const coils = useMemo(
    () =>
      visibleCoils(design, phase, path).sort(
        (a, b) =>
          PHASES.indexOf(a.phase) - PHASES.indexOf(b.phase) ||
          a.path - b.path ||
          a.order - b.order,
      ),
    [design, phase, path],
  );
  const safePage = Math.min(
    page,
    Math.max(0, Math.ceil(coils.length / 30) - 1),
  );
  const selectedCoil = coils.find((c) => c.id === selected);
  const exportScope = `${phase}_${path ? `第${path}路` : '全部支路'}`;
  const exportLabel = `${phase === 'all' ? '全部相' : phase + '相'} · ${path ? `第 ${path} 路` : '全部支路'}`;
  const coilSpans = useMemo(
    () =>
      Array.from(new Set(design.coils.map((c) => Math.abs(c.span)))).sort(
        (a, b) => a - b,
      ),
    [design],
  );
  useEffect(() => {
    if (!fitToWidth || view !== 'linear') return;
    const region = area.current?.querySelector<HTMLElement>('.diagram-scroll');
    const svg = region?.querySelector<SVGSVGElement>(
      'svg[data-export-diagram]',
    );
    if (!region || !svg) return;
    const fit = () => {
      const intrinsicWidth = svg.viewBox.baseVal.width;
      if (region.clientWidth > 0 && intrinsicWidth > 0) {
        setZoom(region.clientWidth / intrinsicWidth);
        region.scrollLeft = 0;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(region);
    return () => observer.disconnect();
  }, [area, fitToWidth, view, design, phase, path, periodicContext]);
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => {
      if (mq.matches) setAnimate(false);
    };
    mq.addEventListener('change', stop);
    return () => mq.removeEventListener('change', stop);
  }, []);
  useEffect(() => {
    if (view !== 'linear') return;
    const frame = requestAnimationFrame(() => {
      const region =
        area.current?.querySelector<HTMLElement>('.diagram-scroll');
      if (!region) return;
      if (!path) {
        region.scrollLeft = 0;
        return;
      }
      // Pan only the drawing, leaving page scroll and the user's zoom intact.
      // Ignore periodic <use> copies: their anchors are not real coil entries.
      const bounds = Array.from(
        region.querySelectorAll('[data-coil-anchor]'),
        (anchor) => anchor.getBoundingClientRect(),
      );
      if (!bounds.length) return;
      const left = Math.min(...bounds.map((b) => b.left));
      const right = Math.max(...bounds.map((b) => b.right));
      const center =
        right - left < region.clientWidth
          ? (left + right) / 2
          : left + region.clientWidth / 2 - 48;
      region.scrollTo({
        left:
          region.scrollLeft +
          center -
          region.getBoundingClientRect().left -
          region.clientWidth / 2,
        behavior: 'auto',
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [area, coils, path, view]);
  function pick(id: string) {
    setSelected(id === selected ? null : id);
    const n = coils.findIndex((c) => c.id === id);
    if (n >= 0) setPage(Math.floor(n / 30));
    if (id !== selected)
      requestAnimationFrame(() => {
        const target =
          area.current?.querySelector(`[data-coil-anchor="${id}"]`) ??
          area.current?.querySelector(`[data-coil-id="${id}"]`);
        target?.scrollIntoView({
          block: 'center',
          inline: 'center',
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
        });
      });
  }
  function exportSVG() {
    const svg = area.current
      ?.querySelector('svg[data-export-diagram]')
      ?.cloneNode(true) as SVGElement | undefined;
    if (!svg) {
      notify('当前视图尚未就绪，请稍后重试。');
      return;
    }
    svg.removeAttribute('style');
    svg.setAttribute('role', 'img');
    const title = `${design.params.slots}槽${design.params.poles}极 ${VIEWS.find((v) => v[0] === view)?.[1]} · ${exportLabel}`;
    svg.setAttribute('aria-label', title);
    const titleElement = svg.querySelector('title');
    if (titleElement) titleElement.textContent = title;
    svg.querySelector('desc')?.remove();
    svg.setAttribute('width', svg.getAttribute('viewBox')!.split(' ')[2]);
    svg.setAttribute('height', svg.getAttribute('viewBox')!.split(' ')[3]);
    svg.querySelectorAll('.trace-line').forEach((el) => el.remove());
    svg
      .querySelectorAll('[tabindex]')
      .forEach((el) => el.removeAttribute('tabindex'));
    svg.querySelectorAll('[role="button"]').forEach((el) => {
      el.removeAttribute('role');
      el.removeAttribute('aria-pressed');
    });
    download(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        new XMLSerializer().serializeToString(svg),
      `绕组_${design.params.slots}槽${design.params.poles}极_${view}_${exportScope}.svg`,
      'image/svg+xml;charset=utf-8',
    );
    notify(`已导出 ${exportLabel} 的 SVG 矢量图。`);
  }
  return (
    <>
      <section className="drawing-card">
        <div className="drawing-heading">
          <div>
            <span className="eyebrow">WINDING CANVAS</span>
            <h3>
              {VIEWS.find((v) => v[0] === view)?.[1]}
              <span className="canvas-count">{coils.length} 个线圈</span>
            </h3>
            {design.params.windingType === 'concentric' && (
              <p className="field-note">
                同心式 · 实际节距{' '}
                {coilSpans.length <= 8
                  ? coilSpans.join(' / ')
                  : `${coilSpans[0]}–${coilSpans.at(-1)}（${coilSpans.length} 种）`}{' '}
                槽
              </p>
            )}
          </div>
          <div className="phase-filter" aria-label="显示相别">
            {(['all', ...PHASES] as const).map((ph) => (
              <button
                key={ph}
                aria-pressed={phase === ph}
                onClick={() => {
                  setPhase(ph);
                  setPage(0);
                  setSelected(null);
                }}
                className={phase === ph ? 'active' : ''}
              >
                {ph !== 'all' && <span style={{ background: COLORS[ph] }} />}
                {ph === 'all' ? '全部相' : ph + ' 相'}
              </button>
            ))}
          </div>
        </div>
        <Tabs
          value={view}
          onValueChange={(v) => {
            setView(v as View);
            setFitToWidth(false);
            setZoom(1);
          }}
        >
          <div className="canvas-toolbar">
            <TabsList className="view-tabs" variant="line">
              {VIEWS.map(([v, label]) => (
                <TabsTrigger value={v} key={v}>
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="canvas-tools">
              <div className="small-choice">
                <Choice
                  label="过滤并联支路"
                  value={String(path)}
                  options={[
                    ['0', '全部支路'],
                    ...Array.from(
                      { length: design.params.paths },
                      (_, i) =>
                        [String(i + 1), `第 ${i + 1} 路`] as [string, string],
                    ),
                  ]}
                  onChange={(v) => {
                    setPath(Number(v));
                    setPage(0);
                    setSelected(null);
                  }}
                />
              </div>
              <div className="zoom-tools">
                {view === 'linear' && (
                  <button
                    className="icon-button"
                    aria-label="线路图适应窗口宽度"
                    title="适应窗口宽度"
                    aria-pressed={fitToWidth}
                    onClick={() => {
                      setFitToWidth(true);
                      const svg = area.current?.querySelector(
                        'svg[data-export-diagram]',
                      ) as SVGSVGElement | null;
                      const region =
                        svg?.closest<HTMLElement>('.diagram-scroll');
                      if (
                        svg &&
                        region &&
                        region.clientWidth > 0 &&
                        svg.viewBox.baseVal.width > 0
                      ) {
                        setZoom(region.clientWidth / svg.viewBox.baseVal.width);
                        region.scrollLeft = 0;
                      }
                    }}
                  >
                    <ScanLine size={14} />
                  </button>
                )}
                <button
                  aria-label="缩小"
                  className="icon-button"
                  onClick={() => {
                    setFitToWidth(false);
                    setZoom((z) => Math.max(0.1, z - 0.25));
                  }}
                  disabled={zoom <= 0.1}
                >
                  <Minus size={14} />
                </button>
                <button
                  className="zoom-label"
                  aria-label="恢复百分之百缩放"
                  onClick={() => {
                    setFitToWidth(false);
                    setZoom(1);
                  }}
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  aria-label="放大"
                  className="icon-button"
                  onClick={() => {
                    setFitToWidth(false);
                    setZoom((z) => Math.min(2.5, z + 0.25));
                  }}
                  disabled={zoom >= 2.5}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </div>
          <div ref={area} data-animation-visible={diagramVisible}>
            {VIEWS.map(([v]) => (
              <TabsContent key={v} value={v}>
                <Diagram
                  design={design}
                  phase={phase}
                  view={v}
                  path={path}
                  selected={selectedCoil?.id}
                  onSelect={pick}
                  zoom={zoom}
                  animate={animate}
                  showConnections={showConnections}
                  showCoilReturns={showCoilReturns}
                  showDirections={showDirections}
                  periodicContext={periodicContext}
                />
              </TabsContent>
            ))}
          </div>
        </Tabs>
        <div className="drawing-footer">
          {view === 'linear' && (
            <>
              <label className="motion-switch" htmlFor="show-periodic-context">
                <Switch
                  id="show-periodic-context"
                  checked={periodicContext}
                  onCheckedChange={setPeriodicContext}
                  aria-label="显示相邻周的跨界延续"
                />
                连续展开
              </label>
              <label
                className="motion-switch"
                htmlFor="show-coil-returns"
                title="细线表示线圈后端回路，粗线表示跨接与引线；接线关系以电气接线图为准"
              >
                <Switch
                  id="show-coil-returns"
                  checked={showCoilReturns}
                  onCheckedChange={setShowCoilReturns}
                  aria-label="显示线圈下方回路线"
                />
                线圈回路线
              </label>
              <label
                className="motion-switch"
                htmlFor="show-series-connections"
              >
                <Switch
                  id="show-series-connections"
                  checked={showConnections}
                  onCheckedChange={setShowConnections}
                  aria-label="显示串联跨接和端子引线"
                />
                跨接与引线
              </label>
              <label
                className="motion-switch"
                htmlFor="show-winding-directions"
              >
                <Switch
                  id="show-winding-directions"
                  checked={showDirections}
                  onCheckedChange={setShowDirections}
                  aria-label="显示线圈参考绕向箭头"
                />
                绕向箭头
              </label>
            </>
          )}
          <label className="motion-switch" htmlFor="trace-motion">
            <Switch
              id="trace-motion"
              checked={animate}
              onCheckedChange={setAnimate}
              aria-label="线路追踪动效"
            />
            线路追踪
          </label>
          <span>滚动浏览 · 点击选择 · 方向键切换</span>
          <button className="quiet-button" onClick={exportSVG}>
            <Download size={14} />
            导出 SVG
          </button>
        </div>
        {selectedCoil && (
          <div className="coil-inspector">
            <Route size={17} />
            <strong
              style={{
                color: branchColor(selectedCoil.phase, selectedCoil.path),
              }}
            >
              {selectedCoil.id}
            </strong>
            <span>
              {selectedCoil.go}槽 L{selectedCoil.goLayer} → {selectedCoil.back}
              槽 L{selectedCoil.backLayer}
            </span>
            <span>
              {selectedCoil.turns}匝 · 第{selectedCoil.path}路 / 顺序
              {selectedCoil.order}
            </span>
            <span>
              节距 {Math.abs(selectedCoil.span)} 槽
              {selectedCoil.group ? ` · 组 ${selectedCoil.group}` : ''}
            </span>
            <button
              className="icon-button"
              aria-label="取消线圈选择"
              onClick={() => setSelected(null)}
            >
              <X size={15} />
            </button>
          </div>
        )}
      </section>
      <section className="panel coil-table-panel">
        <div className="panel-title">
          <h3>
            <Focus size={17} />
            线圈与接线明细
            <span className="table-count">
              {phase === 'all' ? '三相' : phase + '相'} · {coils.length} 个
            </span>
          </h3>
          <div className="export-actions">
            <button
              className="quiet-button"
              onClick={() => {
                download(
                  coilCSV(design, phase, path),
                  `线圈表_${design.params.slots}槽${design.params.poles}极_${exportScope}.csv`,
                  'text/csv;charset=utf-8',
                );
                notify(`已导出 ${exportLabel} 的线圈表和电气节点。`);
              }}
            >
              <Download size={14} />
              CSV
            </button>
            <button
              className="quiet-button"
              onClick={() => {
                download(
                  encodeProject(design),
                  `绕组方案_${design.params.slots}槽${design.params.poles}极.json`,
                  'application/json',
                );
                notify('已导出完整方案，可通过“打开方案”恢复。');
              }}
            >
              <FileJson size={14} />
              完整方案
            </button>
          </div>
        </div>
        <Table className="coil-table">
          <TableHeader>
            <TableRow>
              {[
                '线圈编号',
                '相别 / 支路',
                '去边（槽 / 层）',
                '回边（槽 / 层）',
                '匝数',
                '节距',
                '串联次序',
                '定位',
              ].map((s) => (
                <TableHead key={s}>{s}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {coils.slice(safePage * 30, (safePage + 1) * 30).map((c) => (
              <TableRow
                key={c.id}
                data-state={selectedCoil?.id === c.id ? 'selected' : undefined}
              >
                <TableCell>
                  <span style={{ color: branchColor(c.phase, c.path) }}>
                    {c.id}
                  </span>
                </TableCell>
                <TableCell>
                  {c.phase} / {c.path}路
                </TableCell>
                <TableCell>
                  {c.go} / L{c.goLayer}
                </TableCell>
                <TableCell>
                  {c.back} / L{c.backLayer}
                </TableCell>
                <TableCell>{c.turns}</TableCell>
                <TableCell>{Math.abs(c.span)}</TableCell>
                <TableCell>{c.order}</TableCell>
                <TableCell>
                  <button
                    className="icon-button"
                    onClick={() => pick(c.id)}
                    aria-label={`在线路图定位 ${c.id}`}
                  >
                    <Focus size={15} />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="table-footer">
          <span>
            显示 {coils.length ? safePage * 30 + 1 : 0}–
            {Math.min((safePage + 1) * 30, coils.length)} / {coils.length}{' '}
            个线圈
          </span>
          <Pagination aria-label="线圈表分页">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  text="上一页"
                  aria-label="上一页"
                  aria-disabled={safePage === 0}
                  onClick={(e) => {
                    e.preventDefault();
                    setPage((p) => Math.max(0, p - 1));
                  }}
                />
              </PaginationItem>
              <PaginationItem>
                <span className="page-number">
                  {safePage + 1} / {Math.max(1, Math.ceil(coils.length / 30))}
                </span>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  text="下一页"
                  aria-label="下一页"
                  aria-disabled={(safePage + 1) * 30 >= coils.length}
                  onClick={(e) => {
                    e.preventDefault();
                    setPage((p) =>
                      Math.min(
                        Math.max(0, Math.ceil(coils.length / 30) - 1),
                        p + 1,
                      ),
                    );
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </section>
    </>
  );
}
