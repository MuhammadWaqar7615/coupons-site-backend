import "./dnsPatch.js";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

export const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

/**
 * Resiliently deletes a file from Supabase storage.
 * Enforces a strict 2.5-second timeout so storage API delays never freeze user requests.
 */
export async function deleteFromSupabase(bucket, path) {
  if (!path || !supabase) return;

  const performDelete = async () => {
    try {
      let cleanPath = path;
      if (
        typeof cleanPath === "string" &&
        (cleanPath.startsWith("http://") || cleanPath.startsWith("https://"))
      ) {
        const marker = `/public/${bucket}/`;
        const idx = cleanPath.indexOf(marker);
        if (idx !== -1) {
          cleanPath = cleanPath.substring(idx + marker.length);
        } else {
          const altMarker = `/${bucket}/`;
          const altIdx = cleanPath.indexOf(altMarker);
          if (altIdx !== -1) {
            cleanPath = cleanPath.substring(altIdx + altMarker.length);
          }
        }
      }
      const { error } = await supabase.storage.from(bucket).remove([cleanPath]);
      if (error) {
        console.warn(`[deleteFromSupabase] Error deleting ${cleanPath} from ${bucket}:`, error?.message || error);
      } else {
        console.log(`[deleteFromSupabase] Successfully deleted ${cleanPath} from ${bucket}`);
      }
    } catch (err) {
      console.warn(`[deleteFromSupabase] Exception deleting ${path} from ${bucket}:`, err?.message || err);
    }
  };

  // Timeout guard (2500ms max)
  const timeoutPromise = new Promise((resolve) =>
    setTimeout(() => {
      console.warn(`[deleteFromSupabase] Operation timed out (2500ms) for path: ${path}`);
      resolve();
    }, 2500)
  );

  return Promise.race([performDelete(), timeoutPromise]);
}

/**
 * Non-blocking fire-and-forget storage deletion for fast HTTP responses.
 */
export function queueDeleteFromSupabase(bucket, path) {
  if (!path) return;
  // Trigger in background without blocking response
  setImmediate(() => {
    deleteFromSupabase(bucket, path).catch(() => {});
  });
}

export default supabase;

