"use client";

import React from "react";
import * as Fa from "react-icons/fa6";
import { useGeneralSettings } from "@/hooks/useGeneralSettings";

export default function EetSettings() {
  const { loading, formData, handleChange, handleSubmit } = useGeneralSettings(
    { eet_enable: false },
    (data) => ({ eet_enable: Boolean(data.eet_enable) }),
  );

  if (loading) return <div className="card skeleton"></div>;

  return (
    <div className="card h-100">
      <div className="card-header">
        <h5 className="mb-0">Elektronická evidence tržeb</h5>
      </div>
      <div className="card-body">
        <form onSubmit={handleSubmit}>
          <h6 className="mb-3 text-mute">Evidence tržeb (EET)</h6>
          <div className="col-auto mb-3">
            <label className="form-check-label" htmlFor="eetEnabled">
              Zapnout evidenci tržeb (simulace)
            </label>
            <div className="form-check form-switch mt-3">
              <input
                className="form-check-input"
                type="checkbox"
                id="eetEnabled"
                name="eet_enable"
                checked={formData.eet_enable}
                onChange={handleChange}
              />
            </div>
          </div>
          <p className="text-mute small">
            Poznámka: Tato funkce je v současné době pouze pro testovací účely a negeneruje reálné
            kódy FIK přes servery finanční správy.
          </p>
          <div className="mt-4">
            <button type="submit" className="btn btn-primary">
              <Fa.FaFloppyDisk /> Uložit nastavení
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
