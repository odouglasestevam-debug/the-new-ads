import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Client Supabase pra Server Components/Actions, usando a sessão de auth via cookies.
// Usado só pra checar "quem está logado" — leitura/escrita de dados de negócio
// (clients, appointments) usa supabaseAdmin() (service role), não este.
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // chamado de dentro de um Server Component sem permissão de escrita;
            // o middleware já cuida de renovar a sessão nesses casos.
          }
        },
      },
    }
  );
}
