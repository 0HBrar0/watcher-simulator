const IP_COOLDOWN_S = 60;
const IP_DAILY = 5;
const GLOBAL_COOLDOWN_S = 10;
const GLOBAL_DAILY = 30;
const DAY_S = 86400;

interface Visitor {
  lastAt: number;
  count: number;
}

const utcDay = (ms: number) => Math.floor(ms / 1000 / DAY_S);
const toNextDay = (ms: number) => Math.ceil((utcDay(ms) + 1) * DAY_S - ms / 1000);

/**
 * Held in memory only, for one running instance, so a restart resets it. Visitors are added only
 * when accepted, and the global daily limit caps those at 30, so the map can't be grown by abuse.
 */
export function createLimits() {
  let day = -1;
  let globalCount = 0;
  let globalLastAt = -Infinity;
  let visitors = new Map<string, Visitor>();

  return {
    /**
     * Counts the request as accepted unless it must wait. `solvable` means only this visitor's
     * limits stand in the way, so a passed human check can lift them. Global limits always hold.
     */
    take(ip: string, nowMs: number, passedCheck = false): { wait: number; solvable: boolean } {
      if (utcDay(nowMs) !== day) {
        day = utcDay(nowMs);
        globalCount = 0;
        visitors = new Map();
      }
      const seen = visitors.get(ip);
      const visitorWait = Math.max(
        seen ? Math.ceil(IP_COOLDOWN_S - (nowMs - seen.lastAt) / 1000) : 0,
        seen && seen.count >= IP_DAILY ? toNextDay(nowMs) : 0,
      );
      const globalWait = Math.max(
        Math.ceil(GLOBAL_COOLDOWN_S - (nowMs - globalLastAt) / 1000),
        globalCount >= GLOBAL_DAILY ? toNextDay(nowMs) : 0,
      );
      const wait = Math.max(globalWait, passedCheck ? 0 : visitorWait);
      if (wait > 0) return { wait: Math.max(wait, visitorWait), solvable: globalWait <= 0 };
      visitors.set(ip, { lastAt: nowMs, count: (seen?.count ?? 0) + 1 });
      globalCount += 1;
      globalLastAt = nowMs;
      return { wait: 0, solvable: false };
    },
  };
}
