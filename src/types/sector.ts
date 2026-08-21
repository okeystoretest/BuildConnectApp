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

export interface VideoItem {
  id: string;
  title: string;
  watched: boolean;
  isNew?: boolean;
  tags?: readonly string[];
  /** Caminho público do arquivo de vídeo (reproduzido no modal). */
  filePath?: string;
  /** Caminho público do documento "Instrução Escrita" (abre em nova aba). */
  instructionPath?: string;
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

export type FileKind = "PDF" | "DOCX" | "XLSX" | "PNG";

export interface DocumentItem {
  id: string;
  name: string;
  size: string;
  kind: FileKind;
  tags?: readonly string[];
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
  completion: number;
  photos: readonly PhotoItem[];
  videos: readonly VideoItem[];
  workshops: readonly VideoItem[];
  documents: readonly DocumentItem[];
  links: readonly LinkItem[];
  /** Rótulo do subsetor de origem quando os aplicativos são herdados. */
  appsSourceLabel?: string;
}
