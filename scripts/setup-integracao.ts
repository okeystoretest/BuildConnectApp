/**
 * Build.Connect — provisiona a trilha da Página de Integração.
 *
 * Cadastra os 4 filmes na ordem definida pelo DHO e, para cada um, as 5
 * perguntas COM GABARITO. Conteúdo tirado do PDF "ordem dos vídeos e
 * perguntas" (28/10/2026).
 *
 * IDEMPOTENTE: identifica o filme pelo título e pula o que já tem perguntas.
 * Rodar duas vezes não duplica nada e não apaga tentativa nenhuma.
 *
 * NÃO envia os arquivos de vídeo: os filmes nascem sem arquivo e aparecem como
 * "Pendente" no quadro do DHO, que faz o upload por lá (é por onde a barra de
 * progresso existe, e um MP4 de vários GB não cabe num script). As capas
 * entram por `scripts/setup-integracao-capas.ts`.
 *
 * A ORDEM DAS ALTERNATIVAS é embaralhada de propósito. No PDF de origem a
 * correta é sempre a primeira das três; gravar nessa ordem deixaria o
 * questionário respondível sem assistir a nada. A ordem aqui é fixa (não
 * sorteada): o que o convidado vê é o mesmo que o DHO revisa.
 *
 * Uso:
 *   npx tsx scripts/setup-integracao.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface SeedQuestion {
  label: string;
  /** Alternativas na ordem de exibição. */
  options: string[];
  /** Índice (0-based) da correta em `options`. */
  correct: number;
}

interface SeedFilm {
  order: number;
  title: string;
  focus: string;
  lesson: string;
  questions: SeedQuestion[];
}

