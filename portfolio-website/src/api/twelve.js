// src/api/twelve.js
// Smart provider selection based on stock exchange:
// - TSX stocks (.TO): Marketstack (100 calls/month, EOD data) → Alpha Vantage fallback (25 calls/day)
// - NYSE/NASDAQ: Finnhub (60 calls/min) → Alpha Vantage fallback (25 calls/day)
// Keeps the same exported API used by the app: fetchQuote, fetchSeries
// - Caches in memory + localStorage (TTL: quotes 24h; series 24h)
// - Normalizes symbols (uppercase, trim)
// - Encodes symbols with encodeURIComponent (supports dots like AC.TO)
// - Surfaces shared apiState for banners/toasts

const KEY_MS  = import.meta.env.VITE_MARKETSTACK_KEY || "";
const KEY_FH  = import.meta.env.VITE_FINNHUB_KEY || "";
const KEY_AV  = import.meta.env.VITE_ALPHAVANTAGE_KEY || "";
const USE_MS  = !!KEY_MS;
const USE_FH  = !!KEY_FH;
const USE_AV  = !!KEY_AV;

const QUOTE_TTL_MS  = 24 * 60 * 60 * 1000; // 24 hours
const SERIES_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const mem = {
  quotes: new Map(), // key -> { data, exp }
  series: new Map(), // key -> { data, exp }
};

export const apiState = {
  lastError: null,
  lastErrorAt: 0,
  invalidKey: false,
};

function setError(msg) {
  apiState.lastError = String(msg || "Unknown error");
  apiState.lastErrorAt = Date.now();
  console.warn("[API]", apiState.lastError);
}

function now() { return Date.now(); }

function readLS(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.exp || parsed.exp < now()) return null;
    return parsed.data;
  } catch { return null; }
}

function writeLS(key, data, ttlMs) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, exp: now() + ttlMs }));
  } catch { /* ignore quota */ }
}

function readCache(map, key) {
  const m = map.get(key);
  if (m && m.exp > now()) return m.data;
  const ls = readLS(key);
  if (ls) {
    map.set(key, { data: ls, exp: now() + 500 });
    return ls;
  }
  return null;
}

function writeCache(map, key, data, ttlMs) {
  map.set(key, { data, exp: now() + ttlMs });
  writeLS(key, data, ttlMs);
}

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) {
    let errorMsg = `HTTP ${res.status}`;
    try {
      const errorBody = await res.json();
      console.log('[API] Error response body:', JSON.stringify(errorBody));
      if (errorBody && (errorBody.message || errorBody.error || errorBody["Error Message"])) {
        errorMsg += `: ${errorBody.message || errorBody.error || errorBody["Error Message"]}`;
      }
    } catch {}
    throw new Error(errorMsg);
  }
  const json = await res.json();
  if ((json && json.status === "error") || json.code || json.error || json.note || json["Error Message"]) {
    const msg = json.error || json.message || json.note || json["Error Message"] || "API error";
    throw new Error(msg);
  }
  return json;
}

// -------- Mock loader (deferred import to avoid cycles) --------
async function loadMock() {
  const m = await import("../mock.js");
  return {
    quote(sym) {
      const s = m.mockQuote?.[sym] || {};
      return {
        price: Number(s.price) || 0,
        previous_close: Number(s.prevClose) || 0,
      };
    },
    series(sym, output = 30) {
      const arr = (m.mockSeries?.[sym] || []).slice(-output);
      return {
        values: arr.map(v => ({
          datetime: String(v.datetime),
          close: String(v.close),
        })),
      };
    },
  };
}

