# alpha-chart

A TradingView-style trading chart for React, built on
[lightweight-charts](https://github.com/tradingview/lightweight-charts) v5:

- candles, hollow candles, bars, Heikin Ashi, line, area and baseline styles
- 14 drawing tools (trend lines, rays, channels, Fibonacci, measure, text, …) with magnet, undo/redo, lock/hide
- indicator panes, a legend with values under the crosshair, a settings dialog (inputs, style, visibility per interval), drag to reorder
- an indicator picker with categories and favorites, indicator templates
- range presets, go to date, typed intervals, log/percent scales, time zones, countdown to bar close
- an autosaved layout and per-symbol drawings

The chart fetches nothing by itself. The host application supplies three things:

| Interface | What it does | Built in |
|---|---|---|
| `Datafeed` | bars: a first page, older pages while scrolling left, live updates | — |
| `ChartStorage` | the layout, drawings and indicator templates | `localChartStorage()` (default) |
| `IndicatorEngine` | the studies in the picker and their computation (usually a Web Worker) | — (the example has a small one) |

It comes from AlphaForge, a trading terminal for Bittensor subnet alpha markets, where the
same chart runs with a market API datafeed, server-side storage and a scripting-language engine.

## Try the example

```bash
npm ci
npm run dev        # http://localhost:5173
```

The example charts live market data from Binance's public API (TAO/USDT, BTC/USDT, ETH/USDT; no key
needed): history pages in as you scroll back and the last bar updates over a WebSocket. A random walk is
available offline from the source switch. `example/binance.ts` is a complete `Datafeed` for a real
exchange in about 60 lines; market data © Binance.

## Use it

alpha-chart ships as TypeScript source. Add it as a git submodule (or a dependency pointing at this
repo) and let your bundler compile it; `react`, `react-dom` and `lightweight-charts` are peer
dependencies.

```tsx
import { AlphaChart, type Datafeed } from "alpha-chart";
import "alpha-chart/styles.css";

const datafeed: Datafeed = {
  getBars: async (symbol, interval, { limit, end }) => fetchBars(symbol, interval, limit, end),   // oldest first
  subscribeBars: (symbol, interval, onBars) => socket.onBars(symbol, interval, onBars),           // returns unsubscribe
};

export function Terminal() {
  const [interval, setInterval] = useState("15");
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <AlphaChart datafeed={datafeed} symbol="BTCUSD" interval={interval} onInterval={setInterval} />
    </div>
  );
}
```

The component renders a toolbar, the chart (drawing toolbar + canvas) and a bottom bar as siblings, so
put it in a flex column with a height. Create the datafeed, engine and storage once (module level or
`useMemo`): a new object reloads the chart.

### Bars and intervals

```ts
interface Bar { time: number /* open time, epoch ms */; open: number; high: number; low: number; close: number;
                volume?: number; closed?: boolean; final?: boolean }
```

Intervals are TradingView resolution names: `"1" "5" "15" "30" "60" "120" "240" "D" "W"`. Bars may
carry extra fields; the chart passes them to the indicator engine unchanged.

### Indicator engine

```ts
interface IndicatorEngine {
  categories: string[];
  entries(): StudyEntry[];                       // what the picker lists
  entry(id: string): StudyEntry | undefined;
  connect(onMessage: (m: EngineOut) => void): { post(m: EngineIn): void; close(): void };
  // optional: accepts / resolve (studies loaded later, e.g. user scripts), extra (a picker category loaded on open)
}
```

The chart posts `data` (all bars of `"<symbol>:<interval>"`), `bar` (the newest bar changed),
`set` (an instance's study and inputs) and `remove`. The engine answers `meta` (input definitions,
title, format), `frame` (plots, bands, horizontal levels, shapes, background colours; `full: false`
for a tail update) or `error`. `example/demo.ts` is a complete engine in about 60 lines.

### Props

| Prop | |
|---|---|
| `datafeed`, `symbol`, `interval` | required |
| `onInterval`, `intervals` | interval changes the chart asks for (typed interval, range buttons, layout), and the allowed ones |
| `engine`, `storage` | see above; without an engine the Indicators button is hidden |
| `overlay` | host output drawn over the chart, e.g. a strategy's plots and trade markers |
| `legendRows`, `toolbar`, `actions` | your own content in the legend and the toolbar |
| `onAddStrategy`, `pickerRequest` | picker entries of kind `"strategy"`; open the picker from outside |
| `volumeUnit`, `barInfo`, `barInfoLabel`, `block` | volume unit, extra bar details in the status line, countdown in blocks (chains) |
| `ref` | `goTo(ms)`, `showRange("1M")` |

### Theming

`styles.css` defines colour tokens (`--bg`, `--panel`, `--raised`, `--border`, `--text`, `--muted`,
`--dim`, `--buy`, `--sell`, `--accent`, `--font`) on `:root`; redefine them after importing it.

## Development

```bash
npm run typecheck
npm test           # drawing geometry
npm run build      # type-check + bundle the example
```

## License

MIT. The chart is drawn by TradingView's lightweight-charts (Apache-2.0), which shows its attribution
logo by default; keep it unless you credit TradingView elsewhere as its license notice asks.
