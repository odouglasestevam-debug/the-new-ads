// Monta o SQL de importação dos lotes coletados no WhatsApp Web (extensão do Claude no Chrome).
// Uso: node atendimento-whatsapp/ferramentas/importar-whatsapp-web.mjs <pasta dos lotes> <slug da conta> > saida.sql
// Regras:
//  - hora_incerta: descartada.
//  - Para cada contato vale a coleta completa do lote mais recente que tem a conversa aberta;
//    linhas "parcial" (só a prévia da lista) entram só se não houver coleta completa ou se forem
//    mais novas que ela.
//  - wa_id = WEB- + hash de contato, data, lado, tipo, texto e ordem de repetição: rodar de novo não duplica.
// Só gera INSERT ... on conflict do nothing. A saudação automática é marcada pelo gatilho do banco.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const [pasta, slug] = process.argv.slice(2);
if (!pasta || !slug) { console.error("uso: importar-whatsapp-web.mjs <pasta> <slug>"); process.exit(1); }

const TIPOS = { texto: "texto", audio: "audio", foto: "imagem", imagem: "imagem", video: "video", documento: "documento",
  figurinha: "figurinha", localizacao: "localizacao", contato: "contato" };
const arquivos = readdirSync(pasta).filter((f) => /^lote-\d+\.jsonl$/.test(f)).sort();
const linhas = [];
const avisos = [];
for (const arq of arquivos) {
  const lote = Number(arq.match(/\d+/)[0]);
  readFileSync(join(pasta, arq), "utf8").split(/\r?\n/).forEach((txt, i) => {
    if (!txt.trim()) return;
    let l;
    try { l = JSON.parse(txt); } catch { avisos.push(`${arq}:${i + 1} JSON inválido`); return; }
    if (!l.c || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(l.dt || "") || !["loja", "cliente"].includes(l.de)) {
      avisos.push(`${arq}:${i + 1} sem contato, data ou lado válidos`); return;
    }
    if (l.hora_incerta) return;
    linhas.push({ ...l, lote, ordem: linhas.length });
  });
}

const porContato = new Map();
for (const l of linhas) { if (!porContato.has(l.c)) porContato.set(l.c, []); porContato.get(l.c).push(l); }

const saida = [];
for (const [contato, ls] of porContato) {
  const completas = ls.filter((l) => !l.parcial);
  let ficam = [];
  if (completas.length) {
    const ultimoLote = Math.max(...completas.map((l) => l.lote));
    ficam = completas.filter((l) => l.lote === ultimoLote);
    const ultimaData = ficam.reduce((m, l) => (l.dt > m ? l.dt : m), "");
    ficam.push(...ls.filter((l) => l.parcial && l.dt > ultimaData));
  } else {
    const ultimoLote = Math.max(...ls.map((l) => l.lote));
    ficam = ls.filter((l) => l.lote === ultimoLote);
  }
  const vistos = new Map();
  for (const l of ficam.sort((a, b) => a.ordem - b.ordem)) {
    const tipo = TIPOS[l.tipo] || "outro";
    const texto = typeof l.txt === "string" && l.txt !== "" ? l.txt.slice(0, 4000) : null;
    const chave = [contato, l.dt, l.de, tipo, texto ?? ""].join("|");
    const n = vistos.get(chave) || 0; vistos.set(chave, n + 1);
    const wa = "WEB-" + createHash("sha1").update(chave + "|" + n).digest("hex").slice(0, 24);
    saida.push([wa, contato, l.de === "loja" ? 1 : 0, l.dt.replace(" ", "T") + ":00-03:00", tipo, texto,
      Number.isFinite(l.seg) ? l.seg : null, l.anuncio === true ? 1 : 0, l.de === "cliente" && l.n ? String(l.n).slice(0, 120) : null,
      l.lote, l.parcial ? 1 : 0, Number.isFinite(l.nao_lidas) ? l.nao_lidas : null]);
  }
}

const json = JSON.stringify(saida);
if (json.includes("$imp$")) { console.error("texto contém o delimitador $imp$"); process.exit(1); }
console.log(`-- ${arquivos.join(", ")}: ${linhas.length} linhas lidas, ${saida.length} mensagens, ${porContato.size} contatos`);
for (const a of avisos) console.log("-- aviso: " + a);
console.log(`with conta as (select id from atendimento.contas where slug = '${slug.replace(/'/g, "")}'),
dados as (select e.r, e.ord from jsonb_array_elements($imp$${json}$imp$::jsonb) with ordinality e(r, ord)),
novas as (
  insert into atendimento.mensagens (conta_id, wa_id, contato, chat_jid, de_loja, enviada_em, tipo, texto,
    audio_segundos, transcricao_status, anuncio, nome_contato, bruto)
  select conta.id, r->>0, r->>1, case when r->>1 like 'nome:%' then 'web:' || (r->>1) else (r->>1) || '@s.whatsapp.net' end,
    (r->>2)::int = 1, (r->>3)::timestamptz, r->>4, r->>5, (r->>6)::int,
    case when r->>4 = 'audio' then 'sem_midia' end,
    case when (r->>7)::int = 1 then '{"origem":"whatsapp_web"}'::jsonb end,
    r->>8,
    jsonb_strip_nulls(jsonb_build_object('origem', 'whatsapp_web', 'lote', (r->>9)::int,
      'parcial', case when (r->>10)::int = 1 then true end, 'nao_lidas', (r->>11)::int))
  from dados cross join conta
  order by dados.ord
  on conflict (conta_id, wa_id) do nothing
  returning 1)
select (select count(*) from novas) inseridas, ${saida.length} no_arquivo;`);
