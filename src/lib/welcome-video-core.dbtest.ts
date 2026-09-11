import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { prisma } from "@/lib/db/prisma";
import {
  clearPlatformWelcomeVideo,
  clearSectorWelcomeVideo,
  publishPlatformWelcomeVideo,
  publishSectorWelcomeVideo,
} from "./welcome-video-core";

/**
 * Testes contra um Postgres DE VERDADE (`npm run test:db`).
 *
 * O que se prova aqui é a promessa que a tela faz: quem assistiu ao vídeo de
 * boas-vindas UMA vez não assiste de novo — nem quando a administração troca
 * o vídeo, nem quando o remove e publica outro. Enquanto trocar o vídeo
 * apagava as visualizações, essa promessa era falsa, e foi exatamente o que
 * os usuários relataram depois dos reenvios de 09/09/2026.
 */

const MARK = "#DBTEST";
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let userId = "";
let sectorId = "";
let subsectorId = "";
/** Linha real do vídeo da plataforma, para devolver ao fim. */
let platformBackup: { path: string; title: string | null; publishedAt: Date } | null = null;

before(async () => {
  const user = await prisma.user.create({
    data: {
      username: `welcome-${stamp()}${MARK}`,
      fullName: "Pessoa (teste)",
      passwordHash: "x",
      role: "COLABORADOR",
      platformWelcomeWatchedAt: new Date("2026-01-01T00:00:00Z"),
    },
    select: { id: true },
  });
  userId = user.id;

  const sector = await prisma.sector.create({
    data: { slug: `setor-${stamp()}${MARK}`, label: "Setor (teste)", icon: "Box" },
    select: { id: true },
  });
  sectorId = sector.id;

  const sub = await prisma.subsector.create({
    data: {
      slug: `sub-${stamp()}${MARK}`,
      label: "Subsetor (teste)",
      icon: "Box",
      sectorId,
      welcomeVideoPath: "/uploads/conteudo/antigo.mp4",
      welcomeVideoTitle: "Antigo",
      welcomeVideoAt: new Date("2026-01-01T00:00:00Z"),
    },
    select: { id: true },
  });
  subsectorId = sub.id;

  await prisma.subsectorWelcomeView.create({ data: { userId, subsectorId } });

  platformBackup = await prisma.platformWelcomeVideo.findUnique({
    where: { id: "singleton" },
    select: { path: true, title: true, publishedAt: true },
  });
});

after(async () => {
  // A ordem importa: o subsetor cai em cascata com o setor; a view, com os dois.
  await prisma.sector.deleteMany({ where: { id: sectorId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  if (platformBackup) {
    await prisma.platformWelcomeVideo.upsert({
      where: { id: "singleton" },
      update: platformBackup,
      create: { id: "singleton", ...platformBackup },
    });
  } else {
    await prisma.platformWelcomeVideo.deleteMany({ where: { id: "singleton" } });
  }
  await prisma.$disconnect();
});

async function sectorView() {
  return prisma.subsectorWelcomeView.findUnique({
    where: { userId_subsectorId: { userId, subsectorId } },
    select: { id: true },
  });
}

async function platformWatchedAt() {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { platformWelcomeWatchedAt: true },
  });
  return me?.platformWelcomeWatchedAt ?? null;
}

test("setor: trocar o vídeo grava o caminho novo e MANTÉM quem já assistiu", async () => {
  await publishSectorWelcomeVideo(subsectorId, "/uploads/conteudo/novo.mp4", "Novo");

  const sub = await prisma.subsector.findUnique({
    where: { id: subsectorId },
    select: { welcomeVideoPath: true, welcomeVideoTitle: true },
  });
  assert.equal(sub?.welcomeVideoPath, "/uploads/conteudo/novo.mp4");
  assert.equal(sub?.welcomeVideoTitle, "Novo");
  assert.ok(await sectorView(), "a visualização sumiu ao trocar o vídeo");
});

test("setor: remover o vídeo e publicar outro também mantém a visualização", async () => {
  await clearSectorWelcomeVideo(subsectorId);
  const cleared = await prisma.subsector.findUnique({
    where: { id: subsectorId },
    select: { welcomeVideoPath: true, welcomeVideoAt: true },
  });
  assert.equal(cleared?.welcomeVideoPath, null);
  assert.equal(cleared?.welcomeVideoAt, null);
  assert.ok(await sectorView(), "a visualização sumiu ao remover o vídeo");

  await publishSectorWelcomeVideo(subsectorId, "/uploads/conteudo/terceiro.mp4", null);
  assert.ok(await sectorView(), "a visualização sumiu ao publicar de novo");
});

test("plataforma: trocar o vídeo MANTÉM a data de quem já assistiu", async () => {
  const before = await platformWatchedAt();
  assert.ok(before, "fixture: a pessoa deveria começar com data");

  await publishPlatformWelcomeVideo("/uploads/conteudo/plataforma-novo.mp4", "Plataforma");

  const row = await prisma.platformWelcomeVideo.findUnique({
    where: { id: "singleton" },
    select: { path: true, title: true },
  });
  assert.equal(row?.path, "/uploads/conteudo/plataforma-novo.mp4");
  assert.equal(row?.title, "Plataforma");
  assert.deepEqual(await platformWatchedAt(), before);
});

test("plataforma: remover e publicar de novo também mantém a data", async () => {
  const before = await platformWatchedAt();

  await clearPlatformWelcomeVideo();
  assert.equal(await prisma.platformWelcomeVideo.findUnique({ where: { id: "singleton" } }), null);
  assert.deepEqual(await platformWatchedAt(), before);

  await publishPlatformWelcomeVideo("/uploads/conteudo/plataforma-3.mp4", null);
  assert.deepEqual(await platformWatchedAt(), before);
});
