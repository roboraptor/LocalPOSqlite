import { describe, it, expect } from "vitest";
import { generateSpaydString, buildPayliboUrl } from "@/lib/spayd";

describe("SPAYD Generator", () => {
  it("should generate basic SPAYD string with only IBAN", () => {
    const result = generateSpaydString({ iban: "CZ1234567890" });
    expect(result).toBe("SPD*1.0*ACC:CZ1234567890*PT:IP");
  });

  it("should remove spaces from IBAN", () => {
    const result = generateSpaydString({ iban: "CZ12 3456 7890" });
    expect(result).toBe("SPD*1.0*ACC:CZ1234567890*PT:IP");
  });

  it("should format amount correctly to 2 decimal places", () => {
    const result = generateSpaydString({ iban: "CZ1234567890", amount: 150 });
    expect(result).toContain("*AM:150.00");

    const result2 = generateSpaydString({ iban: "CZ1234567890", amount: "150.5" });
    expect(result2).toContain("*AM:150.50");
  });

  it("should include all optional parameters", () => {
    const result = generateSpaydString({
      iban: "CZ0000",
      amount: 500,
      currency: "CZK",
      vs: "1234567890",
      ks: "0308",
      ss: "9876",
      msg: "Test Platba",
    });

    expect(result).toBe(
      "SPD*1.0*ACC:CZ0000*PT:IP*AM:500.00*CC:CZK*X-VS:1234567890*X-KS:0308*X-SS:9876*MSG:Test Platba",
    );
  });

  it("should return empty string if no IBAN is provided", () => {
    const result = generateSpaydString({ iban: "" });
    expect(result).toBe("");
  });
});

describe("buildPayliboUrl", () => {
  it("returns null for missing or too-short IBAN", () => {
    expect(buildPayliboUrl("image", { iban: "" })).toBeNull();
    expect(buildPayliboUrl("image", { iban: "CZ1234" })).toBeNull();
  });

  it("builds Czech /czech/image URL with decoded prefix/account/bankCode, ks, vs, size and branding", () => {
    const url = buildPayliboUrl("image", {
      iban: "cz65 0800 0000 1920 0014 5399",
      amount: 150,
      currency: "czk",
      vs: "1234567890",
      ks: "0308",
      msg: "Platba",
      size: 256,
      branding: true,
    });
    expect(url).toBe(
      "http://api.paylibo.com/paylibo/generator/czech/image?accountPrefix=19&accountNumber=2000145399&bankCode=0800&amount=150.00&currency=CZK&vs=1234567890&ks=0308&message=Platba&size=256&branding=true",
    );
  });

  it("builds Czech /czech/string URL without image-only params or empty prefix", () => {
    const url = buildPayliboUrl("string", {
      iban: "CZ6508000000002000145399",
      amount: 250,
      currency: "CZK",
      vs: "1234567890",
      ks: "0308",
      size: 128,
      branding: true,
    });
    expect(url).toBe(
      "http://api.paylibo.com/paylibo/generator/czech/string?accountNumber=2000145399&bankCode=0800&amount=250.00&currency=CZK&vs=1234567890&ks=0308",
    );
  });

  it("uses generic iban endpoint for non-Czech IBANs", () => {
    const url = buildPayliboUrl("image", {
      iban: "SK3112000000198742637541",
      amount: 100,
      currency: "EUR",
      size: 128,
      branding: true,
    });
    expect(url).toBe(
      "http://api.paylibo.com/paylibo/generator/image?iban=SK3112000000198742637541&amount=100.00&currency=EUR&size=128&branding=true",
    );
  });
});
