'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Upload, BarChart2, X, Database, Pin, PinOff, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { NavChain } from '@/app/api/nav/dashboards/route';
import { APP_VERSION } from '@/lib/version';

interface AppSidebarProps {
  open:        boolean;
  onClose:     () => void;
  pinned:      boolean;
  onTogglePin: () => void;
}

// ── Surface elevation system ──────────────────────────────────────────────────
// Aligned with the dashboard's card surfaces:
//
//   Dashboard outer bg ─────  #1A1916   (the "negative space" between cards)
//   Toolbar / chart cards ──  #1F1D1A → #252220
//   Sidebar surface ────────  #252220   (same plane as cards — an elevated panel)
//
// The sidebar now reads as a card-level panel anchored to the left edge,
// not a backing surface that the cards float above.

function tokens(dark: boolean) {
  return {
    // Surfaces
    bg:        dark ? '#252220' : '#1A1714',  // card elevation / ink masthead
    band:      dark ? '#1F1D1A' : '#252220',  // recessed brand & footer band
    border:    dark ? '#302D2A' : '#2D2A27',
    rule:      dark ? '#2A2724' : '#1F1C19',  // hair rule between sections
    activeBg:  dark ? '#1A1916' : '#0F0D0B',  // active = pressed into the deeper bg
    hoverBg:   dark ? '#2A2724' : '#1F1C19',  // hover = subtly lifted

    // Accents (Editorial Vintage)
    teal:      dark ? '#14A89E' : '#0E7470',
    orange:    dark ? '#E87030' : '#C55A10',

    // Text
    text:      dark ? '#EDE8E0' : '#F5F0E8',  // active / brand
    nav:       dark ? '#8A857E' : '#A89070',  // inactive nav
    dim:       dark ? '#4E4A46' : '#6B6560',  // section labels
    chrome:    dark ? '#4E4A46' : '#8A8078',  // pin/close icon
  };
}

type T = ReturnType<typeof tokens>;

// ── Section label with hair tick ──────────────────────────────────────────────

function SectionLabel({ label, T: t }: { label: string; T: T }) {
  return (
    <div className="px-4 pt-5 pb-1.5 flex items-center gap-2">
      <span
        aria-hidden
        style={{ width: '6px', height: '1px', background: t.dim }}
      />
      <span
        className="font-mono uppercase"
        style={{ fontSize: '0.575rem', letterSpacing: '0.2em', color: t.dim }}
      >
        {label}
      </span>
    </div>
  );
}

// ── Nav item — 4px left border accent (mirrors KPI / chart card spec) ─────────

