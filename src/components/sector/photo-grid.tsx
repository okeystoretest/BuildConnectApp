import { cn } from "@/lib/utils";
import type { PhotoItem } from "@/types/sector";

export function PhotoGrid({ photos }: { photos: readonly PhotoItem[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {photos.map((photo) => (
        <button
          key={photo.id}
          type="button"
          aria-label={`Abrir foto: ${photo.title}`}
          className={cn(
            "focus-ring group relative aspect-[4/3] overflow-hidden rounded-xl bg-gradient-to-br text-left transition-transform hover:scale-[1.01]",
            !photo.filePath && photo.swatch,
          )}
        >
          {photo.filePath && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={photo.filePath}
              alt={photo.title}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3">
            <span className="text-sm font-medium text-white">{photo.title}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
