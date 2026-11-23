import assert from "node:assert/strict";
import test from "node:test";
import {
  contarEntregas,
  estaAtrasado,
  mediaDasSemanas,
  percentualDaMeta,
  resumirKanban,
  segundaDaSemana,
  semanaIso,
  somarDias,
  variacao,
} from "./math";
import type { MarketingTaskItem } from "@/types/weekly-report";

/**
 * As contas da planilha, conferidas uma a uma.
 *
 * Cada teste cita a célula de origem: é o que permite abrir o arquivo antigo
 * e comparar o número lado a lado quando alguém desconfiar da ferramenta.
 */

test("variação é (atual - anterior) / anterior, como em E2 da aba 3", () => {
  assert.equal(variacao(100, 120), 0.2);
  assert.equal(variacao(120, 90), -0.25);
  assert.equal(variacao(50, 50), 0);
});

test("sem um dos dois números não há variação — a planilha devolvia traço", () => {
  assert.equal(variacao(undefined, 120), undefined);
  assert.equal(variacao(100, undefined), undefined);
  assert.equal(variacao(undefined, undefined), undefined);
});

test("semana anterior zerada não vira variação infinita", () => {
  // A planilha devolvia #DIV/0! aqui. Crescer de 0 para 40 não é "+∞%": é
  // crescimento que não tem base de comparação.
  assert.equal(variacao(0, 40), undefined);
});

test("% da meta é realizado ÷ meta, como em E2 da aba OKRs do Trimestre", () => {
  assert.equal(percentualDaMeta(18, 20), 0.9);
  assert.equal(percentualDaMeta(20, 20), 1);
  assert.equal(percentualDaMeta(3000, 3000), 1);
});

test("meta sem número (0 falhas, +20% vs trimestre) não produz percentual", () => {
  assert.equal(percentualDaMeta(5, 0), undefined);
  assert.equal(percentualDaMeta(5, undefined), undefined);
  assert.equal(percentualDaMeta(undefined, 20), undefined);
});

test("a média de 4 semanas ignora as semanas não apuradas", () => {
  // COUNT do Excel não conta célula vazia: três semanas dividem por três.
  assert.equal(mediaDasSemanas([10, 20, 30, undefined]), 20);
  assert.equal(mediaDasSemanas([10, undefined, undefined, undefined]), 10);
  assert.equal(mediaDasSemanas([0, 10]), 5);
});

test("nenhuma semana apurada: sem média, não zero", () => {
  // Zero diria que o KR não andou. Traço diz que ninguém mediu — e são
  // decisões diferentes na reunião de sexta.
  assert.equal(mediaDasSemanas([]), undefined);
  assert.equal(mediaDasSemanas([undefined, undefined]), undefined);
});

test("os três COUNTIF do rodapé das entregas, mais o que falta responder", () => {
  const contagem = contarEntregas([
    { health: "NO_RITMO" },
    { health: "NO_RITMO" },
    { health: "ATENCAO" },
    { health: "TRAVADO" },
    { health: undefined },
    { health: undefined },
  ]);
  assert.deepEqual(contagem, { onTrack: 2, attention: 1, blocked: 1, pending: 2 });
});

const HOJE = "2026-11-23";

function tarefa(over: Partial<MarketingTaskItem> = {}): MarketingTaskItem {
  return {
    id: "t1",
    code: "K-01",
    title: "Tarefa",
    category: "CONTEUDO",
    priority: "MEDIA",
    enteredAt: "2026-11-16",
    status: "BACKLOG",
    overdue: false,
    ...over,
  };
}

test("atraso é prazo vencido e cartão não publicado", () => {
  assert.equal(estaAtrasado({ dueDate: "2026-11-20", status: "A_FAZER" }, HOJE), true);
  assert.equal(estaAtrasado({ dueDate: "2026-11-30", status: "A_FAZER" }, HOJE), false);
});

test("cartão publicado nunca está atrasado, mesmo com prazo vencido", () => {
  assert.equal(estaAtrasado({ dueDate: "2026-11-01", status: "PUBLICADO" }, HOJE), false);
});

