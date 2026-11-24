import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { updateState } from "@/lib/customerState";
import {
  DEFAULT_CD_SETTINGS,
  applyAdbBrightness,
  clampInt,
  ensureAdbWatcher,
  getCustomerDisplaySettings,
  handleDevicePresence,
  parseAdbDevices,
  parseAutoDelays,
  parseBatteryDump,
  runAdb,
  runDeviceAutomation,
  sendAdbTap,
} from "@/lib/adb";

export async function GET() {
  try {
    ensureAdbWatcher();
    const row = getCustomerDisplaySettings();
    return NextResponse.json({
      ...row,
      auto_delays: parseAutoDelays(row.auto_delays),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    ensureAdbWatcher();
    const body = await req.json();
    const current = getCustomerDisplaySettings();

    const adb_path =
      body.adb_path !== undefined ? String(body.adb_path).trim() || "adb" : current.adb_path;
    const device_serial =
      body.device_serial !== undefined ? String(body.device_serial).trim() : current.device_serial;
    const port = body.port !== undefined ? clampInt(body.port, 1, 65535, 3000) : current.port;
    const toBool = (key: keyof typeof DEFAULT_CD_SETTINGS) =>
      body[key] !== undefined ? (body[key] ? 1 : 0) : Number(current[key]) || 0;

    const idle_brightness =
      body.idle_brightness !== undefined
        ? clampInt(body.idle_brightness, 0, 255, 60)
        : current.idle_brightness;
    const active_brightness =
      body.active_brightness !== undefined
        ? clampInt(body.active_brightness, 0, 255, 100)
        : current.active_brightness;
    const qr_brightness =
      body.qr_brightness !== undefined
        ? clampInt(body.qr_brightness, 0, 255, 200)
        : current.qr_brightness;
    const tap_x = body.tap_x !== undefined ? clampInt(body.tap_x, 0, 10000, 400) : current.tap_x;
    const tap_y = body.tap_y !== undefined ? clampInt(body.tap_y, 0, 10000, 150) : current.tap_y;
    const auto_delays = JSON.stringify(
      parseAutoDelays(body.auto_delays !== undefined ? body.auto_delays : current.auto_delays),
    );

    db.prepare(
      `
      UPDATE customer_display_settings
      SET adb_path = ?, device_serial = ?, port = ?,
          auto_reverse = ?, auto_open_cd = ?, auto_immersive = ?,
          auto_fullscreen = ?, auto_stay_on = ?, auto_brightness = ?,
          idle_brightness = ?, active_brightness = ?, qr_brightness = ?,
          tap_x = ?, tap_y = ?, auto_delays = ?
      WHERE id = 1
    `,
    ).run(
      adb_path,
      device_serial,
      port,
      toBool("auto_reverse"),
      toBool("auto_open_cd"),
      toBool("auto_immersive"),
      toBool("auto_fullscreen"),
      toBool("auto_stay_on"),
      toBool("auto_brightness"),
      idle_brightness,
      active_brightness,
      qr_brightness,
      tap_x,
      tap_y,
      auto_delays,
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    ensureAdbWatcher();
    const body = await req.json();
    const current = getCustomerDisplaySettings();
    const adbPath = (body.adb_path ?? current.adb_path) || "adb";
    const serial = (body.device_serial ?? current.device_serial) || "";
    const port = clampInt(body.port ?? current.port, 1, 65535, 3000);
    const tapX = clampInt(body.tap_x ?? current.tap_x, 0, 10000, 400);
    const tapY = clampInt(body.tap_y ?? current.tap_y, 0, 10000, 150);
    const { action, value } = body;

    if (action === "status") {
      const { stdout } = await runAdb(adbPath, ["devices", "-l"]);
      const devices = parseAdbDevices(stdout);
      const targetDevice = serial
        ? devices.find((d) => d.serial === serial && d.state === "device")
        : devices.find((d) => d.state === "device");

      let battery: ReturnType<typeof parseBatteryDump> | null = null;
      if (targetDevice) {
        const bat = await runAdb(adbPath, ["shell", "dumpsys", "battery"], targetDevice.serial);
        battery = parseBatteryDump(bat.stdout);
      }

      handleDevicePresence(devices, current);

      return NextResponse.json({
        devices,
        battery,
        activeSerial: targetDevice?.serial || null,
      });
    }

    const actions: Record<string, () => Promise<string>> = {
      reverse: async () => {
        await runAdb(adbPath, ["reverse", `tcp:${port}`, `tcp:${port}`], serial);
        return `USB tunel tcp:${port} -> tcp:${port} byl nastaven.`;
      },
      reverse_remove: async () => {
        await runAdb(adbPath, ["reverse", "--remove-all"], serial);
        return "Všechny USB tunely (adb reverse) byly zrušeny.";
      },
      open_cd: async () => {
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
        return `V prohlížeči Chrome byla otevřena stránka http://localhost:${port}/cd.`;
      },
      immersive_on: async () => {
        await runAdb(
          adbPath,
          ["shell", "settings", "put", "global", "policy_control", "immersive.full=*"],
          serial,
        );
        return "Systémová lišta skryta (immersive mode).";
      },
      immersive_off: async () => {
        await runAdb(
          adbPath,
          ["shell", "settings", "put", "global", "policy_control", "immersive.full=null"],
          serial,
        );
        return "Systémová lišta zobrazena.";
      },
      toggle_fullscreen: async () => {
        updateState({ fullscreenToggleId: Date.now(), fullscreenAction: "toggle" });
        await new Promise((r) => setTimeout(r, 150));
        await sendAdbTap({ adb_path: adbPath, device_serial: serial, tap_x: tapX, tap_y: tapY });
        return "Přepnutí fullscreenu v Chrome bylo odesláno.";
      },
      run_auto: async () => {
        const { stdout } = await runAdb(adbPath, ["devices", "-l"]);
        const devices = parseAdbDevices(stdout);
        const target = serial
          ? devices.find((d) => d.serial === serial && d.state === "device")
          : devices.find((d) => d.state === "device");

        if (!target) {
          throw new Error("Žádné aktivní ADB zařízení není připojeno.");
        }

        const steps = await runDeviceAutomation(target.serial, {
          adb_path: adbPath,
          device_serial: target.serial,
          port,
          tap_x: tapX,
          tap_y: tapY,
          auto_reverse: body.auto_reverse !== undefined ? (body.auto_reverse ? 1 : 0) : current.auto_reverse,
          auto_open_cd: body.auto_open_cd !== undefined ? (body.auto_open_cd ? 1 : 0) : current.auto_open_cd,
          auto_immersive:
            body.auto_immersive !== undefined ? (body.auto_immersive ? 1 : 0) : current.auto_immersive,
          auto_fullscreen:
            body.auto_fullscreen !== undefined ? (body.auto_fullscreen ? 1 : 0) : current.auto_fullscreen,
          auto_stay_on: body.auto_stay_on !== undefined ? (body.auto_stay_on ? 1 : 0) : current.auto_stay_on,
          auto_brightness:
            body.auto_brightness !== undefined ? (body.auto_brightness ? 1 : 0) : current.auto_brightness,
          active_brightness:
            body.active_brightness !== undefined
              ? clampInt(body.active_brightness, 0, 255, 100)
              : current.active_brightness,
          auto_delays: JSON.stringify(
            parseAutoDelays(body.auto_delays !== undefined ? body.auto_delays : current.auto_delays),
          ),
        });
        if (steps.length === 0) {
          return "Žádný automatický přepínač není zapnutý.";
        }
        return `Automatizace spuštěna (${target.serial}): ${steps.join(" → ")}.`;
      },
      tap: async () => {
        const { x, y } = await sendAdbTap({
          adb_path: adbPath,
          device_serial: serial,
          tap_x: tapX,
          tap_y: tapY,
        });
        return `Odeslán tap na souřadnice ${x}, ${y}.`;
      },
      stayon_on: async () => {
        await runAdb(adbPath, ["shell", "svc", "power", "stayon", "usb"], serial);
        return "Displej se při připojení přes USB nebude vypínat.";
      },
      stayon_off: async () => {
        await runAdb(adbPath, ["shell", "svc", "power", "stayon", "false"], serial);
        return "Nevypínání displeje na USB bylo zrušeno.";
      },
      wake: async () => {
        await runAdb(adbPath, ["shell", "input", "keyevent", "KEYCODE_WAKEUP"], serial);
        return "Zařízení bylo probuzeno.";
      },
      sleep: async () => {
        await runAdb(adbPath, ["shell", "input", "keyevent", "KEYCODE_SLEEP"], serial);
        return "Zařízení bylo uspáno.";
      },
      brightness: async () => {
        const level = await applyAdbBrightness(value, {
          adb_path: adbPath,
          device_serial: serial,
          tap_x: tapX,
          tap_y: tapY,
        });
        return `Jas displeje nastaven na ${level} / 255.`;
      },
    };

    const handler = actions[action];
    if (!handler) {
      return NextResponse.json({ error: "Neznámá akce." }, { status: 400 });
    }

    const message = await handler();
    return NextResponse.json({ success: true, message });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
