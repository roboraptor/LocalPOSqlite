// c:\projects\LocalPOSjson\src\app\items\page.tsx
"use client";

import { useState, useEffect, useRef, FormEvent, DragEvent, useMemo } from "react";
import * as Fa from "react-icons/fa6";
import IconPicker from "@/components/IconPicker";
import IconByName from "@/components/IconByName";
import { Item, Category } from "@/types/db";
import { formatCurrency } from "@/lib/format";
import { formatStockNumber } from "@/lib/stock";
import FAVORITE_ICONS from "@/data/favoriteIcons.json";

// Nová komponenta pro kartu položky pro lepší přehlednost
function ItemCard({
  item,
  currency,
  onDragStart,
  onDrop,
  onEdit,
  onDelete,
}: {
  item: Item;
  currency: string;
  onDragStart: (e: DragEvent, id: number) => void;
  onDrop: (e: DragEvent, id: number) => void;
  onEdit: (item: Item) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <section
      className="card cardPad drag-card"
      draggable
      onDragStart={(e) => onDragStart(e, item.id)}
      onDrop={(e) => onDrop(e, item.id)}
    >
      <header
        className="receiptHeader"
        style={{ padding: 0, borderBottom: "none", alignItems: "center" }}
      >
        <div className="receiptTitle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            className="drag-handle"
            title="Táhni pro změnu pořadí"
            style={{ cursor: "grab", display: "inline-flex", alignItems: "center" }}
          >
            <Fa.FaGripLines />
          </span>
          <IconByName name={item.icon} />
          <span>#{item.position}</span>
          <span>{item.name}</span>
        </div>
        <div className="totalPrice">{formatCurrency(item.price || 0, currency)}</div>
      </header>
      <div className="muted">
        Kategorie: <strong>{item.category || "Ostatní"}</strong>
      </div>
      {item.stock_initial != null && item.stock_initial > 0 && item.stock_deduct != null && (
        <div style={{ marginTop: 6 }}>
          <div className="muted" style={{ fontSize: "0.85rem" }}>
            Sklad:{" "}
            <strong
              style={{
                color:
                  (item.stock_remaining ?? item.stock_initial) <= 0 ? "#ef4444" : undefined,
              }}
            >
              {formatStockNumber(item.stock_remaining ?? item.stock_initial)}
            </strong>{" "}
            / {formatStockNumber(item.stock_initial)} {item.stock_unit || "ks"} (prodej{" "}
            {formatStockNumber(item.stock_deduct)} {item.stock_unit || "ks"})
          </div>
          <div
            style={{
              marginTop: 4,
              height: 5,
              borderRadius: 999,
              background: "rgba(255, 255, 255, 0.12)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${item.stock_percent ?? 100}%`,
                height: "100%",
                background:
                  (item.stock_percent ?? 100) > 25
                    ? "#22c55e"
                    : (item.stock_percent ?? 100) > 10
                      ? "#f59e0b"
                      : "#ef4444",
                transition: "width 0.2s ease",
              }}
            />
          </div>
        </div>
      )}
      <div
        style={{
          marginTop: 12,
          display: "flex",
          gap: "0.75rem",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <button
          className="btn"
          style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
          onClick={() => onEdit(item)}
        >
          <Fa.FaWrench /> Upravit
        </button>
        <button
          className="btn btn-danger"
          style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
          onClick={() => onDelete(item.id)}
        >
          <Fa.FaTrashCan /> Smazat
        </button>
      </div>
    </section>
  );
}

export default function ItemsAdmin() {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [currency, setCurrency] = useState("CZK");
  const [favoriteIcons, setFavoriteIcons] = useState<string[]>(FAVORITE_ICONS);
  const [loading, setLoading] = useState(true);
  const [savingOrder, setSavingOrder] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const dragIdRef = useRef<number | null>(null);

  const categoryNames = useMemo(
    () => (categories.length > 0 ? categories.map((c) => c.name) : ["Ostatní"]),
    [categories],
  );
  const defaultCategory = categoryNames.includes("Ostatní") ? "Ostatní" : categoryNames[0];

  // Form state
  const emptyForm = {
    id: null,
    name: "",
    price: "",
    category: defaultCategory,
    icon: "FaCubes",
    position: "",
    stock_unit: "",
    stock_initial: "",
    stock_deduct: "",
  };
  const [form, setForm] = useState<{
    id: number | null;
    name: string;
    price: string;
    category: string;
    icon: string;
    position: string | number;
    stock_unit: string;
    stock_initial: string;
    stock_deduct: string;
  }>(emptyForm);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const [itemsRes, iconsRes, catsRes, generalRes] = await Promise.all([
        fetch("/api/items", { cache: "no-store" }),
        fetch("/api/icons", { cache: "no-store" }), // Načteme dynamické ikony z API
        fetch("/api/categories", { cache: "no-store" }),
        fetch("/api/general", { cache: "no-store" }),
      ]);

      if (!itemsRes.ok) throw new Error("Nepodařilo se načíst položky.");
      const data: Item[] = await itemsRes.json();

      if (iconsRes.ok) {
        const iconsData = await iconsRes.json();
        if (Array.isArray(iconsData)) setFavoriteIcons(iconsData);
      }

      if (generalRes.ok) {
        const generalData = await generalRes.json();
        if (generalData?.currency) setCurrency(generalData.currency);
      }

      if (catsRes.ok) {
        const catsData = await catsRes.json();
        if (Array.isArray(catsData)) {
          setCategories(catsData);
          if (catsData.length > 0) {
            const names = catsData.map((c: Category) => c.name);
            const nextDefault = names.includes("Ostatní") ? "Ostatní" : names[0];
            setForm((f) =>
              f.id === null && !names.includes(f.category) ? { ...f, category: nextDefault } : f,
            );
          }
        }
      }

      // Normalizace position + seřazení
      const withPos = (Array.isArray(data) ? data : [])
        .map((it, idx) => ({
          ...it,
          position: typeof it.position === "number" ? it.position : idx + 1,
        }))
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

      setItems(withPos);
      setDirty(false);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const groupedItems = useMemo(() => {
    const groups: Record<string, Item[]> = items.reduce(
      (acc, item) => {
        const category = item.category || "Ostatní";
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(item);
        return acc;
      },
      {} as Record<string, Item[]>,
    );

    const groupNames = Object.keys(groups).sort((a, b) => {
      const indexA = categoryNames.indexOf(a);
      const indexB = categoryNames.indexOf(b);
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return a.localeCompare(b);
    });
    return groupNames.map((name) => ({ name, items: groups[name] }));
  }, [items, categoryNames]);

  const selectCategoryOptions = useMemo(
    () =>
      form.category && !categoryNames.includes(form.category)
        ? [...categoryNames, form.category]
        : categoryNames,
    [categoryNames, form.category],
  );

  const resetForm = () => setForm(emptyForm);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    const price = Number(form.price);
    const category = form.category;
    const icon = form.icon?.trim() || "FaRegSquare";
    const position = form.position === "" ? undefined : Number(form.position);
    const stockInitialStr = String(form.stock_initial ?? "")
      .replace(",", ".")
      .trim();
    const stockDeductStr = String(form.stock_deduct ?? "")
      .replace(",", ".")
      .trim();
    const stockUnitStr = String(form.stock_unit ?? "").trim();

    if (!name) {
      alert("Název nesmí být prázdný.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      alert("Cena musí být nezáporné číslo.");
      return;
    }
    if (position !== undefined && (!Number.isFinite(position) || position < 1)) {
      alert("Pozice musí být kladné číslo.");
      return;
    }

    let stock_unit: string | null = null;
    let stock_initial: number | null = null;
    let stock_deduct: number | null = null;

    if (stockInitialStr !== "") {
      const parsedInitial = Number(stockInitialStr);
      if (!Number.isFinite(parsedInitial) || parsedInitial <= 0) {
        alert("Naskladněné množství musí být kladné číslo.");
        return;
      }
      const parsedDeduct = stockDeductStr === "" ? 1 : Number(stockDeductStr);
      if (!Number.isFinite(parsedDeduct) || parsedDeduct <= 0) {
        alert("Odečet za prodej musí být kladné číslo.");
        return;
      }
      stock_initial = parsedInitial;
      stock_deduct = parsedDeduct;
      stock_unit = stockUnitStr || "ks";
    }

    try {
      const method = form.id ? "PUT" : "POST";
      const body = form.id
        ? {
            id: form.id,
            name,
            price,
            category,
            icon,
            position,
            stock_unit,
            stock_initial,
            stock_deduct,
          }
        : {
            name,
            price,
            category,
            icon,
            position,
            stock_unit,
            stock_initial,
            stock_deduct,
          };

      const res = await fetch("/api/items", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}));
        throw new Error(msg.error || "Uložení selhalo.");
      }
      await load();
      resetForm();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const edit = (item: Item) =>
    setForm({
      id: item.id,
      name: item.name,
      price: String(item.price),
      category: item.category || "Ostatní",
      icon: item.icon || "FaRegSquare",
      position: item.position ?? "",
      stock_unit: item.stock_unit ?? "",
      stock_initial: item.stock_initial != null ? String(item.stock_initial) : "",
      stock_deduct: item.stock_deduct != null ? String(item.stock_deduct) : "",
    });

  const del = async (id: number) => {
    if (!confirm("Smazat tuto položku?")) return;
    try {
      const res = await fetch("/api/items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Smazání selhalo.");
      await load();
      if (form.id === id) resetForm();
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Drag & Drop handlers
  const onDragStart = (e: DragEvent, id: number) => {
    dragIdRef.current = id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(id));
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
  };

  const onDrop = (e: DragEvent, overId: number) => {
    e.preventDefault();
    const dragId = dragIdRef.current;
    if (!dragId || dragId === overId) return;

    const next = [...items];
    const from = next.findIndex((i) => i.id === dragId);
    const to = next.findIndex((i) => i.id === overId);
    if (from === -1 || to === -1) return;

    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);

    const renumbered = next.map((it, idx) => ({ ...it, position: idx + 1 }));
    setItems(renumbered);
    setDirty(true);
  };

  async function saveOrder() {
    setSavingOrder(true);
    try {
      const payload = items.map(({ id, position }) => ({ id, position }));
      const res = await fetch("/api/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: payload }),
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Uložení pořadí selhalo.");

      await load();
      alert("Pořadí uloženo.");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSavingOrder(false);
    }
  }

  return (
    <div className="container">
      <div className="d-flex justify-content-between align-items-center my-3">
        <h1 className="pageTitle my-0">Položky menu</h1>
      </div>

      {err && <div className="alert alert-error">{err}</div>}

      {loading ? (
        <div className="container">
          <div className="card skeleton" style={{ height: "80px", marginBottom: "1rem" }} />
          <div className="grid-tiny">
            <div className="card skeleton" />
            <div className="card skeleton" />
            <div className="card skeleton" />
            <div className="card skeleton" />
          </div>
        </div>
      ) : (
        <>
          {/* Formulář */}
          <section className="card" style={{ marginBottom: "1rem", padding: "0.75rem" }}>
            <form onSubmit={submit}>
              <div className="grid2">
                <div
                  style={{
                    display: "grid",
                    gap: "0.75rem",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    alignItems: "end",
                  }}
                >
                  <div>
                    <label className="form-label" htmlFor="name">
                      Název
                    </label>
                    <input
                      id="name"
                      className="input"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="price">
                      Cena ({currency})
                    </label>
                    <input
                      id="price"
                      className="input"
                      type="number"
                      inputMode="decimal"
                      value={form.price}
                      onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label className="form-label" htmlFor="category">
                      Kategorie
                    </label>
                    <select
                      id="category"
                      className="input"
                      value={form.category}
                      onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    >
                      {selectCategoryOptions.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div
                  style={{
                    display: "grid",
                    gap: "0.75rem",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    alignItems: "end",
                  }}
                >
                  <div>
                    <label className="form-label" htmlFor="position">
                      Pozice
                    </label>
                    <input
                      id="position"
                      className="input"
                      type="number"
                      min="0"
                      value={form.position || ""}
                      onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="form-label">Ikona (FontAwesome)</label>
                    <div className="input grid2-perma" style={{ padding: 6 }}>
                      <div style={{ width: 32, color: "#fff" }}>
                        <IconByName name={form.icon} size={32} />
                      </div>
                      <div>
                        <code style={{ color: "#ccc" }}>{form.icon || "—"}</code>
                      </div>
                    </div>
                  </div>

                  {/* Tlačítka */}
                  <div>
                    <label className="form-label">Akce</label>
                    <div className="grid2-perma">
                      <button
                        className="btn btn-primary super-center"
                        style={{
                          height: "46px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                        }}
                        type="submit"
                      >
                        {form.id ? (
                          <IconByName name="FaRegFloppyDisk" size={24} />
                        ) : (
                          <IconByName name="FaRegSquarePlus" size={24} />
                        )}
                      </button>
                      {form.id && (
                        <button
                          className="btn btn-warning super-center"
                          type="button"
                          onClick={resetForm}
                        >
                          <IconByName name="FaXmark" size={24} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Skladovost (volitelné) */}
              <div style={{ marginTop: "0.75rem" }}>
                <div className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.35rem" }}>
                  Skladovost (volitelné — nevyplněné = bez sledování)
                </div>
                <div
                  style={{
                    display: "grid",
                    gap: "0.75rem",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    alignItems: "end",
                  }}
                >
                  <div>
                    <label className="form-label" htmlFor="stock_unit">
                      Jednotka
                    </label>
                    <input
                      id="stock_unit"
                      list="stock-units"
                      className="input"
                      placeholder="např. L, ks"
                      value={form.stock_unit}
                      onChange={(e) => setForm((f) => ({ ...f, stock_unit: e.target.value }))}
                    />
                    <datalist id="stock-units">
                      <option value="ks" />
                      <option value="L" />
                      <option value="ml" />
                      <option value="g" />
                      <option value="kg" />
                      <option value="porce" />
                    </datalist>
                  </div>
                  <div>
                    <label className="form-label" htmlFor="stock_initial">
                      Naskladněno
                    </label>
                    <input
                      id="stock_initial"
                      className="input"
                      type="number"
                      step="any"
                      min="0"
                      placeholder="např. 60"
                      value={form.stock_initial}
                      onChange={(e) => setForm((f) => ({ ...f, stock_initial: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="stock_deduct">
                      Odečet za prodej
                    </label>
                    <input
                      id="stock_deduct"
                      className="input"
                      type="number"
                      step="any"
                      min="0"
                      placeholder="např. 0.5 nebo 1"
                      value={form.stock_deduct}
                      onChange={(e) => setForm((f) => ({ ...f, stock_deduct: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Icon Picker */}
              <div>
                <div className="grid" style={{ alignItems: "start" }}>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <IconPicker
                      value={form.icon}
                      onChange={(name: string) => setForm((f) => ({ ...f, icon: name }))}
                      placeholder="Hledat (např. coffee, user)…"
                      favorites={favoriteIcons}
                    />
                  </div>
                </div>
              </div>
            </form>
          </section>

          {/* Seznam položek (DRAG & DROP) */}
          <div onDragOver={onDragOver}>
            {groupedItems.map(
              (group) =>
                group.items.length > 0 && (
                  <section key={group.name} style={{ marginBottom: "2rem" }}>
                    <h2
                      className="sectionTitle"
                      style={{
                        borderBottom: "1px solid var(--border)",
                        paddingBottom: "0.5rem",
                        marginBottom: "1rem",
                      }}
                    >
                      {group.name}
                    </h2>
                    <div className="grid-tiny">
                      {group.items.map((item) => (
                        <ItemCard
                          key={item.id}
                          item={item}
                          currency={currency}
                          onDragStart={onDragStart}
                          onDrop={onDrop}
                          onEdit={edit}
                          onDelete={del}
                        />
                      ))}
                    </div>
                  </section>
                ),
            )}
          </div>

          <div
            className="card cardPad"
            style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}
          >
            <button
              className="btn btn-primary"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
              disabled={!dirty || savingOrder}
              onClick={saveOrder}
              title={dirty ? "Uložit nové pořadí" : "Žádná změna"}
            >
              {savingOrder ? (
                "Ukládám…"
              ) : (
                <>
                  <Fa.FaFloppyDisk /> Uložit pořadí
                </>
              )}
            </button>
          </div>

          <style jsx>{`
            .drag-card {
              transition: background-color 0.12s ease;
            }
            .drag-card:active {
              background: rgba(0, 0, 0, 0.03);
            }
            .drag-handle :global(svg) {
              pointer-events: none;
            }
          `}</style>
        </>
      )}
    </div>
  );
}
