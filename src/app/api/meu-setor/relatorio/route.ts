import { prisma } from "@/lib/db/prisma";
import { canReadPersonnelOf } from "@/lib/auth/access";
import { getCurrentUser } from "@/lib/auth/require-user";
import { dateLabelBR, timeLabelBR } from "@/lib/brasilia";
import { can } from "@/lib/permissions";
import { getPersonnelFolders } from "@/lib/personnel-data";
import { getSectorOverview, listScopesForOverview } from "@/lib/sector-overview-data";
import { gerarRelatorioSetorPdf, type SectorReportMember } from "@/lib/sector-report-pdf";
import type { Role } from "@/types";

/**
 * GET /api/meu-setor/relatorio — o painel "Meu Setor" em PDF.
 *
 * Route Handler, e não Server Action, porque a resposta é um ARQUIVO BINÁRIO:
 * o navegador baixa direto, sem o PDF trafegar em base64 no payload do React.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * O ESCOPO É DECIDIDO AQUI, e repete a regra da página de propósito
 * (`app/meu-setor/page.tsx`): o Gestor é preso ao próprio setor e o `?setor=`
 * é IGNORADO para ele. Sem esta linha, bastaria digitar a URL da rota para
 * levar o progresso — e a documentação pessoal — da equipe de outro setor
 * num arquivo. Esconder o botão na tela não é a proteção; isto é.
 *
 * A documentação pessoal passa pelo MESMO portão da tela
 * (`canReadPersonnelOf`), pessoa por pessoa. Quem não alcança recebe o
 * relatório com o bloco marcado como fora de alcance, nunca vazio: seção
 * vazia leria como "não tem documento", que é outra afirmação.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Nome de arquivo só-ASCII: evita a codificação RFC 5987 no cabeçalho. */
function nomeDoArquivo(sectorLabel: string, agora: Date): string {
  const slug = sectorLabel
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const [dia, mes, ano] = dateLabelBR(agora).split("/");
  return `progresso-${slug || "setor"}-${ano}-${mes}-${dia}.pdf`;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Não autenticado", { status: 401 });

  const role = user.role as Role;
  if (!can(role, "sector.overview")) {
    return new Response("Sem permissão para este relatório", { status: 403 });
  }

  const isAdmin = role === "ADMIN";
  const query = new URL(request.url).searchParams;
  const pedido = query.get("setor");
  const subPedido = query.get("subsetor");
  /*
   * Os escopos vêm para os DOIS papéis, ao contrário de antes: o Gestor não
   * escolhe setor, mas filtra subsetor dentro do próprio, e é desta lista que
   * sai a validação do `?subsetor=`.
   */
  const scopes =
    isAdmin || user.sectorId ? await listScopesForOverview(isAdmin ? null : user.sectorId) : [];

  /*
   * A MESMA resolução da página (`app/meu-setor/page.tsx`), incluindo o padrão:
   * para o Gestor o parâmetro NÃO EXISTE, e o Admin sem parâmetro cai no
   * primeiro setor, como a tela faz. Divergir aqui faria a mesma URL abrir uma
   * tela e recusar o relatório dela.
   */
  const sectorId = isAdmin ? (pedido ?? scopes[0]?.sectorId ?? null) : user.sectorId;
  if (!sectorId) return new Response("Nenhum setor vinculado ao seu cadastro", { status: 400 });

  // Admin com parâmetro forjado: só vale setor que existe.
  if (isAdmin && !scopes.some((s) => s.sectorId === sectorId)) {
    return new Response("Setor não encontrado", { status: 404 });
  }

  /*
   * `?subsetor=` forjado é IGNORADO, exatamente como na página: só vale
   * subsetor do setor que o escopo acima liberou. Para o Gestor isso é a
   * trava — a lista dele só tem o próprio setor, então um id de outro setor
   * não casa e o relatório sai com o setor dele inteiro, nunca com a equipe
   * alheia recortada.
   */
  const aberto = scopes.find((s) => s.sectorId === sectorId);
  const subsectorId =
    subPedido && aberto?.subsectors.some((s) => s.subsectorId === subPedido) ? subPedido : null;

  const data = await getSectorOverview({ sectorId, subsectorId });

  /*
   * Os campos de CADASTRO não vêm de `MemberOverview` de propósito: usuário e
   * telefone não são exibidos em tela nenhuma do painel, e colocá-los no tipo
   * os despacharia no payload da página para todo mundo que a abre. O
   * relatório é quem os pede, então o relatório é quem os busca.
   */
  const memberIds = data.members.map((m) => m.userId);
  const cadastros = await prisma.user.findMany({
    where: { id: { in: memberIds } },
    select: {
      id: true,
      username: true,
      phone: true,
      unit: { select: { label: true } },
      subsectors: { select: { subsector: { select: { label: true } } } },
    },
  });
  const cadastroPorId = new Map(cadastros.map((c) => [c.id, c] as const));

  /*
   * Documentação pessoa por pessoa, cada uma pelo portão.
   *
   * São duas consultas por colaborador (o portão) mais uma (as pastas). É
   * aceitável porque o relatório é sob demanda e de um setor só — e trocar o
   * portão por uma inferência de "este gestor alcança este setor" seria
   * reescrever a regra de acesso num segundo lugar, que é exatamente como ela
   * passa a divergir.
   */
  const membros: SectorReportMember[] = [];
  for (const member of data.members) {
    const cadastro = cadastroPorId.get(member.userId);
    const alcanca = await canReadPersonnelOf(user.id, role, member.userId);
    membros.push({
      member,
      username: cadastro?.username ?? "—",
      phone: cadastro?.phone ?? undefined,
      unitLabel: cadastro?.unit?.label ?? undefined,
      subsectorLabels: cadastro?.subsectors.map((s) => s.subsector.label) ?? [],
      folders: alcanca ? ((await getPersonnelFolders(member.userId)) ?? []) : null,
    });
  }

  const agora = new Date();
  /*
   * O recorte no título E no nome do arquivo. Dois relatórios do mesmo setor,
   * um por subsetor, baixados na mesma tarde, chegariam com nome idêntico na
   * pasta de downloads — e o navegador os guardaria como "(1)" e "(2)", sem
   * ninguém saber qual é qual.
   */
  const escopoLabel = data.subsectorLabel
    ? `${data.sectorLabel} · ${data.subsectorLabel}`
    : data.sectorLabel;
  const pdf = gerarRelatorioSetorPdf({
    sectorLabel: escopoLabel,
    requestedByName: user.fullName,
    generatedAtLabel: `${dateLabelBR(agora)} às ${timeLabelBR(agora)}`,
    progress: data.progress,
    average: data.average,
    memberCount: data.memberCount,
    rejections: data.rejections,
    members: membros,
  });

  return new Response(pdf, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${nomeDoArquivo(escopoLabel, agora)}"`,
      // Nunca cacheado: o arquivo carrega documentação pessoal e o recorte
      // depende de quem pediu — uma resposta guardada serviria o relatório de
      // um gestor a outro, e sobreviveria à retirada do acesso.
      "cache-control": "no-store, max-age=0",
    },
  });
}
