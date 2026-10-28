---
tags:
  - audit
  - unicorn-model
  - model-health
created: "2026-10-02"
summary: "Health audit of the Unicorn Model vault: what's solid, internal contradictions, empty pillars, and prioritised fixes."
---

# Model Health Audit - 2026-10-02

⬆ [[The Unicorn Model]]

Scope: [[The Unicorn Model]], the five pillar notes, [[Pre-Trade Checklist]], and the core execution notes ([[Time]], [[Session Open Times]], [[Macro Times]], [[News Drivers]], [[Manipulation]], [[Stop Hunt]], [[Displacement]], [[Where to Enter]], [[FVG Touch vs Breaker Touch Entry]], [[Stop Loss Placement]], [[FVG Stop Loss Methods]], [[Take Profit]], [[Trade Examples]], [[Example 1 - Jul 1 2024 NQ]]) plus the HTF and SMT subnotes.

## Overall verdict

**Core entry model: healthy.** Time → Manipulation → Stop Hunt → Breaker → Displacement → FVG is clearly defined, well linked, and the [[Pre-Trade Checklist]] turns it into a usable go/no-go.

**Model as a whole: incomplete.** Two of five pillars ([[HTF Context]] partly, [[SMT]] almost entirely) are placeholders, and several rules are still discretionary, which matters a lot if the model is going to be automated or backtested.

## 1. Contradictions and ambiguities

1. **Macro times vs. mandatory session windows.** [[Pre-Trade Checklist]] requires price to be inside a session window (NY AM 09:30–12:00, NY PM 13:30–16:00), but [[Macro Times]] lists NY AM 8:50–9:10 and NY PM 12:10–13:40, which sit mostly *outside* those windows. As written, a setup in the 8:50 macro is both a "bonus" and a mandatory fail. Decide whether macros extend the windows or only count when they overlap.
2. **News drivers aren't a valid time window in the checklist.** [[Time]] says significant breakers form at "session opening times and news drivers", but the checklist only accepts session windows. A post-8:30 CPI setup is ambiguous.
3. **No timezone anywhere.** [[Session Open Times]] and [[Macro Times]] give bare clock times (presumably New York time). For anyone trading from Europe, DST shifts between US and EU (late March / late Oct–early Nov) move these by an hour. State "NY time" explicitly.
4. **Displacement: mandatory or not?** [[Model Variables]] lists displacement as part of the mandatory entry function; [[Displacement]] says Scenario 2 (weak displacement) trades are allowed at your discretion. The checklist resolves it only for "mechanical mode". Define what discretionary mode means, or drop it.
5. **Two stop-loss frameworks.** [[Stop Loss Placement]] (breaker vs. sweep high/low) and [[FVG Stop Loss Methods]] (FVG end / OB / swing) aren't reconciled. Say which applies to a Unicorn trade and when.
6. **Entry level left to "adaptive" judgment.** [[FVG Touch vs Breaker Touch Entry]] says pick whichever "fits the current market structure" with no criteria. Since entry level, stop and 2R target are linked, this choice changes R:R and fill rate. It needs a rule (e.g. default to breaker touch unless X).
7. **2R target + optional extension.** [[Take Profit]] fixes 2R but allows going further to Smooth Edges with no rule for partials, moving stop, or what happens if 2R is hit first.

## 2. Empty or stub notes

Pillar-level gaps (referenced by the checklist or course but no content):
- [[Daily Bias]]: empty. A daily bias filter is usually one of the highest-impact filters; currently the model has none.
- [[Intraday Profiles]]: one line.
- [[Good vs Bad SMT]]: empty.
- [[SMT and Position Sizing]]: one line, and position sizing has no other home in the vault.
- [[Which Assets]]: one line. The examples span NQ, ES and CL, but the vault never states which instruments the model is for.
- [[Trade Management]]: contains only "ES takes high, NQ doesn't" (an SMT example), not trade management. Either misfiled or not started.

## 3. Missing pieces for a complete model

- **No risk rules:** risk per trade, daily max loss, max trades per day/session, what to do after a loss or a 2R win.
- **No invalidation / cancellation rules:** e.g. cancel the limit if price reaches 1R or the target without filling, or if the session window closes.
- **No trade management:** break-even rules, partials, early exit if the breaker closes through.
- **No performance evidence:** the 8 [[Trade Examples]] show setups but not entry, stop, target, or outcome in R. They're illustrations, not a sample. There's no journal or stats note to back up "2R is the sweet spot".

## 4. Hygiene

- [[Take Profit]] embeds `Take Profit Smooth Edges.png`, but a note with that name sits in `_to_delete`. Check the image isn't removed.
- [[Model Variables]] links displacement as `[[How to Qualify Good Breakers|Displacement]]` instead of [[Displacement]].
- Most notes have empty `## Notes` sections; fine, but nothing records lessons learned from live trading.
- [[Pre-Trade Checklist]] has no backlinks; link it from [[The Unicorn Model]] so it's part of the main map.

## 5. Priorities

1. Fix the time-window contradictions and add timezone (affects every trade).
2. Write a rule for entry level and stop choice so a setup has one defined entry/SL/TP.
3. Write [[Daily Bias]] and a risk/trade-management note; add them to the checklist.
4. Add outcomes (R) to the 8 examples and start a results log.
5. Fill [[SMT]] subnotes or mark SMT as out of scope for now.
