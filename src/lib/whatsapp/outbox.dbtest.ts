import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { prisma } from "@/lib/db/prisma";
import { drainOutbox, enqueue, MAX_DELAY_MS, MIN_DELAY_MS, randomDelayMs } from "./outbox";
import { MESSAGE_TEXT } from "./messages";

/**
 * A fila, contra o Postgres de verdade.
 *
 * O critério de aceite que mais importa está aqui: "falha no envio para um
 * destinatário específico não impede o envio para os demais". É afirmação
 * fácil de fazer e difícil de garantir — basta o try/catch estar em volta do
 * laço em vez de dentro dele para ela virar mentira, e nada acusa.
 */

const MARK = "#WATEST";
/** Sem espaçamento de verdade: o sorteio tem teste próprio. */
const semEspera = () => 0;
/**
 * "Agora" dos testes, bem à frente do relógio. Os horários se encadeiam a
 * partir do fim da fila e da última enviada; um instante fixo no futuro deixa
 * o que já existe no banco para trás e torna as contas determinísticas.
 */
const AGORA = new Date("2030-01-01T12:00:00Z");
const em = (ms: number) => new Date(AGORA.getTime() + ms);
/** Enfileira sem espaçamento, para os testes de envio. */
const enfileirar = (ids: string[], kind: "AVALIACAO" | "FORMULARIO") =>
  enqueue(ids, kind, { now: AGORA, delayMs: semEspera });

async function makeUser(phone: string | null): Promise<string> {
  const u = await prisma.user.create({
    data: {
      username: `wa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${MARK}`,
      fullName: `Destinatário ${MARK}`,
      passwordHash: "x",
      role: "COLABORADOR",
      phone,
    },
    select: { id: true },
  });
  return u.id;
}

async function limpar() {
  await prisma.whatsappMessage.deleteMany({ where: { user: { username: { contains: MARK } } } });
  await prisma.user.deleteMany({ where: { username: { contains: MARK } } });
}

beforeEach(async () => {
  await limpar();
  // A drenagem envia TUDO que venceu, de quem quer que seja, e as contagens
  // dos testes são globais. Uma pendente de fora dos testes entraria nas
  // contas — e sairia pelo remetente falso. Melhor recusar do que apagá-la.
  const alheias = await prisma.whatsappMessage.count({ where: { status: "PENDENTE" } });
  assert.equal(alheias, 0, "há mensagens pendentes de fora dos testes; esvazie a fila antes");
});
after(async () => {
  await limpar();
  await prisma.$disconnect();
});

test("o intervalo fica entre 1 segundo e 2 horas, e varia", async () => {
  const amostras = Array.from({ length: 200 }, () => randomDelayMs());
  for (const ms of amostras) {
    assert.ok(ms >= MIN_DELAY_MS && ms <= MAX_DELAY_MS, `${ms} fora da janela`);
  }
  assert.equal(MIN_DELAY_MS, 1_000);
  assert.equal(MAX_DELAY_MS, 7_200_000);
  // Intervalo constante é assinatura de robô — a variação é o ponto.
  assert.ok(new Set(amostras).size > 50, "os intervalos precisam variar de fato");
});

test("enfileirar encadeia os horários: o primeiro sai agora, cada seguinte um sorteio depois", async () => {
  const ids = await Promise.all(
    Array.from({ length: 3 }, (_, i) => makeUser(`1198765432${i}`)),
  );
  let vez = 0;
  const sorteios = [30_000, 45_000];
  await enqueue(ids, "FORMULARIO", { now: AGORA, delayMs: () => sorteios[vez++]! });

  const linhas = await prisma.whatsappMessage.findMany({
    where: { userId: { in: ids } },
    orderBy: { sendAfter: "asc" },
    select: { userId: true, sendAfter: true },
  });
  assert.deepEqual(
    linhas.map((l) => l.sendAfter.getTime() - AGORA.getTime()),
    [0, 30_000, 75_000],
  );
  assert.deepEqual(linhas.map((l) => l.userId), ids, "na ordem em que foram enfileirados");
});

test("um lote novo entra DEPOIS do fim da fila, não em paralelo a ela", async () => {
  const [a, b] = await Promise.all([makeUser("11987654321"), makeUser("11987654322")]);
  await enqueue([a], "FORMULARIO", { now: AGORA, delayMs: () => 60_000 });
  // Fila com uma mensagem às 12:00. O lote seguinte não pode nascer às 12:00
  // também — senão dois envios saem colados e o espaçamento vira ficção.
  await enqueue([b], "AVALIACAO", { now: AGORA, delayMs: () => 60_000 });

  const linha = await prisma.whatsappMessage.findFirst({ where: { userId: b } });
  assert.equal(linha!.sendAfter.getTime() - AGORA.getTime(), 60_000);
});

