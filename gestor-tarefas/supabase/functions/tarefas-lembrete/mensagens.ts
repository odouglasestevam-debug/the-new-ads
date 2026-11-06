// Texto das notificações. Sem dependência de Deno para os testes rodarem no Node.
export type Carga = { titulo: string; corpo: string; url: string };

export type Atribuicao = {
  fila_id: number;
  tarefa_id: string;
  lista_id: string;
  titulo: string;
  ator: string | null;
  criador: string | null;
};

export type Urgente = {
  tarefa_id: string;
  lista_id: string;
  titulo: string;
  dias_para_vencer: number | null;
  vez: number;
};

const CENTRAL = "/#/central";
const rotaTarefa = (lista: string, tarefa: string) => `/#/lista/${lista}?t=${tarefa}`;

function resumirTitulos(titulos: string[]) {
  const LIMITE = 3;
  const mostrados = titulos.slice(0, LIMITE).join(" · ");
  return titulos.length > LIMITE ? `${mostrados} e mais ${titulos.length - LIMITE}` : mostrados;
}

function prazo(dias: number | null) {
  if (dias === null || dias === undefined) return "";
  if (dias < 0) return `atrasada há ${-dias} ${dias === -1 ? "dia" : "dias"}`;
  if (dias === 0) return "vence hoje";
  if (dias === 1) return "vence amanhã";
  return `vence em ${dias} dias`;
}

export function mensagemAtribuicao(itens: Atribuicao[]): Carga {
  if (itens.length > 1) {
    const atores = new Set(itens.map((i) => i.ator));
    const [ator] = atores;
    return {
      titulo: atores.size === 1 && ator ? `${ator} te atribuiu ${itens.length} tarefas` : `${itens.length} tarefas novas para você`,
      corpo: resumirTitulos(itens.map((i) => i.titulo)),
      url: CENTRAL,
    };
  }
  const { ator, criador, titulo, lista_id, tarefa_id } = itens[0];
  const url = rotaTarefa(lista_id, tarefa_id);
  if (ator && ator === criador) return { titulo: `${ator} criou e te atribuiu uma tarefa`, corpo: titulo, url };
  const corpo = criador ? `${titulo} (criada por ${criador})` : titulo;
  return { titulo: ator ? `${ator} te atribuiu uma tarefa` : "Tarefa atribuída a você", corpo, url };
}

export function mensagemUrgente(itens: Urgente[]): Carga {
  if (itens.length > 1) {
    return { titulo: `${itens.length} tarefas urgentes`, corpo: resumirTitulos(itens.map((i) => i.titulo)), url: CENTRAL };
  }
  const { titulo, dias_para_vencer, vez, lista_id, tarefa_id } = itens[0];
  const quando = prazo(dias_para_vencer);
  return {
    titulo: vez > 1 ? "Urgente: ainda em aberto" : "Tarefa urgente",
    corpo: quando ? `${titulo} (${quando})` : titulo,
    url: rotaTarefa(lista_id, tarefa_id),
  };
}