// ---------------- Marketstack ----------------
async function msFetchQuote(sym) {
  if (!USE_MS) throw new Error("Marketstack key missing");
  // Marketstack uses .XTSE suffix for Toronto Stock Exchange
  // SHOP.TO becomes SHOP.XTSE
  const marketstackSym = sym.replace(".TO", ".XTSE");
  console.log(`[API] Marketstack requesting: ${marketstackSym}`);
  // Fetch last 2 days to get both current and previous close
  const url = `http://api.marketstack.com/v1/eod?access_key=${KEY_MS}&symbols=${encodeURIComponent(marketstackSym)}&limit=2`;
  const j = await getJSON(url);

  console.log(`[API] Marketstack full response for ${marketstackSym}:`, JSON.stringify(j));

  // Check for errors
  if (j.error) {
    throw new Error(JSON.stringify(j.error));
  }

  if (!j.data || !Array.isArray(j.data) || j.data.length === 0) {
    throw new Error(`Symbol ${sym} not found on Marketstack - empty data array`);
  }

  // Marketstack returns newest first, so [0] = today, [1] = yesterday
  const today = j.data[0];
  const yesterday = j.data[1];

  console.log(`[API] Marketstack today:`, JSON.stringify(today));
  console.log(`[API] Marketstack yesterday:`, JSON.stringify(yesterday));

  const price = Number(today.close);
  const open = Number(today.open);
  // Use yesterday's close as previous_close
  const pc = yesterday ? Number(yesterday.close) : open;

  // Calculate change percent: (close - previous_close) / previous_close * 100
  const changePercent = pc > 0 ? ((price - pc) / pc) * 100 : null;

  return {
    price: Number.isFinite(price) ? price : 0,
    previous_close: Number.isFinite(pc) ? pc : 0,
    change_percent: Number.isFinite(changePercent) ? changePercent : null,
  };
}

async function msFetchSeries(sym, output = 30) {
  if (!USE_MS) throw new Error("Marketstack key missing");
  // Marketstack uses .XTSE suffix for Toronto Stock Exchange
  const marketstackSym = sym.replace(".TO", ".XTSE");
  console.log(`[API] Marketstack requesting series: ${marketstackSym}`);
  const url = `http://api.marketstack.com/v1/eod?access_key=${KEY_MS}&symbols=${encodeURIComponent(marketstackSym)}&limit=${output}`;
  const j = await getJSON(url);

  // Check for errors
  if (j.error) {
    throw new Error(j.error.message || "Marketstack error");
  }

  if (!j.data || !Array.isArray(j.data) || j.data.length === 0) {
    throw new Error(`No historical data from Marketstack for ${sym}`);
  }

  // Marketstack returns newest first, reverse it
  const vals = j.data.reverse().map(v => ({
    datetime: String(v.date).split('T')[0], // Extract just the date part
    close: String(v.close),
  }));
  return { values: vals };
}

// ---------------- Finnhub ----------------
async function fhFetchQuote(sym) {
  if (!USE_FH) throw new Error("Finnhub key missing");
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${KEY_FH}`;
  const j = await getJSON(url);
  const price = Number(j.c);
  const pc = Number(j.pc);
  const changePercent = Number(j.dp); // Finnhub provides "dp" = change percent
  return {
    price: Number.isFinite(price) ? price : 0,
    previous_close: Number.isFinite(pc) ? pc : 0,
    change_percent: Number.isFinite(changePercent) ? changePercent : null,
  };
}

async function fhFetchSeries(sym, output = 30) {
  if (!USE_FH) throw new Error("Finnhub key missing");
  const to = Math.floor(Date.now() / 1000);
  const approxDays = Math.max(output * 2, 60);
  const from = to - approxDays * 86400;
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(sym)}&resolution=D&from=${from}&to=${to}&token=${KEY_FH}`;
  const j = await getJSON(url);
  if (!j || j.s !== "ok" || !Array.isArray(j.t) || !Array.isArray(j.c)) return { values: [] };
  const vals = j.t.map((ts, i) => ({
    datetime: new Date(ts * 1000).toISOString().slice(0, 10),
    close: String(j.c[i]),
  }));
  return { values: vals.slice(-output) };
}

