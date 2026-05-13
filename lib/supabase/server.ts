// Supabase SERVER clients
// ─────────────────────────────────────────────────────────────────────────────
// This module is server-only. Importing it from a client component will fail
// at build time because it pulls in `next/headers`.
//
// Two factories are exported:
//
//   createClient()       → cookie-bound client, runs AS THE LOGGED-IN USER.
//                          Use in Server Components, Route Handlers, and
//                          Server Actions when you want RLS to be enforced
//                          against the caller's session.
//
//   createAdminClient()  → service-role client, BYPASSES Row Level Security.
//                          Use ONLY in Route Handlers / Server Actions / cron
//                          jobs that need elevated access (e.g. bulk inserts
//                          from a CSV upload, admin moderation, background
//                          workers). Never return this client or its results
//                          to the client unfiltered.
//
// Security rules:
//   • SUPABASE_SERVICE_ROLE_KEY must NEVER leak into the browser bundle.
//     Next.js only inlines vars prefixed `NEXT_PUBLIC_`, so referencing the
//     un-prefixed name here is safe — but importing this file from a Client
//     Component would still break (the `next/headers` import enforces that).
//   • Treat any request handled by `createAdminClient()` as fully trusted
//     code: do your own authorization checks (auth.getUser(), role lookups,
//     etc.) before performing privileged writes.

import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types";

// Cookie-bound client — respects RLS, acts as the signed-in user.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options: CookieOptions }[]) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}

// Service-role client — bypasses RLS. Server-only. Authorize before using.
// Intentionally untyped (no Database generic): admin routes cast query results
// to domain types themselves, avoiding Supabase's finicky schema inference.
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local (server-side only)."
    );
  }

  // Belt-and-braces: refuse to construct an admin client outside a Node.js
  // runtime. `window` exists in the browser; if we ever see it here, the
  // service-role key has already been bundled and the situation is unsafe.
  if (typeof window !== "undefined") {
    throw new Error(
      "createAdminClient() must never run in the browser — service role key would leak."
    );
  }

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
