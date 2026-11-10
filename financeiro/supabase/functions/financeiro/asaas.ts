// Cliente mínimo da API do Asaas (produção). Só leitura: o app nunca cria nem altera cobrança.
const BASE = "https://api.asaas.com/v3";

export class ErroAsaas extends Error {
  constructor(mensagem: string, public status: number) {
    super(mensagem);
  }
}

export class Asaas {
  constructor(private token: string) {}

  async get(caminho: string) {
    const resposta = await fetch(BASE + caminho, {
      // O Asaas exige User-Agent em contas novas.
      headers: { access_token: this.token, "User-Agent": "TNA-Financeiro", "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    const texto = await resposta.text();
    let corpo: any = null;
    try { corpo = JSON.parse(texto); } catch { /* corpo não é JSON */ }
    if (!resposta.ok) {
      const motivo = corpo?.errors?.[0]?.description || texto.slice(0, 200) || resposta.statusText;
      throw new ErroAsaas(`Asaas ${resposta.status} em ${caminho.split("?")[0]}: ${motivo}`, resposta.status);
    }
    return corpo;
  }

  // Lista paginada (100 por página, o máximo do Asaas).
  async *paginas(caminho: string): AsyncGenerator<any[]> {
    let offset = 0;
    const sep = caminho.includes("?") ? "&" : "?";
    while (true) {
      const r = await this.get(`${caminho}${sep}limit=100&offset=${offset}`);
      yield r?.data || [];
      if (!r?.hasMore) return;
      offset += 100;
      if (offset > 20000) throw new Error(`Paginação longa demais em ${caminho.split("?")[0]}.`);
    }
  }
}