// --------------- Alpha Vantage ---------------
async function avFetchQuote(sym) {
  if (!USE_AV) throw new Error("Alpha Vantage key missing");

  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(sym)}&apikey=${KEY_AV}`;
  const j = await getJSON(url);

  // Check for rate limit
  if (j.Information || j.Note) {
    throw new Error("Alpha Vantage rate limit exceeded (25 calls/day)");
  }

  const q = j["Global Quote"] || {};
  if (Object.keys(q).length === 0) {
    throw new Error(`Symbol ${sym} not found on Alpha Vantage`);
  }
  const price = Number(q["05. price"]);
  const pc = Number(q["08. previous close"]);
  const changePercent = Number(q["10. change percent"]?.replace('%', '')); // Alpha Vantage provides "10. change percent" as "1.23%"
  return {
    price: Number.isFinite(price) ? price : 0,
    previous_close: Number.isFinite(pc) ? pc : 0,
    change_percent: Number.isFinite(changePercent) ? changePercent : null,
  };
}

async function avFetchSeries(sym, output = 30) {
  if (!USE_AV) throw new Error("Alpha Vantage key missing");

  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(sym)}&apikey=${KEY_AV}`;
  const j = await getJSON(url);

  // Check for rate limit
  if (j.Information || j.Note) {
    throw new Error("Alpha Vantage rate limit exceeded (25 calls/day)");
  }

  const series = j["Time Series (Daily)"] || {};
  if (Object.keys(series).length === 0) {
    throw new Error(`No series data for ${sym}`);
  }

  const dates = Object.keys(series).sort();
  const last = dates.slice(-output);
  const values = last.map(d => ({
    datetime: d,
    close: String(series[d]["4. close"]),
  }));
  return { values };
}

// --------------- Resolve with per-symbol fallback ---------------
async function resolveQuote(sym) {
  const SYM = (sym || "").toUpperCase().trim();
  const cacheKey = `quote:${SYM}`;
  const cached = readCache(mem.quotes, cacheKey);
  if (cached) return cached;

  const isTSX = SYM.endsWith(".TO");

  try {
    let data = null;

    if (isTSX) {
      // TSX stocks: Marketstack first (100 calls/month), Alpha Vantage fallback (25 calls/day)
      if (USE_MS) {
        try {
          data = await msFetchQuote(SYM);
          if (data && (data.price || data.previous_close)) {
            console.log(`[API] Marketstack succeeded for TSX ${SYM}`);
          } else {
            data = null;
          }
        } catch (e) {
          console.log(`[API] Marketstack failed for ${SYM}:`, e.message);
          data = null;
        }
      }

      // Fallback to Alpha Vantage if Marketstack failed
      if (!data && USE_AV) {
        try {
          data = await avFetchQuote(SYM);
          if (data && (data.price || data.previous_close)) {
            console.log(`[API] Alpha Vantage succeeded for TSX ${SYM}`);
          } else {
            data = null;
          }
        } catch (e) {
          console.log(`[API] Alpha Vantage failed for ${SYM}:`, e.message);
          data = null;
        }
      }
    } else {
      // NYSE/NASDAQ stocks: Finnhub first, then Alpha Vantage
      if (USE_FH) {
        try {
          data = await fhFetchQuote(SYM);
          if (data && (data.price || data.previous_close)) {
            console.log(`[API] Finnhub succeeded for ${SYM}`);
          } else {
            data = null;
          }
        } catch (e) {
          console.log(`[API] Finnhub failed for ${SYM}:`, e.message);
          data = null;
        }
      }

      // Fallback to Alpha Vantage if Finnhub failed
      if (!data && USE_AV) {
        try {
          data = await avFetchQuote(SYM);
          if (data && (data.price || data.previous_close)) {
            console.log(`[API] Alpha Vantage succeeded for ${SYM}`);
          } else {
            data = null;
          }
        } catch (e) {
          console.log(`[API] Alpha Vantage failed for ${SYM}:`, e.message);
          data = null;
        }
      }
    }

    // If all providers failed, throw error
    if (!data) {
      throw new Error(`All providers failed for ${SYM}`);
    }

    data = {
      price: Number(data?.price) || 0,
      previous_close: Number(data?.previous_close) || 0,
      change_percent: data?.change_percent ?? null,
    };
    writeCache(mem.quotes, cacheKey, data, QUOTE_TTL_MS);
    return data;
  } catch (e) {
    setError(e?.message || e);
    if (String(apiState.lastError).toLowerCase().includes("invalid api key")) apiState.invalidKey = true;
    if (cached) return cached;
    const mock = await loadMock();
    return mock.quote(SYM);
  }
}

