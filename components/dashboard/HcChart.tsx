'use client';

import { useRef, useEffect, useMemo } from 'react';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import type { ChartDef } from '@/types/dashboard';
import { useI18n } from '@/components/layout/I18nProvider';

// ── Optional Highcharts modules (load once) ───────────────────────────────────
if (typeof Highcharts === 'object') {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const Exp     = require('highcharts/modules/exporting');
  const ExpData = require('highcharts/modules/export-data');
  const Heatmap = require('highcharts/modules/heatmap');
  const Drill   = require('highcharts/modules/drilldown');
  if (typeof Exp     === 'function') Exp(Highcharts);
  if (typeof ExpData === 'function') ExpData(Highcharts);
  if (typeof Heatmap === 'function') Heatmap(Highcharts);
  if (typeof Drill   === 'function') Drill(Highcharts);
  /* eslint-enable @typescript-eslint/no-require-imports */
}

// ── Deep merge (avoids Highcharts.merge CJS/ESM issues) ──────────────────────
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...target };
  for (const [k, v] of Object.entries(source)) {
    if (
      v && typeof v === 'object' && !Array.isArray(v) &&
      out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])
    ) {
      out[k] = deepMerge(out[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ── Editorial Vintage Highcharts theme ───────────────────────────────────────

const LIGHT_PALETTE = ['#C55A10', '#0E7470', '#7B3F28', '#1A6E6A', '#D4774A', '#3A9E9A', '#9B6A3A', '#5A8A6A'];
const DARK_PALETTE  = ['#E87030', '#14A89E', '#C07050', '#20C4B8', '#F5A060', '#45D8CC', '#E8C078', '#88C098'];

function makeTheme(dark: boolean): Highcharts.Options {
  const text    = dark ? '#EDE8E0' : '#1A1714';
  const muted   = dark ? '#8A857E' : '#6B6560';
  const grid    = dark ? '#302D2A' : '#D9C8A8';
  const tooltip = dark ? '#1F1D1A' : '#FAF7F2';
  const palette = dark ? DARK_PALETTE : LIGHT_PALETTE;

  return {
    colors: palette,
    chart: {
      backgroundColor:     'transparent',
      plotBackgroundColor: 'transparent',
      style: {
        fontFamily: "'Manrope', system-ui, sans-serif",
      },
    },
    title:    { text: undefined, style: { color: text } },
    subtitle: { style: { color: muted } },
    xAxis: {
      gridLineColor: grid,
      lineColor:     grid,
      tickColor:     grid,
      labels: { style: { color: muted, fontSize: '10px', fontFamily: "'JetBrains Mono', monospace" } },
      title:  { style: { color: muted, fontSize: '10px' } },
    },
    yAxis: {
      gridLineColor: grid,
      lineColor:     grid,
      tickColor:     grid,
      labels: { style: { color: muted, fontSize: '10px', fontFamily: "'JetBrains Mono', monospace" } },
      title:  { style: { color: muted, fontSize: '10px' } },
    },
    legend: {
      itemStyle:      { color: text, fontWeight: '500', fontSize: '11px', fontFamily: "'Manrope', sans-serif" },
      itemHoverStyle: { color: dark ? '#FAF7F2' : '#1A1714' },
    },
    tooltip: {
      backgroundColor: tooltip,
      borderColor:     dark ? '#302D2A' : '#C4B090',
      borderRadius:    2,
      style:           { color: text, fontFamily: "'Manrope', sans-serif", fontSize: '11px' },
    },
    plotOptions: {
      series: { animation: { duration: 350 } },
    },
    exporting: {
      enabled: true,
      buttons: {
        contextButton: {
          symbolStroke: muted,
          theme: { fill: 'transparent' },
          menuItems: [
            'viewFullscreen', 'printChart', 'separator',
            'downloadPNG', 'downloadJPEG', 'downloadSVG', 'separator',
            'downloadCSV', 'downloadXLS', 'viewData',
          ],
        },
      },
    },
    navigation: {
      menuStyle:         { background: tooltip, borderColor: dark ? '#302D2A' : '#C4B090' },
      menuItemStyle:     { color: text, fontFamily: "'Manrope', sans-serif", fontSize: '12px' },
      menuItemHoverStyle:{ background: dark ? '#302D2A' : '#EDE8E0', color: text },
    },
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface HcChartProps {
  def:             ChartDef;
  dark:            boolean;
  overrideOptions?: Highcharts.Options;
  fullPeriod?:     boolean;
  index?:          number;
}

export function HcChart({ def, dark, overrideOptions, fullPeriod, index }: HcChartProps) {
  const { t } = useI18n();
  const chartRef = useRef<HighchartsReact.RefObject>(null);
  const theme    = useMemo(() => makeTheme(dark), [dark]);

  const options = useMemo<Highcharts.Options>(() => {
    const base = overrideOptions ?? (def.options as Highcharts.Options);
    return deepMerge(
      theme as unknown as Record<string, unknown>,
      base  as unknown as Record<string, unknown>,
    ) as unknown as Highcharts.Options;
  }, [theme, def.options, overrideOptions]);

  // Re-apply theme on dark/light toggle; skip if user is mid-drilldown
  useEffect(() => {
    const chart = chartRef.current?.chart;
    if (!chart) return;
    if ((chart as unknown as { drilldownLevels?: unknown[] }).drilldownLevels?.length) return;
    chart.update(theme as Highcharts.Options, true, true);
  }, [theme]);

  // ── Card surface colors ───────────────────────────────────────────────────
  const surface  = dark ? '#252220' : '#FAF7F2';
  const border   = dark ? '#302D2A' : '#D9C8A8';
  const teal     = dark ? '#14A89E' : '#0E7470';
  const titleCol = dark ? '#EDE8E0' : '#1A1714';
  const footMut  = dark ? '#6B6560' : '#8A857E';
  const footBd   = dark ? '#302D2A' : '#D9C8A8';
  const codeCol  = teal;
  const codeBg   = dark ? 'rgba(20,168,158,0.10)' : 'rgba(14,116,112,0.07)';

  return (
    <div
      className="chart-card flex flex-col overflow-hidden"
      style={{
        background:   surface,
        border:       `1px solid ${border}`,
        borderLeft:   `4px solid ${teal}`,
        borderRadius: '12px',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-1 gap-3 shrink-0">
        <h3
          className="font-serif font-semibold leading-snug flex items-center gap-2"
          style={{ fontSize: '0.9rem', color: titleCol }}
        >
          {index !== undefined && (
            <span
              className="font-mono shrink-0"
              style={{
                fontSize:      '0.62rem',
                letterSpacing: '0.04em',
                fontWeight:    700,
                color:         teal,
                background:    dark ? 'rgba(20,168,158,0.10)' : 'rgba(14,116,112,0.07)',
                border:        `1px solid ${teal}40`,
                padding:       '1px 5px',
                lineHeight:    1.4,
              }}
            >
              {String(index).padStart(2, '0')}
            </span>
          )}
          {def.title}
        </h3>
        {fullPeriod && (
          <span
            className="font-mono shrink-0"
            style={{
              fontSize:   '0.58rem',
              letterSpacing: '0.08em',
              padding:    '2px 6px',
              background: dark ? 'rgba(232,112,48,0.12)' : 'rgba(197,90,16,0.08)',
              color:      dark ? '#E87030' : '#C55A10',
              border:     `1px solid ${dark ? 'rgba(232,112,48,0.25)' : 'rgba(197,90,16,0.2)'}`,
            }}
          >
            FULL PERIOD
          </span>
        )}
      </div>

      {/* Chart canvas */}
      <div className="px-2 py-1 chart-canvas-wrap" style={{ flex: '1 1 auto' }}>
        <HighchartsReact
          ref={chartRef}
          highcharts={Highcharts}
          options={options}
          containerProps={{ style: { height: `${def.height ?? 310}px` } }}
        />
      </div>

      {/* Footer: Note + Formula */}
      <div
        className="px-4 pt-2.5 pb-3.5 space-y-1 shrink-0"
        style={{ borderTop: `1px solid ${footBd}` }}
      >
        <p
          className="font-sans leading-relaxed"
          style={{ fontSize: '0.67rem', color: footMut }}
        >
            <span className="font-semibold" style={{ color: dark ? '#C4B8A8' : '#4A4540' }}>{t('dashboard_ui.note', 'Note')}</span>
            &nbsp;{def.note}
        </p>
        <p
          className="font-sans leading-relaxed"
          style={{ fontSize: '0.67rem', color: footMut }}
        >
          <span className="font-semibold" style={{ color: dark ? '#C4B8A8' : '#4A4540' }}>{t('dashboard_ui.formula', 'Formula')}</span>
          {' '}
          <code
            className="font-mono"
            style={{
              fontSize:  '0.6rem',
              padding:   '1px 5px',
              background: codeBg,
              color:      codeCol,
              borderRadius: '2px',
            }}
          >
            {def.formula}
          </code>
        </p>
      </div>
    </div>
  );
}
