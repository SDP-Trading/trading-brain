---
type: checklist
tags:
  - checklist
  - unicorn-model
  - execution
created: "2026-10-02"
summary: Pre-trade go/no-go checklist for the Unicorn Model, built from the mandatory and optional model variables, execution, stop-loss and take-profit rules.
---

# Pre-Trade Checklist

⬆ [[The Unicorn Model]]

Same checklist, same rules, same target. Every trade, win or lose. If a **mandatory** box is unticked, there's no trade. Some days that means no trade at all, and that still counts as consistency.

---

## 0. Before the session

- [ ] Checked the economic calendar for red-folder news (FOMC, CPI, NFP, etc.). See [[News Drivers]]
- [ ] If there's high-impact news today: **no entries before the release.** Wait for it to print
- [ ] HTF POIs marked: HTF Fair Value Gaps and HTF swing highs/lows. See [[High Timeframe Context]]
- [ ] Draws on liquidity marked: Smooth Edges, EQH/EQL, Asia range high/low. See [[Smooth Edges and EQH-EQL]]

---

## 1. Time (MANDATORY). See [[Time]]

- [ ] Price is inside a focus session window ([[Session Open Times]]):
  - London **02:00 – 05:00**
  - NY AM **09:30 – 12:00**
  - NY PM **13:30 – 16:00**
  - *(Asia 20:00 – 00:00 is not a focus session because it tends to range)*
- [ ] *Bonus:* setup forms inside a [[Macro Times|macro window]]:
  - London 2:33–3:00 · 4:03–4:30
  - NY AM 8:50–9:10 · 9:50–10:10 · 10:50–11:10
  - NY PM 12:10–13:40 · 15:15–15:45

## 2. Manipulation (MANDATORY). See [[Manipulation]]

- [ ] Liquidity has been **taken** in, around or after the session open. Manipulating into an FVG alone doesn't count. See [[Manipulation at Open Times]]
- [ ] I can name the exact high/low that was swept
- [ ] *Bonus:* the sweep took [[Engineered Liquidity]] (equal highs/lows built before the open or news)

## 3. Unicorn entry function (MANDATORY). See [[Unicorn]]

- [ ] **Stop hunt identified.** I know which price leg the liquidity came from. If both legs were swept, I'm using the more significant one. See [[Stop Hunt]]
- [ ] **Breaker marked correctly** on that leg ([[What is a Breaker Block]]):
  - Bullish: highest up-closed candle (or consecutive up-closed candles) before the move that took liquidity
  - Bearish: lowest down-closed candle (or consecutive down-closed candles) before the move that took liquidity
- [ ] **Displacement.** Price moved through the breaker aggressively with little resistance and didn't grind. See [[Displacement]]
  - *Mechanical mode: Scenario 1 (clean displacement) only. Skip Scenario 2.*
- [ ] **FVG aligned with the breaker.** Without one, it's just a breaker and not a Unicorn. See [[Breaker Block and FVG Aligned]]
- [ ] If there are several FVGs, I chose the one with the most confluence (e.g. in discount + order block support). See [[Which FVG to Choose]]

> **STOP HERE if any box in sections 1–3 is unticked.**

---

## 4. Optional variables (quality boosters). See [[Model Variables]]

- [ ] **HTF POI revisited:** price swept a HTF swing high/low or tapped a HTF FVG. See [[High Timeframe Context]]
- [ ] **Correct LTF for that POI** ([[HTF to LTF Timeframe Alignment]]):
  Monthly→Daily · Weekly→4H · Daily→1H · 4H→15m · 1H→5m · 15m→1m
- [ ] **Draw on liquidity in my direction:** trade points toward Smooth Edges / EQH-EQL. See [[Smooth Edges and EQH-EQL]]

**Optional variables present: ___ / 3**. More boosters mean a higher-quality setup.

---

## 5. Execution. See [[Where to Enter]]

- [ ] There's a candle **close** above the breaker (longs) or below it (shorts) after the displacement
- [ ] Order type chosen:
  - Limit: waiting for the breaker retest *(default while still building experience)*
  - Market: entering as close to the breaker as possible
- [ ] Entry level chosen for this structure: touch of the aligned FVG **or** touch of the breaker. See [[FVG Touch vs Breaker Touch Entry]]

## 6. Risk. See [[Stop Loss Placement]] · [[Take Profit]]

- [ ] **Stop loss:**
  - Default: beneath the breaker (longs) or above it (shorts). The breaker failing invalidates the trade
  - Wick room: beyond the low/high that swept liquidity
- [ ] **Take profit is fixed at 2R**
- [ ] Extending beyond 2R only if there's a clear Smooth Edges / EQH-EQL target
- [ ] Position size calculated from the stop distance

---

## 7. Final call

- [ ] All mandatory boxes (sections 1–3) ticked
- [ ] I'm following the plan, not chasing a win

**GO / NO TRADE**

---

*Not yet included because the source notes are still empty: [[Daily Bias]], [[Good vs Bad SMT]], [[SMT and Position Sizing]], [[Trade Management]]. Add them here once they're written.*