async function resolveSeries(sym, interval = "1day", output = 30) {
  const SYM = (sym || "").toUpperCase().trim();
  const key = `series:${SYM}|${interval}|${output}`;
  const cached = readCache(mem.series, key);
  if (cached) return cached;

  const isTSX = SYM.endsWith(".TO");

  try {
    let data = null;

    if (isTSX) {
      // TSX stocks: Marketstack first (100 calls/month), Alpha Vantage fallback (25 calls/day)
      if (USE_MS) {
        try {
          data = await msFetchSeries(SYM, output);
          if (data && data.values && data.values.length > 0) {
            console.log(`[API] Marketstack series succeeded for TSX ${SYM}`);
          } else {
            data = null;
          }
        } catch (e) {
          console.log(`[API] Marketstack series failed for ${SYM}:`, e.message);
          data = null;
        }
      }

      // Fallback to Alpha Vantage if Marketstack failed
      if (!data && USE_AV) {
        try {
          data = await avFetchSeries(SYM, output);
          if (data && data.values && data.values.length > 0) {
            console.log(`[API] Alpha Vantage series succeeded for TSX ${SYM}`);
          } else {
            data = null;
          }
        } catch (e) {
          console.log(`[API] Alpha Vantage series failed for ${SYM}:`, e.message);
          data = null;
        }
      }
    } else {
      // NYSE/NASDAQ stocks: Finnhub first, then Alpha Vantage
      if (USE_FH) {
        try {
          data = await fhFetchSeries(SYM, output);
          if (data && data.values && data.values.length > 0) {
            console.log(`[API] Finnhub series succeeded for ${SYM}`);
          } else {
            data = null;
          }
        } catch (e) {
          console.log(`[API] Finnhub series failed for ${SYM}:`, e.message);
          data = null;
        }
      }

      // Fallback to Alpha Vantage if Finnhub failed
      if (!data && USE_AV) {
        try {
          data = await avFetchSeries(SYM, output);
          if (data && data.values && data.values.length > 0) {
            console.log(`[API] Alpha Vantage series succeeded for ${SYM}`);
          } else {
            data = null;
          }
        } catch (e) {
          console.log(`[API] Alpha Vantage series failed for ${SYM}:`, e.message);
          data = null;
        }
      }
    }

    // If all providers failed, throw error
    if (!data) {
      throw new Error(`All providers failed for ${SYM}`);
    }

    const safe = {
      values: Array.isArray(data?.values)
        ? data.values
            .map(v => ({
              datetime: String(v.datetime || ""),
              close: String(Number(v.close) || 0),
            }))
            .filter(v => v.datetime)
        : [],
    };
    writeCache(mem.series, key, safe, SERIES_TTL_MS);
    return safe;
  } catch (e) {
    setError(e?.message || e);
    if (String(apiState.lastError).toLowerCase().includes("invalid api key")) apiState.invalidKey = true;
    if (cached) return cached;
    const mock = await loadMock();
    return mock.series(SYM, output);
  }
}

// Optional one-time validation
let validated = false;
async function validateKeyOnce() {
  if (validated) return;
  validated = true;
  try {
    if (USE_FH) { await fhFetchQuote("AAPL"); }
    else if (USE_AV) { await avFetchQuote("AAPL"); }
  } catch (e) {
    setError(e?.message || e);
    if (String(apiState.lastError).toLowerCase().includes("invalid api key")) apiState.invalidKey = true;
  }
}

export async function fetchQuote(symbol) {
  await validateKeyOnce();
  return resolveQuote(symbol);
}

export async function fetchSeries(symbol, interval = "1day", output = 30) {
  await validateKeyOnce();
  return resolveSeries(symbol, interval, output);
}
