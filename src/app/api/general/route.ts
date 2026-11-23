import { NextResponse } from "next/server";
import db from "@/db";

// GET /api/general - Načíst nastavení
export async function GET() {
  try {
    // Vždy vracíme řádek s ID 1
    const settings = db.prepare("SELECT * FROM general WHERE id = 1").get();
    return NextResponse.json(settings || {});
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

const pickStr = (body: any, current: any, key: string, fallback = "") =>
  (body[key] !== undefined ? body[key] : current[key]) || fallback;

const pickNullableStr = (body: any, current: any, key: string) =>
  (body[key] !== undefined ? body[key] : current[key]) || null;

const pickBool = (body: any, current: any, key: string) =>
  body[key] !== undefined ? (body[key] ? 1 : 0) : current[key] || 0;

const pickNum = (body: any, current: any, key: string, fallback = 0) =>
  Number(body[key] !== undefined ? body[key] : current[key]) || fallback;

const pickNullableNum = (body: any, current: any, key: string) =>
  body[key] !== undefined ? (body[key] ? Number(body[key]) : null) : current[key] ?? null;

// POST /api/general - Uložit nastavení (UPDATE)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const current = (db.prepare("SELECT * FROM general WHERE id = 1").get() as Record<string, any>) || {};

    const stmt = db.prepare(`
      UPDATE general 
      SET organization_name = ?, organization_address = ?, organization_owner = ?,
          organization_id = ?, organization_vat_id = ?, 
          bank_iban = ?, trx_msg = ?, trx_vs_enabled = ?, trx_ks = ?,
          eet_enable = ?, use_external_qr_api = ?,
          currency = ?, tax_rate = ?, tax_enabled = ?,
          receipt_title = ?, receipt_header = ?, receipt_header_enabled = ?,
          receipt_footer = ?, receipt_footer_enabled = ?
      WHERE id = 1
    `);

    stmt.run(
      pickStr(body, current, "organization_name"),
      pickStr(body, current, "organization_address"),
      pickStr(body, current, "organization_owner"),
      pickStr(body, current, "organization_id"),
      pickStr(body, current, "organization_vat_id"),
      pickNullableStr(body, current, "bank_iban"),
      pickNullableStr(body, current, "trx_msg"),
      pickBool(body, current, "trx_vs_enabled"),
      pickNullableNum(body, current, "trx_ks"),
      pickBool(body, current, "eet_enable"),
      pickBool(body, current, "use_external_qr_api"),
      pickStr(body, current, "currency", "CZK"),
      pickNum(body, current, "tax_rate", 0),
      pickBool(body, current, "tax_enabled"),
      pickStr(body, current, "receipt_title"),
      pickStr(body, current, "receipt_header"),
      pickBool(body, current, "receipt_header_enabled"),
      pickStr(body, current, "receipt_footer"),
      pickBool(body, current, "receipt_footer_enabled"),
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
