/**
 * Política de segurança de conteúdo.
 *
 * Dividida em duas: o que é seguro IMPOR hoje e o que precisa ser observado
 * antes. As diretivas estruturais (moldura, base, formulário, plugin) não têm
 * como quebrar esta aplicação — ela não roda em iframe, não usa <base> nem
 * plugin, e todo formulário posta nela mesma. Já script-src e style-src
 * exigiriam nonce por requisição: o Next injeta script inline de hidratação e
 * o Tailwind gera estilo inline. Por isso a política completa vai em
 * Report-Only: o navegador RELATA o que quebraria, sem quebrar nada.
 *
 * Como ler os relatos: abra a aplicação com o console do navegador aberto e
 * procure por "Content-Security-Policy". Quando a lista estiver estável e
 * conhecida, movemos a política para o header que impõe.
 *
 * Origens externas usadas hoje (auditadas no código):
 *  - https://{s}.tile.openstreetmap.org  — tiles do mapa de rota (Leaflet)
 *  - https://www.openstreetmap.org       — link de atribuição do mapa
 *  - Nominatim é chamado NO SERVIDOR (lib/tracking/geocode.ts): não entra aqui.
 *  - Fontes: next/font/google faz download no build e auto-hospeda. Sem CDN.
 */
const cspEstrutural = [
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const cspCompleta = [
  "default-src 'self'",
  // 'unsafe-inline' aqui é o que precisa sair; exige nonce por requisição.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // data: para ícones embutidos; blob: para a pré-visualização de imagem antes
  // do envio (URL.createObjectURL no seletor de arquivos).
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self'",
  "worker-src 'self' blob:",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  images: {
    formats: ["image/webp"],
  },
  async headers() {
    const headers = [
      // O navegador não adivinha o tipo do conteúdo: respeita o Content-Type.
      { key: "X-Content-Type-Options", value: "nosniff" },
      // Nada de enquadrar a aplicação em iframe de terceiro (clickjacking).
      { key: "X-Frame-Options", value: "DENY" },
      // A URL completa não vaza para sites externos; a origem, sim.
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // Geolocalização é usada pelo rastreio de corrida do motorista — fica
      // liberada para a própria aplicação. O resto, desligado.
      {
        key: "Permissions-Policy",
        value: "geolocation=(self), microphone=(), payment=(), interest-cohort=()",
      },
      { key: "Content-Security-Policy", value: cspEstrutural },
      { key: "Content-Security-Policy-Report-Only", value: cspCompleta },
    ];

    // HSTS só em produção: em desenvolvimento a aplicação roda em http, e
    // prender o navegador a https na máquina do desenvolvedor só atrapalha.
    // Sem includeSubDomains nem preload de propósito — os dois são difíceis de
    // desfazer e afetam subdomínios que esta aplicação não controla.
    if (process.env.NODE_ENV === "production") {
      headers.push({
        key: "Strict-Transport-Security",
        value: "max-age=15552000",
      });
    }

    return [{ source: "/:path*", headers }];
  },
  experimental: {
    serverActions: {
      // BLOQUEADOR DE PRODUÇÃO: o limite padrão de corpo de Server Action é
      // 1 MB. Todo upload do sistema (foto, vídeo, documento, avatar) passa
      // por Server Action com FormData — sem este ajuste, qualquer arquivo
      // acima de 1 MB falha com "Body exceeded 1 MB limit", mesmo com o proxy
      // liberado e o volume montado. Em dev ninguém percebe: as fotos de teste
      // são pequenas.
      //
      // O valor acompanha o maior limite de src/lib/storage/files.ts
      // (vídeo = 500 MB), com folga para o overhead do multipart.
      bodySizeLimit: "520mb",
    },
  },
};

export default nextConfig;
