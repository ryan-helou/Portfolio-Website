import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ThemeToggle from "./components/ThemeToggle";
import HoldingsForm from "./components/HoldingsForm";
import HoldingsTable from "./components/HoldingsTable";
import MetricsBar from "./components/MetricsBar";
import { initialHoldings } from "./mock";
import { apiState, fetchQuote } from "./api/twelve";

const STORAGE_KEY = "portfolio-holdings";
const THEME_KEY = "theme";
const REFRESH_COOLDOWN = 1500;
const ERROR_WINDOW_MS = 15_000;
const FRESH_MS = 60 * 1000;

function normalizeSymbol(symbol) {
  return (symbol || "").toUpperCase().trim();
}

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function resolveQuoteValues(priceValue, previousValue) {
  const resolvedPrice = safeNumber(priceValue);
  const resolvedPrev = safeNumber(previousValue);
  return {
    price:
      resolvedPrice === 0 && resolvedPrev > 0 ? resolvedPrev : resolvedPrice,
    previous: resolvedPrev,
  };
}

function readQuoteEntry(sym) {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(`quote:${sym}`);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function readCachedQuote(sym) {
  const entry = readQuoteEntry(sym);
  if (!entry || !entry.data || !entry.exp) {
    return null;
  }
  if (Date.now() > entry.exp) {
    return null;
  }
  return entry.data;
}

function isQuoteFresh(entry) {
  return Boolean(entry && entry.exp && Date.now() < entry.exp);
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
    return (
      window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false
    );
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
  const refreshMetaRef = useRef({ force: false });
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
    keyNotice = "API keys not set \u2014 using mock data.";
  } else if (!hasFinnhubKey || apiStatus.invalidKey) {
    keyNotice = "Finnhub key missing/invalid \u2014 using mock data.";
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
    if (typeof window === "undefined") {
      return;
    }
    if (selected) {
      window.localStorage.setItem("selectedSymbol", selected);
    } else {
      window.localStorage.removeItem("selectedSymbol");
    }
  }, [selected]);

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
    const applyHoldings = (items, storedSelected) => {
      const sanitized = items
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

      setHoldings(sanitized);

      if (sanitized.length === 0) {
        setSelected(null);
        if (typeof window !== "undefined") {
          window.localStorage.removeItem("selectedSymbol");
        }
        return;
      }

      const fallbackSymbol =
        storedSelected &&
        sanitized.some((item) => item.symbol === storedSelected)
          ? storedSelected
          : sanitized[0].symbol;
      setSelected(fallbackSymbol);
    };

    if (typeof window === "undefined") {
      applyHoldings(initialHoldings, null);
      return;
    }

    const storedHoldings = window.localStorage.getItem(STORAGE_KEY);
    const storedSelectedRaw = window.localStorage.getItem("selectedSymbol");
    const storedSelected = normalizeSymbol(storedSelectedRaw);

    if (storedHoldings) {
      try {
        const parsed = JSON.parse(storedHoldings);
        if (Array.isArray(parsed) && parsed.length > 0) {
          applyHoldings(parsed, storedSelected);
          return;
        }
      } catch (error) {
        console.warn("Failed to read stored holdings", error);
      }
    }

    applyHoldings(initialHoldings, storedSelected);
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

    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings));
      } catch (error) {
        console.warn("Failed to persist holdings", error);
      }
    }

    const symbols = uniqueSymbols;

    if (holdings.length === 0 || symbols.length === 0) {
      if (!cancelled) {
        setPrices({});
        setPrevs({});
        setIsLoadingQuotes(false);
      }
      return () => {
        cancelled = true;
      };
    }

    if (typeof window !== "undefined") {
      const cachedPrices = {};
      const cachedPrevs = {};
      symbols.forEach((sym) => {
        const cached = readCachedQuote(sym);
        if (cached) {
          const resolved = resolveQuoteValues(
            cached.price,
            cached.previous_close
          );
          cachedPrices[sym] = resolved.price;
          cachedPrevs[sym] = resolved.previous;
        }
      });
      if (!cancelled) {
        if (Object.keys(cachedPrices).length > 0) {
          setPrices((prev) => ({ ...prev, ...cachedPrices }));
        }
        if (Object.keys(cachedPrevs).length > 0) {
          setPrevs((prev) => ({ ...prev, ...cachedPrevs }));
        }
      }
    }

    const { force } = refreshMetaRef.current;
    refreshMetaRef.current = { force: false };

    const shouldFetch =
      force ||
      symbols.some((sym) => {
        const entry = readQuoteEntry(sym);
        return !isQuoteFresh(entry);
      });

    if (!shouldFetch) {
      if (!cancelled) {
        setIsLoadingQuotes(false);
      }
      return () => {
        cancelled = true;
      };
    }

    setIsLoadingQuotes(true);

    (async () => {
      for (const symbol of symbols) {
        if (cancelled) {
          break;
        }

        const entry = readQuoteEntry(symbol);
        if (!force && isQuoteFresh(entry) && entry?.data) {
          const resolved = resolveQuoteValues(
            entry.data.price,
            entry.data.previous_close
          );
          if (!cancelled) {
            setPrices((prev) => ({ ...prev, [symbol]: resolved.price }));
            setPrevs((prev) => ({ ...prev, [symbol]: resolved.previous }));
          }
          continue;
        }

        try {
          const quote = await fetchQuote(symbol);
          if (cancelled) {
            break;
          }
          const resolved = resolveQuoteValues(
            quote?.price,
            quote?.previous_close
          );
          setPrices((prev) => ({ ...prev, [symbol]: resolved.price }));
          setPrevs((prev) => ({ ...prev, [symbol]: resolved.previous }));
        } catch (error) {
          const fallbackPrice = pricesRef.current[symbol];
          const fallbackPrev = prevsRef.current[symbol];
          if (!cancelled) {
            setPrices((prev) => ({
              ...prev,
              [symbol]: typeof fallbackPrice === "number" ? fallbackPrice : 0,
            }));
            setPrevs((prev) => ({
              ...prev,
              [symbol]: typeof fallbackPrev === "number" ? fallbackPrev : 0,
            }));
          }
        }
      }

      if (!cancelled) {
        setIsLoadingQuotes(false);
      }
    })().catch((error) => {
      console.error("Unexpected error during quote sync", error);
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

  const requestRefresh = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - refreshCooldownRef.current < REFRESH_COOLDOWN) {
      return;
    }
    refreshCooldownRef.current = now;
    refreshMetaRef.current = { force };
    setRefreshTick((tick) => tick + 1);
  }, []);

  const handleRefresh = useCallback(() => {
    requestRefresh(false);
  }, [requestRefresh]);

  const handleForceRefresh = useCallback(() => {
    requestRefresh(true);
  }, [requestRefresh]);

  const diagnostics = useMemo(() => {
    if (!import.meta.env.DEV || typeof window === "undefined") {
      return null;
    }
    const cacheStatus = uniqueSymbols.map((sym) => {
      const entry = readQuoteEntry(sym);
      if (!entry) {
        return { symbol: sym, cached: false };
      }
      try {
        const { exp, data } = entry;
        const expiryMs = typeof exp === "number" ? exp : Date.now() + FRESH_MS;
        const fresh = isQuoteFresh(entry);
        return {
          symbol: sym,
          cached: true,
          fresh,
          secondsLeft: Math.max(0, Math.floor((expiryMs - Date.now()) / 1000)),
          price: data?.price ?? null,
        };
      } catch {
        return { symbol: sym, cached: true, parseError: true };
      }
    });
    return {
      finnhubKeyPresent: hasFinnhubKey,
      alphaVantageKeyPresent: hasAlphaKey,
      selected,
      lastError: apiStatus.lastError,
      lastErrorAt: apiStatus.lastErrorAt,
      symbols: uniqueSymbols,
      cacheStatus,
    };
  }, [
    hasFinnhubKey,
    hasAlphaKey,
    selected,
    apiStatus.lastError,
    apiStatus.lastErrorAt,
    uniqueSymbols,
  ]);

  return (
    <>
      <div className="container">
        <div className="top-bar">
          <h1 className="top-bar__title">My Portfolio</h1>
          <div className="top-bar__actions">
            <ThemeToggle isDark={isDark} onChange={handleToggleTheme} />
          </div>
        </div>

        <div className="app-shell">
          {keyNotice ? (
            <div className="banner" role="status" aria-live="polite">
              {keyNotice}
            </div>
          ) : null}

          {errorActive ? (
            <div
              className="banner banner--error"
              role="status"
              aria-live="polite"
            >
              {`Live data error: ${apiStatus.lastError}. Showing cached or mock values.`}
            </div>
          ) : null}

          <section className="card fade-in" aria-label="Portfolio metrics">
            <MetricsBar value={portfolioValue} change={todayChange} />
          </section>

          <section className="card fade-in" aria-label="Add holding">
            <h2 className="card__title">Add Holding</h2>
            <HoldingsForm onAdd={handleAddHolding} />
          </section>

          <section className="card fade-in" aria-label="Holdings table">
            <div className="card-header">
              <h2 className="card__title">Holdings</h2>
              <div className="btn-group">
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

          {import.meta.env.DEV && diagnostics ? (
            <details className="diagnostics">
              <summary>Diagnostics</summary>
              <pre>{JSON.stringify(diagnostics, null, 2)}</pre>
            </details>
          ) : null}
        </div>
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
