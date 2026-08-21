"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          background: "#0F0B1A",
          color: "#F1EEF9",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "1rem",
        }}
      >
        <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>
          Erro inesperado na aplicação
        </h1>
        <p style={{ color: "#8B84A3", fontSize: "0.875rem", margin: 0, maxWidth: "24rem" }}>
          Recarregue a página. Se o problema continuar, avise a equipe de TI.
        </p>
        {error.digest && (
          <p style={{ color: "#8B84A3", fontFamily: "monospace", fontSize: "0.7rem", margin: 0 }}>
            Código: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: "0.75rem",
            border: "none",
            borderRadius: "0.5rem",
            background: "#4ADE80",
            color: "#141024",
            fontWeight: 600,
            fontSize: "0.875rem",
            padding: "0.625rem 1rem",
            cursor: "pointer",
          }}
        >
          Tentar novamente
        </button>
      </body>
    </html>
  );
}
