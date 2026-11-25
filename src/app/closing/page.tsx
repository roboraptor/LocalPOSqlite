// c:\projects\LocalPOSjson\src\app\closing\page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import * as Fa from "react-icons/fa6";
import { GeneralSettings, Item, ParsedReceipt, ParsedTab } from "@/types/db";
import { formatCurrency, isWithinDateRange } from "@/lib/format";
import { PrintFooter, PrintHeader } from "@/components/PrintHeader";

interface ProductSaleEntry {
  name: string;
  category: string;
  quantity: number;
  revenue: number;
}

function accumulateProduct(
  map: Record<string, ProductSaleEntry>,
  item: Item,
  price: number,
) {
  const key = item.name;
  if (!map[key]) {
    map[key] = {
      name: item.name,
      category: item.category || "Ostatní",
      quantity: 0,
      revenue: 0,
    };
  }
  map[key].quantity += 1;
  map[key].revenue += price;
}

function PrintProductList({
  products,
  fmt,
  indented = false,
}: {
  products: ProductSaleEntry[];
  fmt: (n: number) => string;
  indented?: boolean;
}) {
  if (products.length === 0) {
    return (
      <div style={{ fontSize: 11, color: "#555", paddingLeft: indented ? 10 : 0 }}>
        Žádné položky
      </div>
    );
  }
  return (
    <>
      {products.map((p) => (
        <div
          key={p.name}
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 11,
            marginBottom: 2,
            paddingLeft: indented ? 10 : 0,
          }}
        >
          <span>
            {p.name} ({p.category})
          </span>
          <span>
            {p.quantity} ks / {fmt(p.revenue)}
          </span>
        </div>
      ))}
    </>
  );
}

function PrintPaymentLines({
  payments,
  fmt,
  indented = false,
}: {
  payments: {
    cash: { amount: number; count: number };
    card: { amount: number; count: number };
    qr: { amount: number; count: number };
    other: { amount: number; count: number };
  };
  fmt: (n: number) => string;
  indented?: boolean;
}) {
  const rows = [
    { label: "Hotovost", data: payments.cash },
    { label: "Karta", data: payments.card },
    { label: "QR platba", data: payments.qr },
    { label: "Ostatní", data: payments.other },
  ].filter((r) => r.data.amount > 0);

  return (
    <>
      {rows.map((r) => (
        <div key={r.label} style={{ display: "flex", justifyContent: "space-between" }}>
          <span>
            {indented ? `  ${r.label}` : r.label} ({r.data.count}x):
          </span>
          <span>{fmt(r.data.amount)}</span>
        </div>
      ))}
    </>
  );
}

