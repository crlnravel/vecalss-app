const WIB_OFFSET = 7 * 60 * 60 * 1000;

export function startOfWibDay(now: Date): Date {
  const local = new Date(now.getTime() + WIB_OFFSET);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - WIB_OFFSET);
}

export function startOfWibMonth(now: Date): Date {
  const local = new Date(now.getTime() + WIB_OFFSET);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - WIB_OFFSET);
}

export function startOfNextWibMonth(now: Date): Date {
  const local = new Date(now.getTime() + WIB_OFFSET);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) - WIB_OFFSET);
}
