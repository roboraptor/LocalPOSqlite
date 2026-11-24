"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as Fa from "react-icons/fa6";
import IconByName from "@/components/IconByName";
import { formatCurrency } from "@/lib/format";
import { NormalizedImportItem, parseItemsImportJson } from "@/lib/importItems";

export default function ImportSettings() {
  const [currency, setCurrency] = useState("CZK");
  const [fileName, setFileName] = useState("");
  const [items, setItems] = useState<NormalizedImportItem[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [createMissingCategories, setCreateMissingCategories] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "danger" } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetch("/api/general")
      .then((res) => res.json())
      .then((data) => {
        if (data?.currency) setCurrency(data.currency);
      })
      .catch(() => {});
  }, []);

  const distinctCategories = useMemo(
    () => Array.from(new Set(items.map((item) => item.category))),
    [items],
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setMessage(null);
    setValidationErrors([]);
    setItems([]);

    if (!file) {
      setFileName("");
      return;
    }

    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const result = parseItemsImportJson(parsed);

      if (result.errors.length > 0) {
        setValidationErrors(result.errors);
      } else {
        setItems(result.items);
      }
    } catch {
      setValidationErrors(["Soubor se nepodařilo načíst jako platný JSON."]);
    }
  };

  const handleImport = async () => {
    if (items.length === 0) return;
    if (
      mode === "replace" &&
      !confirm(
        `Opravdu chcete smazat všechny stávající položky a nahradit je ${items.length} položkami ze souboru?`,
      )
    ) {
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/items/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          mode,
          createMissingCategories,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import selhal.");

      setMessage({
        text: `Úspěšně naimportováno ${data.imported} položek (${mode === "replace" ? "nahrazeno" : "přidáno k existujícím"}).`,
        type: "success",
      });
      setItems([]);
      setFileName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      setMessage({ text: err.message, type: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card h-100">
      <div className="card-header">
        <h5 className="mb-0">Import položek (JSON)</h5>
      </div>
      <div className="card-body">
        <p className="text-mute mb-3">
          Nahrajte záložní <code>.json</code> soubor vytvořený na stránce Export (
          <em>Záloha .JSON</em>).
        </p>

        {message && (
          <div className={`alert alert-${message.type} alert-dismissible fade show`} role="alert">
            {message.text}
            <button type="button" className="btn-close" onClick={() => setMessage(null)}></button>
          </div>
        )}

        <div className="mb-4">
          <label className="form-label fw-bold" htmlFor="importItemsFile">
            Vybrat JSON soubor
          </label>
          <input
            ref={fileInputRef}
            id="importItemsFile"
            type="file"
            accept=".json,application/json"
            className="form-control"
            onChange={handleFileChange}
            disabled={busy}
          />
          {fileName && (
            <div className="form-text">
              Vybraný soubor: <strong>{fileName}</strong>
            </div>
          )}
        </div>

        {validationErrors.length > 0 && (
          <div className="alert alert-danger small mb-4">
            <strong>Chyba validace souboru:</strong>
            <ul className="mb-0 mt-1">
              {validationErrors.slice(0, 5).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
              {validationErrors.length > 5 && (
                <li>… a dalších {validationErrors.length - 5} chyb</li>
              )}
            </ul>
          </div>
        )}

        {items.length > 0 && (
          <>
            <div className="mb-4">
              <div className="d-flex flex-wrap gap-3 align-items-center mb-2">
                <span>
                  Položek k importu: <strong>{items.length}</strong>
                </span>
                <span className="text-mute">
                  Kategorie ({distinctCategories.length}):{" "}
                  <strong>{distinctCategories.join(", ")}</strong>
                </span>
              </div>

              <div className="table-responsive">
                <table className="table table-dark table-sm table-hover align-middle mb-1">
                  <thead>
                    <tr>
                      <th>Ikona</th>
                      <th>Název</th>
                      <th>Kategorie</th>
                      <th className="text-end">Cena</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.slice(0, 10).map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ width: 36 }}>
                          <IconByName name={item.icon} />
                        </td>
                        <td>{item.name}</td>
                        <td>{item.category}</td>
                        <td className="text-end">{formatCurrency(item.price, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {items.length > 10 && (
                <div className="small text-mute">… a dalších {items.length - 10} položek</div>
              )}
            </div>

            <hr />

            <div className="mb-3">
              <label className="form-label fw-bold">Režim importu</label>
              <select
                className="form-select"
                value={mode}
                onChange={(e) => setMode(e.target.value as "append" | "replace")}
                disabled={busy}
              >
                <option value="append">Přidat k existujícím položkám</option>
                <option value="replace">Nahradit všechny stávající položky</option>
              </select>
            </div>

            <div className="form-check form-switch mb-4">
              <input
                className="form-check-input"
                type="checkbox"
                id="createMissingCategories"
                checked={createMissingCategories}
                onChange={(e) => setCreateMissingCategories(e.target.checked)}
                disabled={busy}
              />
              <label className="form-check-label" htmlFor="createMissingCategories">
                Automaticky vytvořit chybějící kategorie v databázi
              </label>
            </div>

            <button
              type="button"
              className="btn btn-primary d-flex align-items-center gap-2"
              onClick={handleImport}
              disabled={busy}
            >
              <Fa.FaFileImport />
              {busy ? "Importuji…" : `Importovat ${items.length} položek`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