test("o prazo é até o fim do dia: hoje não é atraso", () => {
  assert.equal(estaAtrasado({ dueDate: HOJE, status: "A_FAZER" }, HOJE), false);
});

test("cartão sem prazo não entra na conta de atrasados", () => {
  assert.equal(estaAtrasado({ dueDate: undefined, status: "BACKLOG" }, HOJE), false);
});

test("o painel do Kanban reproduz as contagens da aba 8", () => {
  const resumo = resumirKanban([
    tarefa({ id: "1", status: "BACKLOG", category: "CONTEUDO" }),
    tarefa({ id: "2", status: "A_FAZER", category: "CONTEUDO" }),
    tarefa({ id: "3", status: "PUBLICADO", category: "PUBLICACAO" }),
    tarefa({ id: "4", status: "PUBLICADO", category: "RELATORIO" }),
    tarefa({ id: "5", status: "REVISAO", category: "COMUNIDADE", overdue: true }),
  ]);

  assert.equal(resumo.total, 5);
  assert.equal(resumo.published, 2);
  assert.equal(resumo.overdue, 1);

  // A soma das fatias fecha em 1, como o C13 = SUM(C8:C12) da planilha.
  const soma = resumo.byStatus.reduce((acc, linha) => acc + linha.share, 0);
  assert.ok(Math.abs(soma - 1) < 1e-9, `fatias somam ${soma}`);

  const conteudo = resumo.byCategory.find((c) => c.category === "CONTEUDO");
  assert.equal(conteudo?.total, 2);
  assert.equal(conteudo?.counts.BACKLOG, 1);
  assert.equal(conteudo?.counts.A_FAZER, 1);
  assert.equal(conteudo?.counts.PUBLICADO, 0);

  // Toda categoria aparece, inclusive a vazia: a matriz da planilha tinha as
  // cinco linhas sempre, e uma linha que desaparece esconde que ninguém está
  // trabalhando naquela frente.
  assert.equal(resumo.byCategory.length, 5);
  assert.equal(resumo.byCategory.find((c) => c.category === "PROCESSO")?.total, 0);
});

test("quadro vazio: total zero sem divisão por zero nas fatias", () => {
  const resumo = resumirKanban([]);
  assert.equal(resumo.total, 0);
  assert.equal(resumo.overdue, 0);
  assert.ok(resumo.byStatus.every((linha) => linha.share === 0));
});

test("a segunda-feira da semana sai de qualquer dia dela", () => {
  // 23/11/2026 é uma segunda; 27/11 é a sexta da mesma semana.
  assert.equal(segundaDaSemana("2026-11-23"), "2026-11-23");
  assert.equal(segundaDaSemana("2026-11-27"), "2026-11-23");
});

test("domingo pertence à semana que termina nele, não à seguinte", () => {
  // O erro clássico de `- (getDay() - 1)`: domingo pularia para a segunda
  // seguinte e o período sairia uma semana adiantado.
  assert.equal(segundaDaSemana("2026-11-29"), "2026-11-23");
});

test("somarDias atravessa a virada de mês", () => {
  assert.equal(somarDias("2026-11-23", 4), "2026-11-27");
  assert.equal(somarDias("2026-11-30", 1), "2026-12-01");
});

test("nº da semana segue o ISO-8601, como WEEKNUM(...;21) do Excel", () => {
  assert.equal(semanaIso("2026-01-05"), 2);
  assert.equal(semanaIso("2026-11-23"), 48);
});

test("virada de ano não produz duas semanas com o mesmo período", () => {
  // 1º/01/2027 é sexta: pela regra ISO ainda é a semana 53 de 2026, a mesma
  // de 28/12/2026. Um `WEEKNUM` ingênuo diria "semana 1" e o relatório da
  // virada apareceria duas vezes na lista.
  assert.equal(semanaIso("2026-12-28"), 53);
  assert.equal(semanaIso("2027-01-01"), 53);
  assert.equal(semanaIso("2027-01-04"), 1);
});
