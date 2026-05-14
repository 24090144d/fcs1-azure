import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/supabaseCompat';

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export async function POST() {
  try {
    const pool = getPool();

    const { rows } = await pool.query<{ table_name: string }>(
      `
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_type = 'BASE TABLE'
      order by table_name asc
      `
    );

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, truncated_tables: 0 });
    }

    const tableList = rows.map((r) => quoteIdent(r.table_name)).join(', ');
    let identityReset = true;
    try {
      await pool.query(`truncate table ${tableList} restart identity cascade`);
    } catch (e) {
      const msg = e instanceof Error ? e.message.toLowerCase() : '';
      // Azure least-privilege app roles often cannot restart owned sequences.
      if (msg.includes('must be owner of sequence')) {
        identityReset = false;
        await pool.query(`truncate table ${tableList} cascade`);
      } else {
        throw e;
      }
    }

    return NextResponse.json({
      ok: true,
      truncated_tables: rows.length,
      identity_reset: identityReset,
      message: identityReset
        ? 'Database reset completed. All data truncated; schema preserved.'
        : 'Database reset completed. All data truncated; identity counters unchanged due to DB role permissions.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown reset failure';
    console.error('[reset-database]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
