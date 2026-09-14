import dns from "node:dns";

const STATIC_HOST_MAP = {
  "orbolbsltbknqhioztiy.supabase.co": ["172.64.149.246", "104.18.38.10"],
  "aws-0-ap-southeast-2.pooler.supabase.com": ["3.106.102.114"],
};

export function applyDnsPatch() {
  if (globalThis.__dnsPatchApplied) return;
  globalThis.__dnsPatchApplied = true;

  // Extract hostname from SUPABASE_URL if present
  try {
    if (process.env.SUPABASE_URL) {
      const url = new URL(process.env.SUPABASE_URL);
      if (url.hostname && !STATIC_HOST_MAP[url.hostname]) {
        STATIC_HOST_MAP[url.hostname.toLowerCase()] = ["172.64.149.246", "104.18.38.10"];
      }
    }
  } catch {
    // Ignore URL parse error
  }

  const origLookup = dns.lookup;
  const dnsCache = new Map(); // hostname -> { ips, expiresAt }

  dns.lookup = function (hostname, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }

    const cleanHost = (hostname || "").toLowerCase().trim();

    // 1. Direct match in static host map (instant 0ms resolution)
    if (STATIC_HOST_MAP[cleanHost]) {
      const ips = STATIC_HOST_MAP[cleanHost];
      if (options && options.all) {
        return process.nextTick(() =>
          callback(null, ips.map((ip) => ({ address: ip, family: 4 })))
        );
      }
      return process.nextTick(() => callback(null, ips[0], 4));
    }

    // 2. In-memory cache match
    const cached = dnsCache.get(cleanHost);
    if (cached && Date.now() < cached.expiresAt) {
      if (options && options.all) {
        return process.nextTick(() =>
          callback(null, cached.ips.map((ip) => ({ address: ip, family: 4 })))
        );
      }
      return process.nextTick(() => callback(null, cached.ips[0], 4));
    }

    // 3. Fallback to native lookup
    return origLookup.call(this, hostname, options, (err, address, family) => {
      if (!err && address) {
        const ips = Array.isArray(address)
          ? address.map((a) => (typeof a === "string" ? a : a.address))
          : [address];
        dnsCache.set(cleanHost, {
          ips,
          expiresAt: Date.now() + 5 * 60 * 1000, // 5 min TTL
        });
      }
      callback(err, address, family);
    });
  };

  console.log("[DNS PATCH] Fast DNS resolution applied for Supabase and external hosts.");
}

// Auto-apply on import
applyDnsPatch();

export default applyDnsPatch;