const FILMS: SeedFilm[] = [
  {
    order: 1,
    title: "Poder Além da Vida",
    focus: "Autoconhecimento e Presença",
    lesson: "O conhecimento não é o mesmo que a sabedoria. A sabedoria é fazer.",
    questions: [
      {
        label:
          'No primeiro encontro entre Dan Millman e o mentor Sócrates, qual é o sentido profundo da pergunta "você é feliz?" direcionada ao jovem atleta?',
        options: [
          "Avaliar se o seu desempenho acadêmico na faculdade estava satisfatório.",
          "Questionar se todas as conquistas materiais e externas do rapaz eram realmente suficientes para preencher o seu vazio interior.",
          "Medir o impacto da falta de relacionamentos afetivos em sua rotina de treinos.",
        ],
        correct: 1,
      },
      {
        label: 'Por que Dan Millman decide apelidar o misterioso frentista de "Sócrates"?',
        options: [
          'Porque "Sócrates" era apenas um nome difícil de pronunciar que testava a paciência do atleta.',
          "Porque era uma forma irônica de lidar com alguém que não gostava de esportes.",
          "Porque o mentor encarnava a sabedoria, a lucidez e a maturidade intelectual que o jovem aspirava alcançar.",
        ],
        correct: 2,
      },
      {
        label:
          "Qual é o nome da jovem espiritualizada que transita pelo posto de gasolina e desempenha um papel fundamental na jornada de autoconhecimento de Dan?",
        options: ["Alex", "Joy", "Kate"],
        correct: 1,
      },
      {
        label:
          "Qual modalidade esportiva exigia extrema disciplina, foco e perfeccionismo da parte de Dan Millman na universidade?",
        options: ["Boxe.", "Futebol americano.", "Ginástica Olímpica."],
        correct: 2,
      },
      {
        label:
          "Em qual local cotidiano e aparentemente comum o personagem Sócrates exercia suas atividades e encontrava Dan para os seus ensinamentos?",
        options: [
          "Na lanchonete da faculdade.",
          "Em um posto de gasolina.",
          "Em uma livraria tradicional no centro da cidade.",
        ],
        correct: 1,
      },
    ],
  },
  {
    order: 2,
    title: "O Segredo (Documentário)",
    focus: "Mentalidade e Intenção",
    lesson: "Seus pensamentos se tornam coisas.",
    questions: [
      {
        label:
          "De acordo com a premissa central apresentada no filme, qual é a verdadeira origem da realidade que vivenciamos?",
        options: [
          "De processos físicos e cósmicos independentes da mente.",
          "Da interação estritamente material entre os elementos da natureza.",
          "Do poder e da projeção do pensamento humano.",
        ],
        correct: 2,
      },
      {
        label:
          "Para validar suas teorias sobre a manifestação da realidade, qual campo da ciência o documentário utiliza frequentemente como analogia?",
        options: ["Geometria Analítica.", "Física Quântica.", "Biologia Evolutiva."],
        correct: 1,
      },
      {
        label:
          "Considerando a mensagem motivacional da obra, qual reflexão se sobressai sobre a realização dos próprios desejos?",
        options: [
          '"Vai lá e pega", priorizando a ação física imediata sobre a atração mental.',
          '"Então você não terá", enfatizando a escassez decorrente da dúvida.',
          '"Não há limites para ti", reforçando o potencial ilimitado da mente.',
        ],
        correct: 2,
      },
      {
        label:
          "Como o documentário explica a chegada de experiências e circunstâncias à vida de um indivíduo?",
        options: [
          "Por meio do acaso e de coincidências fortuitas do destino.",
          "Através da Lei da Atração, que atrai tudo o que focalizamos.",
          "Devido a fatores puramente externos e alheios ao controle do indivíduo.",
        ],
        correct: 1,
      },
      {
        label:
          "Qual estratégia prática o filme recomenda para manter os objetivos sempre ativos no processo de manifestação?",
        options: [
          "Bem guardadas e trancadas em segredo, protegendo-as de energias negativas alheias.",
          "Fixadas exclusivamente no subconsciente, sem necessidade de lembretes físicos.",
          "Onde possamos vê-las todos os dias, alimentando o foco visual e mental.",
        ],
        correct: 2,
      },
    ],
  },
  {
    order: 3,
    title: "O Segredo: Ouse Sonhar",
    focus: "Perspectiva e Atitude",
    lesson: "A crença cria a realidade quando aliada à esperança.",
    questions: [
      {
        label: "De que maneira singular ocorreu o primeiro encontro entre Miranda e Bray?",
        options: [
          "Em um restaurante local.",
          "Em um acidente de trânsito.",
          "Passeando com os filhos na praia.",
        ],
        correct: 1,
      },
      {
        label:
          "Durante a forte tempestade que atinge a residência, qual objeto é arremessado contra o telhado da casa de Miranda?",
        options: [
          "Uma placa de sinalização de trânsito.",
          "Uma bicicleta abandonada.",
          "Um galho de árvore.",
        ],
        correct: 2,
      },
      {
        label:
          "Qual é a principal convicção filosófica e espiritual defendida por Bray ao longo da história?",
        options: [
          "Que o falecido esposo de Miranda sofreu um atentado criminoso.",
          "No poder do universo e na força dos pensamentos positivos.",
          "Que o atual companheiro de Miranda mantém um relacionamento oculto.",
        ],
        correct: 1,
      },
      {
        label:
          "Para manter a harmonia do lar após a viuvez, quantos filhos Miranda cria sob sua responsabilidade?",
        options: ["1 filho.", "2 filhos.", "3 filhos.", "Outro (especificar)."],
        correct: 2,
      },
      {
        label:
          "Qual é a principal lição transmitida pela narrativa no que tange à transformação da realidade?",
        options: [
          "A certeza de que ainda existem pessoas bondosas no mundo moderno.",
          "A promessa de que todos encontrarão o seu grande amor na juventude.",
          "A aplicação prática da lei universal da atração na superação de adversidades.",
        ],
        correct: 2,
      },
    ],
  },
  {
    order: 4,
    title: "Joy: O Nome do Sucesso",
    focus: "Ação e Resiliência",
    lesson: "A determinação e a execução transformam visão em império.",
    questions: [
      {
        label:
          "Qual foi o invento inovador que marcou o ponto de virada na carreira e na autonomia financeira de Joy?",
        options: [
          "Um liquidificador movido a energia solar.",
          "Uma fritadeira sem óleo (Air Fryer).",
          "Um esfregão autolimpante (Mop).",
        ],
        correct: 2,
      },
      {
        label:
          "Como o ambiente familiar inicial impactou a trajetória emocional e a maturidade precoce de Joy?",
        options: [
          "Bastante luxuoso devido à enorme riqueza acumulada por seu pai.",
          "Marcado por instabilidade e dificuldades emocionais após a separação dos pais.",
          "Solitário em decorrência de sua criação em uma instituição de amparo.",
        ],
        correct: 1,
      },
      {
        label:
          "Qual meio de comunicação de massa desempenhou o papel decisivo na escalada das vendas e no sucesso comercial do produto de Joy?",
        options: [
          "Plataformas digitais e redes sociais na internet.",
          "Distribuição de panfletos informativos em cruzamentos de trânsito.",
          "Uma emissora de televisão especializada em compras (Home Shopping).",
        ],
        correct: 2,
      },
      {
        label:
          "Qual era o nome batizado do esfregão revolucionário que se tornou o símbolo da persistência da protagonista?",
        options: ["Avalon.", "Miracle Mop (Esfregão Milagroso).", "Sunshine."],
        correct: 1,
      },
      {
        label:
          "Ao equilibrar as pressões do empreendedorismo com as demandas do lar, quantos filhos Joy criava sob sua responsabilidade?",
        options: ["1 filho.", "2 filhos.", "3 filhos.", "Outro (especificar)."],
        correct: 1,
      },
    ],
  },
];

