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

/**
 * História da empresa, em capítulos, exibida na Página de Integração.
 *
 * Em capítulos e não num parágrafo único porque o texto é uma linha do
 * tempo de verdade — infância, 2014, 2018, 2019, hoje — e um bloco corrido
 * de seis parágrafos é o tipo de coisa que o convidado rola até o fim sem
 * ler. Cada capítulo rende um marco na trilha vertical da tela.
 *
 * `photo` é OPCIONAL e a seção funciona inteira sem nenhuma: capítulo sem
 * foto vira só texto, sem buraco no layout. Para acrescentar uma, ponha o
 * arquivo em `public/historia/` e aponte aqui:
 *
 *     photo: { src: "/historia/deli.jpg", alt: "Deli no ateliê" }
 *
 * Caminho de `public/`, e não `/uploads`, porque isto é configuração
 * institucional versionada junto do código, como o logo — não material que
 * o DHO troca pela tela.
 */
export interface StoryChapter {
  /** Marco da linha do tempo. Curto: "2014", "Aos 16", "Hoje". */
  marker: string;
  title: string;
  body: string;
  photo?: { src: string; alt: string };
}

export const COMPANY_STORY: readonly StoryChapter[] = [
  {
    marker: "Fortaleza",
    title: "Onde a marca nasce",
    body: "A Okey é uma marca de moda nascida em Fortaleza, a cidade banhada pelo mar, criada por Deliane (Deli) e Carlos Trajano, casal que une arte e gestão em um só propósito.",
  },
  {
    marker: "Antes",
    title: "O banquinho de madeira e a máquina vermelho carmim",
    body: "Deli nasceu em Maracanaú, vizinha de Fortaleza, e o amor pela costura vem da infância. Sentada sob um banquinho de madeira esculpido pelo avô, ela admirava a avó paterna, uma mulher à frente do seu tempo, que costurava as próprias roupas em uma máquina doméstica vermelho carmim. As tardes rendiam risadas entre alfinetes e tecidos. A avó havia fugido da seca do sertão cearense e trouxe para a cidade grande a família e a arte.",
  },
  {
    marker: "Aos 16",
    title: "Alfaiataria e handmade",
    body: "Descendente de italianos, Deli carrega o sobrenome Trajano, herança de antepassados que são um mistério, mas que deixaram no seu DNA o amor pela alta costura. Aos 16 anos, entrou no mundo da moda como modelista e designer. Encantada por arte e acabamentos finos, uniu a alfaiataria ao handmade: o resultado são peças que transitam entre o tempo e carregam as histórias das mãos que as teceram.",
  },
  {
    marker: "O encontro",
    title: "Carlos, filho de costureira",
    body: "Carlos, marido de Deli, é órfão de pai e filho de costureira, e cresceu vendo a mãe costurar. Amava a arte de costurar e também a de gerir pessoas. Foi a combinação perfeita para o que viria.",
  },
  {
    marker: "2014",
    title: "Nasce a Okey",
    body: "Em junho de 2014, a criatividade de Deli e a visão de Carlos se uniram para dar origem à Okey. Sem capital inicial, começaram como private label, entregando peças prontas para outras marcas. A marca ainda não existia para o mundo, mas sua história já estava sendo escrita.",
  },
  {
    marker: "2018",
    title: "A decisão final",
    body: "Em 2018, encerraram a private label e concentraram todas as forças na Okey. Em julho daquele ano chegou o e-commerce; três meses depois, a loja física no Shopping Iguatemi.",
  },
  {
    marker: "2019",
    title: "São Paulo",
    body: "O showroom de atacado em São Paulo abriu as portas da marca para o resto do país.",
  },
  {
    marker: "Hoje",
    title: "Quem faz a Okey",
    body: "Hoje, a Okey reúne quem é apaixonado pelo mundo fashion, pelos sonhos e pelo propósito.",
  },
];

export const CULTURE_TEXT =
  "Acreditamos que grandes resultados nascem de times que confiam uns nos outros. Aqui, cada colaborador tem voz, autonomia para propor melhorias e apoio para crescer.";