test("com a fila vazia, o lote novo respeita a última ENVIADA", async () => {
  const [a, b] = await Promise.all([makeUser("11987654321"), makeUser("11987654322")]);
  await enfileirar([a], "FORMULARIO");
  await drainOutbox({ now: AGORA, resolveJid: async (c) => c[0]!, sender: async () => {} });

  // Publicado dois segundos depois do envio: não sai colado nele.
  await enqueue([b], "AVALIACAO", { now: em(2_000), delayMs: () => 60_000 });
  const linha = await prisma.whatsappMessage.findFirst({ where: { userId: b } });
  assert.equal(linha!.sendAfter.getTime() - AGORA.getTime(), 60_000);
});

test("a drenagem só envia o que já venceu; o resto espera o horário", async () => {
  const [a, b] = await Promise.all([makeUser("11987654321"), makeUser("11987654322")]);
  await enqueue([a, b], "FORMULARIO", { now: AGORA, delayMs: () => 3_600_000 });

  const enviados: string[] = [];
  const opts = {
    delayMs: () => 3_600_000,
    resolveJid: async (c: string[]) => c[0]!,
    sender: async (jid: string) => {
      enviados.push(jid);
    },
  };
  const res = await drainOutbox({ ...opts, now: AGORA });
  assert.equal(res.enviados, 1, "só o primeiro venceu");
  assert.equal(res.pendentes, 1, "o segundo continua na fila, esperando a hora");
  assert.equal(res.aguardando, 1);

  // Uma hora depois, o segundo sai.
  const depois = await drainOutbox({ ...opts, now: em(3_600_000) });
  assert.equal(depois.enviados, 1);
  assert.equal(depois.pendentes, 0);
  assert.equal(enviados.length, 2);
});

test("mesmo com a fila inteira vencida, sai uma e a seguinte espera o sorteio", async () => {
  // O WhatsApp passou horas desconectado: todas venceram. Sem esta guarda a
  // drenagem despejaria tudo de uma vez — o ritmo humano tem de valer na
  // hora do envio, não só na projeção feita ao enfileirar.
  const ids = await Promise.all(
    Array.from({ length: 3 }, (_, i) => makeUser(`1198765432${i}`)),
  );
  await enfileirar(ids, "AVALIACAO");

  const res = await drainOutbox({
    now: AGORA,
    delayMs: () => 90_000,
    resolveJid: async (c) => c[0]!,
    sender: async () => {},
  });
  assert.equal(res.enviados, 1);
  assert.equal(res.aguardando, 2, "as outras duas foram empurradas para depois");

  const proxima = await prisma.whatsappMessage.findFirst({
    where: { status: "PENDENTE" },
    orderBy: { sendAfter: "asc" },
  });
  assert.equal(proxima!.sendAfter.getTime() - AGORA.getTime(), 90_000);
});

test("falha passageira volta para a fila um sorteio adiante, não na mesma passada", async () => {
  const a = await makeUser("11987654321");
  await enfileirar([a], "AVALIACAO");

  const res = await drainOutbox({
    now: AGORA,
    delayMs: () => 30_000,
    resolveJid: async (c) => c[0]!,
    sender: async () => {
      throw new Error("rede fora");
    },
  });
  assert.equal(res.enviados, 0);
  assert.equal(res.falhas, 0, "ainda não desistiu");

  const linha = await prisma.whatsappMessage.findFirst({ where: { userId: a } });
  assert.equal(linha?.status, "PENDENTE");
  assert.equal(linha?.attempts, 1);
  assert.equal(linha!.sendAfter.getTime() - AGORA.getTime(), 30_000);
});

test("enfileirar cria uma linha por destinatário, sem duplicar", async () => {
  const a = await makeUser("11987654321");
  const b = await makeUser("11987654322");

  assert.equal(await enfileirar([a, b, a], "FORMULARIO"), 2, "o repetido entra uma vez só");
  assert.equal(await prisma.whatsappMessage.count({ where: { userId: { in: [a, b] } } }), 2);
});

test("falha em um destinatário NÃO impede os demais", async () => {
  const a = await makeUser("11987654321");
  const b = await makeUser("11987654322");
  const c = await makeUser("11987654323");
  await enfileirar([a], "AVALIACAO");
  await enfileirar([b], "AVALIACAO");
  await enfileirar([c], "AVALIACAO");

  const enviados: string[] = [];
  const res = await drainOutbox({
    now: AGORA,
    delayMs: semEspera,
    resolveJid: async (cands) => cands[0]!,
    sender: async (jid) => {
      // O segundo cai. Os outros dois têm de sair assim mesmo.
      if (jid.startsWith("5511987654322")) throw new Error("queda simulada");
      enviados.push(jid);
    },
  });

  assert.equal(res.enviados, 2, "o primeiro e o terceiro saíram");
  assert.equal(enviados.length, 2);

  const doB = await prisma.whatsappMessage.findFirst({ where: { userId: b } });
  assert.equal(doB?.status, "PENDENTE", "falha passageira volta para a fila");
  assert.equal(doB?.attempts, 1);
  assert.match(doB?.error ?? "", /queda simulada/);

  const doA = await prisma.whatsappMessage.findFirst({ where: { userId: a } });
  assert.equal(doA?.status, "ENVIADO");
  assert.ok(doA?.sentAt, "o horário do envio fica registrado");
});

