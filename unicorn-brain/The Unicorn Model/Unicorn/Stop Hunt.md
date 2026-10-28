# Stop Hunt

⬆ [[Unicorn]]

See also: [[What is a Breaker Block]] · [[Manipulation]]

Since the [[What is a Breaker Block|Breaker Block]] depends on liquidity being taken, the stop hunt is our primary variable to evaluate before looking at potential breakers.

Recall the definition of a breaker: *"The highest up-closed candle, or lowest down-closed candle, before taking liquidity."* Let's focus on the second part of that definition — "...before taking liquidity."

Before searching for potential Breaker Blocks, we need to identify which price leg liquidity is being taken from. This lets us pinpoint the candles that form the breaker. Sometimes a market structure has different highs and lows, and we need to pay attention to which high/low price is taking liquidity from.

![[Stop Hunt Scenarios.png]]

**Scenario 1** — liquidity is taken exclusively from one specific price leg. We should concentrate solely on the candles from that price leg for our breaker analysis.

**Scenario 2** — liquidity is being taken from both price legs. In this case, we should focus on the more significant price leg for our breaker block.

## Notes
