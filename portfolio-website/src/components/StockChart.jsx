import { useEffect, useMemo, useState } from "react";
import { fetchSeries } from "../api/twelve";

const VIEWBOX_WIDTH = 600;
const VIEWBOX_HEIGHT = 220;
const SERIES_INTERVAL = "1day";
const SERIES_OUTPUT = 30;

function computePaths(data) {
  if (!Array.isArray(data) || data.length === 0) {
    return { line: "", area: "" };
  }

  const numericPoints = data
    .map((point) => ({
      datetime: point?.datetime ?? "",
      close: Number(point?.close),
    }))
    .filter((point) => point.datetime && Number.isFinite(point.close));

  if (!numericPoints.length) {
    return { line: "", area: "" };
  }

  const closes = numericPoints.map((point) => point.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;

  const points = numericPoints.map((point, index) => {
    const x =
      numericPoints.length === 1
        ? VIEWBOX_WIDTH / 2
        : (index / (numericPoints.length - 1)) * VIEWBOX_WIDTH;
    const y =
      VIEWBOX_HEIGHT - ((point.close - min) / range) * VIEWBOX_HEIGHT;
    return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
  });

  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
    .join(" ");

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const area = `${line} L${lastPoint.x} ${VIEWBOX_HEIGHT} L${firstPoint.x} ${VIEWBOX_HEIGHT} Z`;

  return { line, area };
}

function readSeriesEntry(sym, interval = SERIES_INTERVAL, output = SERIES_OUTPUT) {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(`series:${sym}|${interval}|${output}`);
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

export default function StockChart({ symbol }) {
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(false);
  const normalizedSymbol = useMemo(
    () => (typeof symbol === "string" ? symbol.toUpperCase().trim() : ""),
    [symbol]
  );

  useEffect(() => {
    let active = true;

    async function loadData() {
      if (!normalizedSymbol) {
        if (active) {
          setSeries([]);
          setLoading(false);
        }
        return;
      }

      let hadCached = false;
      const entry = readSeriesEntry(normalizedSymbol, SERIES_INTERVAL, SERIES_OUTPUT);

      if (entry && entry.data && entry.exp && Date.now() < entry.exp) {
        const hydratedValues = Array.isArray(entry.data.values)
          ? entry.data.values.filter((point) => {
              const closeNumber = Number(point?.close);
              const datetime = point?.datetime ?? "";
              return datetime && Number.isFinite(closeNumber);
            })
          : [];
        if (hydratedValues.length) {
          setSeries(hydratedValues);
          hadCached = true;
        } else {
          setSeries([]);
        }
      } else {
        setSeries([]);
      }

      const shouldFetch =
        !entry ||
        !entry.exp ||
        Date.now() >= entry.exp ||
        !hadCached;

      if (!shouldFetch) {
        setLoading(false);
        return;
      }

      if (!hadCached) {
        setLoading(true);
      }

      try {
        const response = await fetchSeries(
          normalizedSymbol,
          SERIES_INTERVAL,
          SERIES_OUTPUT
        );
        if (!active) {
          return;
        }

        const values = Array.isArray(response.values)
          ? response.values.filter((point) => {
              const closeNumber = Number(point?.close);
              const datetime = point?.datetime ?? "";
              return datetime && Number.isFinite(closeNumber);
            })
          : [];

        setSeries(values);
      } catch (error) {
        console.warn(`Failed to load series for ${normalizedSymbol}`, error);
        if (active && !hadCached) {
          setSeries([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadData();
    return () => {
      active = false;
    };
  }, [normalizedSymbol]);

  const { line, area } = useMemo(() => computePaths(series), [series]);

  if (!normalizedSymbol) {
    return (
      <div className="empty">
        <p>Select a holding to preview the sparkline.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="empty">
        <span className="helper">Loading series...</span>
      </div>
    );
  }

  if (!series.length || !line) {
    return (
      <div className="empty">
        <p>No data yet. Select a holding.</p>
      </div>
    );
  }

  return (
    <div className="chart fade-in">
      <div className="chart__legend">
        <span className="tag">{normalizedSymbol}</span>
      </div>
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Price history for ${normalizedSymbol}`}
      >
        <defs>
          <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} className="sparkline-glow" />
        <path d={line} className="sparkline-path" />
      </svg>
    </div>
  );
}
