// Regras de recorrência na gaveta da tarefa (dias da semana, dia do mês, 1ª/última segunda...).
// O banco é quem gera a próxima tarefa (privado.tarefas_proxima_data); aqui só configura e mostra a prévia.
// Botões na ordem de segunda a domingo; o valor gravado continua 0 = domingo ... 6 = sábado.
const BOTOES_SEMANA = [[1, "Seg"], [2, "Ter"], [3, "Qua"], [4, "Qui"], [5, "Sex"], [6, "Sáb"], [0, "Dom"]];
const NOMES_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const ORDENS = [[1, "1ª"], [2, "2ª"], [3, "3ª"], [4, "4ª"], [-1, "Última"]];

// Mesma conta do banco, só para a prévia. Semana começa no domingo.
function proximaRecorrencia(t) {
  const base = t.data_entrega || hojeSP();
  const n = t.recorrencia_intervalo || 1;
  if (t.recorrencia === "diaria") return somarDias(base, n);
  if (t.recorrencia === "anual") return String(Number(base.slice(0, 4)) + n) + base.slice(4);
  if (t.recorrencia === "semanal") {
    const dias = t.recorrencia_dias_semana;
    if (!dias?.length) return somarDias(base, 7 * n);
    const semanaBase = somarDias(base, -diaDaSemana(base));
    for (let i = 1; i <= 7 * n + 7; i++) {
      const d = somarDias(base, i);
      const semanas = Math.round((comoData(somarDias(d, -diaDaSemana(d))) - comoData(semanaBase)) / 604800000);
      if (dias.includes(diaDaSemana(d)) && semanas % n === 0) return d;
    }
    return somarDias(base, 7 * n);
  }
  // mensal
  const [a, m] = base.split("-").map(Number);
  const noMes = (k) => {
    const inicio = new Date(Date.UTC(a, m - 1 + k * n, 1));
    const ultimo = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 0));
    if (t.recorrencia_mensal === "dia_mes") {
      const dia = t.recorrencia_dia_mes === -1 ? ultimo.getUTCDate() : Math.min(t.recorrencia_dia_mes, ultimo.getUTCDate());
      return comoIso(new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), dia)));
    }
    if (t.recorrencia_ordem === -1) {
      return somarDias(comoIso(ultimo), -((ultimo.getUTCDay() - t.recorrencia_dia_semana + 7) % 7));
    }
    return somarDias(comoIso(inicio), ((t.recorrencia_dia_semana - inicio.getUTCDay() + 7) % 7) + 7 * (t.recorrencia_ordem - 1));
  };
  if (!t.recorrencia_mensal) {
    const alvo = new Date(Date.UTC(a, m - 1 + n, 1));
    const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
    return comoIso(new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth(), Math.min(Number(base.slice(8)), ultimo))));
  }
  for (let k = 0; k <= 36; k++) { const c = noMes(k); if (c > base) return c; }
  return base;
}

function listaNatural(itens) {
  return itens.length <= 1 ? itens.join("") : itens.slice(0, -1).join(", ") + " e " + itens.at(-1);
}

function descreverRecorrencia(t) {
  if (!t.recorrencia) return "";
  const n = t.recorrencia_intervalo || 1;
  const cada = (um, varios) => (n === 1 ? um : `A cada ${n} ${varios}`);
  if (t.recorrencia === "diaria") return cada("Todo dia", "dias");
  if (t.recorrencia === "anual") return cada("Todo ano", "anos");
  if (t.recorrencia === "semanal") {
    const dias = t.recorrencia_dias_semana;
    const quais = dias?.length ? `, ${dias.length === 7 ? "todos os dias" : "na " + listaNatural(BOTOES_SEMANA.filter(([d]) => dias.includes(d)).map(([d]) => DIAS_SEMANA[d]))}` : "";
    return cada("Toda semana", "semanas") + quais;
  }
  const base = cada("Todo mês", "meses");
  if (t.recorrencia_mensal === "dia_mes") return base + (t.recorrencia_dia_mes === -1 ? ", no último dia" : `, no dia ${t.recorrencia_dia_mes}`);
  if (t.recorrencia_mensal === "dia_semana") {
    const dia = t.recorrencia_dia_semana, masculino = dia === 0 || dia === 6;
    const ordem = t.recorrencia_ordem === -1 ? (masculino ? "último" : "última") : `${t.recorrencia_ordem}${masculino ? "º" : "ª"}`;
    return base + `, ${masculino ? "no" : "na"} ${ordem} ${NOMES_SEMANA[dia]}`;
  }
  return base + ", no mesmo dia da entrega";
}

