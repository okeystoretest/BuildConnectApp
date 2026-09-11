import { prisma } from "@/lib/db/prisma";

/**
 * Escritas do vídeo de boas-vindas (setor e plataforma) no banco.
 *
 * Existe separado das actions por um motivo só: é aqui que mora a promessa
 * "quem assistiu uma vez não assiste de novo", e é isto que o teste de banco
 * (`welcome-video-core.dbtest.ts`) prova.
 *
 * Até 11/09/2026 trocar o vídeo APAGAVA as visualizações — a ideia era que o
 * vídeo novo tinha de ser visto por todos. Na prática, cada reenvio (e houve
 * vários nos ajustes de upload de 09/09) obrigou a plataforma inteira a
 * assistir de novo, e foi isso que os usuários relataram. A marca de
 * "assistido" é da PESSOA, não do arquivo: trocar ou remover o vídeo não a
 * toca. Se um dia for preciso reexibir para todos, isso será uma ação
 * explícita ("zerar visualizações"), não um efeito colateral do upload.
 */

const PLATFORM_ID = "singleton";

/** Grava o vídeo novo do subsetor. Não toca em `SubsectorWelcomeView`. */
export async function publishSectorWelcomeVideo(
  subsectorId: string,
  publicPath: string,
  title: string | null,
): Promise<void> {
  await prisma.subsector.update({
    where: { id: subsectorId },
    data: {
      welcomeVideoPath: publicPath,
      welcomeVideoTitle: title || null,
      welcomeVideoAt: new Date(),
    },
  });
}

/** Tira o vídeo do subsetor. As visualizações ficam, para o próximo vídeo. */
export async function clearSectorWelcomeVideo(subsectorId: string): Promise<void> {
  await prisma.subsector.update({
    where: { id: subsectorId },
    data: { welcomeVideoPath: null, welcomeVideoTitle: null, welcomeVideoAt: null },
  });
}

/** Grava o vídeo novo da plataforma. Não toca em `User.platformWelcomeWatchedAt`. */
export async function publishPlatformWelcomeVideo(
  publicPath: string,
  title: string | null,
): Promise<void> {
  await prisma.platformWelcomeVideo.upsert({
    where: { id: PLATFORM_ID },
    update: { path: publicPath, title: title || null, publishedAt: new Date() },
    create: { id: PLATFORM_ID, path: publicPath, title: title || null },
  });
}

/** Tira o vídeo da plataforma. As datas de quem assistiu ficam. */
export async function clearPlatformWelcomeVideo(): Promise<void> {
  await prisma.platformWelcomeVideo.deleteMany({ where: { id: PLATFORM_ID } });
}
