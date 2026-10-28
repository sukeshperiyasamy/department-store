import { PackageSearch } from "lucide-react";
import { fetchCatalogSnapshot } from "@/lib/frappe-server";
import { formatINR } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

/** Product catalog from the same snapshot the counters cache (read-only). */
export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();
  const pageNum = Math.max(1, Number.parseInt(page ?? "1", 10) || 1);

  let snapshot = null;
  let error: string | null = null;
  try {
    snapshot = await fetchCatalogSnapshot();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const items = (snapshot?.items ?? []).filter((item) => {
    if (!query) return true;
    return (
      item.item_code.toLowerCase().includes(query) ||
      item.item_name.toLowerCase().includes(query) ||
      item.aliases.some((a) => a.toLowerCase().includes(query)) ||
      item.barcodes.some((b) => b.barcode.includes(query))
    );
  });
  const total = items.length;
  const start = (pageNum - 1) * PAGE_SIZE;
  const pageItems = items.slice(start, start + PAGE_SIZE);
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Catalog</h1>
          <div className="desc">
            {snapshot ? (
              <>
                {snapshot.items.length} sellable items · price list{" "}
                <strong>{snapshot.price_list}</strong>
                {snapshot.currency ? ` (${snapshot.currency})` : ""} · synced{" "}
                {new Date(snapshot.generated_at).toLocaleString()}
              </>
            ) : (
              "Product catalog"
            )}
          </div>
        </div>
        <form className="toolbar" method="get" role="search">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search code, name, alias or barcode…"
            aria-label="Search catalog"
            style={{ minWidth: 260 }}
          />
          <button className="btn primary" type="submit">Search</button>
        </form>
      </div>

      {error && <div className="error-banner">ERP unavailable: {error}</div>}

      <div className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Item</th>
                <th>Code</th>
                <th>Barcode</th>
                <th>Unit</th>
                <th className="num">Selling price</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((item) => (
                <tr key={item.item_code}>
                  <td>
                    {item.item_name}
                    {item.aliases.length > 0 && (
                      <div className="muted" style={{ fontSize: 12 }}>
                        aliases: {item.aliases.join(", ")}
                      </div>
                    )}
                  </td>
                  <td className="mono">{item.item_code}</td>
                  <td className="mono">
                    {item.barcodes[0]?.barcode ?? "—"}
                    {item.barcodes.length > 1 && (
                      <span className="muted"> +{item.barcodes.length - 1}</span>
                    )}
                  </td>
                  <td className="muted">{item.stock_uom}</td>
                  <td className="num">
                    {item.price
                      ? formatINR(item.price.price_list_rate)
                      : <span className="badge warn">no price</span>}
                  </td>
                </tr>
              ))}
              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty">
                      <div className="glyph"><PackageSearch size={36} color="var(--muted)" aria-hidden="true" /></div>
                      {query ? `No products match “${q}”.` : "No products in the catalog yet."}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {lastPage > 1 && (
          <p className="muted" style={{ marginBottom: 0 }}>
            Page {pageNum} of {lastPage} · {total} matches ·{" "}
            {pageNum > 1 && <a href={`/catalog?q=${encodeURIComponent(q ?? "")}&page=${pageNum - 1}`}>← prev</a>}
            {" · "}
            {pageNum < lastPage && <a href={`/catalog?q=${encodeURIComponent(q ?? "")}&page=${pageNum + 1}`}>next →</a>}
          </p>
        )}
      </div>
    </>
  );
}
