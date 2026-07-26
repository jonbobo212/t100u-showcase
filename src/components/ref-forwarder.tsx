"use client";

import { useEffect } from "react";
import { REF_CODE_PATTERN, REF_COOKIE } from "@/lib/referral";

/* Closes the cross-app attribution chain: if the visitor carries an agency
 * referral cookie, outbound links to Aplify/Aspira get `ref={code}` appended
 * at click time, so the partner app can persist the attribution on signup
 * (see docs/HANDOFF_TO_APLIFY.md / HANDOFF_TO_ASPIRA.md). Click-time (not
 * render-time) because pages are SSG and must stay cacheable per-visitor. */

const PARTNER_HOST = /(^|\.)(aplify\.org|aspira\.study)$/;

function readRefCookie(): string | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${REF_COOKIE}=([^;]*)`)
  );
  if (!match) return null;
  const value = decodeURIComponent(match[1]);
  return REF_CODE_PATTERN.test(value) ? value : null;
}

export function RefForwarder() {
  useEffect(() => {
    const decorate = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      let url: URL;
      try {
        url = new URL(anchor.href);
      } catch {
        return;
      }
      if (!PARTNER_HOST.test(url.hostname) || url.searchParams.has("ref")) {
        return;
      }
      const ref = readRefCookie();
      if (!ref) return;
      url.searchParams.set("ref", ref);
      anchor.href = url.toString();
    };
    document.addEventListener("click", decorate, true);
    document.addEventListener("auxclick", decorate, true);
    return () => {
      document.removeEventListener("click", decorate, true);
      document.removeEventListener("auxclick", decorate, true);
    };
  }, []);
  return null;
}
