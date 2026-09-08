import type { RayonMenu } from "@/lib/taxonomy";

const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase().trim();

/** Keep the complete path to a match, and all children of a matching parent. */
export function filterCategoryDirectory(rows: RayonMenu[], query: string): RayonMenu[] {
  const term = normalize(query);
  if (!term) return rows;
  return rows.flatMap((row) => {
    if (normalize(row.label).includes(term)) return [row];
    const children = filterCategoryDirectory(row.enfants, query);
    return children.length ? [{ ...row, enfants: children }] : [];
  });
}
