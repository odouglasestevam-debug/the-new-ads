"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { supabaseServer } from "@/lib/supabase/server";
import { sendText } from "@/lib/neogo";
import { mensagemConfirmacao } from "@/lib/messages";
import { normalizarTelefone } from "@/lib/phone";

export async function sair() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function criarCliente(formData: FormData) {
  const nome = String(formData.get("nome") ?? "").trim();
  const telefone = normalizarTelefone(String(formData.get("telefone") ?? ""));
  const notas = String(formData.get("notas") ?? "").trim() || null;

  if (!nome || !telefone) {
    throw new Error("Nome e telefone são obrigatórios.");
  }

  const db = supabaseAdmin();
  const { error } = await db.from("clients").insert({ name: nome, phone: telefone, notes: notas });
  if (error) throw new Error(error.message);

  revalidatePath("/clientes");
  redirect("/clientes");
}

export async function criarServico(formData: FormData) {
  const nome = String(formData.get("nome") ?? "").trim();
  const categoria = String(formData.get("categoria") ?? "cilios");
  const preco = Number(formData.get("preco") ?? 0);
  const duracao = Number(formData.get("duracao") ?? 60);
  const tipoProcedimento = String(formData.get("tipo_procedimento") ?? "").trim() || null;

  if (!nome || preco <= 0) {
    throw new Error("Nome e preço (maior que zero) são obrigatórios.");
  }

  const db = supabaseAdmin();
  const { error } = await db
    .from("services")
    .insert({ name: nome, category: categoria, price: preco, duration_min: duracao, tipo_procedimento: tipoProcedimento });
  if (error) throw new Error(error.message);

  revalidatePath("/servicos");
  redirect("/servicos");
}

// Compartilhado entre criarAgendamento (cliente já cadastrada) e
// criarClienteEAgendamento (cliente nova) — cria o agendamento pra um client_id
// que já existe e dispara a confirmação por WhatsApp.
async function inserirAgendamentoEEnviarConfirmacao(
  clientId: string,
  cliente: { name: string; phone: string },
  formData: FormData
) {
  const serviceId = String(formData.get("service_id") ?? "");
  const data = String(formData.get("data") ?? ""); // yyyy-mm-dd
  const hora = String(formData.get("hora") ?? ""); // HH:mm
  const duracao = Number(formData.get("duracao") ?? 60);
  const preco = Number(formData.get("preco") ?? 0);
  const notas = String(formData.get("notas") ?? "").trim() || null;

  if (!serviceId || !data || !hora) {
    throw new Error("Preencha serviço, data e hora.");
  }

  // Horário sempre interpretado como horário local de São Paulo (-03:00).
  const startAtIso = `${data}T${hora}:00-03:00`;

  const db = supabaseAdmin();
  const { data: servico, error: erroServico } = await db
    .from("services")
    .select("id, name, price")
    .eq("id", serviceId)
    .single();
  if (erroServico || !servico) throw new Error("Serviço não encontrado.");

  const { data: agendamento, error } = await db
    .from("appointments")
    .insert({
      client_id: clientId,
      service_id: serviceId,
      price: preco || servico.price,
      start_at: startAtIso,
      duration_min: duracao,
      notes: notas,
    })
    .select("id, start_at")
    .single();
  if (error || !agendamento) throw new Error(error?.message ?? "Falha ao criar agendamento.");

  const texto = mensagemConfirmacao(cliente.name, servico.name, new Date(agendamento.start_at));
  try {
    await sendText(cliente.phone, texto);
    await db
      .from("appointments")
      .update({ confirmation_sent_at: new Date().toISOString() })
      .eq("id", agendamento.id);
    await db.from("message_log").insert({
      appointment_id: agendamento.id,
      client_id: clientId,
      direction: "out",
      body: texto,
    });
  } catch (err) {
    // Agendamento já foi criado; a falha de envio não deve travar o fluxo,
    // só fica sem confirmation_sent_at pra ela reenviar manualmente se precisar.
    console.error("Falha ao enviar confirmação NeoGo:", err);
  }

  revalidatePath("/agenda");
}

