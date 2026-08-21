import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * Health check para o Easy Panel / Traefik.
 *
 * Responde 200 só quando o banco realmente responde: um container que subiu
 * mas perdeu o Postgres precisa ser reportado como não saudável, não como
 * vivo. `SELECT 1` é a consulta mais barata possível e não toca em tabela
 * nenhuma.
 *
 * A rota é isenta do middleware de sessão (ver src/middleware.ts) — sem isso
 * o health check receberia um 302 para /login e passaria sempre.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok", db: "up", at: new Date().toISOString() },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "error", db: "down", at: new Date().toISOString() },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
