import { createClient } from "@supabase/supabase-js";

// Service role: usado só no servidor (API routes, Server Components/Actions).
// Nunca expor essa key pro client (não tem prefixo NEXT_PUBLIC_).
export function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
