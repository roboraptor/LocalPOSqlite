import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import db from "@/db";
import { CustomerDisplaySettings } from "@/types/db";

const execFileAsync = promisify(execFile);
let cachedAdbBin: string | null = null;

export const DEFAULT_CD_SETTINGS: Omit<CustomerDisplaySettings, "id"> = {
  adb_path: "adb",
  device_serial: "",
  port: 3000,
  auto_reverse: 0,
  auto_open_cd: 0,
  auto_immersive: 0,
  auto_stay_on: 0,
  auto_brightness: 0,
  idle_brightness: 60,
  active_brightness: 100,
  qr_brightness: 200,
  tap_x: 400,
  tap_y: 100,
};

export function clampInt(val: unknown, min: number, max: number, fallback: number): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

export function getCustomerDisplaySettings(): CustomerDisplaySettings {
  const row = db
    .prepare("SELECT * FROM customer_display_settings WHERE id = 1")
    .get() as CustomerDisplaySettings | undefined;
  return { id: 1, ...DEFAULT_CD_SETTINGS, ...(row || {}) };
}

function findWindowsAdb(): string | null {
  if (process.platform !== "win32") return null;
  const localAppData = process.env.LOCALAPPDATA || "";
  const candidates: string[] = [];

  if (localAppData) {
    candidates.push(path.join(localAppData, "Microsoft", "WinGet", "Links", "adb.exe"));

    const packagesDir = path.join(localAppData, "Microsoft", "WinGet", "Packages");
    try {
      for (const entry of fs.readdirSync(packagesDir)) {
        if (entry.startsWith("Google.PlatformTools")) {
          candidates.push(path.join(packagesDir, entry, "platform-tools", "adb.exe"));
        }
      }
    } catch {
      // WinGet packages folder might not exist
    }

    candidates.push(path.join(localAppData, "Android", "Sdk", "platform-tools", "adb.exe"));
  }

  candidates.push("C:\\platform-tools\\adb.exe");

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export async function runAdb(adbPath: string, args: string[], serial?: string) {
  const cleanSerial = (serial || "").trim();
  const fullArgs = cleanSerial && args[0] !== "devices" ? ["-s", cleanSerial, ...args] : args;
  const rawBin = (adbPath || "adb").trim() || "adb";
  const bin = rawBin === "adb" && cachedAdbBin ? cachedAdbBin : rawBin;

  const execAdb = async (targetBin: string) => {
    const { stdout, stderr } = await execFileAsync(targetBin, fullArgs, { timeout: 8000 });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  };

  try {
    return await execAdb(bin);
  } catch (err: any) {
    if (err?.code === "ENOENT" && rawBin === "adb") {
      const fallback = findWindowsAdb();
      if (fallback) {
        cachedAdbBin = fallback;
        try {
          return await execAdb(fallback);
        } catch (retryErr: any) {
          const detail =
            retryErr?.stderr?.trim() || retryErr?.stdout?.trim() || retryErr?.message || "Chyba ADB";
          throw new Error(detail);
        }
      }
    }
    if (err?.code === "ENOENT") {
      throw new Error(
        "ADB nebylo nalezeno. Nainstalujte Android Platform Tools do PATH nebo zadejte cestu k adb.exe.",
      );
    }
    const detail = err?.stderr?.trim() || err?.stdout?.trim() || err?.message || "Chyba ADB";
    throw new Error(detail);
  }
}

export interface AdbDeviceInfo {
  serial: string;
  state: string;
  model: string;
}

export function parseAdbDevices(output: string): AdbDeviceInfo[] {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      const serial = parts[0] || "";
      const state = parts[1] || "unknown";
      const modelToken = parts.find((p) => p.startsWith("model:"));
      const model = modelToken ? modelToken.replace("model:", "").replace(/_/g, " ") : "";
      return { serial, state, model };
    });
}

export function parseBatteryDump(output: string) {
  const getVal = (key: string) => {
    const m = output.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, "mi"));
    return m ? m[1].trim() : null;
  };

  const level = Number(getVal("level"));
  const tempRaw = Number(getVal("temperature"));
  const voltage = Number(getVal("voltage"));
  const acPowered = getVal("AC powered") === "true";
  const usbPowered = getVal("USB powered") === "true";
  const wirelessPowered = getVal("Wireless powered") === "true";
  const statusCode = Number(getVal("status"));

  const statusMap: Record<number, string> = {
    2: "Nabíjí se",
    3: "Vybíjí se",
    4: "Nenabíjí se",
    5: "Plně nabito",
  };

  return {
    level: Number.isFinite(level) ? level : null,
    temperatureC: Number.isFinite(tempRaw) ? Number((tempRaw / 10).toFixed(1)) : null,
    voltageMv: Number.isFinite(voltage) ? voltage : null,
    plugged: acPowered ? "AC" : usbPowered ? "USB" : wirelessPowered ? "Wireless" : "Odpojeno",
    status: statusMap[statusCode] || "Neznámý",
  };
}

export async function sendAdbTap(overrides?: {
  adb_path?: string;
  device_serial?: string;
  tap_x?: number;
  tap_y?: number;
}) {
  const settings = getCustomerDisplaySettings();
  const adbPath = overrides?.adb_path ?? settings.adb_path;
  const serial = overrides?.device_serial ?? settings.device_serial;
  const x = clampInt(overrides?.tap_x ?? settings.tap_x, 0, 10000, 400);
  const y = clampInt(overrides?.tap_y ?? settings.tap_y, 0, 10000, 100);

  await runAdb(adbPath, ["shell", "input", "tap", String(x), String(y)], serial);
  return { x, y };
}

export async function applyAdbBrightness(
  level: number,
  overrides?: { adb_path?: string; device_serial?: string; tap_x?: number; tap_y?: number },
) {
  const settings = getCustomerDisplaySettings();
  const adbPath = overrides?.adb_path ?? settings.adb_path;
  const serial = overrides?.device_serial ?? settings.device_serial;
  const clamped = clampInt(level, 0, 255, 180);

  await runAdb(
    adbPath,
    ["shell", "settings", "put", "system", "screen_brightness_mode", "0"],
    serial,
  );
  await runAdb(
    adbPath,
    ["shell", "settings", "put", "system", "screen_brightness", String(clamped)],
    serial,
  );
  await sendAdbTap({
    adb_path: adbPath,
    device_serial: serial,
    tap_x: overrides?.tap_x,
    tap_y: overrides?.tap_y,
  });
  return clamped;
}

let brightnessRunning = false;
let pendingBrightness: number | null = null;

export function triggerAutoBrightness(level: number) {
  pendingBrightness = clampInt(level, 0, 255, 180);
  if (brightnessRunning) return;

  brightnessRunning = true;
  (async () => {
    while (pendingBrightness !== null) {
      const next = pendingBrightness;
      pendingBrightness = null;
      try {
        await applyAdbBrightness(next);
      } catch (err: any) {
        console.warn("[ADB AutoBrightness] Failed:", err?.message || err);
      }
    }
    brightnessRunning = false;
  })();
}
