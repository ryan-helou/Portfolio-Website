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
import { apiState, fetchQuote } from "./api/twelve";

const STORAGE_KEY = "portfolio-holdings";
const THEME_KEY = "theme";
const REFRESH_COOLDOWN = 1500;
const ERROR_WINDOW_MS = 15_000;

function normalizeSymbol(symbol) {
  return (symbol || "").toUpperCase().trim();
}

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function App() {
  const finnhubKey = import.meta.env.VITE_FINNHUB_KEY;
  const alphaKey = import.meta.env.VITE_ALPHAVANTAGE_KEY;
  const hasFinnhubKey = Boolean(finnhubKey);
  const hasAlphaKey = Boolean(alphaKey);
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
  const [refreshTick, setRefreshTick] = useState(0);
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(false);
  const [toast, setToast] = useState("");
  const [apiStatus, setApiStatus] = useState({
    lastError: apiState.lastError,
    lastErrorAt: apiState.lastErrorAt,
    invalidKey: apiState.invalidKey,
  });

  const toastTimerRef = useRef(null);
  const refreshCooldownRef = useRef(0);
  const pricesRef = useRef(prices);
  const prevsRef = useRef(prevs);
  const apiStatusRef = useRef(apiStatus);

  const uniqueSymbols = useMemo(() => {
    return Array.from(
      new Set(
        holdings
          .map((holding) => normalizeSymbol(holding.symbol))
          .filter((sym) => sym.length > 0)
      )
    );
  }, [holdings]);

  let keyNotice = "";
  if (!hasFinnhubKey && !hasAlphaKey) {
    keyNotice = "API keys not set — using mock data.";
  } else if (!hasFinnhubKey || apiStatus.invalidKey) {
    keyNotice = "Finnhub key missing/invalid — using mock data.";
  }

  const errorActive =
    Boolean(apiStatus.lastError) &&
    Date.now() - apiStatus.lastErrorAt < ERROR_WINDOW_MS;

  useEffect(() => {
    pricesRef.current = prices;
  }, [prices]);

  useEffect(() => {
    prevsRef.current = prevs;
  }, [prevs]);

  useEffect(() => {
    apiStatusRef.current = apiStatus;
  }, [apiStatus]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, []);

  const showToast = useCallback((message) => {
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
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const timer = window.setInterval(() => {
      const nextStatus = {
        lastError: apiState.lastError,
        lastErrorAt: apiState.lastErrorAt,
        invalidKey: apiState.invalidKey,
      };

      const previous = apiStatusRef.current;
      const changed =
        previous.lastError !== nextStatus.lastError ||
        previous.lastErrorAt !== nextStatus.lastErrorAt ||
        previous.invalidKey !== nextStatus.invalidKey;

      if (changed) {
        apiStatusRef.current = nextStatus;
        setApiStatus(nextStatus);
        if (nextStatus.lastError && nextStatus.lastErrorAt) {
          showToast(nextStatus.lastError);
        }
      }
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [showToast]);

  useEffect(() => {
    if (typeof window === "undefined") {
      setHoldings(initialHoldings);
      setSelected(normalizeSymbol(initialHoldings[0]?.symbol));
      return;
    }

    const storedValue = window.localStorage.getItem(STORAGE_KEY);
    if (storedValue) {
      try {
        const parsed = JSON.parse(storedValue);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const sanitized = parsed
            .map((item) => ({
              symbol: normalizeSymbol(item.symbol),
              shares: Number(item.shares),
            }))
            .filter(
              (item) =>
                item.symbol.length > 0 &&
                Number.isFinite(item.shares) &&
                item.shares > 0
            );
          if (sanitized.length > 0) {
            setHoldings(sanitized);
            setSelected(sanitized[0].symbol);
            return;
          }
        }
      } catch (error) {
        console.warn("Failed to read stored holdings", error);
      }
    }

    const sanitizedInitial = initialHoldings.map((item) => ({
      symbol: normalizeSymbol(item.symbol),
      shares: Number(item.shares),
    }));
    setHoldings(sanitizedInitial);
    setSelected(normalizeSymbol(sanitizedInitial[0]?.symbol));
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
        console.warn("Failed to persist theme", error);
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
        }
        return;
      }

      if (!cancelled) {
        setIsLoadingQuotes(true);
      }

      const nextPrices = {};
      const nextPrevs = {};
      const symbols = uniqueSymbols;

      for (const symbol of symbols) {
        if (cancelled) {
          return;
        }
        try {
          const quote = await fetchQuote(symbol);
          const price = safeNumber(quote?.price);
          const previous = safeNumber(quote?.previous_close);
          nextPrices[symbol] =
            price === 0 && previous > 0 ? previous : price;
          nextPrevs[symbol] = previous;
        } catch (error) {
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
      }
    }

    syncQuotes()
      .catch((error) => {
        console.error("Unexpected error during quote sync", error);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingQuotes(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [holdings, refreshTick, uniqueSymbols]);

  useEffect(() => {
    if (holdings.length === 0) {
      setSelected(null);
      return;
    }

    const current = normalizeSymbol(selected);
    const hasSelected = holdings.some(
      (item) => normalizeSymbol(item.symbol) === current
    );
    if (!hasSelected) {
      setSelected(normalizeSymbol(holdings[0].symbol));
    }
  }, [holdings, selected]);

  const portfolioValue = useMemo(() => {
    return holdings.reduce((sum, holding) => {
      const sym = normalizeSymbol(holding.symbol);
      if (!sym) {
        return sum;
      }
      const price = prices[sym] ?? 0;
      return sum + holding.shares * price;
    }, 0);
  }, [holdings, prices]);

  const todayChange = useMemo(() => {
    return holdings.reduce((sum, holding) => {
      const sym = normalizeSymbol(holding.symbol);
      if (!sym) {
        return sum;
      }
      const price = prices[sym] ?? 0;
      const prev = prevs[sym] ?? 0;
      return sum + holding.shares * (price - prev);
    }, 0);
  }, [holdings, prices, prevs]);

  const handleAddHolding = useCallback(({ symbol, shares }) => {
    const sym = normalizeSymbol(symbol);
    const shareCount = Number(shares);
    if (!sym || !Number.isFinite(shareCount) || shareCount <= 0) {
      return;
    }

    setHoldings((current) => {
      const existing = current.find(
        (item) => normalizeSymbol(item.symbol) === sym
      );
      if (existing) {
        return current.map((item) =>
          normalizeSymbol(item.symbol) === sym
            ? { ...item, shares: item.shares + shareCount }
            : item
        );
      }
      return [...current, { symbol: sym, shares: shareCount }];
    });
    setSelected((current) => current ?? sym);
  }, []);

  const handleRemoveHolding = useCallback((symbol) => {
    const sym = normalizeSymbol(symbol);
    setHoldings((current) =>
      current.filter((item) => normalizeSymbol(item.symbol) !== sym)
    );
  }, []);

  const handleToggleTheme = useCallback(() => {
    setIsDark((prev) => !prev);
  }, []);

  const handleRefresh = useCallback(() => {
    const now = Date.now();
    if (now - refreshCooldownRef.current < REFRESH_COOLDOWN) {
      return;
    }
    refreshCooldownRef.current = now;
    setRefreshTick((tick) => tick + 1);
  }, []);

  const themeAriaLabel = isDark ? "Switch to light theme" : "Switch to dark theme";
  const themeLabel = isDark ? "Light" : "Dark";

  const diagnostics = useMemo(
    () => ({
      finnhubKeyPresent: hasFinnhubKey,
      alphaVantageKeyPresent: hasAlphaKey,
      invalidKey: apiStatus.invalidKey,
      lastError: apiStatus.lastError,
      lastErrorAt: apiStatus.lastErrorAt,
      symbols: uniqueSymbols,
    }),
    [apiStatus, hasAlphaKey, hasFinnhubKey, uniqueSymbols]
  );

  return (
    <>
      <div className="container">
        {keyNotice ? (
          <div className="banner" role="status" aria-live="polite">
            {keyNotice}
          </div>
        ) : null}

        {errorActive ? (
          <div className="banner banner--error" role="status" aria-live="polite">
            {`Live data error: ${apiStatus.lastError}. Showing cached or mock values.`}
          </div>
        ) : null}

        <header className="card top-bar">
          <h1 className="top-bar__title">My Portfolio</h1>
          <button
            type="button"
            className="btn btn--ghost btn--icon theme-toggle"
            onClick={handleToggleTheme}
            aria-label={themeAriaLabel}
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
            onSelect={(symbol) => setSelected(normalizeSymbol(symbol))}
            selectedSymbol={selected}
            errorActive={errorActive}
          />
        </section>

        <section className="card fade-in" aria-label="Performance chart">
          <h2>Performance</h2>
          <StockChart symbol={selected} />
        </section>

        {import.meta.env.DEV ? (
          <details className="diagnostics">
            <summary>Diagnostics</summary>
            <pre>{JSON.stringify(diagnostics, null, 2)}</pre>
          </details>
        ) : null}
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
