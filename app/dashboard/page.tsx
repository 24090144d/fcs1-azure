import Link from 'next/link';
import { Upload } from 'lucide-react';
import { unstable_noStore as noStore } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { AppLayout } from '@/components/layout/AppLayout';
import { DashboardClient } from './DashboardClient';
import type { ImDashboardJson, ChainEntry } from '@/types/dashboard';

export const dynamic = 'force-dynamic';

type SbResult<T> = { data: T | null; error: { message: string } | null };

function resolveDashboardTable(moduleCode?: string): 'im_dashboard_json' | 'jo_dashboard_json' {
  return String(moduleCode ?? '').toLowerCase() === 'jo' ? 'jo_dashboard_json' : 'im_dashboard_json';
}

async function fetchDashboard(hotelCode?: string, moduleCode?: string): Promise<ImDashboardJson | null> {
  noStore();
  try {
    const supabase = createAdminClient();
    type DashRow = { generated_json: ImDashboardJson };
    const table = resolveDashboardTable(moduleCode);
    const isJo = String(moduleCode ?? '').toLowerCase() === 'jo';
    const expectedSchema = String(moduleCode ?? '').toLowerCase() === 'jo' ? 'jo-v1' : 'im-v1';
    const base = supabase
      .from(table)
      .select('generated_json')
      .filter('generated_json->meta->>schema', 'eq', expectedSchema)
      .order('created_at', { ascending: false });
    let result = await (
      hotelCode
        ? base.filter('generated_json->meta->>hotel_code', 'eq', hotelCode)
        : base
    ).limit(1).maybeSingle() as unknown as SbResult<DashRow>;
    if (!result.data && isJo && hotelCode) {
      // Some historical JO rows may lack parsed hotel_code due to file-hash dedupe.
      // Fallback to latest JO dashboard row so user still sees JO data.
      result = await base.limit(1).maybeSingle() as unknown as SbResult<DashRow>;
    }
    return result.data?.generated_json ?? null;
  } catch { return null; }
}

async function fetchChainEntries(chainCode: string, currentHotelCode: string, moduleCode?: string): Promise<ChainEntry[]> {
  noStore();
  try {
    const supabase = createAdminClient();
    type DashRow = { generated_json: ImDashboardJson; created_at: string };
    const table = resolveDashboardTable(moduleCode);
    const { data: rows } = await supabase
      .from(table)
      .select('generated_json, created_at')
      .filter('generated_json->meta->>chain_code', 'eq', chainCode)
      .order('created_at', { ascending: false }) as unknown as SbResult<DashRow[]>;
    if (!rows || rows.length === 0) return [];
    const seen = new Map<string, ChainEntry>();
    for (const row of rows) {
      const json = row.generated_json;
      if (!json?.meta?.hotel_code) continue;
      if (seen.has(json.meta.hotel_code)) continue;
      if (!json.summary) continue;
      seen.set(json.meta.hotel_code, {
        hotel_code:   json.meta.hotel_code,
        hotel_name:   json.meta.hotel_name,
        country_code: json.meta.country_code ?? '',
        summary:      json.summary,
      });
    }
    return Array.from(seen.values()).sort((a, b) => a.hotel_code.localeCompare(b.hotel_code));
  } catch { return []; }
}

// Needed to allow searchParams without force-dynamic in static export
export const generateStaticParams = async () => [];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { hotel?: string; module?: string };
}) {
  const hotelCode = searchParams.hotel;
  const data = await fetchDashboard(hotelCode, searchParams.module);

  if (!data) {
    return (
      <AppLayout breadcrumbs={[{ label: 'Dashboard' }]}>
        <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
          <div className="text-center space-y-4 px-6">
            <div className="w-16 h-16 rounded-2xl bg-slate-200 flex items-center justify-center mx-auto">
              <Upload size={24} className="text-slate-500" />
            </div>
            <h1 className="font-serif text-2xl font-bold text-slate-800">No Dashboard Data</h1>
            <p className="font-sans text-sm text-slate-500 max-w-sm">
              Upload an IM or JO CSV file to generate your dashboard. The analysis will appear here automatically after finalization.
            </p>
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-2 bg-slate-800 text-white font-sans text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-slate-700 transition-colors"
            >
              <Upload size={15} />
              Upload CSV
            </Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  const chainEntries = data.meta.chain_code
    ? await fetchChainEntries(data.meta.chain_code, data.meta.hotel_code, searchParams.module)
    : [];

  const { chain_code, hotel_code, hotel_name, country_code } = data.meta;
  const hotelLabel = hotel_code
    ? [chain_code, hotel_code, hotel_name, country_code ? `(${country_code})` : '']
        .filter(Boolean).join(' - ')
    : data.meta.source_name;

  return (
    <AppLayout breadcrumbs={[{ label: 'Dashboard' }, { label: hotelLabel }]}>
      <DashboardClient data={data} chainEntries={chainEntries} />
    </AppLayout>
  );
}
