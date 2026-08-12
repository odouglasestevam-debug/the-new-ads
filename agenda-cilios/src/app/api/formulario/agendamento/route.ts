import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Dados que o modal de "novo agendamento" precisa pra montar os selects,
// sem precisar navegar pra uma página separada. Protegido pelo proxy (auth).
export async function GET() {
  const db = supabaseAdmin();
  const [{ data: clientes }, { data: servicos }] = await Promise.all([
    db.from("clients").select("id, name, phone").order("name"),
    db.from("services").select("id, name, price, duration_min").eq("active", true).order("name"),
  ]);

  return NextResponse.json({ clientes: clientes ?? [], servicos: servicos ?? [] });
}
