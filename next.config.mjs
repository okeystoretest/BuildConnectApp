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
  // Baileys fora do empacotamento do servidor.
  //
  // Ele carrega libsignal e protobufjs com require dinâmico, e mantém um
  // WebSocket vivo — coisas que o bundler do Next ou quebra na análise
  // estática, ou duplica a cada recompilação, deixando duas conexões
  // disputando a mesma sessão. Externo, é o Node que o carrega, uma vez.
  serverExternalPackages: ["baileys"],
  // Sem "X-Powered-By: Next.js" na resposta. Medido em produção, ele estava
  // sendo enviado: anuncia o framework para qualquer requisição e entrega de
  // graça a lista de CVEs que vale a pena tentar primeiro.
  poweredByHeader: false,
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
    // O PORTÃO MAIS BAIXO, e o menos óbvio dos dois.
    //
    // O Server Action posta na URL da própria página, e o matcher do
    // middleware cobre /setores/*. Então o Next bufferiza o corpo para o
    // middleware ANTES de qualquer outra coisa — e o padrão dele são 10 MB.
    // Acima disso a requisição é abortada com ECONNRESET, e o navegador recebe
    // uma resposta que o cliente do Next não consegue interpretar: a tela cai
    // no boundary genérico "Algo deu errado".
    //
    // Era isto que derrubava o envio de vídeo. O bodySizeLimit de 520 MB
    // abaixo nunca chegou a valer: este portão fecha primeiro.
    //
    // ACOMPANHA MAX_REQUEST_BYTES em src/lib/storage/limits.ts. Este arquivo é
    // ESM puro e não importa TypeScript, então os dois números vivem
    // separados: mexeu em um, mexa no outro.
    middlewareClientMaxBodySize: "145mb",
    serverActions: {
      // O limite padrão de corpo de Server Action é 1 MB. Todo upload do
      // sistema (foto, vídeo, documento, avatar) passa por Server Action com
      // FormData — sem este ajuste, qualquer arquivo acima de 1 MB falha com
      // "Body exceeded 1 MB limit". Em dev ninguém percebe: as fotos de teste
      // são pequenas.
      //
      // 145 MB cobre o pior envio legítimo do modal de vídeo — vídeo (110) +
      // instrução escrita (25) + transcrição (5) = 140, mais folga para o
      // overhead do multipart.
      //
      // O NÚMERO É DITADO POR TEMPO, não por memória. O `requestTimeout` do
      // Node vale 300 s e o `next start` não deixa mexer nele; a 4,8 Mbps
      // medidos em produção, 145 MB levam ~243 s. O teto anterior de 215 MB
      // permitia um envio de ~344 s, que morria em 502 com um ECONNRESET mudo
      // depois de o usuário esperar quase seis minutos.
      //
      // A memória, que já foi o critério, hoje sobra: mesmo bufferizado duas
      // vezes (aqui e no middleware acima), dá ~290 MB contra ~11 GB livres.
      bodySizeLimit: "145mb",
    },
  },
};

export default nextConfig;