export async function criarAgendamento(formData: FormData) {
  const clientId = String(formData.get("client_id") ?? "");
  if (!clientId) throw new Error("Escolha a cliente.");

  const db = supabaseAdmin();
  const { data: cliente, error: erroCliente } = await db
    .from("clients")
    .select("id, name, phone")
    .eq("id", clientId)
    .single();
  if (erroCliente || !cliente) throw new Error("Cliente não encontrado.");

  await inserirAgendamentoEEnviarConfirmacao(clientId, cliente, formData);
}

// Cliente nova: cadastra e já cria o agendamento em seguida, tudo no mesmo popup.
export async function criarClienteEAgendamento(formData: FormData) {
  const nome = String(formData.get("nome") ?? "").trim();
  const telefone = normalizarTelefone(String(formData.get("telefone") ?? ""));

  if (!nome || !telefone) {
    throw new Error("Nome e telefone da cliente são obrigatórios.");
  }

  const db = supabaseAdmin();
  const { data: cliente, error } = await db
    .from("clients")
    .insert({ name: nome, phone: telefone })
    .select("id, name, phone")
    .single();
  if (error?.code === "23505") throw new Error("Já existe uma cliente cadastrada com esse telefone.");
  if (error || !cliente) throw new Error(error?.message ?? "Falha ao cadastrar cliente.");

  await inserirAgendamentoEEnviarConfirmacao(cliente.id, cliente, formData);
  revalidatePath("/clientes");
}

