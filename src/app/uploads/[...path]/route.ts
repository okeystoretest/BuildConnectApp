import { getCurrentUser } from "@/lib/auth/require-user";
import { canAdministerDho } from "@/lib/auth/access";
import { resolveSafePath, streamFile } from "@/lib/storage/stream-file";
import type { Role } from "@/types";

/**
 * Servidor dos arquivos enviados (`/uploads/...`).
 *
 * Por que existe: o banco guarda só o caminho público e os binários ficam em
 * `UPLOADS_DIR`, FORA de `public/` — logo, fora do que o Next serve sozinho.
 * Num deploy com Nginx próprio bastava um `alias`; rodando em container
 * (Easy Panel), o proxy não enxerga esse diretório. Esta rota fecha o buraco
 * sem mudar uma linha do resto do sistema: os caminhos salvos no banco
 * continuam valendo.
 *
 * Autenticação: a rota é isenta do middleware (ver src/middleware.ts), então a
 * checagem de sessão é feita AQUI. Sem isso, todo o acervo — comprovantes,
 * documentos do DHO e evidências de denúncia — ficava acessível a quem tivesse
 * o link, sem login. Nome aleatório não é controle de acesso: URL vaza por
 * histórico, Referer, encaminhamento e cache de proxy.
 *
 * A conferência é getCurrentUser, e não getSession: o cookie é a fotografia do
 * login, e é o sessionVersion do banco que faz desligamento e rebaixamento
 * valerem na hora. Com o cookie apenas assinado, quem foi desligado seguiria
 * baixando o acervo inteiro até o token vencer — oito horas depois.
 *
 * O CONVIDADO da Página de Integração não passa por aqui, em hipótese alguma:
 * ele tem rota própria (`/api/integracao/arquivo/[assetId]`), com portão
 * próprio, que só alcança o que está registrado como peça daquela página. As
 * duas rotas compartilham a ENTREGA (lib/storage/stream-file) e nada da
 * autorização — era este o ponto de mantê-las separadas.
 */

/**
 * Categorias que só a gestão do DHO abre, e que nunca ficam em cache.
 * Conjunto único: o portão e o cabeçalho de cache têm de concordar, e duas
 * listas separadas divergem na primeira categoria nova.
 */
const SENSITIVE_CATEGORIES = new Set(["denuncias", "pessoal"]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Não autenticado", { status: 401 });

  const { path: segments } = await params;
  const category = segments?.[0];
  /*
   * Evidências da Central de Denúncias e documentação pessoal do colaborador
   * (RG, CPF, CTPS, ASO, dado bancário): só quem administra o DHO abre o
   * ARQUIVO. Papel e lotação saem do BANCO, e não do cookie — admin rebaixado,
   * ou gestor movido para fora do DHO, perde o anexo na requisição seguinte.
   *
   * O Gestor com acesso à documentação da equipe NÃO passa por aqui: ele vê a
   * página renderizada com marca d'água, em /api/documentos-pessoais. O
   * original não lhe é entregue em nenhuma hipótese, e é esta linha que
   * sustenta isso — não a ausência de um botão na tela.
   *
   * Sem esta checagem bastava ESTAR LOGADO para abrir qualquer documento de
   * qualquer colaborador com o link na mão: a tela do Departamento Pessoal é
   * restrita, mas o arquivo nunca foi, e link vaza por histórico, Referer e
   * encaminhamento. Nome aleatório não é controle de acesso.
   */
  const sensitive = SENSITIVE_CATEGORIES.has(category ?? "");
  if (sensitive && !(await canAdministerDho(user.id, user.role as Role))) {
    return new Response("Sem permissão", { status: 403 });
  }

  const filePath = resolveSafePath(segments ?? []);
  if (!filePath) return new Response("Not found", { status: 404 });

  // Nomes são aleatórios e nunca reaproveitados: cache longo. Mas "private" —
  // o conteúdo é de usuário autenticado e não pode ficar em proxy
  // compartilhado. Documento pessoal e evidência de denúncia, nunca: um ano de
  // cache deixa o arquivo no disco do navegador de quem o abriu, e de lá ele
  // volta a abrir sem passar por portão nenhum — inclusive depois de a pessoa
  // perder o acesso, ser movida de setor ou sair da empresa.
  return streamFile(request, filePath, {
    cacheControl: sensitive ? "no-store" : "private, max-age=31536000, immutable",
  });
}
