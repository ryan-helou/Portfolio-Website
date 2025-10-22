import { useEffect, useMemo, useState } from "react";
import HoldingsForm from "./components/HoldingsForm";
import HoldingsTable from "./components/HoldingsTable";
import MetricsBar from "./components/MetricsBar";
import StockChart from "./components/StockChart";
import { initialHoldings } from "./mock";
import { fetchQuote } from "./api/twelve";

const STORAGE_KEY = "portfolio-holdings";
const THEME_KEY = "theme";

function App() {
  const [holdings, setHoldings] = useState([]);
  const [prices, setPrices] = useState({});
  const [prevs, setPrevs] = useState({});
  const [selected, setSelected] = useState(null);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === "dark") {
      return true;
    }
    if (stored === "light") {
      return false;
    }
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
  });

  useEffect(() => {
    const storedValue = window.localStorage.getItem(STORAGE_KEY);
    if (storedValue) {
      try {
        const parsed = JSON.parse(storedValue);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setHoldings(parsed);
          setSelected(parsed[0].symbol);
          return;
        }
      } catch (error) {
        console.warn("Failed to parse stored holdings", error);
      }
    }
    setHoldings(initialHoldings);
    setSelected(initialHoldings[0]?.symbol ?? null);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("theme-dark");
    } else {
      root.classList.remove("theme-dark");
    }
    window.localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    let active = true;

    async function loadQuotes() {
      if (holdings.length === 0) {
        setPrices({});
        setPrevs({});
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
        return;
      }

      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings));

      const results = await Promise.all(
        holdings.map(async ({ symbol }) => {
          const quote = await fetchQuote(symbol);
          return { symbol, quote };
        })
      );

      if (!active) {
        return;
      }

      const nextPrices = {};
      const nextPrevs = {};

      for (const { symbol, quote } of results) {
        nextPrices[symbol] = quote.price ?? 0;
        nextPrevs[symbol] = quote.previous_close ?? 0;
      }

      setPrices(nextPrices);
      setPrevs(nextPrevs);
    }

    loadQuotes();
    return () => {
      active = false;
    };
  }, [holdings]);

  useEffect(() => {
    if (holdings.length === 0) {
      setSelected(null);
      return;
    }

    const hasSelected = holdings.some((item) => item.symbol === selected);
    if (!hasSelected) {
      setSelected(holdings[0].symbol);
    }
  }, [holdings, selected]);

  const portfolioValue = useMemo(() => {
    return holdings.reduce((sum, { symbol, shares }) => {
      const price = prices[symbol] ?? 0;
      return sum + shares * price;
    }, 0);
  }, [holdings, prices]);

  const todayChange = useMemo(() => {
    return holdings.reduce((sum, { symbol, shares }) => {
      const price = prices[symbol] ?? 0;
      const prev = prevs[symbol] ?? 0;
      return sum + shares * (price - prev);
    }, 0);
  }, [holdings, prices, prevs]);

  function handleAddHolding({ symbol, shares }) {
    setHoldings((current) => {
      const existing = current.find((item) => item.symbol === symbol);
      if (existing) {
        return current.map((item) =>
          item.symbol === symbol
            ? { ...item, shares: item.shares + shares }
            : item
        );
      }
      return [...current, { symbol, shares }];
    });
  }

  function handleRemoveHolding(symbol) {
    setHoldings((current) => current.filter((item) => item.symbol !== symbol));
  }

  function handleToggleTheme() {
    setIsDark((prev) => !prev);
  }

  return (
    <div className="container">
      <header className="card top-bar">
        <h1 className="top-bar__title">My Portfolio</h1>
        <button
          type="button"
          className="btn btn--ghost btn--icon theme-toggle"
          onClick={handleToggleTheme}
          aria-label="Toggle theme"
        >
          <span aria-hidden="true">{isDark ? "☀️" : "🌙"}</span>
        </button>
      </header>

      <section className="card fade-in" aria-label="Portfolio metrics">
        <MetricsBar value={portfolioValue} change={todayChange} />
      </section>

      <section className="card fade-in" aria-label="Add holding">
        <h2>Add Holding</h2>
        <HoldingsForm onAdd={handleAddHolding} />
      </section>

      <section className="card fade-in" aria-label="Holdings table">
        <h2>Holdings</h2>
        <HoldingsTable
          holdings={holdings}
          prices={prices}
          onRemove={handleRemoveHolding}
          onSelect={setSelected}
          selectedSymbol={selected}
        />
      </section>

      <section className="card fade-in" aria-label="Performance chart">
        <h2>Performance</h2>
        <StockChart symbol={selected} />
      </section>
    </div>
  );
}

export default App;
