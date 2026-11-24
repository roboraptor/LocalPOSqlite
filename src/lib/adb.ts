import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import db from "@/db";
import { AutoStepDelays, CustomerDisplaySettings } from "@/types/db";
import { customerClients, updateState } from "@/lib/customerState";

const execFileAsync = promisify(execFile);
let cachedAdbBin: string | null = null;

export const DEFAULT_AUTO_DELAYS: AutoStepDelays = {
  auto_stay_on: 0,
  auto_immersive: 0,
  auto_reverse: 0,
  auto_open_cd: 1,
  auto_fullscreen: 3,
  auto_brightness: 1,
};

export function parseAutoDelays(raw: unknown): AutoStepDelays {
  let obj: Record<string, unknown> = {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") obj = parsed as Record<string, unknown>;
    } catch {
      obj = {};
    }
  } else if (raw && typeof raw === "object") {
    obj = raw as Record<string, unknown>;
  }

  const clampDelay = (val: unknown, fallback: number) => {
    const num = Number(val);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(60, Math.max(0, Math.round(num * 10) / 10));
  };

  return {
    auto_stay_on: clampDelay(obj.auto_stay_on, DEFAULT_AUTO_DELAYS.auto_stay_on),
    auto_immersive: clampDelay(obj.auto_immersive, DEFAULT_AUTO_DELAYS.auto_immersive),
    auto_reverse: clampDelay(obj.auto_reverse, DEFAULT_AUTO_DELAYS.auto_reverse),
    auto_open_cd: clampDelay(obj.auto_open_cd, DEFAULT_AUTO_DELAYS.auto_open_cd),
    auto_fullscreen: clampDelay(obj.auto_fullscreen, DEFAULT_AUTO_DELAYS.auto_fullscreen),
    auto_brightness: clampDelay(obj.auto_brightness, DEFAULT_AUTO_DELAYS.auto_brightness),
  };
}

