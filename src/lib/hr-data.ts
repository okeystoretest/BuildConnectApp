import type {
  EvaluationType,
  HrDocument,
  IntegrationMap,
  ManagedUser,
} from "@/types/hr";

export const EVALUATION_TYPES: readonly EvaluationType[] = [
  { id: "e1", title: "Acompanhamento Funcional Pré-Efetivo", count: 4 },
  { id: "e2", title: "Análise de Desempenho Comportamental", count: 3 },
  { id: "e3", title: "Matriz de Decisão", count: 2 },
  { id: "e4", title: "Avaliação Multidirecional de Eficácia no Trabalho", count: 1 },
  { id: "e5", title: "Avaliação Multidirecional de Inteligência Emocional", count: 2 },
];

export const INTEGRATION_MAPS: readonly IntegrationMap[] = [
  { id: "m1", title: "Integração Geral", scope: "Todas as áreas", progress: 100, status: "CONCLUIDO" },
  { id: "m2", title: "Trilha Logística", scope: "Logística", progress: 75, status: "EM_ANDAMENTO" },
  { id: "m3", title: "Trilha Comercial", scope: "Comercial", progress: 40, status: "EM_ANDAMENTO" },
  { id: "m4", title: "Segurança do Trabalho", scope: "Produção", progress: 60, status: "EM_ANDAMENTO" },
];

export const HR_DOCUMENTS: readonly HrDocument[] = [
  { id: "h1", name: "Política de Benefícios.pdf", size: "1.2 MB", kind: "PDF" },
  { id: "h2", name: "Código de Conduta.pdf", size: "800 KB", kind: "PDF" },
  { id: "h3", name: "Manual do Colaborador.docx", size: "340 KB", kind: "DOCX" },
  { id: "h4", name: "Tabela Salarial.xlsx", size: "90 KB", kind: "XLSX" },
];

export const MANAGED_USERS: readonly ManagedUser[] = [
  {
    id: "u1",
    name: "Ana Ribeiro",
    username: "ana#BC",
    role: "COLABORADOR",
    sector: "Logística",
    subsectors: "Estoque",
  },
  {
    id: "u2",
    name: "Carlos Mendes",
    username: "carlos#BC",
    role: "GESTOR",
    sector: "Comercial",
    subsectors: "Vendas",
  },
  {
    id: "u3",
    name: "Beatriz Souza",
    username: "beatriz#BC",
    role: "ADMIN",
    sector: "TI",
    subsectors: "—",
  },
  {
    id: "u4",
    name: "Diego Alves",
    username: "diego#BC",
    role: "COLABORADOR",
    sector: "Produção",
    subsectors: "Corte, Acabamento",
  },
  {
    id: "u5",
    name: "Fernanda Lima",
    username: "fernanda#BC",
    role: "COLABORADOR",
    sector: "Comercial",
    subsectors: "OKEY - Vitrine",
  },
  {
    id: "u6",
    name: "Gustavo Rocha",
    username: "gustavo#BC",
    role: "COLABORADOR",
    sector: "Logística",
    subsectors: "Motoristas",
  },
  {
    id: "u7",
    name: "João Motta",
    username: "joao#BC",
    role: "COLABORADOR",
    sector: "Logística",
    subsectors: "Motoristas",
  },
  {
    id: "u8",
    name: "Pedro Dias",
    username: "pedro#BC",
    role: "COLABORADOR",
    sector: "Logística",
    subsectors: "Motoristas",
  },
];
