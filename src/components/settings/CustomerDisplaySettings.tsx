"use client";

import React, { useEffect, useState } from "react";
import * as Fa from "react-icons/fa6";
import type { AutoStepDelays } from "@/types/db";

interface DeviceInfo {
  serial: string;
  state: string;
  model: string;
}

interface BatteryInfo {
  level: number | null;
  temperatureC: number | null;
  voltageMv: number | null;
  plugged: string;
  status: string;
}

const DEFAULT_DELAYS: AutoStepDelays = {
  auto_stay_on: 0,
  auto_immersive: 0,
  auto_reverse: 0,
  auto_open_cd: 1,
  auto_fullscreen: 3,
  auto_brightness: 1,
};

const AUTO_STEPS: {
  key: keyof AutoStepDelays;
  id: string;
  label: React.ReactNode;
  isFirst?: boolean;
}[] = [
  {
    key: "auto_stay_on",
    id: "autoStayOn",
    label: "Automaticky zapnout nevypínání displeje na USB",
    isFirst: true,
  },
  {
    key: "auto_immersive",
    id: "autoImmersive",
    label: "Automaticky skrýt systémovou lištu (immersive mode)",
  },
  {
    key: "auto_reverse",
    id: "autoReverse",
    label: (
      <>
        Automaticky nastavit USB tunel (<code>adb reverse</code>)
      </>
    ),
  },
  {
    key: "auto_open_cd",
    id: "autoOpenCd",
    label: (
      <>
        Automaticky otevřít stránku <code>/cd</code> v Chrome
      </>
    ),
  },
  {
    key: "auto_fullscreen",
    id: "autoFullscreen",
    label: "Automaticky zapnout fullscreen v Chrome",
  },
  {
    key: "auto_brightness",
    id: "autoBrightness",
    label: "Automaticky nastavit podsvícení + tap při změně účtenky a QR platbě",
  },
];

