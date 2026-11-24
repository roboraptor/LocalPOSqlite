import { describe, it, expect } from "vitest";
import { parseItemsImportJson } from "@/lib/importItems";

describe("parseItemsImportJson", () => {
  it("parses valid exported items array and applies defaults", () => {
    const result = parseItemsImportJson([
      { id: 1, name: " Kofola ", price: 40, category: "Nápoje", position: 4, icon: "FaBeerMugEmpty" },
      { name: "Dort", price: 0 },
    ]);

    expect(result.errors).toEqual([]);
    expect(result.items).toEqual([
      { name: "Kofola", price: 40, category: "Nápoje", position: 4, icon: "FaBeerMugEmpty" },
      { name: "Dort", price: 0, category: "Ostatní", position: 0, icon: null },
    ]);
  });

  it("rejects non-array or empty inputs", () => {
    expect(parseItemsImportJson({ name: "Kofola" }).errors.length).toBeGreaterThan(0);
    expect(parseItemsImportJson([]).errors.length).toBeGreaterThan(0);
  });

  it("reports invalid item name or negative price", () => {
    const res = parseItemsImportJson([
      { name: "", price: 20 },
      { name: "Pivo", price: -5 },
    ]);

    expect(res.items).toEqual([]);
    expect(res.errors).toHaveLength(2);
  });
});
