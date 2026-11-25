// c:\projects\LocalPOSjson\src\app\api\customer-display\update\route.ts
import { NextRequest, NextResponse } from "next/server";
import { getState, updateState } from "@/lib/customerState";
import { ensureAdbWatcher, getCustomerDisplaySettings, triggerAutoBrightness } from "@/lib/adb";

export async function POST(req: NextRequest) {
  try {
    ensureAdbWatcher();
    const body = await req.json();
    const prev = getState();
    const prevShowQR = Boolean(prev.showQRModal);
    const prevReceiptJson = JSON.stringify(prev.receipt || []);

    updateState(body);

    const settings = getCustomerDisplaySettings();
    if (settings.auto_brightness) {
      const qrOpened = Boolean(body.showQRModal) && !prevShowQR;
      const qrClosed = !body.showQRModal && prevShowQR;
      const receiptChanged =
        Array.isArray(body.receipt) && JSON.stringify(body.receipt) !== prevReceiptJson;

      if (qrOpened) {
        triggerAutoBrightness(settings.qr_brightness);
      } else if (qrClosed || (receiptChanged && !body.showQRModal)) {
        triggerAutoBrightness(settings.active_brightness);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[API Update] Error processing update:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
