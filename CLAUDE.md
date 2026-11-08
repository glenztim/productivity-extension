# Focused Time

Firefox-first browser extension (WXT + React + TypeScript). Time on productive
sites earns time on distracting ones (the "time pool"). It also has hard blocks,
per-site tab limits, a dashboard of daily progress, and, as the long-term goal,
streaks, XP, goals and projects.

Working name history: formerly "Focus Pool". Storage keys and internal names keep
the old naming where they never mentioned it; do not rename them.

## Hard rules

- **Firefox first.** Use the `browser` namespace (via WXT), no Chrome-only APIs.
  Say where Firefox behaves differently. The background is an event page that can
  be suspended: keep no important state only in memory.
- **Privacy.** Never store, log, or put into URLs: visited URLs or hostnames.
  The only exception is list entries the user typed in themselves. Events and
  stats are numbers and category totals only. Everything stays in local storage.
- **Progress only goes up.** No negative scores, no XP loss, no level resets, no
  penalties. Bad time is plain information and never subtracts. Streaks forgive
  (freezes, "5 of 7" style rules).
- **Every feature is optional** and can be switched off in Settings.

## Architecture (verify against the code and correct this file if it has drifted)

- Storage items are declared in `lib/storage.ts` (WXT `storage`, local area).
  Daily category totals: `hourlyStats` (source of truth, hour buckets by local
  time), `dailyStats` (legacy, read-only fallback). Per-day counters:
  `dayEvents`. Also: settings, lists, pool balance, mode, checkpoint,
  `schemaVersion`.
- **Every change to a stored shape needs a migration** in the migration runner
  (it runs under the lock at background start). Bump `schemaVersion`.
- All writes happen in the background and go through the shared mutex
  (`lib/mutex.ts`). Never read-modify-write storage outside it. Use the `...Locked`
  variants when already holding the lock, or you will deadlock.
- Time accounting: `lib/accounting.ts` (`flush`, `recomputeCurrentActivity`,
  heartbeat alarm). Intervals are split at local hour and day boundaries
  (`lib/dateUtils.ts`). Gaps over the threshold are dropped, not credited.
- Events: `recordEvent(dateKey, name, amount)` in `lib/dayEvents.ts`. Names are a
  typed union, values are numbers only. `goalReached` fires once per day.
- Popup, options, dashboard and content scripts never write storage directly.
  They send typed messages (`lib/messages.ts`) that the background validates and
  handles (`lib/messageHandler.ts`). Content scripts may send only the allowed
  message types.
- Reads go through selectors in `lib/dayStats.ts` (`getDayTotals`, `getDayHours`,
  `getDayEvents`) and `lib/score.ts` (goal progress and levels).
- Tab limits: `lib/tabLimits.ts`. Alarms are re-created at background start.
- Mock data is dev-only (`WXT_MOCK_DATA=true` in `.env.local`) and must never
  appear in production builds.

## Roadmap (source of truth is the roadmap doc; keep this list in sync)

- [x] Step 0: per-day event counters, `goalReached`, selectors, tests
- [x] Tab limit: per hostname, `www.` stripped, newest tab closes, pinned exempt,
      startup grace period, notification, `tabsAutoClosed`
- [x] Message layer, schema version, mock flag, Firefox packaging
- [ ] Step 1: friction checks. After 15 min of active time on one blocklist
      domain, a soft-lock overlay appears on the page. Challenge ladder: hold a
      button, math, short text, long text. Needs a content script and host
      access (decision pending: `<all_urls>` was removed in commit 88db102)
- [ ] Gamification: streaks, XP and levels, achievements, goals, projects,
      checklists, weekly review (plans and open questions are in the roadmap doc)

## Working rules

- Audit first for anything non-trivial: report the current state, give a short
  plan, then wait for my go-ahead before changing code.
- Small commits with clear messages. Keep `tsc` and all tests green. Run
  `wxt build -b firefox` before calling something done.
- Do not create git worktrees. Never touch `node_modules` or run `npm ci` without
  asking. No new dependencies without asking. Do not delete or move files that
  are not part of the task.
- Add tests for new logic, especially time boundaries (midnight, DST).
- Always list what you could not verify in a real Firefox (event ordering,
  alarms, permissions, notifications, session restore).
- I am learning this stack: explain non-obvious decisions in a sentence or two
  instead of only showing the diff.
