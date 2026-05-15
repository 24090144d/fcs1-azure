'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Sun, Moon, Printer, CalendarDays, X } from 'lucide-react';
import Highcharts from 'highcharts';
import { KpiCard }  from '@/components/dashboard/KpiCard';
import type { ImDashboardJson, DailyBucket, KpiDef, ChartDef, ChainEntry } from '@/types/dashboard';
import { useI18n } from '@/components/layout/I18nProvider';

const HcChart = dynamic(() => import('@/components/dashboard/HcChart').then(m => m.HcChart), { ssr: false });

// ── Constants ─────────────────────────────────────────────────────────────────

const CHAIN_CHARTS = new Set(['chart_12', 'chart_13', 'chart_14', 'chart_15', 'chart_16', 'chart_17', 'chart_18', 'chart_20']);
const GAUGE_CHARTS = new Set(['eac_06', 'chart_22', 'chart_23', 'chart_24']);
const CORP_IM_TOP_IDS = new Set(['chart_18', 'chart_19', 'chart_20', 'chart_21', 'chart_22', 'chart_23', 'chart_24', 'chart_25', 'chart_26', 'chart_27']);
const CORP_IM_TOP_MAP: Array<{ code: string; id: string; title: string; note: string; formula: string }> = [
  { code: 'imc01', id: 'chart_22', title: 'Hotel Incident -> Top 10 Incident Item', note: 'Donut drilldown from hotel incident volume to top 10 incident items (incident item name).', formula: 'COUNT by hotel -> top 10 incident_item_name counts per hotel' },
  { code: 'imc02', id: 'chart_18', title: 'Total Incident vs Status by Hotel', note: 'Stacked bar by hotel status mix.', formula: 'SUM(status) by hotel' },
  { code: 'imc03', id: 'chart_19', title: 'VIP Closure Rate vs VIP Incident by Hotel', note: 'Bar + line dual-axis comparison.', formula: 'VIP total and VIP completed/VIP total' },
  { code: 'imc04', id: 'chart_26', title: 'Hotel Incident -> Top 10 Incident Category', note: 'Donut drilldown from hotel incident volume to top 10 incident categories.', formula: 'COUNT by hotel -> top 10 category counts per hotel' },
  { code: 'imc05', id: 'chart_21', title: 'Chain — Repeat Incident Rate by Hotel', note: '', formula: '' },
  { code: 'imc06', id: 'chart_23', title: 'Worldmap Incident by Hotel', note: 'Country detected from CountryCode. Labels/tooltips show per-country hotel incident counts (comma-separated when multiple hotels).', formula: 'SUM(incidents) by country_code for color; display hotel_code + incident_count list' },
  { code: 'imc07', id: 'chart_24', title: 'Hotel -> Department', note: 'Column drilldown from hotel incident volume to department incident volume, with data labels.', formula: 'COUNT by hotel -> COUNT by department' },
  { code: 'imc08', id: 'chart_25', title: 'Hotel -> Source of Complaint', note: 'Donut drilldown from hotel incident volume to source-of-complaint distribution.', formula: 'COUNT by hotel -> COUNT by source_of_complaint' },
  { code: 'imc09', id: 'chart_20', title: 'VIP vs Non-VIP by Hotel', note: 'Vertical stacked bar by hotel.', formula: 'VIP count and (Total - VIP) by hotel' },
  { code: 'imc10', id: 'chart_27', title: 'Hotel -> Booking Source', note: 'Donut drilldown from hotel incident volume to booking source distribution.', formula: 'COUNT by hotel -> COUNT by booking_source' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function mergeRecords(maps: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of maps) for (const [k, v] of Object.entries(m)) out[k] = (out[k] ?? 0) + v;
  return out;
}

function r1(n: number) { return Math.round(n * 10) / 10; }
function r2(n: number) { return Math.round(n * 100) / 100; }

const SEV_WEIGHTS: Record<string, number> = { Low: 1, Medium: 2, High: 3, Critical: 4 };
const SEV_ORDER   = ['Critical', 'High', 'Medium', 'Low'] as const;
const SEV_COLORS  = { Critical: '#dc3545', High: '#fd7e14', Medium: '#ffc107', Low: '#28a745' };
const STAT_COLORS: Record<string, string> = { Completed: '#22c55e', Cancelled: '#94a3b8' };

// ── Client-side re-aggregation from raw_daily ─────────────────────────────────

interface FilteredData {
  total: number; completed: number; cancelled: number; pending: number;
  high_crit: number; severity_sum: number; vip: number;
  byStatus:   Record<string, number>;
  bySeverity: Record<string, number>;
  byCategory: Record<string, number>;
  weekdayMap: Record<number, number>;
  monthMap:   Record<string, number>;
  weekMap:    Record<string, number>;
  days:       DailyBucket[];
}

function dateToWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  const wn = 1 + Math.round(((d.getTime() - w1.getTime()) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(wn).padStart(2, '0')}`;
}

function reAggregate(buckets: DailyBucket[], from: string, to: string): FilteredData {
  const days = buckets.filter(b => b.date >= from && b.date <= to);
  const total        = days.reduce((s, b) => s + b.total, 0);
  const completed    = days.reduce((s, b) => s + b.completed, 0);
  const cancelled    = days.reduce((s, b) => s + b.cancelled, 0);
  const pending      = days.reduce((s, b) => s + b.pending, 0);
  const high_crit    = days.reduce((s, b) => s + b.high_crit, 0);
  const severity_sum = days.reduce((s, b) => s + b.severity_sum, 0);
  const vip          = days.reduce((s, b) => s + (b.vip ?? 0), 0);
  const byStatus     = mergeRecords(days.map(b => b.by_status));
  const bySeverity   = mergeRecords(days.map(b => b.by_severity));
  const byCategory   = mergeRecords(days.map(b => b.by_category));

  const weekdayMap: Record<number, number> = {};
  const monthMap:   Record<string, number>  = {};
  const weekMap:    Record<string, number>  = {};
  for (const b of days) {
    const d  = new Date(b.date);
    const wd = d.getDay();
    weekdayMap[wd] = (weekdayMap[wd] ?? 0) + b.total;
    const mk = b.date.slice(0, 7);
    monthMap[mk] = (monthMap[mk] ?? 0) + b.total;
    const wk = dateToWeekKey(b.date);
    weekMap[wk] = (weekMap[wk] ?? 0) + b.total;
  }
  return { total, completed, cancelled, pending, high_crit, severity_sum, vip, byStatus, bySeverity, byCategory, weekdayMap, monthMap, weekMap, days };
}

function recomputeKpis(base: KpiDef[], fd: FilteredData): KpiDef[] {
  const { total, completed, cancelled, pending, severity_sum, vip } = fd;
  const closureRate = total > 0 ? (completed / total) * 100 : 0;
  const backlogRate = total > 0 ? (pending   / total) * 100 : 0;
  const avgSev      = total > 0 ? severity_sum / total       : 0;
  const hasVip      = vip > 0;
  return base.map(k => {
    if (k.id === 'kpi_01') return { ...k, value: total };
    if (k.id === 'kpi_02') return { ...k, value: r1(closureRate) };
    if (k.id === 'kpi_03') return { ...k, value: r1(backlogRate) };
    if (k.id === 'kpi_04') return { ...k, value: pending };
    if (k.id === 'kpi_05') return { ...k, value: cancelled };
    if (k.id === 'kpi_06') return { ...k, available: hasVip, value: hasVip ? r1((vip / total) * 100) : null };
    if (k.id === 'kpi_10') return { ...k, value: r2(avgSev) };
    // kpi_07 (VIP closure), kpi_08 (repeat rate), kpi_09 (avg first response) — full-period only
    return k;
  });
}

function hcOpts(o: Record<string, unknown>): Highcharts.Options {
  return o as unknown as Highcharts.Options;
}

// ── Filterable chart rebuilder ────────────────────────────────────────────────

function buildFilteredOptions(def: ChartDef, fd: FilteredData): Highcharts.Options | undefined {
  const { days, byStatus, bySeverity, byCategory, weekdayMap, monthMap, weekMap } = fd;
  const sortedDays   = days.map(d => d.date);
  const sortedMonths = Object.keys(monthMap).sort();
  const sortedWeeks  = Object.keys(weekMap).sort();
  const tickIv       = Math.max(1, Math.floor(sortedDays.length / 10));
  const topCats      = Object.entries(byCategory).sort(([,a],[,b]) => b-a).map(([k]) => k);

  const catDailyMap: Record<string, Record<string, number>> = {};
  for (const b of days) for (const [cat, cnt] of Object.entries(b.by_category)) {
    if (!catDailyMap[cat]) catDailyMap[cat] = {};
    catDailyMap[cat][b.date] = (catDailyMap[cat][b.date] ?? 0) + cnt;
  }
  const sevDailyMap: Record<string, Record<string, number>> = {};
  for (const b of days) for (const [sev, cnt] of Object.entries(b.by_severity)) {
    if (!sevDailyMap[sev]) sevDailyMap[sev] = {};
    sevDailyMap[sev][b.date] = (sevDailyMap[sev][b.date] ?? 0) + cnt;
  }
  const top5 = topCats.slice(0, 5);
  const top10 = topCats.slice(0, 10);

  function catClosureRates(cats: string[]) {
    const statusDailyMap: Record<string, Record<string, number>> = {};
    for (const b of days) for (const [st, cnt] of Object.entries(b.by_status)) {
      if (!statusDailyMap[st]) statusDailyMap[st] = {};
      for (const [cat] of Object.entries(b.by_category)) {
        // approximate: distribute status counts proportionally by day
        statusDailyMap[st][cat] = (statusDailyMap[st][cat] ?? 0) + cnt;
      }
    }
    // Use byCategory from filtered days + proportional completion
    const total = Object.values(byCategory).reduce((s,v)=>s+v,0);
    if (total === 0) return cats.map(() => 0);
    const completedTotal = fd.completed;
    return cats.map(cat => {
      const catTotal = byCategory[cat] ?? 0;
      if (catTotal === 0) return 0;
      const estCompleted = catDailyMap[cat] ? Object.values(catDailyMap[cat]).reduce((s,v)=>s+v,0) : 0;
      // We can't know per-cat status in filtered data, fall back to overall closure rate
      return r1((completedTotal / Math.max(total, 1)) * 100);
    });
  }

  switch (def.id) {
    case 'eac_01': return hcOpts({
      chart: { type: 'pie' },
      series: [{ name: 'Status', type: 'pie', innerSize: '45%',
        data: Object.entries(byStatus).sort(([,a],[,b])=>b-a).map(([name,y])=>({
          name, y, drilldown: name, ...(STAT_COLORS[name]?{color:STAT_COLORS[name]}:{})
        })) }],
      // drilldown data is full-period from stored JSON — dept breakdown always reflects all records
      drilldown: (def.options as Record<string, unknown>).drilldown,
      plotOptions: { pie: { dataLabels: { enabled: true, format: '<b>{point.name}</b><br>{point.y} ({point.percentage:.1f}%)' } } },
      tooltip: { pointFormat: '<b>{point.name}</b>: {point.y} incidents ({point.percentage:.1f}%)' },
    });
    case 'chart_03': return hcOpts({
      chart: { type: 'pie' },
      series: [{ name: 'Incidents', type: 'pie', innerSize: '45%',
        data: Object.entries(byStatus).sort(([,a],[,b])=>b-a).map(([name,y])=>({ name,y,...(STAT_COLORS[name]?{color:STAT_COLORS[name]}:{}) })) }],
      plotOptions: { pie: { dataLabels: { enabled: true, format: '<b>{point.name}</b><br>{point.y} ({point.percentage:.1f}%)' } } },
    });
    case 'eac_02': case 'chart_02': return hcOpts({
      chart: { type: def.id === 'eac_02' ? 'column' : 'pie' },
      ...(def.id === 'eac_02'
        ? { xAxis: { categories: SEV_ORDER.filter(s => bySeverity[s]) }, series: [{ name: 'Count', data: SEV_ORDER.filter(s=>bySeverity[s]).map(s=>({ y: bySeverity[s]??0, color: SEV_COLORS[s as keyof typeof SEV_COLORS] })) }] }
        : { series: [{ name:'Incidents', type:'pie', innerSize:'50%', data: SEV_ORDER.filter(s=>bySeverity[s]).map(s=>({ name:s, y:bySeverity[s], color:SEV_COLORS[s as keyof typeof SEV_COLORS] })) }] }),
      plotOptions: def.id === 'eac_02'
        ? { column: { dataLabels: { enabled: true } } }
        : { pie: { dataLabels: { enabled: true, format: '<b>{point.name}</b>: {point.percentage:.1f}%' } } },
    });
    case 'eac_03': case 'chart_04': return hcOpts({
      chart: { type: def.id === 'eac_03' ? 'areaspline' : 'spline' },
      xAxis: { categories: sortedDays, tickInterval: tickIv },
      yAxis: { title: { text: 'Incidents' }, min: 0 },
      series: [{ name: 'Incidents', data: days.map(d => d.total), ...(def.id === 'eac_03' ? { fillOpacity: 0.15 } : {}) }],
      tooltip: { shared: true },
    });
    case 'eac_04': case 'chart_01': {
      const cats = topCats.slice(0, def.id === 'chart_01' ? 999 : 10);
      return hcOpts({
        chart: { type: def.id === 'eac_04' ? 'bar' : 'column' },
        xAxis: { categories: cats },
        yAxis: { title: { text: 'Incidents' } },
        series: [{ name: 'Incidents', data: cats.map(c=>byCategory[c]??0) }],
        plotOptions: { [def.id === 'eac_04' ? 'bar' : 'column']: { dataLabels: { enabled: true } } },
      });
    }
    case 'chart_05': return hcOpts({
      chart: { type: 'column' },
      xAxis: { categories: sortedMonths },
      yAxis: { title: { text: 'Incidents' } },
      series: [{ name: 'Incidents', data: sortedMonths.map(m => monthMap[m] ?? 0) }],
      plotOptions: { column: { dataLabels: { enabled: true } } },
    });
    case 'chart_11': return hcOpts({
      chart: { type: 'column' },
      xAxis: { categories: top10 },
      yAxis: { title: { text: 'Closure Rate (%)' }, min: 0, max: 100 },
      series: [{ name: 'Closure Rate %', data: catClosureRates(top10) }],
      plotOptions: { column: { dataLabels: { enabled: true, format: '{point.y:.1f}%' } } },
      tooltip: { pointFormat: 'Closure Rate: <b>{point.y:.1f}%</b>' },
    });
    case 'chart_19': return hcOpts({
      chart: { type: 'column' },
      xAxis: { categories: sortedWeeks, tickInterval: Math.max(1, Math.floor(sortedWeeks.length / 8)) },
      yAxis: { title: { text: 'Incidents' } },
      series: [{ name: 'Incidents', data: sortedWeeks.map(w => weekMap[w] ?? 0) }],
      plotOptions: { column: { dataLabels: { enabled: sortedWeeks.length <= 16 } } },
    });
    default: return undefined;
  }
}

// ── Chain chart builder (multi-hotel comparison) ──────────────────────────────

function buildChainOptions(id: string, entries: ChainEntry[]): Highcharts.Options | undefined {
  if (entries.length < 2) return undefined; // use single-hotel fallback
  const codes = entries.map(e => e.hotel_code);

  switch (id) {
    case 'chart_12': return hcOpts({
      chart: { type: 'column' },
      xAxis: { categories: codes },
      yAxis: { title: { text: 'Incidents' } },
      series: [{ name: 'Total Incidents', data: entries.map(e => e.summary.total) }],
      plotOptions: { column: { dataLabels: { enabled: true } } },
      tooltip: { pointFormat: '<b>{point.y}</b> incidents' },
    });
    case 'chart_13': return hcOpts({
      chart: { type: 'column' },
      xAxis: { categories: codes },
      yAxis: { title: { text: 'Closure Rate (%)' }, min: 0, max: 100 },
      series: [{
        name: 'Closure Rate %', color: '#22c55e',
        data: entries.map(e => {
          const { total, completed } = e.summary;
          return total > 0 ? r1((completed / total) * 100) : 0;
        }),
      }],
      plotOptions: { column: { dataLabels: { enabled: true, format: '{point.y:.1f}%' } } },
    });
    case 'chart_14': return hcOpts({
      chart: { type: 'column' },
      xAxis: { categories: codes },
      yAxis: { title: { text: 'VIP Share (%)' }, min: 0, max: 100 },
      series: [{
        name: 'VIP Share %', color: '#f59e0b',
        data: entries.map(e => {
          const { total, vip_total } = e.summary;
          return total > 0 ? r1((vip_total / total) * 100) : 0;
        }),
      }],
      plotOptions: { column: { dataLabels: { enabled: true, format: '{point.y:.1f}%' } } },
    });
    case 'chart_15': return hcOpts({
      chart: { type: 'column' },
      xAxis: { categories: codes },
      yAxis: { title: { text: 'Avg Severity (1–4)' }, min: 0, max: 4 },
      series: [{
        name: 'Avg Severity', color: '#ef4444',
        data: entries.map(e => {
          const { total, severity_sum } = e.summary;
          return total > 0 ? r2(severity_sum / total) : 0;
        }),
      }],
      plotOptions: { column: { dataLabels: { enabled: true, format: '{point.y:.2f}' } } },
    });
    case 'chart_16': {
      // Collect all category keys across hotels, take top-6
      const allCatMap: Record<string, number> = {};
      for (const e of entries) for (const [k, v] of Object.entries(e.summary.category_map)) allCatMap[k] = (allCatMap[k] ?? 0) + v;
      const topCats = Object.entries(allCatMap).sort(([,a],[,b])=>b-a).slice(0,6).map(([k])=>k);
      return hcOpts({
        chart: { type: 'column' },
        xAxis: { categories: codes },
        yAxis: { title: { text: 'Share (%)' }, min: 0, max: 100 },
        series: topCats.map(cat => ({
          name: cat,
          data: entries.map(e => {
            const t = e.summary.total;
            return t > 0 ? r1(((e.summary.category_map[cat] ?? 0) / t) * 100) : 0;
          }),
        })),
        plotOptions: { column: { stacking: 'normal' } },
        tooltip: { pointFormat: '<b>{series.name}</b>: {point.y:.1f}%<br/>' },
      });
    }
    case 'chart_17': return hcOpts({
      chart: { type: 'column' },
      xAxis: { categories: codes },
      yAxis: { title: { text: 'Pending Rate (%)' }, min: 0, max: 100 },
      series: [{
        name: 'Pending Rate %', color: '#f97316',
        data: entries.map(e => {
          const { total, pending } = e.summary;
          return total > 0 ? r1((pending / total) * 100) : 0;
        }),
      }],
      plotOptions: { column: { dataLabels: { enabled: true, format: '{point.y:.1f}%' } } },
    });
    case 'chart_18': {
      // Top-5 depts across chain → stacked bar per hotel
      const allDeptMap: Record<string, number> = {};
      for (const e of entries) for (const [k, v] of Object.entries(e.summary.dept_map)) allDeptMap[k] = (allDeptMap[k] ?? 0) + v;
      const topDepts = Object.entries(allDeptMap).sort(([,a],[,b])=>b-a).slice(0,5).map(([k])=>k);
      if (topDepts.length === 0) return undefined;
      return hcOpts({
        chart: { type: 'column' },
        xAxis: { categories: codes },
        yAxis: { title: { text: 'Incidents' } },
        series: topDepts.map(dept => ({
          name: dept,
          data: entries.map(e => e.summary.dept_map[dept] ?? 0),
        })),
        plotOptions: { column: { stacking: 'normal' } },
        tooltip: { pointFormat: '<b>{series.name}</b>: {point.y}<br/>' },
      });
    }
    case 'chart_20': return hcOpts({
      chart: { type: 'column' },
      xAxis: { categories: codes },
      yAxis: { title: { text: 'Repeat Rate (%)' }, min: 0, max: 100 },
      series: [{
        name: 'Repeat Rate %', color: '#f59e0b',
        data: entries.map(e => {
          const { total, repeat_count } = e.summary;
          return total > 0 ? r1((repeat_count / total) * 100) : 0;
        }),
      }],
      plotOptions: { column: { dataLabels: { enabled: true, format: '{point.y:.1f}%' } } },
    });
    default: return undefined;
  }
}

function buildCorpImOptions(id: string, entries: ChainEntry[], worldMapData?: Record<string, unknown> | null): Highcharts.Options | undefined {
  if (entries.length < 2) return undefined;
  const codes = entries.map(e => e.hotel_code);
  const statusKeys = Array.from(
    new Set(entries.flatMap((e) => Object.keys(e.summary.status_map ?? {}))),
  ).sort((a, b) => {
    const rank = (k: string) => (k === 'Completed' ? 0 : k === 'Pending' ? 1 : k === 'Cancelled' ? 2 : 3);
    return rank(a) - rank(b) || a.localeCompare(b);
  });

  if (id === 'chart_18') {
    return hcOpts({
      chart: { type: 'bar' },
      xAxis: { categories: codes },
      yAxis: { min: 0, title: { text: 'Incidents' } },
      plotOptions: { series: { stacking: 'normal' } },
      series: statusKeys.map((status) => ({
        type: 'bar',
        name: status,
        data: entries.map((e) => e.summary.status_map[status] ?? 0),
      })),
      tooltip: { shared: true },
    });
  }

  if (id === 'chart_19') {
    return hcOpts({
      chart: { type: 'column' },
      xAxis: { categories: codes },
      yAxis: [
        { title: { text: 'VIP Incidents' }, min: 0 },
        { title: { text: 'VIP Closure Rate (%)' }, opposite: true, min: 0, max: 100 },
      ],
      series: [
        {
          type: 'column',
          name: 'VIP Incidents',
          data: entries.map((e) => e.summary.vip_total),
          color: '#0E7470',
        },
        {
          type: 'spline',
          name: 'VIP Closure Rate %',
          yAxis: 1,
          data: entries.map((e) => {
            const total = e.summary.vip_total;
            return total > 0 ? r1((e.summary.vip_completed / total) * 100) : 0;
          }),
          color: '#C55A10',
        },
      ],
      tooltip: { shared: true },
    });
  }

  if (id === 'chart_20') {
    return hcOpts({
      chart: { type: 'column' },
      xAxis: { categories: codes },
      yAxis: { min: 0, title: { text: 'Incidents' } },
      plotOptions: { series: { stacking: 'normal' } },
      series: [
        {
          type: 'column',
          name: 'VIP',
          data: entries.map((e) => e.summary.vip_total),
          color: '#0E7470',
        },
        {
          type: 'column',
          name: 'Non-VIP',
          data: entries.map((e) => Math.max(e.summary.total - e.summary.vip_total, 0)),
          color: '#C55A10',
        }
      ],
      tooltip: { shared: true },
    });
  }

  if (id === 'chart_21') return buildChainOptions('chart_20', entries); // Repeat rate
  if (id === 'chart_22') {
    const topLevel = entries.map((e) => ({
      name: e.hotel_code,
      y: e.summary.total,
      drilldown: e.hotel_code,
    }));
    const drillSeries = entries.map((e) => ({
      id: e.hotel_code,
      name: `${e.hotel_code} Top 10`,
      type: 'pie' as const,
      innerSize: '45%',
      data: Object.entries(((e.summary as { item_map?: Record<string, number> }).item_map) ?? e.summary.category_map ?? {})
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([name, y]) => ({ name, y })),
    }));
    return hcOpts({
      chart: { type: 'pie' },
      series: [{
        name: 'Hotel Incidents',
        type: 'pie',
        innerSize: '45%',
        data: topLevel,
      }],
      drilldown: { series: drillSeries },
      tooltip: { pointFormat: '<b>{point.y}</b> incidents' },
    });
  }
  if (id === 'chart_23') {
    if (!worldMapData) return undefined;
    const countryAgg = new Map<string, { total: number; hotels: string[] }>();
    for (const e of entries) {
      const code = String(e.country_code ?? '').trim().toLowerCase();
      if (!code) continue;
      const prev = countryAgg.get(code) ?? { total: 0, hotels: [] };
      prev.total += e.summary.total;
      prev.hotels.push(`${e.hotel_code} ${e.summary.total}`);
      countryAgg.set(code, prev);
    }
    const mapDataPoints = Array.from(countryAgg.entries()).map(([code, agg]) => ({
      'hc-key': code,
      value: agg.total,
      labelrank: agg.total,
      custom: {
        hotels: agg.hotels.join(', '),
        countryCode: code.toUpperCase(),
      },
    }));
    return hcOpts({
      chart: { type: 'map' },
      mapNavigation: { enabled: true },
      colorAxis: {
        min: 0,
        minColor: '#E6F4F1',
        maxColor: '#0E7470',
      },
      series: [{
        type: 'map',
        name: 'Hotel Incidents',
        mapData: worldMapData,
        data: mapDataPoints.map((p) => ({
          code: (p.custom.countryCode ?? '').toUpperCase(),
          value: p.value,
          custom: p.custom,
        })),
        joinBy: ['iso-a2', 'code'],
        borderColor: '#B9A88A',
        nullColor: '#F4EEE4',
        states: { hover: { color: '#C55A10' } },
        dataLabels: {
          enabled: true,
          allowOverlap: false,
          crop: false,
          overflow: 'allow',
          padding: 2,
          useHTML: true,
          formatter: function (this: { point?: { options?: { custom?: { hotels?: string } }; series?: { chart?: { fullscreen?: { isOpen?: boolean } } } } }) {
            const hotels = this.point?.options?.custom?.hotels ?? '';
            const isFullscreen = this.point?.series?.chart?.fullscreen?.isOpen === true;
            const size = isFullscreen ? 16 : 8;
            return `<span style="font-size:${size}px;line-height:1.2;font-weight:700">${hotels}</span>`;
          },
          style: {
            fontSize: '8px',
            fontWeight: '600',
            textOutline: 'none',
          },
        },
      } as unknown as Highcharts.SeriesOptionsType],
      tooltip: {
        useHTML: true,
        pointFormatter: function (this: Highcharts.Point) {
          const hotels = (this.options as { custom?: { hotels?: string } }).custom?.hotels ?? '';
          const cc = (this.options as { custom?: { countryCode?: string } }).custom?.countryCode ?? this.name;
          return `<b>${cc}</b><br/>Hotels: ${hotels || '-'}`;
        },
      },
    });
  }
  if (id === 'chart_24') {
    const topLevel = entries.map((e) => ({
      name: e.hotel_code,
      y: e.summary.total,
      drilldown: `hotel:${e.hotel_code}`,
    }));
    const drillSeries: Array<{
      id: string;
      name: string;
      type: 'column';
      data: Array<{ name: string; y: number; drilldown?: string }>;
    }> = [];

    for (const e of entries) {
      const hotel = e.hotel_code;
      const topDepts = Object.entries(e.summary.dept_map ?? {})
        .sort(([, a], [, b]) => b - a);

      drillSeries.push({
        id: `hotel:${hotel}`,
        name: `${hotel} Departments`,
        type: 'column',
        data: topDepts.map(([dept, total]) => ({ name: dept, y: total })),
      });
    }

    return hcOpts({
      chart: { type: 'column' },
      xAxis: { type: 'category' },
      yAxis: { title: { text: 'Incidents' }, min: 0 },
      plotOptions: { column: { dataLabels: { enabled: true, format: '{point.y}' } } },
      series: [{
        name: 'Incidents',
        type: 'column',
        data: topLevel,
      }],
      drilldown: { series: drillSeries },
      tooltip: { pointFormat: '<b>{point.y}</b> incidents' },
    });
  }
  if (id === 'chart_25') {
    const topHotels = entries
      .map((e) => ({ hotel: e.hotel_code, total: e.summary.total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
    if (topHotels.length === 0) return undefined;

    const drillSeries: Array<{
      id: string;
      name: string;
      type: 'pie';
      innerSize: string;
      data: Array<{ name: string; y: number }>;
    }> = topHotels.map((h) => {
      const entry = entries.find((e) => e.hotel_code === h.hotel);
      const rows = Object.entries(entry?.summary.source_map ?? {})
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([name, y]) => ({ name, y }));
      return {
        id: `h:${h.hotel}`,
        name: `${h.hotel} Source of Complaint`,
        type: 'pie',
        innerSize: '45%',
        data: rows.length > 0 ? rows : [{ name: 'Unknown', y: 0 }],
      };
    });

    return hcOpts({
      chart: { type: 'pie' },
      series: [{
        name: 'Incidents',
        type: 'pie',
        innerSize: '45%',
        data: topHotels.map((h) => ({ name: h.hotel, y: h.total, drilldown: `h:${h.hotel}` })),
      }],
      drilldown: {
        series: drillSeries,
      },
      tooltip: { pointFormat: '<b>{point.y}</b> incidents' },
    });
  }
  if (id === 'chart_26') {
    const topLevel = entries.map((e) => ({
      name: e.hotel_code,
      y: e.summary.total,
      drilldown: e.hotel_code,
    }));
    const drillSeries = entries.map((e) => ({
      id: e.hotel_code,
      name: `${e.hotel_code} Top 10`,
      type: 'pie' as const,
      innerSize: '45%',
      data: Object.entries(e.summary.category_map ?? {})
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([name, y]) => ({ name, y })),
    }));
    return hcOpts({
      chart: { type: 'pie' },
      series: [{
        name: 'Incidents',
        type: 'pie',
        innerSize: '45%',
        data: topLevel,
      }],
      drilldown: { series: drillSeries },
      tooltip: { pointFormat: '<b>{point.y}</b> incidents' },
    });
  }
  if (id === 'chart_27') {
    const topHotels = entries
      .map((e) => ({ hotel: e.hotel_code, total: e.summary.total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
    if (topHotels.length === 0) return undefined;
    return hcOpts({
      chart: { type: 'pie' },
      series: [{
        name: 'Incidents',
        type: 'pie',
        innerSize: '45%',
        data: topHotels.map((h) => ({ name: h.hotel, y: h.total, drilldown: h.hotel })),
      }],
      drilldown: {
        series: topHotels.map((h) => {
          const entry = entries.find((e) => e.hotel_code === h.hotel);
          const booking = (entry?.summary as { booking_map?: Record<string, number> } | undefined)?.booking_map ?? {};
          const primaryRows = Object.entries(booking)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([name, y]) => ({ name, y }));
          const sourceFallback = Object.entries(entry?.summary.source_map ?? {})
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([name, y]) => ({ name, y }));
          const rows = primaryRows.length > 0
            ? primaryRows
            : (sourceFallback.length > 0 ? sourceFallback : [{ name: 'Unknown', y: entry?.summary.total ?? 0 }]);
          return {
            id: h.hotel,
            name: `${h.hotel} Booking Source`,
            type: 'pie' as const,
            innerSize: '45%',
            data: rows,
          };
        }),
      },
      tooltip: { pointFormat: '<b>{point.y}</b> incidents' },
    });
  }

  return undefined;
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionHead({ label, dark }: { label: string; dark: boolean }) {
  return (
    <div className="print-section-head flex items-center gap-4">
      <span
        className="font-mono uppercase shrink-0"
        style={{
          fontSize:      '0.625rem',
          letterSpacing: '0.18em',
          color: dark ? '#6B6560' : '#8A857E',
        }}
      >
        {label}
      </span>
      <div
        className="flex-1 h-px"
        style={{ background: dark ? '#302D2A' : '#D9C8A8' }}
        aria-hidden
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DashboardClient({ data, chainEntries = [] }: { data: ImDashboardJson; chainEntries?: ChainEntry[] }) {
  const isJo = data.meta.schema === 'jo-v1';
  const isCorp = String(data.meta.hotel_code ?? '').toUpperCase() === 'CORP';
  const { t } = useI18n();
  const moduleLabel = isJo ? 'JO' : 'IM';
  const contextTitle = isCorp
    ? `${(data.meta.chain_code ?? 'CORP').toUpperCase()} · ${moduleLabel}`
    : data.meta.hotel_name
    ? `${data.meta.hotel_name} · ${data.meta.hotel_code ?? ''} · ${moduleLabel}${data.meta.country_code ? ` (${data.meta.country_code})` : ''}`
    : data.meta.source_name;
  const [dark,     setDark]     = useState(false);
  const [worldMapData, setWorldMapData] = useState<Record<string, unknown> | null>(null);
  const [dateFrom, setDateFrom] = useState(data.meta.date_range.min ?? '');
  const [dateTo,   setDateTo]   = useState(data.meta.date_range.max ?? '');
  const [filtered, setFiltered] = useState(false);

  // Sync dark class to <html> so Tailwind dark: variants work globally
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  useEffect(() => {
    if (!isCorp || isJo) return;
    let cancelled = false;
    fetch('https://code.highcharts.com/mapdata/custom/world.geo.json')
      .then((r) => r.json())
      .then((json) => { if (!cancelled) setWorldMapData(json as Record<string, unknown>); })
      .catch(() => { if (!cancelled) setWorldMapData(null); });
    return () => { cancelled = true; };
  }, [isCorp, isJo]);

  // Reflow Highcharts before print so SVGs resize to the mm-based CSS dimensions
  useEffect(() => {
    const handleBeforePrint = () => {
      Highcharts.charts.forEach(c => c?.reflow());
    };
    window.addEventListener('beforeprint', handleBeforePrint);
    return () => window.removeEventListener('beforeprint', handleBeforePrint);
  }, []);

  const applyFilter = useCallback(() => {
    if (dateFrom && dateTo && dateFrom <= dateTo) setFiltered(true);
  }, [dateFrom, dateTo]);

  const clearFilter = useCallback(() => {
    setDateFrom(data.meta.date_range.min ?? '');
    setDateTo(data.meta.date_range.max ?? '');
    setFiltered(false);
  }, [data.meta.date_range]);

  const fd = useMemo<FilteredData | null>(() => {
    if (!filtered || !dateFrom || !dateTo) return null;
    return reAggregate(data.raw_daily, dateFrom, dateTo);
  }, [filtered, dateFrom, dateTo, data.raw_daily]);

  const kpis = useMemo(() =>
    isJo ? data.kpis : (fd ? recomputeKpis(data.kpis, fd) : data.kpis),
  [fd, data.kpis, isJo]);

  const localizedKpis = useMemo(() => kpis.map((k) => ({
    ...k,
    label: t(`${isJo ? 'kpi_labels_jo' : 'kpi_labels_im'}.${k.id}`, k.label),
    note: t(`${isJo ? 'kpi_notes_jo' : 'kpi_notes_im'}.${k.id}`, k.note),
  })), [kpis, isJo, t]);

  const localizedEac = useMemo(() => data.eac.map((c) => ({
    ...c,
    title: t(`${isJo ? 'chart_titles_jo' : 'chart_titles_im'}.${c.id}`, c.title),
    note: t(`${isJo ? 'chart_notes_jo' : 'chart_notes_im'}.${c.id}`, c.note),
  })), [data.eac, isJo, t]);

  const localizedCharts = useMemo(() => data.charts.map((c) => ({
    ...c,
    title: t(`${isJo ? 'chart_titles_jo' : 'chart_titles_im'}.${c.id}`, c.title),
    note: t(`${isJo ? 'chart_notes_jo' : 'chart_notes_im'}.${c.id}`, c.note),
  })), [data.charts, isJo, t]);

  const corpImTopCharts = useMemo<ChartDef[]>(() => {
    if (isJo || !isCorp) return [];
    return CORP_IM_TOP_MAP.map((m) => ({
      id: m.id,
      title: m.title,
      options: {},
      note: m.note,
      formula: m.formula,
      filterable: false,
    }));
  }, [isJo, isCorp]);

  function chartOpts(def: ChartDef): { override?: Highcharts.Options; fullPeriod: boolean } {
    if (isCorp && !isJo && CORP_IM_TOP_IDS.has(def.id)) {
      const corpOpts = buildCorpImOptions(def.id, chainEntries, worldMapData);
      if (corpOpts) return { override: corpOpts, fullPeriod: false };
    }
    if (CHAIN_CHARTS.has(def.id)) {
      const chainOpts = buildChainOptions(def.id, chainEntries);
      if (chainOpts) return { override: chainOpts, fullPeriod: false };
    }
    if (GAUGE_CHARTS.has(def.id)) {
      const trackColor  = dark ? '#302D2A' : '#D9C8A8';
      const labelColor  = dark ? '#EDE8E0' : '#1A1714';
      const mutedColor  = dark ? '#8A857E' : '#6B6560';
      const defOpts     = def.options as Record<string, unknown>;
      const baseSeries  = defOpts.series as Array<Record<string, unknown>> | undefined;
      // Extract original format string (e.g. "<b>{point.y:.1f}%</b>") to preserve unit
      const origDl = ((defOpts.plotOptions as Record<string, unknown>)?.pie as Record<string, unknown>)?.dataLabels as Record<string, unknown> | undefined;
      const dlFormat = origDl?.format as string | undefined ?? '{point.y:.1f}';
      const gaugeOverride: Highcharts.Options = {
        chart: { type: 'pie', margin: [0, 0, 40, 0] },
        series: baseSeries?.map(s => ({
          ...s,
          data: (s.data as Array<Record<string, unknown>>)?.map((d, i) =>
            i === 1 ? { ...d, color: trackColor } : d,
          ),
        })) as Highcharts.SeriesOptionsType[],
        plotOptions: {
          pie: {
            startAngle: -90, endAngle: 90,
            center: ['50%', '80%'],
            size: '130%', innerSize: '58%',
            borderWidth: 0,
            dataLabels: {
              enabled: true,
              distance: -50,
              format: dlFormat,
              style: {
                fontSize: '20px',
                fontWeight: '700',
                fontFamily: "'Manrope', sans-serif",
                color: labelColor,
                textOutline: 'none',
              },
            } as Highcharts.SeriesPieDataLabelsOptionsObject,
          },
        },
        tooltip: { enabled: false },
        title: {
          text: `<span style="font-size:11px;color:${mutedColor};font-family:'Manrope',sans-serif;letter-spacing:0.06em">${def.title.replace('Gauge — ', '').toUpperCase()}</span>`,
          align: 'center',
          verticalAlign: 'bottom',
          y: -8,
          useHTML: true,
        },
      };
      return { override: gaugeOverride, fullPeriod: filtered };
    }
    if (isJo) return { fullPeriod: false };
    if (!fd || !def.filterable) return { fullPeriod: !def.filterable && filtered };
    const override = buildFilteredOptions(def, fd);
    return override ? { override, fullPeriod: false } : { fullPeriod: true };
  }

  // ── Color tokens ─────────────────────────────────────────────────────────
  const bg          = dark ? '#1A1916' : '#F5F0E8';
  const toolbarBg   = dark ? '#1F1D1A' : '#FAF7F2';
  const toolbarBd   = dark ? '#302D2A' : '#D9C8A8';
  const metaTitle   = dark ? '#C4B8A8' : '#1A1714';
  const metaSub     = dark ? '#6B6560' : '#8A857E';
  const inputBg     = dark ? '#252220' : '#FAF7F2';
  const inputBd     = dark ? '#3D3A36' : '#C4B090';
  const inputText   = dark ? '#EDE8E0' : '#1A1714';
  const teal        = dark ? '#14A89E' : '#0E7470';
  const orange      = dark ? '#E87030' : '#C55A10';
  const footerText  = dark ? '#4E4A46' : '#A89070';
  const footerBd    = dark ? '#252220' : '#D9C8A8';
  const naText      = dark ? '#4E4A46' : '#A89070';

  // Partition core charts
  const operationalCharts = isJo ? localizedCharts : localizedCharts.filter(c => {
    const n = parseInt(c.id.replace('chart_', ''));
    return n >= 1 && n <= 11;
  });
  const comparisonCharts = isJo ? [] : localizedCharts.filter(c => {
    const n = parseInt(c.id.replace('chart_', ''));
    if (isCorp && CORP_IM_TOP_IDS.has(c.id)) return false;
    return n >= 12 && n <= 20;
  });
  const hourlyChart = isJo || isCorp ? undefined : localizedCharts.find(c => c.id === 'chart_21');
  const gaugeCharts = isJo ? [] : localizedCharts.filter(c => GAUGE_CHARTS.has(c.id) && !(isCorp && CORP_IM_TOP_IDS.has(c.id)));
  const hasChain    = chainEntries.length >= 2;
  const corpBenchmarkRows = useMemo(() => {
    if (!isCorp || isJo || chainEntries.length === 0) return [];
    return [...chainEntries]
      .sort((a, b) => a.hotel_code.localeCompare(b.hotel_code))
      .map((e) => {
        const total = e.summary.total;
        const critical = e.summary.severity_map?.Critical ?? 0;
        const criticalPct = total > 0 ? r1((critical / total) * 100) : 0;
        const closureRate = total > 0 ? r1((e.summary.completed / total) * 100) : 0;
        return {
          hotel: e.hotel_name || e.hotel_code,
          total,
          criticalPct,
          vipCases: e.summary.vip_total,
          avgResolution: 'N/A',
          incidentPerNight: 'N/A',
          closureRate,
        };
      });
  }, [isCorp, isJo, chainEntries]);

  // c05(eac[4]) ↔ c02(eac[1])  and  c13(operationalCharts[6]) ↔ c06(eac[5])
  const reorderedEac = [...localizedEac];
  const reorderedOperational = [...operationalCharts];
  if (!isJo && reorderedEac.length > 5 && reorderedOperational.length > 6) {
    [reorderedEac[1], reorderedEac[4]] = [reorderedEac[4], reorderedEac[1]];
    const _savedEac06 = reorderedEac[5];
    reorderedEac[5] = reorderedOperational[6];
    reorderedOperational[6] = _savedEac06;
  }

  // Global chart sequence index across all groups (no reset between sections)
  let chartSequence = 0;
  const nextChartIndex = () => {
    chartSequence += 1;
    return chartSequence;
  };

  return (
    <div className="grain transition-colors print:bg-white" style={{ background: bg, minHeight: '100vh' }} data-print-root>

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-20 px-6 py-3 flex flex-wrap items-center gap-3 print-hidden"
        style={{ background: toolbarBg, borderBottom: `1px solid ${toolbarBd}` }}
      >
        {/* Meta */}
          <div className="flex-1 min-w-0">
            <h3 className="font-serif font-semibold truncate leading-snug" style={{ fontSize: '1.125rem', color: metaTitle }}>
              {contextTitle}
            </h3>
            <p className="font-mono mt-0.5" style={{ fontSize: '0.6rem', letterSpacing: '0.05em', color: metaSub }}>
            {data.meta.total_records.toLocaleString()} {t('dashboard_ui.records_suffix', 'records')}
            {' · '}{t('dashboard_ui.generated_prefix', 'Generated')} {new Date(data.meta.generated_at).toLocaleString()}
            {hasChain && ` · ${chainEntries.length} hotels in chain`}
            {isCorp && ` · Corp comparison view`}
          </p>
        </div>

        {/* Date range filter */}
        <div className="flex items-center gap-2">
          <CalendarDays size={13} style={{ color: teal }} />
          <input
            type="date" value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setFiltered(false); }}
            className="font-mono text-[0.68rem] px-2 py-1.5 outline-none focus:ring-1"
            style={{
              background: inputBg, border: `1px solid ${inputBd}`,
              color: inputText, '--tw-ring-color': teal,
            } as React.CSSProperties}
          />
          <span className="font-mono text-[0.7rem]" style={{ color: metaSub }}>→</span>
          <input
            type="date" value={dateTo}
            onChange={e => { setDateTo(e.target.value); setFiltered(false); }}
            className="font-mono text-[0.68rem] px-2 py-1.5 outline-none focus:ring-1"
            style={{
              background: inputBg, border: `1px solid ${inputBd}`,
              color: inputText, '--tw-ring-color': teal,
            } as React.CSSProperties}
          />
          <button
            type="button" onClick={applyFilter}
            className="font-mono font-medium px-3 py-1.5 transition-opacity hover:opacity-85"
            style={{ fontSize: '0.68rem', letterSpacing: '0.06em', background: teal, color: '#FAF7F2' }}
          >
            {t('dashboard_ui.filter_apply', 'Apply').toUpperCase()}
          </button>
          {filtered && (
            <button
              type="button" onClick={clearFilter}
              className="flex items-center gap-1 font-mono px-2 py-1.5 transition-opacity hover:opacity-75"
              style={{ fontSize: '0.68rem', color: teal, border: `1px solid ${teal}33` }}
            >
              <X size={11} /> {t('dashboard_ui.filter_clear', 'Clear').toUpperCase()}
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button" onClick={() => window.print()}
            className="flex items-center gap-1.5 font-mono px-3 py-1.5 transition-opacity hover:opacity-75"
            style={{ fontSize: '0.68rem', letterSpacing: '0.06em', color: orange, border: `1px solid ${orange}33` }}
          >
            <Printer size={12} /> {t('dashboard_ui.export_pdf', 'Export PDF').toUpperCase()}
          </button>
          <button
            type="button" onClick={() => setDark(d => !d)}
            className="p-1.5 transition-opacity hover:opacity-75"
            style={{ color: metaSub, border: `1px solid ${toolbarBd}` }}
            aria-label={t('dashboard_ui.toggle_dark_mode', 'Toggle dark mode')}
          >
            {dark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </div>

      <div className="px-6 pt-1 pb-5 space-y-7 max-w-screen-2xl mx-auto">

        {/* ── Print-only title (hidden on screen) ───────────────────────────── */}
        <div className="print-title hidden" style={{ borderBottom: '2px solid #0E7470', paddingBottom: '6mm' }}>
          <p className="font-serif font-bold" style={{ fontSize: '1.1rem', color: '#1A1714' }}>
            {data.meta.chain_code} — {data.meta.hotel_code} — {data.meta.hotel_name}
            {data.meta.country_code ? ` (${data.meta.country_code})` : ''}
          </p>
          <p className="font-mono" style={{ fontSize: '0.6rem', color: '#6B6560', marginTop: '3px', letterSpacing: '0.06em' }}>
            {isJo ? t('dashboard_ui.dashboard_label_jo', 'JO Dashboard') : t('dashboard_ui.dashboard_label_im', 'IM Dashboard')} · {data.meta.total_records.toLocaleString()} {t('dashboard_ui.records_suffix', 'records')} ·
            {t('dashboard_ui.generated_prefix', 'Generated')} {new Date(data.meta.generated_at).toLocaleDateString()}
          </p>
        </div>

        {/* ── KPIs ──────────────────────────────────────────────────────────── */}
        <section className="kpi-print-section">
          <div className="kpi-grid mt-0 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {localizedKpis.map(k => <KpiCard key={k.id} kpi={k} dark={dark} />)}
          </div>
          {filtered && (
            <p className="mt-1 font-mono" style={{ fontSize: '0.6rem', color: naText }}>
              KPIs filtered to {dateFrom} → {dateTo}
            </p>
          )}
        </section>

        {/* ── Corp IM top charts ───────────────────────────────────────────── */}
        {isCorp && !isJo && corpImTopCharts.length > 0 && (
          <section>
            <SectionHead label={'Corp Comparison Top 10'} dark={dark} />
            <div className="chart-grid mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              {corpImTopCharts.map((def, idx) => {
                const { override, fullPeriod } = chartOpts(def);
                return <HcChart key={def.id} def={def} dark={dark} overrideOptions={override} fullPeriod={fullPeriod} index={idx + 1} />;
              })}
            </div>
          </section>
        )}

        <section>
          <SectionHead label={t('dashboard_ui.section_charts', 'Executive Analysis Charts')} dark={dark} />
          <div className="chart-grid mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            {reorderedEac.map((def, i) => {
              const { override, fullPeriod } = chartOpts(def);
              return <HcChart key={def.id} def={def} dark={dark} overrideOptions={override} fullPeriod={fullPeriod} index={nextChartIndex()} />;
            })}
          </div>
        </section>

        {/* ── Operational ──────────────────────────────────────────────────── */}
        <section>
          <SectionHead label={isJo ? t('dashboard_ui.operational_jo', 'Operational Detail — JO View') : t('dashboard_ui.operational_im', 'Operational Detail — GM View')} dark={dark} />
          <div className="chart-grid mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            {reorderedOperational.map((def, i) => {
              const { override, fullPeriod } = chartOpts(def);
              return <HcChart key={def.id} def={def} dark={dark} overrideOptions={override} fullPeriod={fullPeriod} index={nextChartIndex()} />;
            })}
          </div>
        </section>

        {/* ── Chain Comparison ──────────────────────────────────────────────── */}
        {(!isJo || isCorp) && (
        <section>
          <SectionHead
            label={hasChain ? `${t('dashboard_ui.chain_comparison', 'Chain Comparison')} — ${chainEntries.length} ${t('dashboard_ui.hotels', 'Hotels')}` : t('dashboard_ui.chain_comparison', 'Chain Comparison')}
            dark={dark}
          />
          {!hasChain && (
            <p className="mt-1.5 mb-4 font-mono" style={{ fontSize: '0.62rem', color: naText }}>
              {t('dashboard_ui.benchmarking_hint', 'Upload CSVs for other hotels in the same chain to enable cross-hotel benchmarking.')}
            </p>
          )}
          <div className="chart-grid mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            {comparisonCharts.map((def, i) => {
              const { override, fullPeriod } = chartOpts(def);
              return <HcChart key={def.id} def={def} dark={dark} overrideOptions={override} fullPeriod={fullPeriod} index={nextChartIndex()} />;
            })}
          </div>
        </section>
        )}

        {/* ── Time / Volume detail ──────────────────────────────────────────── */}
        {!isJo && hourlyChart && (
          <section>
            <SectionHead label={t('dashboard_ui.time_patterns', 'Time Patterns')} dark={dark} />
            <div className="chart-grid mt-4 grid grid-cols-1 md:grid-cols-2 gap-5">
              <HcChart
                key={hourlyChart.id}
                def={hourlyChart}
                dark={dark}
                fullPeriod={false}
                index={nextChartIndex()}
              />
            </div>
          </section>
        )}

        {/* ── Gauges ───────────────────────────────────────────────────────── */}
        {!isJo && gaugeCharts.length > 0 && (
          <section>
            <SectionHead label={t('dashboard_ui.performance_gauges', 'Performance Gauges')} dark={dark} />
            <div className="chart-grid mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {gaugeCharts.map((def, i) => {
                const { override, fullPeriod } = chartOpts(def);
                return <HcChart key={def.id} def={def} dark={dark} overrideOptions={override} fullPeriod={fullPeriod} index={nextChartIndex()} />;
              })}
            </div>
          </section>
        )}

        {/* ── Corp benchmark table ─────────────────────────────────────── */}
        {isCorp && !isJo && corpBenchmarkRows.length > 0 && (
          <section>
            <SectionHead label={'Benchmark by Hotel Table'} dark={dark} />
            <div
              className="mt-4 overflow-x-auto"
              style={{
                background: dark ? '#252220' : '#FAF7F2',
                border: `1px solid ${dark ? '#3A3530' : '#B9A88A'}`,
                borderLeft: `4px solid ${dark ? '#14A89E' : '#0E7470'}`,
                borderRadius: '12px',
              }}
            >
              <table className="min-w-full">
                <thead>
                  <tr style={{ background: dark ? '#1F1D1A' : '#F5F0E8' }}>
                    {['Hotel', 'Total Cases', 'Critical %', 'VIP Cases', 'Avg Resolution Time', 'Incident/Night', 'Closure Rate'].map((h) => (
                      <th
                        key={h}
                        className="text-left px-3 py-2 font-mono uppercase"
                        style={{ fontSize: '0.62rem', letterSpacing: '0.08em', color: dark ? '#C4B8A8' : '#4A4540', borderBottom: `1px solid ${dark ? '#302D2A' : '#D9C8A8'}` }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {corpBenchmarkRows.map((r, idx) => (
                    <tr key={`${r.hotel}-${idx}`}>
                      <td className="px-3 py-2 font-sans" style={{ fontSize: '0.78rem', color: dark ? '#EDE8E0' : '#1A1714', borderBottom: `1px solid ${dark ? '#302D2A' : '#EFE3CF'}` }}>{r.hotel}</td>
                      <td className="px-3 py-2 font-mono" style={{ fontSize: '0.72rem', color: dark ? '#EDE8E0' : '#1A1714', borderBottom: `1px solid ${dark ? '#302D2A' : '#EFE3CF'}` }}>{r.total}</td>
                      <td className="px-3 py-2 font-mono" style={{ fontSize: '0.72rem', color: dark ? '#EDE8E0' : '#1A1714', borderBottom: `1px solid ${dark ? '#302D2A' : '#EFE3CF'}` }}>{r.criticalPct}%</td>
                      <td className="px-3 py-2 font-mono" style={{ fontSize: '0.72rem', color: dark ? '#EDE8E0' : '#1A1714', borderBottom: `1px solid ${dark ? '#302D2A' : '#EFE3CF'}` }}>{r.vipCases}</td>
                      <td className="px-3 py-2 font-mono" style={{ fontSize: '0.72rem', color: dark ? '#8A857E' : '#6B6560', borderBottom: `1px solid ${dark ? '#302D2A' : '#EFE3CF'}` }}>{r.avgResolution}</td>
                      <td className="px-3 py-2 font-mono" style={{ fontSize: '0.72rem', color: dark ? '#8A857E' : '#6B6560', borderBottom: `1px solid ${dark ? '#302D2A' : '#EFE3CF'}` }}>{r.incidentPerNight}</td>
                      <td className="px-3 py-2 font-mono" style={{ fontSize: '0.72rem', color: dark ? '#EDE8E0' : '#1A1714', borderBottom: `1px solid ${dark ? '#302D2A' : '#EFE3CF'}` }}>{r.closureRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <footer
          className="pt-6 flex items-center justify-between font-mono"
          style={{ borderTop: `1px solid ${footerBd}`, fontSize: '0.6rem', letterSpacing: '0.08em', color: footerText }}
        >
          <span>fcs1-dash · {isJo ? t('dashboard_ui.dashboard_full_label_jo', 'Job Order Dashboard') : t('dashboard_ui.dashboard_full_label_im', 'Incident Management Dashboard')}</span>
          <span>Highcharts · Supabase · Next.js</span>
        </footer>
      </div>
    </div>
  );
}
