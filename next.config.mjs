/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  images: {
    formats: ["image/webp"],
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
