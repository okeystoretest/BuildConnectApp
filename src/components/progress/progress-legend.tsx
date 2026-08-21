export function ProgressLegend() {
  return (
    <div className="flex items-center gap-4 text-xs">
      <span className="flex items-center gap-1.5 text-muted">
        <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
        Vídeos
      </span>
      <span className="flex items-center gap-1.5 text-muted">
        <span className="h-2 w-2 rounded-full bg-info" aria-hidden />
        Documentos
      </span>
    </div>
  );
}
