import { useEffect } from "react";
import { buildFaviconHref, type FaviconColor } from "./documentTitle.js";

export function useDocumentChrome(title: string, favicon: FaviconColor): void {
  useEffect(() => {
    document.title = title;
  }, [title]);

  useEffect(() => {
    const link = ensureFaviconLink();
    link.href = buildFaviconHref(favicon);
  }, [favicon]);
}

function ensureFaviconLink(): HTMLLinkElement {
  const existing = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (existing) {
    if (existing.type !== "image/svg+xml") existing.type = "image/svg+xml";
    return existing;
  }
  const link = document.createElement("link");
  link.rel = "icon";
  link.type = "image/svg+xml";
  document.head.appendChild(link);
  return link;
}
