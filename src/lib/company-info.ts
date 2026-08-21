import type { CompanyValue } from "@/types/content";

/**
 * Conteúdo institucional da empresa (missão, visão, valores, cultura).
 * É configuração — não são dados de usuário nem operação. Editar aqui.
 * Se um dia virar editável pelo RH na plataforma, migra para o banco.
 */

export const COMPANY_VALUES: readonly CompanyValue[] = [
  {
    title: "Missão",
    icon: "Target",
    body: "Gerar valor e conexões duradouras com nossa comunidade mediante a entrega de design artesanal e atemporal de alta qualidade.",
  },
  {
    title: "Visão",
    icon: "Eye",
    body: "Ser referência internacional em design autêntico e inovação socioambiental, conectando uma comunidade engajada.",
  },
  {
    title: "Valores",
    icon: "Heart",
    body: "Integridade, excelência, responsabilidade socioambiental e transformação em tudo que fazemos.",
  },
];

export const CULTURE_TEXT =
  "Acreditamos que grandes resultados nascem de times que confiam uns nos outros. Aqui, cada colaborador tem voz, autonomia para propor melhorias e apoio para crescer.";