test("cada tipo manda o seu texto", async () => {
  const a = await makeUser("11987654321");
  const b = await makeUser("11987654322");
  await enfileirar([a], "AVALIACAO");
  await enfileirar([b], "FORMULARIO");

  const textos: string[] = [];
  await drainOutbox({
    now: AGORA,
    delayMs: semEspera,
    resolveJid: async (c) => c[0]!,
    sender: async (_jid, text) => {
      textos.push(text);
    },
  });

  assert.ok(textos.some((t) => t === MESSAGE_TEXT.AVALIACAO));
  assert.ok(textos.some((t) => t === MESSAGE_TEXT.FORMULARIO));
  assert.ok(textos.every((t) => t.includes("buildconnectapp.com.br/minhas-avaliacoes")));
});

test("cadastro sem telefone falha de vez, sem gastar tentativa à toa", async () => {
  // É o caso dos usuários cadastrados antes de o campo telefone existir.
  const semTelefone = await makeUser(null);
  await enfileirar([semTelefone], "AVALIACAO");

  const res = await drainOutbox({
    now: AGORA,
    resolveJid: async (c) => c[0]!,
    sender: async () => {
      assert.fail("não deveria tentar enviar sem número");
    },
  });

  assert.equal(res.falhas, 1);
  const linha = await prisma.whatsappMessage.findFirst({ where: { userId: semTelefone } });
  assert.equal(linha?.status, "FALHOU", "repetir não faria surgir um telefone");
  assert.match(linha?.error ?? "", /Telefone ausente/);
});

test("número sem WhatsApp falha de vez", async () => {
  const a = await makeUser("11987654321");
  await enfileirar([a], "AVALIACAO");

  const res = await drainOutbox({
    now: AGORA,
    resolveJid: async () => null,
    sender: async () => {
      assert.fail("não deveria enviar para número que não existe");
    },
  });

  assert.equal(res.falhas, 1);
  const linha = await prisma.whatsappMessage.findFirst({ where: { userId: a } });
  assert.equal(linha?.status, "FALHOU");
  assert.match(linha?.error ?? "", /não tem WhatsApp/);
});

test("desiste depois de três tentativas", async () => {
  const a = await makeUser("11987654321");
  await enfileirar([a], "AVALIACAO");

  for (let i = 0; i < 3; i += 1) {
    // Sem espaçamento: a falha passageira devolve a mensagem um sorteio
    // adiante, e aqui interessa só a contagem de tentativas.
    await drainOutbox({
      now: AGORA,
      delayMs: semEspera,
      resolveJid: async (c) => c[0]!,
      sender: async () => {
        throw new Error("rede fora");
      },
    });
  }

  const linha = await prisma.whatsappMessage.findFirst({ where: { userId: a } });
  assert.equal(linha?.attempts, 3);
  assert.equal(linha?.status, "FALHOU", "parou de tentar");
});

test("o lote respeita o teto e o resto continua na fila", async () => {
  const ids = await Promise.all(
    Array.from({ length: 5 }, (_, i) => makeUser(`1198765432${i}`)),
  );
  await enfileirar(ids, "FORMULARIO");

  const res = await drainOutbox({
    now: AGORA,
    limit: 2,
    delayMs: semEspera,
    resolveJid: async (c) => c[0]!,
    sender: async () => {},
  });

  assert.equal(res.enviados, 2);
  assert.equal(res.pendentes, 3, "os outros três esperam a próxima rodada");
});

test("destinatário excluído no meio da drenagem não derruba os demais", async () => {
  // Foi o defeito que apareceu em 03/09/2026, quando dois arquivos de teste
  // dividiram o mesmo banco: `update` LANÇA se a linha sumiu, e a exceção
  // escapava do laço abortando os envios restantes. Em produção bastaria
  // alguém excluir um colaborador durante a drenagem — o cascade leva a
  // mensagem, e todos os destinatários seguintes ficariam sem receber.
  const a = await makeUser("11987654321");
  const some = await makeUser("11987654322");
  const c = await makeUser("11987654323");
  await enfileirar([a], "AVALIACAO");
  await enfileirar([some], "AVALIACAO");
  await enfileirar([c], "AVALIACAO");

  const enviados: string[] = [];
  const res = await drainOutbox({
    now: AGORA,
    delayMs: semEspera,
    resolveJid: async (cands) => cands[0]!,
    sender: async (jid) => {
      // No meio do envio do segundo, o destinatário some do sistema.
      if (jid.startsWith("5511987654322")) {
        await prisma.user.delete({ where: { id: some } });
      }
      enviados.push(jid);
    },
  });

  assert.equal(enviados.length, 3, "os três chegaram a ser enviados");
  assert.equal(res.enviados, 3, "e nenhum erro abortou o laço");
});
