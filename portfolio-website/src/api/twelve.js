// src/api/twelve.js
// Finnhub-first with Alpha Vantage per-symbol fallback, then mocks.
// Keeps the same exported API used by the app: fetchQuote, fetchSeries
// - Caches in memory + localStorage (TTL: quotes 60s; series 5min)
// - Normalizes symbols (uppercase, trim)
// - Encodes symbols with encodeURIComponent (supports dots like AC.TO)
// - Surfaces shared apiState for banners/toasts

const KEY_FH  = import.meta.env.VITE_FINNHUB_KEY || "";
const KEY_AV  = import.meta.env.VITE_ALPHAVANTAGE_KEY || "";
const USE_FH  = !!KEY_FH;
const USE_AV  = !!KEY_AV;

const QUOTE_TTL_MS  = 60 * 1000;
const SERIES_TTL_MS = 5 * 60 * 1000;

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
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

// ---------------- Finnhub ----------------
async function fhFetchQuote(sym) {
  if (!USE_FH) throw new Error("Finnhub key missing");
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${KEY_FH}`;
  const j = await getJSON(url);
  const price = Number(j.c);
  const pc = Number(j.pc);
  return {
    price: Number.isFinite(price) ? price : 0,
    previous_close: Number.isFinite(pc) ? pc : 0,
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
  const q = j["Global Quote"] || {};
  const price = Number(q["05. price"]);
  const pc = Number(q["08. previous close"]);
  return {
    price: Number.isFinite(price) ? price : 0,
    previous_close: Number.isFinite(pc) ? pc : 0,
  };
}

async function avFetchSeries(sym, output = 30) {
  if (!USE_AV) throw new Error("Alpha Vantage key missing");
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(sym)}&apikey=${KEY_AV}`;
  const j = await getJSON(url);
  const series = j["Time Series (Daily)"] || {};
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

  try {
    let data = null;

    if (USE_FH) {
      try {
        data = await fhFetchQuote(SYM);
        if (USE_AV && (!data || (!data.price && !data.previous_close))) {
          const av = await avFetchQuote(SYM);
          if (av && (av.price || av.previous_close)) data = av;
        }
      } catch (e) {
        if (USE_AV) {
          try { data = await avFetchQuote(SYM); } catch {}
        }
        if (!data) throw e;
      }
    } else if (USE_AV) {
      data = await avFetchQuote(SYM);
    } else {
      const mock = await loadMock();
      data = mock.quote(SYM);
    }

    data = {
      price: Number(data?.price) || 0,
      previous_close: Number(data?.previous_close) || 0,
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

  try {
    let data = null;

    if (USE_FH) {
      try {
        data = await fhFetchSeries(SYM, output);
        const empty = !data || !Array.isArray(data.values) || data.values.length === 0;
        if (USE_AV && empty) {
          const av = await avFetchSeries(SYM, output);
          if (av && Array.isArray(av.values) && av.values.length) data = av;
        }
      } catch (e) {
        if (USE_AV) {
          try { data = await avFetchSeries(SYM, output); } catch {}
        }
        if (!data) throw e;
      }
    } else if (USE_AV) {
      data = await avFetchSeries(SYM, output);
    } else {
      const mock = await loadMock();
      data = mock.series(SYM, output);
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
