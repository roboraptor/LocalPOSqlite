import { spawn } from "child_process";
import { NextRequest, NextResponse } from "next/server";
import {
  findTargetAdbDevice,
  getCustomerDisplaySettings,
  isBinaryAvailable,
  parseAdbDevices,
  resolveAdbBinary,
  resolveFfmpegBinary,
  runAdb,
} from "@/lib/adb";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);
const MAX_BUFFER_BYTES = 5 * 1024 * 1024;
const MAX_INITIAL_BURST_BYTES = 512 * 1024;
const MIN_FRAME_INTERVAL_MS = 200;

const globalForPreview = globalThis as unknown as {
  activePreviewCleanup?: (() => void) | null;
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const current = getCustomerDisplaySettings();
  const adbPath = (searchParams.get("adb_path") ?? current.adb_path) || "adb";
  const serial = (searchParams.get("device_serial") ?? current.device_serial) || "";
  const isCheckOnly = searchParams.get("check") === "1";

  if (globalForPreview.activePreviewCleanup) {
    return NextResponse.json(
      { error: "Náhled již sleduje jiný klient nebo se právě ukončuje." },
      { status: 409 },
    );
  }

  const ffmpegBin = resolveFfmpegBinary();
  if (isCheckOnly) {
    const hasFfmpeg = await isBinaryAvailable(ffmpegBin, ["-version"]);
    if (!hasFfmpeg) {
      return NextResponse.json(
        { error: "FFmpeg nebylo nalezeno. Nainstalujte ho příkazem: winget install Gyan.FFmpeg" },
        { status: 400 },
      );
    }

    try {
      const { stdout } = await runAdb(adbPath, ["devices", "-l"]);
      const devices = parseAdbDevices(stdout);
      const target = findTargetAdbDevice(devices, serial);
      if (!target) {
        return NextResponse.json(
          { error: "Žádné aktivní ADB zařízení není připojeno." },
          { status: 400 },
        );
      }
      return NextResponse.json({ ok: true, serial: target.serial });
    } catch (err: any) {
      return NextResponse.json(
        { error: err?.message || "Nepodařilo se spojit s ADB." },
        { status: 400 },
      );
    }
  }

  const adbBin = resolveAdbBinary(adbPath);
  const cleanSerial = serial.trim();

  // Pojistka u starších Androidů, aby předchozí screenrecord neblokoval nový start
  await runAdb(adbPath, ["shell", "pkill", "-f", "screenrecord"], cleanSerial).catch(() => {});

  const adbArgs = [
    ...(cleanSerial ? ["-s", cleanSerial] : []),
    "exec-out",
    "screenrecord",
    "--output-format=h264",
    "--bit-rate=2000000",
    "-",
  ];
  const ffmpegArgs = [
    "-flags",
    "low_delay",
    "-probesize",
    "32",
    "-analyzeduration",
    "0",
    "-threads",
    "1",
    "-f",
    "h264",
    "-i",
    "pipe:0",
    "-threads",
    "1",
    "-vf",
    "scale=540:-1,format=yuvj420p",
    "-fps_mode",
    "passthrough",
    "-flush_packets",
    "1",
    "-f",
    "mjpeg",
    "-q:v",
    "5",
    "pipe:1",
  ];

  let cleanupFn: ((closeStream?: boolean) => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const adbProc = spawn(adbBin, adbArgs, { windowsHide: true });
      const ffmpegProc = spawn(ffmpegBin, ffmpegArgs, { windowsHide: true });

      let cleaned = false;
      let frameBuffer: Buffer = Buffer.alloc(0);
      let framesSent = 0;
      let lastFrameSentAt = 0;
      let flushedInitial = false;
      let initialBurstBytes = 0;
      const initialBurstChunks: Buffer[] = [];
      let initialFlushTimer: ReturnType<typeof setTimeout> | null = null;

      const cleanup = (closeStream = true) => {
        if (cleaned) return;
        cleaned = true;
        if (initialFlushTimer) {
          clearTimeout(initialFlushTimer);
          initialFlushTimer = null;
        }
        try {
          adbProc.kill("SIGKILL");
        } catch {}
        try {
          ffmpegProc.kill("SIGKILL");
        } catch {}
        if (globalForPreview.activePreviewCleanup === cleanupFn) {
          globalForPreview.activePreviewCleanup = null;
        }
        if (closeStream) {
          try {
            controller.close();
          } catch {}
        }
      };

      cleanupFn = cleanup;
      globalForPreview.activePreviewCleanup = cleanup;

      ffmpegProc.stdin?.on("error", () => {});

      adbProc.stdout?.on("data", (chunk: Buffer) => {
        if (cleaned) return;
        try {
          ffmpegProc.stdin?.write(chunk);
        } catch {
          return;
        }

        if (framesSent === 0 && !flushedInitial) {
          if (initialBurstBytes + chunk.length <= MAX_INITIAL_BURST_BYTES) {
            initialBurstChunks.push(chunk);
            initialBurstBytes += chunk.length;
          }
          if (initialFlushTimer) clearTimeout(initialFlushTimer);
          // Raw H.264 parser drží první keyframe do příchodu dalšího snímku; na statickém
          // displeji zopakujeme úvodní SPS+PPS+IDR burst, čímž okamžitě dostaneme 1. JPEG snímek.
          initialFlushTimer = setTimeout(() => {
            if (cleaned || framesSent > 0 || flushedInitial || initialBurstChunks.length === 0) {
              return;
            }
            flushedInitial = true;
            try {
              ffmpegProc.stdin?.write(Buffer.concat(initialBurstChunks));
            } catch {}
          }, 150);
        }
      });

      adbProc.stdout?.on("end", () => {
        try {
          ffmpegProc.stdin?.end();
        } catch {}
      });

      ffmpegProc.stdout?.on("data", (chunk: Buffer) => {
        if (cleaned) return;
        frameBuffer = Buffer.concat([frameBuffer, chunk]);

        let start = frameBuffer.indexOf(SOI);
        while (start !== -1) {
          const end = frameBuffer.indexOf(EOI, start + 2);
          if (end === -1) {
            if (start > 0) frameBuffer = frameBuffer.subarray(start);
            break;
          }

          const jpegFrame = frameBuffer.subarray(start, end + 2);
          const now = Date.now();
          if (framesSent === 0 || now - lastFrameSentAt >= MIN_FRAME_INTERVAL_MS) {
            const header = Buffer.from(
              `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpegFrame.length}\r\n\r\n`,
            );
            try {
              controller.enqueue(Buffer.concat([header, jpegFrame, Buffer.from("\r\n")]));
              framesSent += 1;
              lastFrameSentAt = now;
              if (initialFlushTimer) {
                clearTimeout(initialFlushTimer);
                initialFlushTimer = null;
              }
            } catch {
              cleanup(false);
              return;
            }
          }

          frameBuffer = frameBuffer.subarray(end + 2);
          start = frameBuffer.indexOf(SOI);
        }

        if (frameBuffer.length > MAX_BUFFER_BYTES) {
          frameBuffer = Buffer.alloc(0);
        }
      });

      const handleAbort = () => cleanup(true);
      req.signal.addEventListener("abort", handleAbort, { once: true });

      adbProc.on("close", () => cleanup(true));
      adbProc.on("error", () => cleanup(true));
      ffmpegProc.on("close", () => cleanup(true));
      ffmpegProc.on("error", () => cleanup(true));
    },
    cancel() {
      cleanupFn?.(false);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "multipart/x-mixed-replace; boundary=frame",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Connection: "keep-alive",
    },
  });
}
