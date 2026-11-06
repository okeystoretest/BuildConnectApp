import assert from "node:assert/strict";
import test from "node:test";
import { dataDaQuery, emDias, fimDoDia } from "./janela";

/**
 * A conferência que faltava, escrita depois do defeito e não antes.
 *
 * O cronograma do Flow virou calendário em 06/11/2026, com visões de mês,
 * semana e DIA. Na visão de dia a janela pedida é `de = ate = aquele dia`, e
 * o `lte` na meia-noite devolvia ZERO peças num dia que tinha conteúdo — a
 * tela dizia "Nada publicado pelo Marketing neste período" com a peça viva no
 * banco. Nenhum teste reclamou, e nenhum reclamaria: é uma conta de borda que
 * só erra na ponta da janela.
 */

test("fim do dia cobre o dia inteiro, até o último milissegundo", () => {
  const dia = dataDaQuery("2026-09-05")!;
  assert.equal(fimDoDia(dia).toISOString(), "2026-09-05T23:59:59.999Z");
});

test("uma peça agendada durante o dia cai DENTRO da janela de um dia só", () => {
  const dia = dataDaQuery("2026-09-05")!;
  const peca = new Date("2026-09-05T13:00:00.000Z");
  // É exatamente o `gte`/`lte` que a rota monta.
  assert.equal(peca >= dia && peca <= fimDoDia(dia), true);
  // E, sem o `fimDoDia`, ficava de fora — o defeito que isto guarda.
  assert.equal(peca <= dia, false);
});

test("a meia-noite do dia seguinte continua FORA", () => {
  const dia = dataDaQuery("2026-09-05")!;
  assert.equal(new Date("2026-09-06T00:00:00.000Z") <= fimDoDia(dia), false);
});

test("fim do dia não depende da hora que recebeu", () => {
  const meiaNoite = new Date("2026-09-05T00:00:00.000Z");
  const tarde = new Date("2026-09-05T17:42:11.123Z");
  assert.equal(fimDoDia(meiaNoite).toISOString(), fimDoDia(tarde).toISOString());
});

test("data da query vira meia-noite UTC", () => {
  assert.equal(dataDaQuery("2026-09-05")!.toISOString(), "2026-09-05T00:00:00.000Z");
});

test("data torta é ignorada, nunca erro — ela vem da URL", () => {
  for (const torta of [null, "", "ontem", "05/09/2026", "2026-9-5", "2026-13-40x"]) {
    assert.equal(dataDaQuery(torta), null, `deveria ignorar: ${JSON.stringify(torta)}`);
  }
});

test("emDias anda para frente e para trás", () => {
  const base = dataDaQuery("2026-09-05")!;
  assert.equal(emDias(base, 1).toISOString(), "2026-09-06T00:00:00.000Z");
  assert.equal(emDias(base, -5).toISOString(), "2026-08-31T00:00:00.000Z");
});
