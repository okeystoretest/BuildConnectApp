"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Play, Captions, MessageSquareText, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { EditableMediaActions } from "./editable-media-actions";
import type { MediaEditValue } from "./media-edit-modal";
import { VideoModal } from "./video-modal";
import { deleteSectorVideo } from "@/lib/sector-actions";
import { useUploadProgress } from "@/lib/use-upload-progress";
import { useToast } from "@/providers/toast-provider";
import type { VideoItem } from "@/types/sector";

/**
 * Pendência de resposta: chegou ao fim e ainda não respondeu à pergunta de
 * compreensão. Clicar abre o player já com a pergunta — é a resposta que
 * conclui o vídeo. Vitrines (Coleção, Workshop) não têm regra de conclusão.
 *
 * É o único elemento clicável da miniatura além do play, e por isso fica no
 * canto ESQUERDO, longe do selo de estado.
 */
function AnswerButton({
  video,
  comprehension,
  onAnswer,
}: {
  video: VideoItem;
  comprehension: boolean;
  onAnswer: () => void;
}) {
  if (!comprehension) return null;
  if (!video.ended || video.watched || video.comprehension) return null;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onAnswer();
      }}
      className="focus-ring inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent transition-colors hover:bg-accent/25"
    >
      <MessageSquareText className="h-3 w-3" /> Responder
    </button>
  );
}

/**
 * Selo "Assistido": a resposta de compreensão foi enviada. Só leitura —
 * assistido não é clique.
 *
 * Pill BRANCA nos dois temas, de propósito. Ela pousa sobre a miniatura, que
 * é uma imagem qualquer: um selo que acompanhasse o tema ficaria escuro sobre
 * um quadro escuro. Branco sólido com sombra é o que se enxerga sobre
 * qualquer frame.
 *
 * "Avaliado" (o gestor já deu a nota) NÃO aparece aqui — vive dentro do
 * player, em `video-modal`.
 */
function WatchedPill({
  video,
  comprehension,
  className,
}: {
  video: VideoItem;
  comprehension: boolean;
  className?: string;
}) {
  if (!comprehension || !video.watched) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-900 shadow-md ring-1 ring-black/10",
        className,
      )}
    >
      <CheckCircle2 className="h-3 w-3" /> Assistido
    </span>
  );
}

/** Selo de transcrição disponível. */
function TranscriptBadge({ video, className }: { video: VideoItem; className?: string }) {
  if (!video.transcriptText?.trim()) return null;
  return (
    <span className={cn("flex items-center text-muted", className)}>
      <Captions className="h-3.5 w-3.5" aria-label="Transcrição disponível" />
    </span>
  );
}

/** Vídeo que chegou por compartilhamento: mostra de onde veio. */
function SharedBadge({ video, className }: { video: VideoItem; className?: string }) {
  if (!video.sharedFrom) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted",
        className,
      )}
      title={`Compartilhado por ${video.sharedFrom}`}
    >
      <Share2 className="h-3 w-3" /> {video.sharedFrom}
    </span>
  );
}

/** Miniatura do vídeo; sem ela, o placeholder listrado de sempre. */
function Thumbnail({ video, className }: { video: VideoItem; className?: string }) {
  if (!video.thumbnailPath) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={video.thumbnailPath}
      alt=""
      loading="lazy"
      className={cn("absolute inset-0 h-full w-full object-cover", className)}
    />
  );
}

/**
 * Salvar (título, tags, transcrição, compartilhamento) e excluir, ligados ao
 * servidor. Compartilhado pelo card e pela linha da lista.
 */
