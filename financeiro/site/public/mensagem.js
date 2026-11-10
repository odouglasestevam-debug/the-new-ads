// Monta a mensagem de cobrança. O mesmo arquivo roda na tela (prévia) e na Edge Function (envio),
// pra o cliente receber exatamente o que o Douglas viu na prévia.

export const VARIAVEIS = [
  ["{contato}", "Nome do contato (ou da empresa, se não tiver)"],
  ["{valor}", "Valor da cobrança"],
  ["{vencimento}", "Data de vencimento"],
  ["{descricao}", "Descrição da cobrança no Asaas"],
  ["{link}", "Link da fatura (Pix, boleto e cartão)"],
  ["{dias_atraso}", "Dias de atraso"],
];

export const ETAPAS = {
  antes: "Antes do vencimento",
  no_dia: "No dia do vencimento",
  atraso: "Em atraso",
};

export function formatarBRL(valor) {
  const n = Number(valor || 0);
  return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "2026-11-20" → "20/11/2026". Lida com a data como texto pra não sofrer com fuso.
export function formatarData(iso, curta = false) {
  if (!iso) return "";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return curta ? `${d}/${m}` : `${d}/${m}/${a}`;
}

// Celular do Asaas (só dígitos, com DDD) para o formato do WhatsApp: 55 + DDD + número.
export function telefoneWhatsApp(celular) {
  let d = String(celular || "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) d = "55" + d;
  if (!/^55\d{10,11}$/.test(d)) return null;
  return d;
}

// Troca as variáveis. Linha cuja variável ficou vazia (ex.: cobrança sem descrição) some inteira,
// em vez de sair "Referente a: " pela metade.
export function montarMensagem(modelo, dados) {
  const valores = {
    contato: (dados.contato || "").trim(),
    valor: dados.valor != null ? formatarBRL(dados.valor) : "",
    vencimento: formatarData(dados.vencimento),
    descricao: (dados.descricao || "").trim(),
    link: (dados.link_fatura || "").trim(),
    dias_atraso: dados.dias_atraso ? String(dados.dias_atraso) : "",
  };
  const linhas = String(modelo || "").replace(/\r\n/g, "\n").split("\n");
  const saida = [];
  for (const linha of linhas) {
    let vazia = false;
    const nova = linha.replace(/\{(\w+)\}/g, (inteiro, nome) => {
      if (!(nome in valores)) return inteiro;
      if (!valores[nome]) vazia = true;
      return valores[nome];
    });
    if (vazia) {
      // "Olá, {contato}!" sem contato vira "Olá!" em vez de sumir a saudação
      const semNome = linha.includes("{contato}") ? nova.replace(/,\s*([!.?])/, "$1").replace(/\s+([!.?])/, "$1") : null;
      if (semNome && !/\{\w+\}/.test(linha.replace("{contato}", ""))) saida.push(semNome);
      continue;
    }
    saida.push(nova);
  }
  return saida.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function modeloDaEtapa(config, etapa) {
  return etapa === "antes" ? config.texto_antes : etapa === "no_dia" ? config.texto_no_dia : config.texto_atraso;
}
