export type SectorKind = "VITRINE" | "PADRAO";

export type TabId =
  | "fotos"
  | "videos"
  | "workshop"
  | "sites"
  | "instrucoes-video"
  | "documentos"
  | "avaliacoes"
  | "cronograma";

/** Situação da resposta de compreensão (Instruções em Vídeo) do usuário logado. */
export type ComprehensionStatus = "ENVIADA" | "AVALIADA";

export interface VideoItem {
  id: string;
  title: string;
  /**
   * Assistido: a resposta de compreensão foi enviada (Instruções em Vídeo).
   * Vitrines não têm regra de conclusão — ali o valor é histórico.
   */
  watched: boolean;
  /** Chegou ao fim do vídeo: a pergunta de compreensão está liberada. */
  ended?: boolean;
  /** Ausente = ainda não respondeu à pergunta de compreensão. */
  comprehension?: ComprehensionStatus;
  isNew?: boolean;
  tags?: readonly string[];
  /** Caminho público do arquivo de vídeo (reproduzido no modal). */
  filePath?: string;
  /** Miniatura (.webp) capturada no envio. Sem ela, o card usa o placeholder. */
  thumbnailPath?: string;
  /** Texto completo da transcrição, exibido ao lado do player. */
  transcriptText?: string;
  /** Caminho público do arquivo de transcrição enviado. */
  transcriptPath?: string;
}

export interface PhotoItem {
  id: string;
  title: string;
  /** Gradiente de placeholder quando não há imagem real. */
  swatch: string;
  /** Caminho da imagem real (.webp). Quando presente, é renderizada. */
  filePath?: string;
}

export type FileKind = "PDF" | "DOCX" | "XLSX" | "PPTX" | "PNG";

export interface DocumentItem {
  id: string;
  name: string;
  size: string;
  kind: FileKind;
  tags?: readonly string[];
  /** Caminho público do arquivo, para visualizar/baixar. */
  filePath: string;
}

/** Atalho de plataforma exibido na aba "Aplicativos". */
export interface LinkItem {
  id: string;
  label: string;
  url: string;
  /** Ícone da plataforma (.webp). Sem ícone, cai no placeholder padrão. */
  iconPath?: string;
}

export interface SectorContent {
  slug: string;
  name: string;
  parent: string;
  kind: SectorKind;
  description: string;
  /**
   * Percentual concluído da área. Nulo nas vitrines: visualização casual,
   * nada ali é material a concluir.
   */
  completion: number | null;
  photos: readonly PhotoItem[];
  videos: readonly VideoItem[];
  workshops: readonly VideoItem[];
  documents: readonly DocumentItem[];
  links: readonly LinkItem[];
  /** Rótulo do subsetor de origem quando os aplicativos são herdados. */
  appsSourceLabel?: string;
}