function useVideoAdmin(slug: string, video: VideoItem, sharing: boolean) {
  const router = useRouter();
  const toast = useToast();
  const upload = useUploadProgress();
  const [editing, setEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();

  // Só Instruções compartilham (o servidor filtra por INSTRUCAO). O card
  // não sabe o kind; `comprehension` é o que identifica a aba. Passado
  // como parâmetro acima. Memoizado: o modal recarrega a lista de destinos
  // quando este objeto muda, e ele não deve mudar a cada render do card.
  const sharingProps = useMemo(
    () => (sharing ? { slug, current: video.sharedWith ?? [] } : undefined),
    [sharing, slug, video.sharedWith],
  );

  async function save(value: MediaEditValue) {
    setSaveError(null);
    const fd = new FormData();
    fd.set("slug", slug);
    fd.set("id", video.id);
    fd.set("title", value.title);
    for (const tag of value.tags) fd.append("tags", tag);
    for (const sid of value.shareWith ?? []) fd.append("shareWith", sid);
    fd.set("transcriptMode", value.transcriptMode ?? "keep");
    if (value.transcriptMode === "replace" && value.transcriptFile) {
      fd.set("transcriptFile", value.transcriptFile);
    }
    const res = await upload.send("setor-video-editar", fd);
    upload.reset();
    if (res.ok) {
      setEditing(false);
      router.refresh();
    } else {
      setSaveError(res.error ?? "Falha ao salvar.");
    }
  }

  function remove() {
    startDelete(async () => {
      const res = await deleteSectorVideo({ slug, id: video.id });
      if (res.ok) {
        toast.success("Vídeo excluído.");
        router.refresh();
      } else {
        toast.error(res.error ?? "Falha ao excluir o vídeo.");
      }
    });
  }

  return {
    title: video.title,
    tags: video.tags,
    transcript: { hasCurrent: Boolean(video.transcriptText?.trim()) },
    sharing: sharingProps,
    saving: upload.busy,
    saveError,
    editing,
    onEditingChange: (open: boolean) => {
      setEditing(open);
      if (!open) setSaveError(null);
    },
    onSave: (value: MediaEditValue) => void save(value),
    onDelete: remove,
    deleting,
  };
}

export interface VideoCardProps {
  slug: string;
  video: VideoItem;
  /** Tags em uso no setor, oferecidas como sugestão na edição. */
  suggestions?: readonly string[];
  /**
   * Instruções em Vídeo: ao concluir, pergunta de compreensão. As vitrines
   * (Coleção, Workshop) não passam — só rastreiam a conclusão.
   */
  comprehension?: boolean;
  /**
   * Veio do aviso de reprovação: abre o player deste vídeo já reproduzindo.
   * Quem decide é a página do setor, lendo `?video=&assistir=1`.
   */
  autoOpen?: boolean;
}

/** Abrir/fechar o player, com a variante "abrir já na pergunta". */
function usePlayer(autoOpen = false) {
  const router = useRouter();
  const [state, setState] = useState<{ open: boolean; askNow: boolean }>({
    open: autoOpen,
    askNow: false,
  });
  return {
    open: state.open,
    askNow: state.askNow,
    play: () => setState({ open: true, askNow: false }),
    answer: () => setState({ open: true, askNow: true }),
    close: () => setState({ open: false, askNow: false }),
    // Progresso ou resposta gravados: o selo do card vem do servidor.
    changed: () => router.refresh(),
  };
}

export function VideoCard({
  slug,
  video,
  suggestions,
  comprehension = false,
  autoOpen = false,
}: VideoCardProps) {
  const player = usePlayer(autoOpen);
  const { deleting, ...admin } = useVideoAdmin(slug, video, comprehension);

  return (
    <>
      <article
        className={cn(
          "group relative overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-border-strong",
          deleting && "pointer-events-none opacity-50",
        )}
      >
        {/* Vídeo compartilhado: quem edita e exclui é o subsetor dono. */}
        {!video.sharedFrom && <EditableMediaActions {...admin} suggestions={suggestions} />}

        {/* Irmãos do botão de play, não filhos: <button> dentro de <button> é
            HTML inválido e o React avisa no console.

            Ação à esquerda, estado à direita — os dois nunca aparecem juntos
            (responder é antes de assistir), mas os cantos fixos evitam que o
            selo dance de lado conforme o vídeo avança. */}
        <span className="absolute left-3 top-3 z-10">
          <AnswerButton video={video} comprehension={comprehension} onAnswer={player.answer} />
        </span>
        <span className="absolute right-3 top-3 z-10">
          <WatchedPill video={video} comprehension={comprehension} />
        </span>

        <button
          type="button"
          onClick={player.play}
          aria-label={`Reproduzir: ${video.title}`}
          className="bc-stripes focus-ring relative flex aspect-video w-full items-center justify-center overflow-hidden bg-surface-2"
        >
          <Thumbnail video={video} className="transition-transform group-hover:scale-[1.03]" />

          <span className="relative z-10 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform group-hover:scale-110">
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          </span>
        </button>

        <div className="flex items-center justify-between gap-2 p-3.5">
          <h3 className="truncate text-sm font-medium text-foreground">{video.title}</h3>
          <SharedBadge video={video} className="shrink-0" />
          <TranscriptBadge video={video} className="shrink-0" />
        </div>
      </article>

      <VideoModal
        video={video}
        open={player.open}
        askNow={player.askNow}
        autoPlay={autoOpen}
        comprehension={comprehension}
        onClose={player.close}
        onChanged={player.changed}
      />
    </>
  );
}

export function VideoListRow({
  slug,
  video,
  suggestions,
  comprehension = false,
  autoOpen = false,
}: VideoCardProps) {
  const player = usePlayer(autoOpen);
  const { deleting, ...admin } = useVideoAdmin(slug, video, comprehension);

  return (
    <>
      <article
        className={cn(
          "relative flex items-center gap-4 rounded-xl border border-border bg-surface p-3 pr-24 transition-colors hover:border-border-strong",
          deleting && "pointer-events-none opacity-50",
        )}
      >
        <button
          type="button"
          onClick={player.play}
          aria-label={`Reproduzir: ${video.title}`}
          className="bc-stripes focus-ring relative flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2"
        >
          <Thumbnail video={video} />
          <Play className="relative z-10 h-4 w-4 fill-primary text-primary drop-shadow" />
        </button>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-foreground">{video.title}</h3>
          <div className="flex items-center">
            <SharedBadge video={video} className="mt-1 mr-2" />
            <TranscriptBadge video={video} className="mt-1" />
          </div>
        </div>

        <AnswerButton video={video} comprehension={comprehension} onAnswer={player.answer} />
        <WatchedPill video={video} comprehension={comprehension} className="shrink-0" />

        {/* Vídeo compartilhado: quem edita e exclui é o subsetor dono. */}
        {!video.sharedFrom && (
          <EditableMediaActions
            {...admin}
            suggestions={suggestions}
            className="!top-1/2 !-translate-y-1/2 !bg-transparent"
          />
        )}
      </article>

      <VideoModal
        video={video}
        open={player.open}
        askNow={player.askNow}
        autoPlay={autoOpen}
        comprehension={comprehension}
        onClose={player.close}
        onChanged={player.changed}
      />
    </>
  );
}
