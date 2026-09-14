export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { applyDnsPatch } = await import("./lib/dnsPatch.js");
    applyDnsPatch();
  }
}
