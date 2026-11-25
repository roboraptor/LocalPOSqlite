import { GeneralSettings } from "@/types/db";

interface PrintHeaderProps {
  general: Partial<GeneralSettings>;
  documentTitle: string;
  metaText: string;
  titleSize?: number;
  textSize?: number;
  showDivider?: boolean;
}

/**
 * Shared thermal print header rendered inside `.print-only` sections.
 */
export function PrintHeader({
  general,
  documentTitle,
  metaText,
  titleSize = 18,
  textSize = 11,
  showDivider = false,
}: PrintHeaderProps) {
  return (
    <div style={{ textAlign: "center", marginBottom: 20 }}>
      <h2 style={{ fontSize: titleSize, margin: "0 0 5px 0", fontWeight: "bold" }}>
        {general.organization_name || "Local POS"}
      </h2>
      {general.organization_address && (
        <div style={{ fontSize: textSize, whiteSpace: "pre-line" }}>
          {general.organization_address}
        </div>
      )}
      {(general.organization_id || general.organization_vat_id) && (
        <div style={{ fontSize: textSize }}>
          {general.organization_id ? `IČO: ${general.organization_id}` : ""}
          {general.organization_id && general.organization_vat_id ? " • " : ""}
          {general.organization_vat_id ? `DIČ: ${general.organization_vat_id}` : ""}
        </div>
      )}
      {general.receipt_title && (
        <div style={{ fontSize: textSize + 1, fontWeight: "bold", marginTop: 4 }}>
          {general.receipt_title}
        </div>
      )}
      {Boolean(general.receipt_header_enabled) && general.receipt_header && (
        <div style={{ fontSize: textSize, whiteSpace: "pre-line", marginTop: 4 }}>
          {general.receipt_header}
        </div>
      )}
      <div style={{ fontSize: textSize + 3, fontWeight: "bold", marginTop: 6 }}>
        {documentTitle}
      </div>
      <div style={{ fontSize: textSize, color: "#555" }}>{metaText}</div>
      {showDivider && <div style={{ borderBottom: "2px solid black", marginTop: 10 }} />}
    </div>
  );
}

interface PrintFooterProps {
  general: Partial<GeneralSettings>;
  fontSize?: number;
  marginTop?: number;
  className?: string;
}

/**
 * Shared thermal print footer rendered when receipt_footer_enabled is active.
 */
export function PrintFooter({
  general,
  fontSize = 11,
  marginTop = 10,
  className,
}: PrintFooterProps) {
  if (!Boolean(general.receipt_footer_enabled) || !general.receipt_footer) {
    return null;
  }
  return (
    <div
      className={className}
      style={{ textAlign: "center", fontSize, whiteSpace: "pre-line", marginTop }}
    >
      {general.receipt_footer}
    </div>
  );
}