function NavItem({
  href, active, onClose, T: t, children,
}: {
  href: string; active: boolean; onClose: () => void; T: T; children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <Link
      href={href}
      onClick={onClose}
      className="flex items-center gap-2.5 px-3 py-2.5 font-sans"
      style={{
        fontSize:   '0.8rem',
        fontWeight: active ? 600 : 400,
        color:      active || hovered ? t.text : t.nav,
        background: active ? t.activeBg : hovered ? t.hoverBg : 'transparent',
        borderLeft: `4px solid ${active ? t.teal : 'transparent'}`,
        transition: 'color 150ms ease, background 150ms ease, border-color 150ms ease',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </Link>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AppSidebar({ open, onClose, pinned, onTogglePin }: AppSidebarProps) {
  const pathname      = usePathname();
  const searchParams  = useSearchParams();
  const currentHotel  = searchParams.get('hotel') ?? '';
  const currentModule = searchParams.get('module') ?? 'im';
  const [chains, setChains] = useState<NavChain[]>([]);
  const [expandedChains, setExpandedChains] = useState<Set<string>>(new Set());

  // Sync dark state from <html class="dark"> (toggled by DashboardClient)
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const html = document.documentElement;
    setDark(html.classList.contains('dark'));
    const obs = new MutationObserver(() => setDark(html.classList.contains('dark')));
    obs.observe(html, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    fetch('/api/nav/dashboards')
      .then(r => r.json())
      .then(d => {
        const loaded: NavChain[] = d.chains ?? [];
        setChains(loaded);
        // Auto-expand only the chain containing the active hotel
        setExpandedChains(prev => {
          const next = new Set(prev);
          loaded.forEach(({ chain, items }) => {
            const hasActive = items.some(
              item => item.hotel_code === currentHotel && item.module === currentModule
            );
            if (hasActive) next.add(chain);
          });
          return next;
        });
      })
      .catch(() => {});
  }, [pathname, currentHotel, currentModule]);

  const t = tokens(dark);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className={['fixed inset-0 z-20', pinned ? 'lg:hidden' : ''].join(' ')}
          style={{ background: 'rgba(20,18,16,0.78)' }}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={[
          'fixed inset-y-0 left-0 z-30 w-60 flex flex-col shrink-0 print:hidden',
          'transition-transform duration-200 ease-in-out',
          pinned ? 'lg:static lg:translate-x-0' : '',
          open   ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
        style={{
          background:  t.bg,
          borderRight: `1px solid ${t.border}`,
          transition:  'background 300ms ease, border-color 300ms ease',
        }}
      >

        {/* ── Editorial masthead rule ────────────────────────────────────── */}
        <div
          aria-hidden
          style={{
            height:     '2px',
            background: `linear-gradient(to right, ${t.teal} 0%, ${t.teal}66 55%, transparent 100%)`,
            opacity:    0.85,
          }}
        />

        {/* ── Brand ──────────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-4 py-3.5 shrink-0"
          style={{ background: t.band, borderBottom: `1px solid ${t.border}` }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-6 h-6 flex items-center justify-center shrink-0"
              style={{ background: t.teal }}
            >
              <Database size={12} style={{ color: t.band }} />
            </div>
            <span className="leading-none flex items-baseline">
              <span
                className="font-serif font-bold"
                style={{ fontSize: '0.95rem', letterSpacing: '-0.015em', color: t.text }}
              >
                FCS1
              </span>
              <span
                className="font-mono"
                style={{ fontSize: '0.75rem', fontWeight: 400, color: t.teal }}
              >
                &nbsp;JO Dashbard
              </span>
            </span>
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={onTogglePin}
              className="hidden lg:flex items-center justify-center p-1.5 transition-opacity hover:opacity-70"
              style={{ color: t.chrome }}
              aria-label={pinned ? 'Unpin sidebar' : 'Pin sidebar'}
            >
              {pinned ? <Pin size={12} /> : <PinOff size={12} />}
            </button>
            <button
              onClick={onClose}
              className="lg:hidden p-1.5 transition-opacity hover:opacity-70"
              style={{ color: t.chrome }}
              aria-label="Close sidebar"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* ── Workspace nav ──────────────────────────────────────────────── */}
        <SectionLabel label="Workspace" T={t} />
        <nav className="px-1 shrink-0">
          <NavItem href="/onboarding" active={pathname === '/onboarding'} onClose={onClose} T={t}>
            <Upload size={14} strokeWidth={pathname === '/onboarding' ? 2.5 : 2} className="shrink-0" />
            Upload CSV
          </NavItem>
        </nav>

        {/* ── Hair rule ──────────────────────────────────────────────────── */}
        <div
          aria-hidden
          className="mx-4 mt-4"
          style={{ height: '1px', background: t.rule }}
        />

        {/* ── Chain sections ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {chains.map(({ chain, items }) => {
            const isExpanded = expandedChains.has(chain);
            const hasActive  = items.some(
              item => pathname === '/dashboard' &&
                      item.hotel_code === currentHotel &&
                      item.module    === currentModule
            );
            return (
              <div key={chain}>
                {/* Collapsible chain header */}
                <button
                  onClick={() => setExpandedChains(prev => {
                    const next = new Set(prev);
                    if (next.has(chain)) next.delete(chain); else next.add(chain);
                    return next;
                  })}
                  className="w-full flex items-center gap-2 px-4 pt-5 pb-1.5"
                  style={{ background: 'transparent' }}
                >
                  <span aria-hidden style={{ width: '6px', height: '1px', background: hasActive ? t.teal : t.dim, flexShrink: 0 }} />
                  <span
                    className="font-sans uppercase flex-1 text-left font-bold"
                    style={{ fontSize: '0.72rem', letterSpacing: '0.08em', color: hasActive ? t.teal : t.nav }}
                  >
                    {chain}
                  </span>
                  <ChevronRight
                    size={10}
                    style={{
                      color:     hasActive ? t.teal : t.dim,
                      transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 150ms ease',
                      flexShrink: 0,
                    }}
                  />
                </button>

                {/* Items — only when expanded */}
                {isExpanded && (
                  <nav className="px-1 space-y-px">
                    {items.map(item => {
                      const active =
                        pathname === '/dashboard' &&
                        item.hotel_code === currentHotel &&
                        item.module    === currentModule;
                      return (
                        <NavItem
                          key={`${chain}-${item.hotel_code}-${item.module}`}
                          href={item.href}
                          active={active}
                          onClose={onClose}
                          T={t}
                        >
                          <BarChart2 size={14} strokeWidth={active ? 2.5 : 2} className="shrink-0" />
                          <span className="truncate">
                            <span style={{ fontWeight: 600 }}>{item.hotel_code}</span>
                            <span style={{ opacity: 0.5 }}> · {item.label}</span>
                          </span>
                        </NavItem>
                      );
                    })}
                  </nav>
                )}
              </div>
            );
          })}
        </div>

        {/* ── User strip ─────────────────────────────────────────────────── */}
        <div
          className="px-4 py-3 shrink-0"
          style={{ borderTop: `1px solid ${t.border}`, background: t.band }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-6 h-6 flex items-center justify-center shrink-0"
              style={{
                background: `${t.teal}1a`,
                border:     `1px solid ${t.teal}40`,
              }}
            >
              <span
                className="font-mono font-bold"
                style={{ fontSize: '0.62rem', color: t.teal }}
              >
                F
              </span>
            </div>
            <div className="min-w-0 leading-tight flex-1">
              <p
                className="font-sans font-medium truncate"
                style={{ fontSize: '0.7rem', color: t.text }}
              >
                William.Choo
              </p>
              <p
                className="font-mono truncate"
                style={{ fontSize: '0.58rem', letterSpacing: '0.02em', color: t.dim, marginTop: '2px' }}
              >
                fcs1.jpn@gmail.com
              </p>
            </div>
            <span
              className="font-mono shrink-0"
              style={{
                fontSize:    '0.52rem',
                letterSpacing: '0.04em',
                color:       t.teal,
                background:  `${t.teal}18`,
                border:      `1px solid ${t.teal}30`,
                padding:     '1px 5px',
              }}
            >
              {APP_VERSION}
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
