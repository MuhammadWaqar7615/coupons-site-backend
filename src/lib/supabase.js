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

export async function deleteFromSupabase(bucket, path) {
  console.log(`[deleteFromSupabase] bucket=${bucket} path=${path}`);
  if (!path || !supabase) return;
  try {
    let cleanPath = path;
    if (typeof cleanPath === "string" && (cleanPath.startsWith("http://") || cleanPath.startsWith("https://"))) {
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
      console.error(`Error deleting ${cleanPath} from ${bucket}:`, error);
    }
  } catch (err) {
    console.error(`Exception deleting ${path} from ${bucket}:`, err);
  }
}

export default supabase;