export const DEFAULT_CD_SETTINGS: Omit<CustomerDisplaySettings, "id"> = {
  adb_path: "adb",
  device_serial: "",
  port: 3000,
  auto_reverse: 0,
  auto_open_cd: 0,
  auto_immersive: 0,
  auto_fullscreen: 0,
  auto_stay_on: 0,
  auto_brightness: 0,
  idle_brightness: 60,
  active_brightness: 100,
  qr_brightness: 200,
  tap_x: 400,
  tap_y: 150,
  auto_delays: JSON.stringify(DEFAULT_AUTO_DELAYS),
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
  const y = clampInt(overrides?.tap_y ?? settings.tap_y, 0, 10000, 150);

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

const globalForAdb = globalThis as unknown as {
  adbLastConnectedSerial?: string | null;
  adbAutomationRunning?: boolean;
  adbWatcherStarted?: boolean;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runDeviceAutomation(
  serial: string,
  overrides?: Partial<CustomerDisplaySettings>,
): Promise<string[]> {
  const settings: CustomerDisplaySettings = {
    ...getCustomerDisplaySettings(),
    ...overrides,
    device_serial: serial,
  };
  const executed: string[] = [];
  const port = clampInt(settings.port, 1, 65535, 3000);
  const adbPath = settings.adb_path || "adb";
  const delays = parseAutoDelays(settings.auto_delays);

  const runStep = async (key: keyof AutoStepDelays, label: string, fn: () => Promise<void>) => {
    try {
      const waitSec = delays[key] ?? 0;
      if (waitSec > 0) {
        await sleep(Math.round(waitSec * 1000));
      }
      await fn();
      executed.push(label);
    } catch (err: any) {
      console.warn(`[ADB Auto] Step "${label}" failed:`, err?.message || err);
    }
  };

  if (settings.auto_stay_on) {
    await runStep("auto_stay_on", "Nevypínat na USB", async () => {
      await runAdb(adbPath, ["shell", "svc", "power", "stayon", "usb"], serial);
    });
  }

  if (settings.auto_immersive) {
    await runStep("auto_immersive", "Skrýt lištu", async () => {
      await runAdb(
        adbPath,
        ["shell", "settings", "put", "global", "policy_control", "immersive.full=*"],
        serial,
      );
    });
  }

  if (settings.auto_reverse) {
    await runStep("auto_reverse", `USB tunel (${port})`, async () => {
      await runAdb(adbPath, ["reverse", `tcp:${port}`, `tcp:${port}`], serial);
    });
  }

  if (settings.auto_open_cd) {
    await runStep("auto_open_cd", "Otevřít /cd v Chrome", async () => {
      await runAdb(adbPath, ["shell", "input", "keyevent", "KEYCODE_WAKEUP"], serial);
      await sleep(400);
      await runAdb(
        adbPath,
        [
          "shell",
          "am",
          "start",
          "-a",
          "android.intent.action.VIEW",
          "-d",
          `http://localhost:${port}/cd`,
          "-p",
          "com.android.chrome",
        ],
        serial,
      );
      if (settings.auto_fullscreen) {
        const deadline = Date.now() + 4000;
        while (customerClients.size === 0 && Date.now() < deadline) {
          await sleep(250);
        }
        await sleep(300);
      }
    });
  }

  if (settings.auto_fullscreen) {
    await runStep("auto_fullscreen", "Fullscreen v Chrome", async () => {
      updateState({ fullscreenToggleId: Date.now(), fullscreenAction: "enter" });
      await sleep(200);
      await sendAdbTap({
        adb_path: adbPath,
        device_serial: serial,
        tap_x: settings.tap_x,
        tap_y: settings.tap_y,
      });
    });
  }

  if (settings.auto_brightness) {
    await runStep("auto_brightness", `Podsvícení (${settings.active_brightness})`, async () => {
      await applyAdbBrightness(settings.active_brightness, {
        adb_path: adbPath,
        device_serial: serial,
        tap_x: settings.tap_x,
        tap_y: settings.tap_y,
      });
    });
  }

  return executed;
}

export function handleDevicePresence(
  devices: AdbDeviceInfo[],
  settingsArg?: CustomerDisplaySettings,
) {
  const settings = settingsArg || getCustomerDisplaySettings();
  const desiredSerial = (settings.device_serial || "").trim();
  const target = desiredSerial
    ? devices.find((d) => d.serial === desiredSerial && d.state === "device")
    : devices.find((d) => d.state === "device");

  if (!target) {
    globalForAdb.adbLastConnectedSerial = null;
    return;
  }

  if (
    target.serial === globalForAdb.adbLastConnectedSerial ||
    globalForAdb.adbAutomationRunning
  ) {
    return;
  }

  globalForAdb.adbLastConnectedSerial = target.serial;

  const hasAutoEnabled = Boolean(
    settings.auto_stay_on ||
      settings.auto_immersive ||
      settings.auto_reverse ||
      settings.auto_open_cd ||
      settings.auto_fullscreen ||
      settings.auto_brightness,
  );

  if (!hasAutoEnabled) return;

  globalForAdb.adbAutomationRunning = true;
  runDeviceAutomation(target.serial, settings)
    .then((steps) => {
      if (steps.length > 0) {
        console.log(`[ADB Auto] Completed for ${target.serial}: ${steps.join(", ")}`);
      }
    })
    .finally(() => {
      globalForAdb.adbAutomationRunning = false;
    });
}

export function ensureAdbWatcher() {
  if (process.env.VITEST || globalForAdb.adbWatcherStarted) return;
  globalForAdb.adbWatcherStarted = true;

  const timer = setInterval(async () => {
    try {
      const settings = getCustomerDisplaySettings();
      const hasAutoEnabled = Boolean(
        settings.auto_stay_on ||
          settings.auto_immersive ||
          settings.auto_reverse ||
          settings.auto_open_cd ||
          settings.auto_fullscreen ||
          settings.auto_brightness,
      );
      if (!hasAutoEnabled) return;

      const { stdout } = await runAdb(settings.adb_path || "adb", ["devices", "-l"]);
      const devices = parseAdbDevices(stdout);
      handleDevicePresence(devices, settings);
    } catch {
      globalForAdb.adbLastConnectedSerial = null;
    }
  }, 5000);

  if (typeof timer.unref === "function") {
    timer.unref();
  }
}
