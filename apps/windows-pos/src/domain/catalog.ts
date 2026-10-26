/**
 * Catalog search: barcode-first lookup and ranked text/alias search.
 * Pure functions over the cached snapshot — no server access, works offline.
 */
import type { CatalogItem } from "@departmental/shared-types";

export interface SearchHit {
  item: CatalogItem;
  score: number;
  matchedBy: "barcode" | "alias" | "item_code" | "item_name";
}

export function findByBarcode(
  items: readonly CatalogItem[],
  barcode: string,
): CatalogItem | null {
  const normalized = barcode.trim();
  if (!normalized) return null;
  for (const item of items) {
    if (item.barcodes.some((b) => b.barcode === normalized)) return item;
  }
  return null;
}

export function searchCatalog(
  items: readonly CatalogItem[],
  query: string,
  limit = 20,
): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const tokens = q.split(/\s+/);
  const hits: SearchHit[] = [];

  for (const item of items) {
    const code = item.item_code.toLowerCase();
    const name = item.item_name.toLowerCase();
    const aliases = item.aliases.map((a) => a.toLowerCase());

    if (code === q) {
      hits.push({ item, score: 100, matchedBy: "item_code" });
      continue;
    }
    const aliasExact = aliases.indexOf(q);
    if (aliasExact >= 0) {
      hits.push({ item, score: 95, matchedBy: "alias" });
      continue;
    }
    if (name === q) {
      hits.push({ item, score: 90, matchedBy: "item_name" });
      continue;
    }

    if (tokens.every((t) => name.includes(t))) {
      hits.push({ item, score: 70, matchedBy: "item_name" });
      continue;
    }
    const aliasMatch = aliases.find((a) => tokens.every((t) => a.includes(t)));
    if (aliasMatch) {
      hits.push({ item, score: 65, matchedBy: "alias" });
      continue;
    }
    if (code.includes(q)) {
      hits.push({ item, score: 40, matchedBy: "item_code" });
      continue;
    }
    if (name.includes(q)) {
      hits.push({ item, score: 30, matchedBy: "item_name" });
      continue;
    }
    // Tolerate short typos against aliases and names (prefix of >=3 chars).
    if (q.length >= 3 && aliases.concat(name.split(" ")).some((w) => w.startsWith(q))) {
      hits.push({ item, score: 20, matchedBy: "item_name" });
    }
  }

  return hits.sort((a, b) => b.score - a.score || a.item.item_code.localeCompare(b.item.item_code)).slice(0, limit);
}
