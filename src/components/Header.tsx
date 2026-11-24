"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Fa from "react-icons/fa6";

interface BatteryStatus {
  level: number | null;
  temperatureC: number | null;
  plugged: string;
  status: string;
}

export default function Header() {
  const [expanded, setExpanded] = useState(false);
  const [cdBattery, setCdBattery] = useState<BatteryStatus | null>(null);
  const [refreshingCd, setRefreshingCd] = useState(false);
  const pathname = usePathname();

  const refreshCdStatus = async () => {
    setRefreshingCd(true);
    try {
      const res = await fetch("/api/settings/customer-display", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status" }),
      });
      if (!res.ok) {
        setCdBattery(null);
        return;
      }
      const data = await res.json();
      setCdBattery(data?.battery || null);
    } catch {
      setCdBattery(null);
    } finally {
      setRefreshingCd(false);
    }
  };

  useEffect(() => {
    if (pathname !== "/cd") {
      refreshCdStatus();
    }
  }, [pathname]);

  if (pathname === "/cd") {
    return null;
  }

  const navLinks = [
    { href: "/", label: "Pokladna" },
    { href: "/items", label: "Položky" },
    { href: "/receipts", label: "Účtenky" },
    { href: "/closing", label: "Uzávěrka" },
    { href: "/export", label: "Export" },
    { href: "/settings", label: "Nastavení" },
  ];

  return (
    <nav className="navbar navbar-expand-sm navbar-dark shadow-sm">
      <div className="container">
        <Link href="/" className="navbar-brand fw-bold">
          LocalPOSqlite
        </Link>

        <button
          className="navbar-toggler super-center btn btn-warning"
          style={{ height: 34 }}
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon"></span>
        </button>

        <div className={`collapse navbar-collapse ${expanded ? "show" : ""}`}>
          <div className="navbar-nav ms-auto">
            {cdBattery && (
              <button
                type="button"
                className={`btn ${
                  (cdBattery.temperatureC !== null && cdBattery.temperatureC >= 40) ||
                  (cdBattery.level !== null && cdBattery.level <= 15)
                    ? "btn-danger"
                    : "btn-secondary"
                } super-center`}
                style={{
                  marginLeft: 5,
                  marginBottom: 3,
                  height: 34,
                  gap: 6,
                  whiteSpace: "nowrap",
                }}
                onClick={refreshCdStatus}
                disabled={refreshingCd}
                title={`Klientský displej (${cdBattery.status}, ${cdBattery.plugged}) — kliknutím obnovíte`}
              >
                <Fa.FaMobileScreen size={14} />
                <span>
                  {refreshingCd
                    ? "..."
                    : `${cdBattery.level ?? "?"}% • ${cdBattery.temperatureC !== null ? `${cdBattery.temperatureC} °C` : "? °C"}`}
                </span>
              </button>
            )}
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`btn btn-warning nav-link super-center ${pathname === link.href ? "active" : ""}`}
                style={{ marginLeft: 5, marginBottom: 3, height: 34 }}
                onClick={() => setExpanded(false)}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