async function main() {
  console.log("Build.Connect — setup da Página de Integração\n");

  // Erro de digitação no gabarito vira filme sem resposta certa, e o convidado
  // nunca passaria. Confere ANTES de tocar o banco.
  for (const film of FILMS) {
    for (const [i, q] of film.questions.entries()) {
      if (q.correct < 0 || q.correct >= q.options.length) {
        throw new Error(`"${film.title}", pergunta ${i + 1}: gabarito fora das alternativas.`);
      }
    }
  }

  for (const film of FILMS) {
    const existing = await prisma.integrationAsset.findFirst({
      where: { kind: "FILME", title: film.title },
      select: { id: true, _count: { select: { questions: true } } },
    });

    const assetId =
      existing?.id ??
      (
        await prisma.integrationAsset.create({
          data: {
            kind: "FILME",
            title: film.title,
            focus: film.focus,
            lesson: film.lesson,
            order: film.order,
          },
          select: { id: true },
        })
      ).id;

    if (existing && existing._count.questions > 0) {
      console.log(`  = "${film.title}" já tem questionário — nada a fazer.`);
      continue;
    }

    for (const [qIndex, question] of film.questions.entries()) {
      await prisma.integrationQuestion.create({
        data: {
          assetId,
          label: question.label,
          order: qIndex,
          options: {
            create: question.options.map((label, oIndex) => ({
              label,
              order: oIndex,
              correct: oIndex === question.correct,
            })),
          },
        },
      });
    }

    console.log(`  + "${film.title}" (${film.questions.length} perguntas, com gabarito)`);
  }

  console.log(
    "\nPronto. Os filmes estão sem ARQUIVO: suba cada um pelo DHO →" +
      " Gestão de Usuários → Página de Integração.",
  );
}

main()
  .catch((error) => {
    console.error("\nFalhou:", error instanceof Error ? error.message : error);
    console.error(
      "\nSe o erro citar tabela inexistente, a migration ainda não foi aplicada:" +
        "\n  npx prisma migrate deploy && npx prisma generate",
    );
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