export default function CustomerDisplaySettings() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "danger" } | null>(null);

  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [battery, setBattery] = useState<BatteryInfo | null>(null);
  const [manualBrightness, setManualBrightness] = useState<number>(180);

  const [formData, setFormData] = useState({
    adb_path: "adb",
    device_serial: "",
    port: 3000,
    auto_reverse: false,
    auto_open_cd: false,
    auto_immersive: false,
    auto_fullscreen: false,
    auto_stay_on: false,
    auto_brightness: false,
    active_brightness: 100,
    qr_brightness: 200,
    tap_x: 400,
    tap_y: 150,
    auto_delays: { ...DEFAULT_DELAYS } as AutoStepDelays,
  });

  useEffect(() => {
    fetch("/api/settings/customer-display")
      .then((res) => res.json())
      .then((data) => {
        if (data && !data.error) {
          setFormData({
            adb_path: data.adb_path || "adb",
            device_serial: data.device_serial || "",
            port: Number(data.port) || 3000,
            auto_reverse: Boolean(data.auto_reverse),
            auto_open_cd: Boolean(data.auto_open_cd),
            auto_immersive: Boolean(data.auto_immersive),
            auto_fullscreen: Boolean(data.auto_fullscreen),
            auto_stay_on: Boolean(data.auto_stay_on),
            auto_brightness: Boolean(data.auto_brightness),
            active_brightness: Number(data.active_brightness ?? 100),
            qr_brightness: Number(data.qr_brightness ?? 200),
            tap_x: Number(data.tap_x ?? 400),
            tap_y: Number(data.tap_y ?? 150),
            auto_delays: {
              ...DEFAULT_DELAYS,
              ...(typeof data.auto_delays === "object" && data.auto_delays ? data.auto_delays : {}),
            },
          });
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const runAction = async (action: string, value?: number) => {
    setBusy(true);
    setMessage(null);
    try {
      const payload: Record<string, any> = {
        action,
        value,
        adb_path: formData.adb_path,
        device_serial: formData.device_serial,
        port: formData.port,
        tap_x: formData.tap_x,
        tap_y: formData.tap_y,
      };
      if (action === "run_auto") {
        payload.auto_stay_on = formData.auto_stay_on;
        payload.auto_immersive = formData.auto_immersive;
        payload.auto_reverse = formData.auto_reverse;
        payload.auto_open_cd = formData.auto_open_cd;
        payload.auto_fullscreen = formData.auto_fullscreen;
        payload.auto_brightness = formData.auto_brightness;
        payload.active_brightness = formData.active_brightness;
        payload.auto_delays = formData.auto_delays;
      }

      const res = await fetch("/api/settings/customer-display", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Akce selhala.");

      if (action === "status") {
        setDevices(Array.isArray(data.devices) ? data.devices : []);
        setBattery(data.battery || null);
        if (!data.devices?.length) {
          setMessage({ text: "Nebylo nalezeno žádné USB/ADB zařízení.", type: "danger" });
        } else {
          setMessage({
            text: `Nalezeno zařízení: ${data.devices.length}${data.activeSerial ? ` (aktivní: ${data.activeSerial})` : ""}`,
            type: "success",
          });
        }
      } else {
        setMessage({ text: data.message || "Příkaz proveden.", type: "success" });
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = e.target;
    const value =
      target.type === "checkbox"
        ? target.checked
        : target.type === "number" || target.type === "range"
          ? Number(target.value)
          : target.value;
    setFormData((prev) => ({ ...prev, [target.name]: value }));
  };

  const handleDelayChange = (key: keyof AutoStepDelays, val: string) => {
    const num = Number(val);
    const clamped = Number.isFinite(num) ? Math.min(60, Math.max(0, num)) : 0;
    setFormData((prev) => ({
      ...prev,
      auto_delays: { ...prev.auto_delays, [key]: clamped },
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/customer-display", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chyba při ukládání.");
      setMessage({ text: "Nastavení klientského displeje uloženo.", type: "success" });
    } catch (err: any) {
      setMessage({ text: err.message, type: "danger" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="card skeleton"></div>;

  const isHotBattery =
    battery?.temperatureC !== null &&
    battery?.temperatureC !== undefined &&
    battery.temperatureC >= 40;

  return (
    <div className="card h-100">
      <div className="card-header">
        <h5 className="mb-0">Klientský displej (USB / ADB)</h5>
      </div>
      <div className="card-body">
        {message && (
          <div className={`alert alert-${message.type} alert-dismissible fade show`} role="alert">
            {message.text}
            <button type="button" className="btn-close" onClick={() => setMessage(null)}></button>
          </div>
        )}

        <form onSubmit={handleSave}>
          {/* 1. Stav zařízení a baterie */}
          <h6 className="mb-3 text-mute">Stav zařízení a baterie</h6>
          <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
            <button
              type="button"
              className="btn btn-outline-info d-flex align-items-center gap-2"
              onClick={() => runAction("status")}
              disabled={busy}
            >
              <Fa.FaMobileScreen /> Zkontrolovat připojení a baterii
            </button>
          </div>

          {devices.length > 0 && (
            <div className="mb-3">
              <div className="small text-mute mb-2">Detekovaná ADB zařízení:</div>
              <div className="d-flex flex-wrap gap-2">
                {devices.map((d) => (
                  <button
                    key={d.serial}
                    type="button"
                    className={`btn btn-sm ${formData.device_serial === d.serial ? "btn-primary" : "btn-outline-secondary"}`}
                    onClick={() => setFormData((prev) => ({ ...prev, device_serial: d.serial }))}
                    title="Vybrat jako cílové zařízení"
                  >
                    {d.model || "Zařízení"} ({d.serial}) [{d.state}]
                  </button>
                ))}
              </div>
            </div>
          )}

          {battery && (
            <div className="alert alert-secondary py-2 px-3 small d-flex flex-wrap gap-4 mb-3">
              <span>
                <strong>Baterie:</strong> {battery.level ?? "?"}% ({battery.status})
              </span>
              <span className={isHotBattery ? "text-danger fw-bold" : ""}>
                <strong>Teplota:</strong>{" "}
                {battery.temperatureC !== null ? `${battery.temperatureC} °C` : "?"}
                {isHotBattery ? " (!)" : ""}
              </span>
              <span>
                <strong>Napájení:</strong> {battery.plugged}
              </span>
            </div>
          )}

          <hr />

          {/* 2. Konfigurace */}
          <h6 className="mb-3 text-mute">Konfigurace</h6>
          <div className="row g-3 mb-4">
            <div className="col-md-5">
              <label className="form-label fw-bold">Cesta k ADB</label>
              <input
                type="text"
                className="form-control"
                name="adb_path"
                value={formData.adb_path}
                onChange={handleChange}
                placeholder="adb nebo C:\platform-tools\adb.exe"
              />
            </div>
            <div className="col-md-4">
              <label className="form-label fw-bold">Serial zařízení (volitelné)</label>
              <input
                type="text"
                className="form-control"
                name="device_serial"
                value={formData.device_serial}
                onChange={handleChange}
                placeholder="Prázdné = jediné připojené"
              />
            </div>
            <div className="col-md-3">
              <label className="form-label fw-bold">Port serveru</label>
              <input
                type="number"
                className="form-control"
                name="port"
                min={1}
                max={65535}
                value={formData.port}
                onChange={handleChange}
              />
            </div>
          </div>

          <hr />

          {/* 3. Manuální ovládání */}
          <h6 className="mb-3 text-mute">Manuální ovládání (ADB)</h6>
          <div className="d-flex flex-wrap gap-2 mb-3">
            <button
              type="button"
              className="btn btn-outline-primary d-flex align-items-center gap-2"
              onClick={() => runAction("reverse")}
              disabled={busy}
            >
              <Fa.FaPlug /> USB tunel (adb reverse)
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary d-flex align-items-center gap-2"
              onClick={() => runAction("reverse_remove")}
              disabled={busy}
            >
              <Fa.FaLinkSlash /> Zrušit tunel
            </button>
            <button
              type="button"
              className="btn btn-outline-success d-flex align-items-center gap-2"
              onClick={() => runAction("open_cd")}
              disabled={busy}
            >
              <Fa.FaArrowUpRightFromSquare /> Otevřít /cd na telefonu
            </button>
          </div>

          <div className="d-flex flex-wrap gap-2 mb-3">
            <button
              type="button"
              className="btn btn-outline-primary btn-sm d-flex align-items-center gap-1"
              onClick={() => runAction("toggle_fullscreen")}
              disabled={busy}
            >
              <Fa.FaExpand /> Přepnout Fullscreen (Chrome)
            </button>
            <button
              type="button"
              className="btn btn-outline-info btn-sm"
              onClick={() => runAction("immersive_on")}
              disabled={busy}
            >
              Skrýt lištu
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => runAction("immersive_off")}
              disabled={busy}
            >
              Zobrazit lištu
            </button>
            <button
              type="button"
              className="btn btn-outline-warning btn-sm"
              onClick={() => runAction("stayon_on")}
              disabled={busy}
            >
              Nevypínat na USB
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => runAction("stayon_off")}
              disabled={busy}
            >
              Zrušit nevypínání
            </button>
            <button
              type="button"
              className="btn btn-outline-success btn-sm"
              onClick={() => runAction("wake")}
              disabled={busy}
            >
              Probudit
            </button>
            <button
              type="button"
              className="btn btn-outline-danger btn-sm"
              onClick={() => runAction("sleep")}
              disabled={busy}
            >
              Uspat
            </button>
          </div>

          <div className="row g-3 align-items-end mb-3">
            <div className="col-sm-3 col-6">
              <label className="form-label small fw-bold">Tap X (px)</label>
              <input
                type="number"
                className="form-control form-control-sm"
                name="tap_x"
                min={0}
                max={10000}
                value={formData.tap_x}
                onChange={handleChange}
              />
            </div>
            <div className="col-sm-3 col-6">
              <label className="form-label small fw-bold">Tap Y (px)</label>
              <input
                type="number"
                className="form-control form-control-sm"
                name="tap_y"
                min={0}
                max={10000}
                value={formData.tap_y}
                onChange={handleChange}
              />
            </div>
            <div className="col-auto">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => runAction("tap")}
                disabled={busy}
              >
                Vyzkoušet tap
              </button>
            </div>
          </div>

          <div className="row align-items-center g-2 mb-4">
            <div className="col-sm-6">
              <label className="form-label small mb-1">
                Manuální jas displeje: <strong>{manualBrightness}</strong> / 255
              </label>
              <input
                type="range"
                className="form-range"
                min={0}
                max={255}
                value={manualBrightness}
                onChange={(e) => setManualBrightness(Number(e.target.value))}
              />
            </div>
            <div className="col-auto d-flex gap-2">
              <button
                type="button"
                className="btn btn-outline-primary btn-sm"
                onClick={() => runAction("brightness", manualBrightness)}
                disabled={busy}
              >
                Nastavit jas
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => {
                  setManualBrightness(60);
                  runAction("brightness", 60);
                }}
                disabled={busy}
              >
                60
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => {
                  setManualBrightness(255);
                  runAction("brightness", 255);
                }}
                disabled={busy}
              >
                255
              </button>
            </div>
          </div>

          <hr />

          {/* 4. Automatizace */}
          <h6 className="mb-3 text-mute">Automatizace</h6>

          <div className="row g-3 mb-4">
            <div className="col-md-6">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <label className="form-label mb-0" htmlFor="activeBrightness">
                  Podsvícení pro účtenku: <strong>{formData.active_brightness}</strong> / 255
                </label>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => runAction("brightness", formData.active_brightness)}
                  disabled={busy}
                >
                  Vyzkoušet
                </button>
              </div>
              <input
                id="activeBrightness"
                type="range"
                className="form-range"
                name="active_brightness"
                min={0}
                max={255}
                value={formData.active_brightness}
                onChange={handleChange}
                disabled={!formData.auto_brightness}
              />
            </div>
            <div className="col-md-6">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <label className="form-label mb-0" htmlFor="qrBrightness">
                  Podsvícení pro QR platbu: <strong>{formData.qr_brightness}</strong> / 255
                </label>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => runAction("brightness", formData.qr_brightness)}
                  disabled={busy}
                >
                  Vyzkoušet
                </button>
              </div>
              <input
                id="qrBrightness"
                type="range"
                className="form-range"
                name="qr_brightness"
                min={0}
                max={255}
                value={formData.qr_brightness}
                onChange={handleChange}
                disabled={!formData.auto_brightness}
              />
            </div>
          </div>

          <p className="text-mute small mb-2">
            Zapnuté kroky se spouští shora dolů po připojení ADB zařízení. Číslo vlevo určuje
            prodlevu (v sekundách) před spuštěním daného kroku (u prvního po spojení se zařízením,
            u dalších po předchozím kroku).
          </p>

          <div className="d-flex flex-column gap-2 mb-4">
            {AUTO_STEPS.map((step) => (
              <div key={step.key} className="d-flex align-items-center gap-3">
                <div
                  className="d-flex align-items-center gap-1 flex-shrink-0"
                  title={
                    step.isFirst
                      ? "Prodleva po úspěšném spojení se zařízením (s)"
                      : "Prodleva po předchozím kroku (s)"
                  }
                >
                  <input
                    type="number"
                    className="form-control form-control-sm text-end"
                    style={{ width: 68 }}
                    min={0}
                    max={60}
                    step="0.5"
                    value={formData.auto_delays[step.key]}
                    onChange={(e) => handleDelayChange(step.key, e.target.value)}
                    aria-label={`Prodleva před: ${step.key}`}
                  />
                  <span className="small text-mute">s</span>
                </div>
                <div className="form-check form-switch mb-0">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id={step.id}
                    name={step.key}
                    checked={formData[step.key]}
                    onChange={handleChange}
                  />
                  <label className="form-check-label" htmlFor={step.id}>
                    {step.label}
                  </label>
                </div>
              </div>
            ))}
          </div>

          <div className="d-flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              <Fa.FaFloppyDisk /> Uložit nastavení
            </button>
            <button
              type="button"
              className="btn btn-outline-success d-flex align-items-center gap-2"
              onClick={() => runAction("run_auto")}
              disabled={busy}
            >
              <Fa.FaPlay /> Spustit automatizaci teď
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
