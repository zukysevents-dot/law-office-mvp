"use client";

// Last-resort boundary for errors thrown in the root layout. Must render its own
// <html>/<body>. Keeps the message generic — no stack trace to the client.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="cs">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#072924",
          color: "#fff",
          textAlign: "center",
          padding: "1rem",
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>
            Něco se pokazilo
          </h1>
          <p style={{ fontSize: "0.875rem", opacity: 0.85, marginBottom: "1rem" }}>
            Aplikaci se nepodařilo načíst. Zkuste to prosím znovu.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              border: "1px solid rgba(255,255,255,0.4)",
              background: "transparent",
              color: "#fff",
              padding: "0.5rem 1rem",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Zkusit znovu
          </button>
        </div>
      </body>
    </html>
  );
}
