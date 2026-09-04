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
/** Sem espera de verdade: o delay tem teste próprio. */
const semEspera = () => 0;

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

beforeEach(limpar);
after(async () => {
  await limpar();
  await prisma.$disconnect();
});

test("o intervalo fica entre 1 e 10 segundos, e varia", async () => {
  const amostras = Array.from({ length: 200 }, () => randomDelayMs());
  for (const ms of amostras) {
    assert.ok(ms >= MIN_DELAY_MS && ms <= MAX_DELAY_MS, `${ms} fora da janela`);
  }
  // Intervalo constante é assinatura de robô — a variação é o ponto.
  assert.ok(new Set(amostras).size > 50, "os intervalos precisam variar de fato");
});

test("enfileirar cria uma linha por destinatário, sem duplicar", async () => {
  const a = await makeUser("11987654321");
  const b = await makeUser("11987654322");

  assert.equal(await enqueue([a, b, a], "FORMULARIO"), 2, "o repetido entra uma vez só");
  assert.equal(await prisma.whatsappMessage.count({ where: { userId: { in: [a, b] } } }), 2);
});

test("falha em um destinatário NÃO impede os demais", async () => {
  const a = await makeUser("11987654321");
  const b = await makeUser("11987654322");
  const c = await makeUser("11987654323");
  await enqueue([a], "AVALIACAO");
  await enqueue([b], "AVALIACAO");
  await enqueue([c], "AVALIACAO");

  const enviados: string[] = [];
  const res = await drainOutbox({
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
  await enqueue([a], "AVALIACAO");
  await enqueue([b], "FORMULARIO");

  const textos: string[] = [];
  await drainOutbox({
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
  await enqueue([semTelefone], "AVALIACAO");

  const res = await drainOutbox({
    delayMs: semEspera,
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
  await enqueue([a], "AVALIACAO");

  const res = await drainOutbox({
    delayMs: semEspera,
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
  await enqueue([a], "AVALIACAO");

  for (let i = 0; i < 3; i += 1) {
    await drainOutbox({
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
  await enqueue(ids, "FORMULARIO");

  const res = await drainOutbox({
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
  await enqueue([a], "AVALIACAO");
  await enqueue([some], "AVALIACAO");
  await enqueue([c], "AVALIACAO");

  const enviados: string[] = [];
  const res = await drainOutbox({
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
