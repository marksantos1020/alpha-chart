# alpha-chart

A TradingView-style trading chart for React, built on
[lightweight-charts](https://github.com/tradingview/lightweight-charts) v5:

- 12 chart types in a TradingView-style menu: bars, candles, hollow candles, line, line with markers, step line,
  area, HLC area, baseline, columns, high-low, Heikin Ashi
- a TradingView-style drawing toolbar with 57 tools in grouped menus: lines, channels, pitchforks, Fibonacci and Gann,
  chart patterns and Elliott waves, cycles, long/short positions, anchored VWAP, range measurers, shapes, brushes,
  text notes and icons; cursors (cross, dot, arrow, eraser), magnet modes, favorites with a floating bar,
  undo/redo, lock, hide and remove menus
- TradingView-style price axis: filled labels at the latest bar, outlined values of the last visible bar in history, countdown inside the price label
- indicator panes you can merge and split, pinning to the left, right or no price scale, a legend with values under the crosshair,
  a settings dialog (inputs, style, visibility per interval), drag to reorder, and one indicator as another's source
  (engines that set `indicatorSources`)
- indicator frames can shift plots by bars (Ichimoku, Alligator), colour each bar from a palette, draw candles,
  recolour the chart's bars, and carry lines, labels and boxes
- an indicator picker with categories and favorites, indicator templates
- range presets, go to date, typed intervals, log/percent scales, time zones, countdown to bar close
- an autosaved layout and per-symbol drawings
- dark and light themes, or follow the system setting

The chart fetches nothing by itself. The host application supplies three things:

| Interface | What it does | Built in |
|---|---|---|
| `Datafeed` | bars: a first page, older pages while scrolling left, live updates | — |
| `ChartStorage` | the layout, drawings and indicator templates | `localChartStorage()` (default) |
| `IndicatorEngine` | the studies in the picker and their computation | `basicEngine`: 26 standard indicators |

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

### Price precision

Chart settings › Symbol › Precision chooses the decimals of the axis, the price labels and the legend.
"Default" uses `datafeed.pricePrecision(symbol)` when the datafeed provides it (a number of decimals,
or a promise of one, e.g. from the exchange's tick size) and otherwise picks the decimals from the
price itself, which suits very small prices such as 0.0019712. The example's Binance datafeed reads
the tick size, so TAOUSDT shows `271.9` and BTCUSDT `82375.56`.

### Built-in indicators

`basicEngine` gives the picker 26 common indicators, computed with TradingView's formulas and default
inputs, colours and levels:

| Category | Indicators |
|---|---|
| Moving averages | SMA, EMA, WMA, Hull MA, VWMA |
| Bands & channels | Bollinger Bands, Keltner Channels, Donchian Channels, Envelope |
| Trend | VWAP (daily, UTC), Supertrend, Parabolic SAR, ADX |
| Oscillators | RSI, MACD, Stochastic, Stochastic RSI, CCI, Williams %R, Momentum, ROC, ATR |
| Volume | Volume with MA, OBV, Money Flow Index, Chaikin Money Flow |

```tsx
import { AlphaChart, basicEngine } from "alpha-chart";

<AlphaChart datafeed={datafeed} engine={basicEngine} symbol="TAOUSDT" interval="60" />
```

They run on the main thread; a live tick recomputes and sends only the last values to the chart.
`computeStudy(id, bars, params)` returns one indicator's output without a chart (tests, servers).

### Your own indicator engine

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
for a tail update) or `error`. `src/basic/engine.ts` is a complete engine to start from.

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
| `theme`, `onThemeChange` | `"dark"`, `"light"` or `"system"`; with `onThemeChange` Chart settings › Canvas offers the choice |
| `ref` | `goTo(ms)`, `showRange("1M")` |

### Themes

```tsx
import { AlphaChart, ThemeToggle, useThemeMode } from "alpha-chart";

function App() {
  const { mode, theme, setMode } = useThemeMode();
  return (
    <AlphaChart theme={mode} onThemeChange={setMode} actions={<ThemeToggle theme={theme} onChange={setMode} />} {...rest} />
  );
}
```

`useThemeMode()` keeps the choice in `localStorage` (`alpha.theme`), follows the operating system
in `"system"` mode and sets `data-theme` on `<html>`, so the rest of the page can use the same
colours. Without it, `theme` alone themes the chart and its dialogs. To avoid a dark flash on
load, set the attribute before the page renders:

```html
<script>
  try { var m = localStorage.getItem("alpha.theme"); if (m !== "dark" && m !== "light") m = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"; document.documentElement.setAttribute("data-theme", m); } catch (e) {}
</script>
```

Colours are CSS custom properties in `styles.css`: one set under `:root, [data-theme="dark"]`, one
under `[data-theme="light"]`. The canvas reads them too, so overriding a token after importing the
stylesheet restyles the whole chart:

| Token | Used for |
|---|---|
| `--bg`, `--panel`, `--raised`, `--border` | page, menus and dialogs, inputs and hover, lines |
| `--text`, `--muted`, `--dim` | text levels |
| `--buy`, `--sell`, `--accent`, `--blue`, `--link` | up/down values, focus and highlights, active tools, links |
| `--chart-text`, `--chart-grid`, `--chart-crosshair`, `--chart-crosshair-label` | axis labels, grid, crosshair |
| `--hover`, `--veil`, `--backdrop`, `--shadow` | legend hover, loading veil, dialog backdrop, shadows |
| `--gap` | the space between panels |

```css
[data-theme="light"] { --chart-grid: #eef1f6; --accent: #7e57c2; }
```

Candle colours are a chart setting (Chart settings › Symbol), not a theme token.

The toolbar, drawing toolbar, chart and bottom bar are separate panels on `--bg`. Put the chart in a
flex column with `gap: 4px` and `background: var(--gap)` to separate them like TradingView does:

```css
.chart-host { display: flex; flex-direction: column; gap: 4px; background: var(--gap); }
```

## Development

```bash
npm run typecheck
npm test           # drawing geometry, built-in indicators
npm run build      # type-check + bundle the example
```

## License

MIT. The chart is drawn by TradingView's lightweight-charts (Apache-2.0), which shows its attribution
logo by default; keep it unless you credit TradingView elsewhere as its license notice asks.
