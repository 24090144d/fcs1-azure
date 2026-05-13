// Supabase BROWSER client
// ─────────────────────────────────────────────────────────────────────────────
// Use this in client components, browser-side hooks, and any code that runs
// in the user's browser. It is safe to ship to the client.
//
// Rules:
//   • Only NEXT_PUBLIC_* env vars are referenced here — anything else would be
//     undefined in the browser bundle.
//   • NEVER import the service-role key (SUPABASE_SERVICE_ROLE_KEY) in this
//     file or in any module reachable from a client component. The service
//     role key bypasses Row Level Security and would give every visitor full
//     database access if leaked into the JS bundle.
//   • For privileged operations (admin reads/writes that bypass RLS), call a
//     Next.js API route or Server Action that uses `createAdminClient()` from
//     `./server`.
//
// The publishable/anon key is safe in the browser because RLS policies on the
// database constrain what an unauthenticated or authenticated user can do.

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