export default function ClosingPage() {
  const [receipts, setReceipts] = useState<ParsedReceipt[]>([]);
  const [tabs, setTabs] = useState<ParsedTab[]>([]);
  const [general, setGeneral] = useState<Partial<GeneralSettings>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Date filters
  const [from, setFrom] = useState(""); // YYYY-MM-DD
  const [to, setTo] = useState(""); // YYYY-MM-DD
  const [activePreset, setActivePreset] = useState<"dnes" | "vcera" | "tyden" | "mesic" | "vse" | "custom">("dnes");

  // View mode filter: 'sold' (completed), 'all' (completed + open), 'open' (open tabs/tables only)
  const [viewMode, setViewMode] = useState<"sold" | "all" | "open">("sold");

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        const [receiptsRes, tabsRes, generalRes] = await Promise.all([
          fetch("/api/receipts", { cache: "no-store" }),
          fetch("/api/tabs", { cache: "no-store" }),
          fetch("/api/general", { cache: "no-store" }),
        ]);

        if (!receiptsRes.ok) throw new Error("Nepodařilo se načíst účtenky");
        if (!tabsRes.ok) throw new Error("Nepodařilo se načíst otevřené účty");

        const receiptsData = await receiptsRes.json();
        const tabsData = await tabsRes.json();
        const generalData = generalRes.ok ? await generalRes.json() : {};

        setReceipts(Array.isArray(receiptsData) ? receiptsData : []);
        setTabs(Array.isArray(tabsData) ? tabsData : []);
        setGeneral(generalData && !generalData.error ? generalData : {});
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();

    // Default to 'today' preset
    setPreset("dnes");
  }, []);

  const setPreset = (preset: "dnes" | "vcera" | "tyden" | "mesic" | "vse") => {
    const today = new Date();
    const formatDate = (d: Date) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    if (preset === "dnes") {
      setFrom(formatDate(today));
      setTo(formatDate(today));
    } else if (preset === "vcera") {
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      setFrom(formatDate(yesterday));
      setTo(formatDate(yesterday));
    } else if (preset === "tyden") {
      const currentDay = today.getDay();
      const distance = currentDay === 0 ? 6 : currentDay - 1; // adjust for Sunday being 0
      const monday = new Date(today);
      monday.setDate(today.getDate() - distance);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      setFrom(formatDate(monday));
      setTo(formatDate(sunday));
    } else if (preset === "mesic") {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setFrom(formatDate(firstDay));
      setTo(formatDate(lastDay));
    } else if (preset === "vse") {
      setFrom("");
      setTo("");
    }
    setActivePreset(preset);
  };

  const handleCustomDateChange = (type: "from" | "to", val: string) => {
    if (type === "from") {
      setFrom(val);
    } else {
      setTo(val);
    }
    setActivePreset("custom");
  };

  // Filter receipts in-memory
  const filteredReceipts = useMemo(
    () => receipts.filter((r) => isWithinDateRange(r.created_at, from, to)),
    [receipts, from, to],
  );

  // Filter tabs in-memory
  const filteredTabs = useMemo(
    () => tabs.filter((t) => isWithinDateRange(t.created_at, from, to)),
    [tabs, from, to],
  );

  // Aggregate stats based on active view mode
  const stats = useMemo(() => {
    let totalRevenue = 0;
    let cashRevenue = 0;
    let cardRevenue = 0;
    let qrRevenue = 0;
    let otherRevenue = 0;
    let openRevenue = 0;

    let cashCount = 0;
    let cardCount = 0;
    let qrCount = 0;
    let otherCount = 0;
    let openCount = 0;

    const productSales: Record<string, ProductSaleEntry> = {};
    const categorySales: Record<string, { name: string; quantity: number; revenue: number }> = {};

    // Separate lists for split printing when viewMode === "all"
    const soldProductSales: Record<string, ProductSaleEntry> = {};
    const openProductSales: Record<string, ProductSaleEntry> = {};

    const addItems = (items: Item[], isTab: boolean) => {
      items.forEach((item) => {
        const price = item.price || 0;
        accumulateProduct(productSales, item, price);
        accumulateProduct(isTab ? openProductSales : soldProductSales, item, price);

        const catKey = item.category || "Ostatní";
        if (!categorySales[catKey]) {
          categorySales[catKey] = {
            name: catKey,
            quantity: 0,
            revenue: 0,
          };
        }
        categorySales[catKey].quantity += 1;
        categorySales[catKey].revenue += price;
      });
    };

    // 1. Process sold receipts (if view mode is 'sold' or 'all')
    if (viewMode === "sold" || viewMode === "all") {
      filteredReceipts.forEach((r) => {
        const receiptTotal = (r.items || []).reduce((sum, item) => sum + (item.price || 0), 0);
        addItems(r.items || [], false);
        totalRevenue += receiptTotal;

        const rawMethod = (r.payment_method || "").toLowerCase().trim();
        if (rawMethod === "cash" || rawMethod === "hotovost" || rawMethod === "hotově") {
          cashRevenue += receiptTotal;
          cashCount += 1;
        } else if (rawMethod === "card" || rawMethod === "karta" || rawMethod === "kartou") {
          cardRevenue += receiptTotal;
          cardCount += 1;
        } else if (rawMethod === "qr" || rawMethod === "qr platba" || rawMethod === "qr_platba") {
          qrRevenue += receiptTotal;
          qrCount += 1;
        } else {
          otherRevenue += receiptTotal;
          otherCount += 1;
        }
      });
    }

    // 2. Process open tabs (if view mode is 'open' or 'all')
    if (viewMode === "open" || viewMode === "all") {
      filteredTabs.forEach((t) => {
        const tabTotal = (t.items || []).reduce((sum, item) => sum + (item.price || 0), 0);
        addItems(t.items || [], true);
        totalRevenue += tabTotal;

        openRevenue += tabTotal;
        openCount += 1;
      });
    }

    let datasetCount = 0;
    if (viewMode === "sold" || viewMode === "all") datasetCount += filteredReceipts.length;
    if (viewMode === "open" || viewMode === "all") datasetCount += filteredTabs.length;

    const avgTicket = datasetCount > 0 ? totalRevenue / datasetCount : 0;

    const sortedProducts = Object.values(productSales).sort((a, b) => b.quantity - a.quantity);
    const sortedCategories = Object.values(categorySales).sort((a, b) => b.revenue - a.revenue);
    const sortedSoldProducts = Object.values(soldProductSales).sort((a, b) => b.quantity - a.quantity);
    const sortedOpenProducts = Object.values(openProductSales).sort((a, b) => b.quantity - a.quantity);

    return {
      totalRevenue,
      datasetCount,
      avgTicket,
      payments: {
        cash: { amount: cashRevenue, count: cashCount },
        card: { amount: cardRevenue, count: cardCount },
        qr: { amount: qrRevenue, count: qrCount },
        other: { amount: otherRevenue, count: otherCount },
        open: { amount: openRevenue, count: openCount },
      },
      products: sortedProducts,
      categories: sortedCategories,
      soldProducts: sortedSoldProducts,
      openProducts: sortedOpenProducts,
      soldRevenue: cashRevenue + cardRevenue + qrRevenue + otherRevenue,
      openRevenue: openRevenue,
      soldCount: filteredReceipts.length,
      openCount: filteredTabs.length,
    };
  }, [filteredReceipts, filteredTabs, viewMode]);

  const handlePrint = () => {
    window.print();
  };

  const fmt = (amount: number) => formatCurrency(amount, general.currency);

  if (loading) {
    return (
      <div className="container">
        <h1 className="pageTitle">Uzávěrka prodejů</h1>
        <div className="card skeleton" style={{ height: 100 }} />
        <div className="grid">
          <div className="card skeleton" />
          <div className="card skeleton" />
          <div className="card skeleton" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <h1 className="pageTitle">Uzávěrka prodejů</h1>
        <div className="alert alert-error">{error}</div>
      </div>
    );
  }

  const getPercent = (amount: number) => {
    if (stats.totalRevenue === 0) return 0;
    return Math.round((amount / stats.totalRevenue) * 100);
  };

  const dateRangeLabel = () => {
    if (!from && !to) return "Všechna data";
    if (from === to) return new Date(from).toLocaleDateString("cs-CZ");
    const fromStr = from ? new Date(from).toLocaleDateString("cs-CZ") : "...";
    const toStr = to ? new Date(to).toLocaleDateString("cs-CZ") : "...";
    return `${fromStr} – ${toStr}`;
  };

  const datasetCountLabel = () => {
    if (viewMode === "sold") return "POČET ÚČTENEK";
    if (viewMode === "open") return "POČET OTEVŘENÝCH ÚČTŮ";
    return "ÚČTENKY + OTEVŘENÉ ÚČTY";
  };

  return (
    <div className="container">
      {/* Screen view layout */}
      <div className="no-print">
        <div className="d-flex justify-content-between align-items-center my-3">
          <h1 className="pageTitle my-0">Uzávěrka prodejů</h1>
          <button className="btn btn-primary d-flex align-items-center gap-2" onClick={handlePrint}>
            <Fa.FaPrint /> Tisk uzávěrky
          </button>
        </div>

        {/* Filters Card */}
        <section className="card cardPad mb-4">
          {/* Row 1: Období selector & Date inputs */}
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
            <div>
              <h5 className="form-label mb-2">
                <Fa.FaCalendarDays className="me-2" /> Výběr období
              </h5>
              <div className="d-flex flex-wrap gap-2">
                <button
                  className={`btn ${activePreset === "dnes" ? "btn-primary" : ""}`}
                  onClick={() => setPreset("dnes")}
                >
                  Dnes
                </button>
                <button
                  className={`btn ${activePreset === "vcera" ? "btn-primary" : ""}`}
                  onClick={() => setPreset("vcera")}
                >
                  Včera
                </button>
                <button
                  className={`btn ${activePreset === "tyden" ? "btn-primary" : ""}`}
                  onClick={() => setPreset("tyden")}
                >
                  Tento týden
                </button>
                <button
                  className={`btn ${activePreset === "mesic" ? "btn-primary" : ""}`}
                  onClick={() => setPreset("mesic")}
                >
                  Tento měsíc
                </button>
                <button
                  className={`btn ${activePreset === "vse" ? "btn-primary" : ""}`}
                  onClick={() => setPreset("vse")}
                >
                  Celá historie
                </button>
              </div>
            </div>

            {/* Date pickers on the right */}
            <div className="d-flex flex-wrap align-items-center gap-3">
              <div className="d-flex align-items-center gap-2">
                <label htmlFor="from" className="form-label mb-0 text-nowrap">Od:</label>
                <input
                  id="from"
                  type="date"
                  className="input"
                  style={{ width: "auto", minHeight: "38px" }}
                  value={from}
                  onChange={(e) => handleCustomDateChange("from", e.target.value)}
                />
              </div>
              <div className="d-flex align-items-center gap-2">
                <label htmlFor="to" className="form-label mb-0 text-nowrap">Do:</label>
                <input
                  id="to"
                  type="date"
                  className="input"
                  style={{ width: "auto", minHeight: "38px" }}
                  value={to}
                  onChange={(e) => handleCustomDateChange("to", e.target.value)}
                />
              </div>
            </div>
          </div>

          <hr style={{ borderColor: "var(--border)", margin: "0 0 1.25rem 0" }} />

          {/* Row 2: Typ dat v uzávěrce */}
          <div>
            <h5 className="form-label mb-2">
              <Fa.FaSliders className="me-2" /> Typ dat v uzávěrce
            </h5>
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-3">
              <div className="d-flex flex-wrap gap-2">
                <button
                  className={`btn d-flex align-items-center gap-2 ${viewMode === "sold" ? "btn-primary" : ""}`}
                  onClick={() => setViewMode("sold")}
                >
                  <Fa.FaReceipt /> Pouze prodané (Uzavřené)
                </button>
                <button
                  className={`btn d-flex align-items-center gap-2 ${viewMode === "all" ? "btn-primary" : ""}`}
                  onClick={() => setViewMode("all")}
                >
                  <Fa.FaScaleBalanced /> Prodané + Otevřené účty
                </button>
                <button
                  className={`btn d-flex align-items-center gap-2 ${viewMode === "open" ? "btn-primary" : ""}`}
                  onClick={() => setViewMode("open")}
                >
                  <Fa.FaFolderOpen /> Pouze otevřené účty
                </button>
              </div>
              <span className="text-mute">
                Zvolené období: <strong>{dateRangeLabel()}</strong>
              </span>
            </div>
          </div>
        </section>

        {/* Big numbers summary */}
        <div className="grid mb-4">
          <div className="card cardPad d-flex flex-row align-items-center justify-content-between">
            <div>
              <div className="text-mute fw-bold mb-1">
                {viewMode === "open" ? "OČEKÁVANÁ TRŽBA" : "CELKOVÁ TRŽBA"}
              </div>
              <h2 className="mb-0 fw-extrabold text-success" style={{ fontFeatureSettings: "'tnum'" }}>
                {fmt(stats.totalRevenue)}
              </h2>
            </div>
            <Fa.FaCoins size={36} className="text-success opacity-75" />
          </div>

          <div className="card cardPad d-flex flex-row align-items-center justify-content-between">
            <div>
              <div className="text-mute fw-bold mb-1">{datasetCountLabel()}</div>
              <h2 className="mb-0 fw-extrabold text-primary">
                {stats.datasetCount}
              </h2>
            </div>
            <Fa.FaReceipt size={36} className="text-primary opacity-75" />
          </div>

          <div className="card cardPad d-flex flex-row align-items-center justify-content-between">
            <div>
              <div className="text-mute fw-bold mb-1">PRŮMĚRNÁ ÚTRATA</div>
              <h2 className="mb-0 fw-extrabold text-warning">
                {fmt(stats.avgTicket)}
              </h2>
            </div>
            <Fa.FaScaleBalanced size={36} className="text-warning opacity-75" />
          </div>
        </div>

        {/* Detailed stats grids */}
        <div className="grid mb-4">
          {/* Column 1: Payment Methods & Category Share */}
          <div className="d-flex flex-column gap-3">
            {/* Card: Payment methods */}
            <div className="card cardPad">
              <h5 className="card-header px-0 pt-0 pb-3 border-bottom mb-3 text-white">
                <Fa.FaCreditCard className="me-2" /> Platební metody
              </h5>

              {/* Payment methods list */}
              {[
                {
                  key: "cash",
                  visible: viewMode === "sold" || viewMode === "all",
                  icon: <Fa.FaMoneyBill1Wave className="text-success" />,
                  label: `Hotovost (${stats.payments.cash.count}x)`,
                  amount: stats.payments.cash.amount,
                  textClass: "text-success",
                  barClass: "bg-success",
                },
                {
                  key: "card",
                  visible: viewMode === "sold" || viewMode === "all",
                  icon: <Fa.FaCreditCard className="text-primary" />,
                  label: `Karta (${stats.payments.card.count}x)`,
                  amount: stats.payments.card.amount,
                  textClass: "text-primary",
                  barClass: "bg-primary",
                },
                {
                  key: "qr",
                  visible: viewMode === "sold" || viewMode === "all",
                  icon: <Fa.FaQrcode className="text-warning" />,
                  label: `QR Platba (${stats.payments.qr.count}x)`,
                  amount: stats.payments.qr.amount,
                  textClass: "text-warning",
                  barClass: "bg-warning",
                },
                {
                  key: "other",
                  visible:
                    (viewMode === "sold" || viewMode === "all") &&
                    stats.payments.other.amount > 0,
                  icon: <Fa.FaEllipsis className="text-white" />,
                  label: `Ostatní / Neuvedeno (${stats.payments.other.count}x)`,
                  amount: stats.payments.other.amount,
                  textClass: "text-secondary",
                  barClass: "bg-secondary",
                },
                {
                  key: "open",
                  visible: viewMode === "open" || viewMode === "all",
                  icon: <Fa.FaFolderOpen className="text-info" />,
                  label: `Otevřené účty (${stats.payments.open.count}x)`,
                  amount: stats.payments.open.amount,
                  textClass: "text-info",
                  barClass: "bg-info",
                },
              ]
                .filter((row) => row.visible)
                .map((row, idx, arr) => (
                  <div key={row.key} className={idx < arr.length - 1 ? "mb-3" : undefined}>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="d-flex align-items-center gap-2">
                        {row.icon} {row.label}
                      </span>
                      <span className={`fw-bold ${row.textClass}`}>
                        {fmt(row.amount)} ({getPercent(row.amount)}%)
                      </span>
                    </div>
                    <div className="progress" style={{ height: 8, backgroundColor: "var(--surface-2)" }}>
                      <div
                        className={`progress-bar ${row.barClass}`}
                        style={{ width: `${getPercent(row.amount)}%` }}
                      />
                    </div>
                  </div>
                ))}
            </div>

            {/* Card: Categories */}
            <div className="card cardPad">
              <h5 className="card-header px-0 pt-0 pb-3 border-bottom mb-3 text-white">
                <Fa.FaTags className="me-2" /> Tržby podle kategorií
              </h5>
              {stats.categories.length === 0 ? (
                <p className="text-mute my-0">Žádná data pro vybrané období.</p>
              ) : (
                stats.categories.map((cat) => (
                  <div key={cat.name} className="mb-3">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span>{cat.name} ({cat.quantity} ks)</span>
                      <span className="fw-bold">{fmt(cat.revenue)} ({getPercent(cat.revenue)}%)</span>
                    </div>
                    <div className="progress" style={{ height: 8, backgroundColor: "var(--surface-2)" }}>
                      <div
                        className="progress-bar bg-info"
                        style={{ width: `${getPercent(cat.revenue)}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Column 2: Product Mix */}
          <div className="card cardPad" style={{ gridColumn: "span 2" }}>
            <h5 className="card-header px-0 pt-0 pb-3 border-bottom mb-3 text-white">
              <Fa.FaBurger className="me-2" /> Prodané položky (Product Mix)
            </h5>
            {stats.products.length === 0 ? (
              <p className="text-mute my-0">Žádný prodej za vybrané období.</p>
            ) : (
              <div className="table-responsive">
                <table className="table table-dark table-hover" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
                  <thead>
                    <tr>
                      <th style={{ color: "var(--muted)" }}>Položka</th>
                      <th style={{ color: "var(--muted)" }}>Kategorie</th>
                      <th className="text-end" style={{ color: "var(--muted)" }}>Množství</th>
                      <th className="text-end" style={{ color: "var(--muted)" }}>Tržba</th>
                      <th className="text-end" style={{ color: "var(--muted)" }}>Podíl</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.products.map((p) => (
                      <tr key={p.name}>
                        <td>{p.name}</td>
                        <td>
                          <span className="badge bg-secondary" style={{ marginLeft: 0 }}>
                            {p.category}
                          </span>
                        </td>
                        <td className="text-end fw-bold">{p.quantity} ks</td>
                        <td className="text-end">{fmt(p.revenue)}</td>
                        <td className="text-end text-mute" style={{ fontSize: "0.9em" }}>
                          {getPercent(p.revenue)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Print-only layout (Thermal POS style) */}
      <div className="print-only">
        <PrintHeader
          general={general}
          documentTitle="UZÁVĚRKA PRODEJŮ"
          metaText={`Vytvořeno: ${new Date().toLocaleString("cs-CZ")}`}
        />

        <div style={{ borderBottom: "1px dashed black", paddingBottom: 5, marginBottom: 5 }}>
          <strong>Typ uzávěrky:</strong> {
            viewMode === "sold" ? "Pouze prodané" :
              viewMode === "all" ? "Prodané + Otevřené účty" : "Pouze otevřené účty"
          } <br />
          <strong>Období:</strong> {dateRangeLabel()} <br />
          <strong>Počet dokladů:</strong> {stats.datasetCount}
        </div>

        <div style={{ fontSize: 14, fontWeight: "bold", display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span>
            {viewMode === "open" ? "OČEKÁVANÝ OBRAT:" : "CELKOVÝ OBRAT:"}
          </span>
          <span>{fmt(stats.totalRevenue)}</span>
        </div>

        {viewMode === "all" && (
          <>
            <div style={{ fontSize: 11, display: "flex", justifyContent: "space-between", marginBottom: 3, paddingLeft: 10 }}>
              <span>- Zaplaceno (Paid):</span>
              <span>{fmt(stats.soldRevenue)}</span>
            </div>
            <div style={{ fontSize: 11, display: "flex", justifyContent: "space-between", marginBottom: 5, paddingLeft: 10 }}>
              <span>- Otevřeno (Unpaid):</span>
              <span>{fmt(stats.openRevenue)}</span>
            </div>
          </>
        )}

        <div style={{ borderBottom: "1px dashed black", paddingBottom: 5, marginBottom: 5 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Průměrný doklad:</span>
            <span>{fmt(stats.avgTicket)}</span>
          </div>
        </div>

        {/* Layout for 'sold' or 'open' modes */}
        {viewMode !== "all" && (
          <>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: "bold", textDecoration: "underline", marginBottom: 3 }}>PLATEBNÍ METODY</div>
              {viewMode === "sold" ? (
                <PrintPaymentLines payments={stats.payments} fmt={fmt} />
              ) : (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Otevřené účty ({stats.payments.open.count}x):</span>
                  <span>{fmt(stats.payments.open.amount)}</span>
                </div>
              )}
            </div>

            <div style={{ borderBottom: "1px dashed black", marginBottom: 5 }} />

            <div>
              <div style={{ fontWeight: "bold", textDecoration: "underline", marginBottom: 3 }}>PRODANÉ POLOŽKY (Product Mix)</div>
              <PrintProductList products={stats.products} fmt={fmt} />
            </div>
          </>
        )}

        {/* Layout for combined 'all' mode */}
        {viewMode === "all" && (
          <>
            {/* Zaplaceno Section */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: "bold", textDecoration: "underline", marginBottom: 3 }}>ZAPLACENÉ (PAID)</div>
              <PrintPaymentLines payments={stats.payments} fmt={fmt} indented />
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: "bold", marginBottom: 3 }}>Zaplacené položky (Product Mix):</div>
              <PrintProductList products={stats.soldProducts} fmt={fmt} indented />
            </div>

            <div style={{ borderBottom: "1px dashed black", marginBottom: 5 }} />

            {/* Otevreno Section */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: "bold", textDecoration: "underline", marginBottom: 3 }}>NEZAPLACENO / OTEVŘENO</div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>  Otevřené účty ({stats.payments.open.count}x):</span>
                <span>{fmt(stats.payments.open.amount)}</span>
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: "bold", marginBottom: 3 }}>Otevřené položky (Product Mix):</div>
              <PrintProductList products={stats.openProducts} fmt={fmt} indented />
            </div>
          </>
        )}

        <div style={{ borderBottom: "1px dashed black", marginTop: 5, marginBottom: 5 }} />

        <PrintFooter general={general} />

        <div style={{ textAlign: "center", fontSize: 10, marginTop: 15 }}>
          * Konec uzávěrky *
        </div>
      </div>

      {/* Embedded print styles */}
      <style jsx global>{`
        @media print {
          .print-only {
            width: 76mm; /* Standard receipt paper width */
            margin: 0 auto;
            font-family: 'Courier New', Courier, monospace;
            font-size: 12px;
            line-height: 1.4;
            color: black !important;
            background: white !important;
            padding: 10px;
          }
        }
      `}</style>
    </div>
  );
}
