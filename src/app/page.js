export const dynamic = "force-dynamic";

export default function RootPage() {
  return (
    <main style={{ fontFamily: "monospace", padding: "2rem" }}>
      <pre>
        {JSON.stringify(
          {
            status: "ok",
            service: "codice-sconto-backend",
            version: "1.0.0",
            health: "/api/health",
            documentation: "ENDPOINT_INVENTORY.md",
          },
          null,
          2
        )}
      </pre>
    </main>
  );
}