export async function resolverPendencia(id: string) {
  const db = supabaseAdmin();
  const { error } = await db.from("pendencias_agendamento").update({ status: "resolvida" }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/agenda");
}

export async function descartarPendencia(id: string) {
  const db = supabaseAdmin();
  const { error } = await db.from("pendencias_agendamento").update({ status: "descartada" }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/agenda");
}

export async function resolverAvisoCancelamento(id: string) {
  const db = supabaseAdmin();
  const { error } = await db.from("avisos_cancelamento").update({ status: "resolvido" }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/agenda");
}

export async function criarItemEstoque(formData: FormData) {
  const nome = String(formData.get("nome") ?? "").trim();
  const categoria = String(formData.get("categoria") ?? "cilios");
  const unidade = String(formData.get("unidade") ?? "unidade").trim() || "unidade";
  const quantidadeInicial = Number(formData.get("quantidade_inicial") ?? 0);
  const estoqueMinimo = Number(formData.get("estoque_minimo") ?? 0);
  const custoUnitario = Number(formData.get("custo_unitario") ?? 0);

  if (!nome) throw new Error("Nome do item é obrigatório.");

  const db = supabaseAdmin();
  const { error } = await db.from("estoque_itens").insert({
    nome,
    categoria,
    unidade,
    quantidade_atual: quantidadeInicial,
    estoque_minimo: estoqueMinimo,
    custo_unitario: custoUnitario,
    ultima_compra_em: quantidadeInicial > 0 ? new Date().toISOString() : null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/estoque");
}

// Compra registrada = entrada no estoque; atualiza quantidade, custo unitário
// (baseado nessa compra) e a data da última compra pro alerta de "há quanto
// tempo não repõe esse item".
export async function registrarCompraEstoque(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  const quantidade = Number(formData.get("quantidade") ?? 0);
  const valorTotal = Number(formData.get("valor_total") ?? 0);
  const fornecedor = String(formData.get("fornecedor") ?? "").trim() || null;

  if (!itemId || quantidade <= 0) throw new Error("Informe a quantidade comprada.");

  const db = supabaseAdmin();
  const { data: item, error: erroItem } = await db
    .from("estoque_itens")
    .select("id, quantidade_atual")
    .eq("id", itemId)
    .single();
  if (erroItem || !item) throw new Error("Item não encontrado.");

  const { error: erroMovimento } = await db.from("estoque_movimentos").insert({
    item_id: itemId,
    tipo: "compra",
    direcao: "entrada",
    quantidade,
    valor_total: valorTotal || null,
    fornecedor,
  });
  if (erroMovimento) throw new Error(erroMovimento.message);

  const atualizacao: Record<string, unknown> = {
    quantidade_atual: Number(item.quantidade_atual) + quantidade,
    ultima_compra_em: new Date().toISOString(),
  };
  if (valorTotal > 0) atualizacao.custo_unitario = valorTotal / quantidade;

  const { error } = await db.from("estoque_itens").update(atualizacao).eq("id", itemId);
  if (error) throw new Error(error.message);

  revalidatePath("/estoque");
}

// Ajuste manual (correção de contagem ou baixa por uso) — não passa pela
// "receita" de insumo por serviço, é a esposa quem decide a quantidade.
export async function registrarAjusteEstoque(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  const direcao = String(formData.get("direcao") ?? "saida") as "entrada" | "saida";
  const quantidade = Number(formData.get("quantidade") ?? 0);
  const observacao = String(formData.get("observacao") ?? "").trim() || null;

  if (!itemId || quantidade <= 0) throw new Error("Informe a quantidade do ajuste.");

  const db = supabaseAdmin();
  const { data: item, error: erroItem } = await db
    .from("estoque_itens")
    .select("id, quantidade_atual")
    .eq("id", itemId)
    .single();
  if (erroItem || !item) throw new Error("Item não encontrado.");

  const novaQuantidade =
    direcao === "entrada" ? Number(item.quantidade_atual) + quantidade : Number(item.quantidade_atual) - quantidade;

  const { error: erroMovimento } = await db.from("estoque_movimentos").insert({
    item_id: itemId,
    tipo: "ajuste",
    direcao,
    quantidade,
    observacao,
  });
  if (erroMovimento) throw new Error(erroMovimento.message);

  const { error } = await db
    .from("estoque_itens")
    .update({ quantidade_atual: Math.max(novaQuantidade, 0) })
    .eq("id", itemId);
  if (error) throw new Error(error.message);

  revalidatePath("/estoque");
}

export async function arquivarItemEstoque(id: string) {
  const db = supabaseAdmin();
  const { error } = await db.from("estoque_itens").update({ ativo: false }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/estoque");
}

export async function criarDespesa(formData: FormData) {
  const nome = String(formData.get("nome") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "fixa");
  const recorrencia = String(formData.get("recorrencia") ?? "mensal");
  const valor = Number(formData.get("valor") ?? 0);
  const diaVencimento = recorrencia === "mensal" ? Number(formData.get("dia_vencimento") ?? 0) || null : null;
  const data = recorrencia === "unica" ? String(formData.get("data") ?? "").trim() || null : null;

  if (!nome || valor <= 0) throw new Error("Nome e valor (maior que zero) são obrigatórios.");

  const db = supabaseAdmin();
  const { error } = await db.from("despesas").insert({
    nome,
    tipo,
    recorrencia,
    valor,
    dia_vencimento: diaVencimento,
    data,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/estoque");
}

export async function arquivarDespesa(id: string) {
  const db = supabaseAdmin();
  const { error } = await db.from("despesas").update({ ativo: false }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/estoque");
}

export async function atualizarStatusAgendamento(
  id: string,
  status: "confirmed" | "cancelled" | "done",
  formData: FormData
) {
  const db = supabaseAdmin();
  const atualizacao: { status: typeof status; payment_method?: string } = { status };

  if (status === "done") {
    const formaPagamento = String(formData.get("payment_method") ?? "");
    if (!formaPagamento) throw new Error("Escolha a forma de pagamento pra concluir.");
    atualizacao.payment_method = formaPagamento;
  }

  const { error } = await db.from("appointments").update(atualizacao).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/agenda");
}
