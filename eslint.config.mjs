import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

/**
 * Configuração do ESLint (formato flat, ESLint 9).
 *
 * Até aqui o projeto tinha o script `lint`, mas nenhuma configuração: rodar
 * `npm run lint` só abria o assistente de instalação e não checava nada.
 *
 * Base: as regras do próprio Next (core-web-vitals) mais as de TypeScript.
 * Gerado, build e migrations ficam de fora — não é código escrito à mão.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "prisma/migrations/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