// Linhas extras da grade da gaveta, logo abaixo de "Repetir".
function blocoRegraRecorrencia(t) {
  if (t.recorrencia === "semanal") {
    const dias = t.recorrencia_dias_semana || [];
    return `<span class="rotulo">Nos dias</span>
      <div class="dias-semana" role="group" aria-label="Dias da semana">
        ${BOTOES_SEMANA.map(([i, l]) => `<button type="button" class="dia-semana${dias.includes(i) ? " ligado" : ""}" aria-pressed="${dias.includes(i)}"
          title="${NOMES_SEMANA[i]}" onclick="alternarDiaRecorrencia('${t.id}', ${i})">${l}</button>`).join("")}
      </div>`;
  }
  if (t.recorrencia === "mensal") {
    const modo = t.recorrencia_mensal || "";
    let detalhe = "";
    if (modo === "dia_mes") {
      detalhe = `<select onchange="salvarRegraMensal('${t.id}', { recorrencia_dia_mes: Number(this.value) })" aria-label="Dia do mês">
        ${Array.from({ length: 31 }, (_, i) => i + 1).map((d) => `<option value="${d}"${t.recorrencia_dia_mes === d ? " selected" : ""}>Dia ${d}</option>`).join("")}
        <option value="-1"${t.recorrencia_dia_mes === -1 ? " selected" : ""}>Último dia</option></select>`;
    } else if (modo === "dia_semana") {
      detalhe = `<div class="duas">
        <select onchange="salvarRegraMensal('${t.id}', { recorrencia_ordem: Number(this.value) })" aria-label="Qual semana">
          ${ORDENS.map(([v, n]) => `<option value="${v}"${t.recorrencia_ordem === v ? " selected" : ""}>${n}</option>`).join("")}</select>
        <select onchange="salvarRegraMensal('${t.id}', { recorrencia_dia_semana: Number(this.value) })" aria-label="Dia da semana">
          ${NOMES_SEMANA.map((n, i) => `<option value="${i}"${t.recorrencia_dia_semana === i ? " selected" : ""}>${n}</option>`).join("")}</select>
      </div>`;
    }
    return `<span class="rotulo">No mês</span>
      <div class="regra-mensal">
        <select onchange="mudarModoMensal('${t.id}', this.value)" aria-label="Regra do mês">
          <option value=""${!modo ? " selected" : ""}>No mesmo dia da entrega</option>
          <option value="dia_mes"${modo === "dia_mes" ? " selected" : ""}>Todo dia…</option>
          <option value="dia_semana"${modo === "dia_semana" ? " selected" : ""}>Toda 1ª, 2ª… ou última…</option>
        </select>
        ${detalhe}
      </div>`;
  }
  return "";
}

function resumoRecorrencia(t) {
  if (!t.recorrencia) return "";
  const prox = proximaRecorrencia(t);
  return `<p class="resumo-recorrencia">${esc(descreverRecorrencia(t))}. Ao concluir, a próxima é criada para <b>${esc(rotuloData(prox))}</b>.</p>`;
}

function alternarDiaRecorrencia(id, dia) {
  const t = S.tarefas.find((x) => x.id === id);
  const atuais = t.recorrencia_dias_semana || [];
  const novos = atuais.includes(dia) ? atuais.filter((d) => d !== dia) : [...atuais, dia].sort();
  salvarTarefa(id, { recorrencia_dias_semana: novos.length ? novos : null }, { silencioso: true });
}

// Ao escolher o modo, já sugere a regra da data de entrega atual (ex.: entrega numa 3ª sexta → "3ª sexta").
function mudarModoMensal(id, modo) {
  const t = S.tarefas.find((x) => x.id === id);
  const base = t.data_entrega || hojeSP();
  const dia = Number(base.slice(8));
  if (modo === "dia_mes") return salvarRegraMensal(id, { recorrencia_mensal: "dia_mes", recorrencia_dia_mes: dia });
  if (modo === "dia_semana") {
    const ordem = Math.ceil(dia / 7);
    return salvarRegraMensal(id, { recorrencia_mensal: "dia_semana", recorrencia_ordem: ordem > 4 ? -1 : ordem, recorrencia_dia_semana: diaDaSemana(base) });
  }
  salvarRegraMensal(id, { recorrencia_mensal: null });
}

function salvarRegraMensal(id, patch) {
  const t = S.tarefas.find((x) => x.id === id);
  const regra = {
    recorrencia_mensal: t.recorrencia_mensal, recorrencia_dia_mes: t.recorrencia_dia_mes,
    recorrencia_ordem: t.recorrencia_ordem, recorrencia_dia_semana: t.recorrencia_dia_semana, ...patch,
  };
  // O banco exige a regra completa do modo escolhido e nada do outro modo.
  if (regra.recorrencia_mensal !== "dia_mes") regra.recorrencia_dia_mes = null;
  if (regra.recorrencia_mensal !== "dia_semana") { regra.recorrencia_ordem = null; regra.recorrencia_dia_semana = null; }
  salvarTarefa(id, regra, { silencioso: true });
}
