export function parseAmountToCents(val: any): number {
  if (val === undefined || val === null) return 0;
  let parsed = 0;
  if (typeof val === 'number') {
    parsed = val;
  } else if (typeof val === 'string') {
    let cleaned = val.trim().replace(/,/g, '.');
    parsed = Number(cleaned);
  }
  
  if (isNaN(parsed) || !isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  
  return Math.round(parsed * 100);
}
