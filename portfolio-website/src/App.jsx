import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import HoldingsForm from "./components/HoldingsForm";
import HoldingsTable from "./components/HoldingsTable";
import MetricsBar from "./components/MetricsBar";
import StockChart from "./components/StockChart";
import { initialHoldings } from "./mock";
import { fetchQuote, useMock } from "./api/twelve";

const STORAGE_KEY = "portfolio-holdings";
const THEME_KEY = "theme";
const MOCK_NOTICE = "Twelve Data API key not set — using mock data.";
const CONNECTION_NOTICE = "Quotes may be stale — check your connection.";
const REFRESH_COOLDOWN = 1500;

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function App() {
  const usingMock = useMock();
  const [holdings, setHoldings] = useState([]);
  const [prices, setPrices] = useState({});
  const [prevs, setPrevs] = useState({});
  const [selected, setSelected] = useState(null);
  const [notice, setNotice] = useState(() => (usingMock ? MOCK_NOTICE : ""));
  const [toast, setToast] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(false);
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

  const refreshCooldownRef = useRef(0);
  const toastTimerRef = useRef(null);
  const pricesRef = useRef(prices);
  const prevsRef = useRef(prevs);

  useEffect(() => {
    pricesRef.current = prices;
  }, [prices]);

  useEffect(() => {
    prevsRef.current = prevs;
  }, [prevs]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, []);

  const showToast = useCallback(
    (message) => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }

      if (!message) {
        setToast("");
        return;
      }

      setToast(message);
      if (typeof window !== "undefined") {
        toastTimerRef.current = window.setTimeout(() => {
          setToast("");
          toastTimerRef.current = null;
        }, 4000);
      }
    },
    [setToast]
  );

  useEffect(() => {
    const storedValue =
      typeof window !== "undefined"
        ? window.localStorage.getItem(STORAGE_KEY)
        : null;

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

    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
      } catch (error) {
        console.warn("Failed to persist theme preference", error);
      }
    }
  }, [isDark]);

  useEffect(() => {
    let cancelled = false;

    async function syncQuotes() {
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(holdings)
          );
        } catch (error) {
          console.warn("Failed to persist holdings", error);
        }
      }

      if (holdings.length === 0) {
        if (!cancelled) {
          setPrices({});
          setPrevs({});
          setIsLoadingQuotes(false);
          if (!usingMock) {
            setNotice("");
          }
        }
        return;
      }

      if (!cancelled) {
        setIsLoadingQuotes(true);
      }

      const symbols = Array.from(
        new Set(
          holdings
            .map((item) => item.symbol)
            .filter((symbol) => typeof symbol === "string" && symbol)
        )
      );

      const nextPrices = {};
      const nextPrevs = {};
      let hadError = false;

      for (const symbol of symbols) {
        try {
          const quote = await fetchQuote(symbol);
          nextPrices[symbol] = safeNumber(quote?.price);
          nextPrevs[symbol] = safeNumber(quote?.previous_close);
        } catch (error) {
          console.warn(`Failed to load quote for ${symbol}`, error);
          hadError = true;
          const fallbackPrice = pricesRef.current[symbol];
          const fallbackPrev = prevsRef.current[symbol];
          nextPrices[symbol] =
            typeof fallbackPrice === "number" ? fallbackPrice : 0;
          nextPrevs[symbol] =
            typeof fallbackPrev === "number" ? fallbackPrev : 0;
        }
      }

      if (!cancelled) {
        setPrices(nextPrices);
        setPrevs(nextPrevs);
        if (!usingMock) {
          setNotice(hadError ? CONNECTION_NOTICE : "");
        }
        if (hadError) {
          showToast(CONNECTION_NOTICE);
        }
        setIsLoadingQuotes(false);
      }
    }

    syncQuotes().catch((error) => {
      if (cancelled) {
        return;
      }
      console.error("Unexpected error while loading quotes", error);
      if (!usingMock) {
        setNotice(CONNECTION_NOTICE);
      }
      showToast(CONNECTION_NOTICE);
      setIsLoadingQuotes(false);
    });

    return () => {
      cancelled = true;
    };
  }, [holdings, refreshTick, showToast, usingMock]);

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

  function handleRefresh() {
    const now = Date.now();
    if (now - refreshCooldownRef.current < REFRESH_COOLDOWN) {
      return;
    }
    refreshCooldownRef.current = now;
    setRefreshTick((tick) => tick + 1);
  }

  const themeLabel = isDark ? "Light" : "Dark";

  return (
    <>
      <div className="container">
        {notice ? (
          <div className="banner" role="status" aria-live="polite">
            {notice}
          </div>
        ) : null}

        <header className="card top-bar">
          <h1 className="top-bar__title">My Portfolio</h1>
          <button
            type="button"
            className="btn btn--ghost btn--icon theme-toggle"
            onClick={handleToggleTheme}
            aria-label="Toggle theme"
          >
            <span aria-hidden="true">{themeLabel}</span>
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
          <div className="card-header">
            <h2>Holdings</h2>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={handleRefresh}
              disabled={isLoadingQuotes}
              aria-label="Refresh quotes"
            >
              {isLoadingQuotes ? "Refreshing..." : "Refresh"}
            </button>
          </div>
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

      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
    </>
  );
}

export default App;
