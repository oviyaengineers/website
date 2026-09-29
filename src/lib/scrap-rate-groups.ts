export function scrapRateGroupKey(materialName: string): string {
  const key = materialName.trim().toLowerCase();
  return key === "a105" || key === "wcb" ? "a105-wcb" : key;
}

/** Resolve one current rate across every material that shares its rate group. */
export function sharedScrapRates(
  materials: { id: string; name: string }[],
  rates: { material_id: string; rate_per_kg: number; updated_at: string }[]
) {
  const names = new Map(materials.map((material) => [material.id, material.name]));
  const groupRates = new Map<string, { value: number; updatedAt: string }>();

  for (const row of rates) {
    const name = names.get(row.material_id);
    if (!name) continue;
    const group = scrapRateGroupKey(name);
    const previous = groupRates.get(group);
    if (!previous || row.updated_at > previous.updatedAt) {
      groupRates.set(group, { value: Number(row.rate_per_kg), updatedAt: row.updated_at });
    }
  }

  const byMaterialId = new Map<string, number>();
  const byName = new Map<string, number>();
  for (const material of materials) {
    const value = groupRates.get(scrapRateGroupKey(material.name))?.value;
    if (value === undefined) continue;
    byMaterialId.set(material.id, value);
    byName.set(material.name.trim().toLowerCase(), Math.round(value * 100));
  }
  return { byMaterialId, byName };
}
