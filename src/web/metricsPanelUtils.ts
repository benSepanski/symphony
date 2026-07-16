export function successPctColorClass(successPct: number): string {
  if (successPct >= 90) return "text-emerald-300";
  if (successPct >= 70) return "text-amber-300";
  return "text-rose-300";
}
