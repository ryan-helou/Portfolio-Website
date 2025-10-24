import { useState } from "react";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function normalizeSymbol(symbol) {
  return (symbol || "").toUpperCase().trim();
}

const DASH = "\u2014";

export default function HoldingsTable({
  holdings,
  prices,
  onRemove,
  onSelect,
  selectedSymbol,
  errorActive,
}) {
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState("asc");

  const handleHeaderClick = (column) => {
    if (sortColumn === column) {
      // Cycle through: asc -> desc -> unsorted
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else {
        // Third click: reset to unsorted
        setSortColumn(null);
        setSortDirection("asc");
      }
    } else {
      // Switch to new column with default direction
      setSortColumn(column);
      setSortDirection(column === "symbol" ? "asc" : "desc");
    }
  };

  const getSortedHoldings = () => {
    // If no sort column selected, return original order
    if (!sortColumn) {
      return holdings;
    }

    const sorted = [...holdings].sort((a, b) => {
      const symA = normalizeSymbol(a.symbol);
      const symB = normalizeSymbol(b.symbol);

      let compareValue = 0;

      switch (sortColumn) {
        case "symbol":
          compareValue = symA.localeCompare(symB);
          break;

        case "shares":
          compareValue = Number(a.shares) - Number(b.shares);
          break;

        case "price": {
          const priceA = typeof prices?.[symA] === "object"
            ? Number(prices[symA]?.price ?? 0)
            : Number(prices?.[symA] ?? 0);
          const priceB = typeof prices?.[symB] === "object"
            ? Number(prices[symB]?.price ?? 0)
            : Number(prices?.[symB] ?? 0);
          compareValue = priceA - priceB;
          break;
        }

        case "change": {
          const getChange = (sym) => {
            const rawEntry = prices?.[sym];
            let priceNumber = 0;
            let prevClose = null;
            let changePercent = null;

            if (typeof rawEntry === "object" && rawEntry !== null) {
              priceNumber = Number(rawEntry.price ?? 0);
              prevClose = Number(rawEntry.prevClose ?? NaN);
              changePercent = rawEntry.changePercent ?? null;
            } else {
              priceNumber = Number(rawEntry ?? 0);
              prevClose = Number(prices?.[`${sym}-prevClose`] ?? NaN);
            }

            if (changePercent !== null && Number.isFinite(changePercent)) {
              return changePercent;
            }
            if (prevClose && Number.isFinite(prevClose)) {
              return ((priceNumber - prevClose) / prevClose) * 100;
            }
            return 0;
          };

          compareValue = getChange(symA) - getChange(symB);
          break;
        }

        case "value": {
          const priceA = typeof prices?.[symA] === "object"
            ? Number(prices[symA]?.price ?? 0)
            : Number(prices?.[symA] ?? 0);
          const priceB = typeof prices?.[symB] === "object"
            ? Number(prices[symB]?.price ?? 0)
            : Number(prices?.[symB] ?? 0);
          const valueA = priceA * Number(a.shares);
          const valueB = priceB * Number(b.shares);
          compareValue = valueA - valueB;
          break;
        }

        default:
          compareValue = 0;
      }

      return sortDirection === "asc" ? compareValue : -compareValue;
    });

    return sorted;
  };

  if (!holdings.length) {
    return (
      <div className="empty" role="status">
        <p>No holdings yet.</p>
        <p className="helper">Add your first symbol above to start tracking.</p>
      </div>
    );
  }

  function renderRow(holding) {
    const sym = normalizeSymbol(holding.symbol);
    const sharesNumber = Number(holding.shares);
    const hasShares = Number.isFinite(sharesNumber);
    const formattedShares = hasShares
      ? sharesNumber.toLocaleString("en-US", {
          minimumFractionDigits: Number.isInteger(sharesNumber) ? 0 : 2,
          maximumFractionDigits: 4,
        })
      : "--";

    // Price extraction - support both shapes: { SYMBOL: number } or { SYMBOL: { price, prevClose, changePercent } }
    const rawEntry = prices ? prices[sym] : undefined;
    let priceNumber = 0;
    let prevClose = null;
    let changePercent = null;

    if (rawEntry === undefined) {
      // fallback to keyed prev-close style (e.g. prices["AAPL-prevClose"]) or numeric mapping
      priceNumber = Number(prices?.[sym] ?? 0);
      prevClose = Number(prices?.[`${sym}-prevClose`] ?? NaN);
      if (!Number.isFinite(prevClose)) prevClose = null;
    } else if (typeof rawEntry === "number") {
      priceNumber = Number(rawEntry);
      prevClose = Number(prices?.[`${sym}-prevClose`] ?? NaN);
      if (!Number.isFinite(prevClose)) prevClose = null;
    } else if (typeof rawEntry === "object" && rawEntry !== null) {
      priceNumber = Number(rawEntry.price ?? rawEntry.currentPrice ?? 0);
      prevClose = Number(rawEntry.prevClose ?? rawEntry.previousClose ?? NaN);
      if (!Number.isFinite(prevClose)) prevClose = null;
      changePercent = rawEntry.changePercent ?? null;
    }

    const hasPrice = Number.isFinite(priceNumber) && priceNumber !== 0;
    const showDash = priceNumber === 0 && errorActive;
    const formattedPrice = hasPrice
      ? currencyFormatter.format(priceNumber)
      : showDash
      ? DASH
      : "--";

    const valueNumber =
      hasPrice && hasShares ? priceNumber * sharesNumber : NaN;
    const formattedValue =
      Number.isFinite(valueNumber) && !showDash
        ? currencyFormatter.format(valueNumber)
        : showDash
        ? DASH
        : "--";

    // Use changePercent from API if available, otherwise calculate from prevClose
    const dailyChangePct = changePercent !== null && Number.isFinite(changePercent)
      ? changePercent
      : prevClose
      ? ((priceNumber - prevClose) / prevClose) * 100
      : null;
    const formattedChange =
      dailyChangePct !== null ? (
        <span
          className={`change-value ${
            dailyChangePct >= 0 ? "positive" : "negative"
          }`}
        >
          {(dailyChangePct > 0 ? "+" : "") + dailyChangePct.toFixed(2)}%
        </span>
      ) : showDash ? (
        DASH
      ) : (
        "--"
      );

    const isSelected =
      normalizeSymbol(selectedSymbol) === sym && sym.length > 0;

    return (
      <tr
        key={sym}
        className={isSelected ? "is-selected" : ""}
        onClick={() => onSelect(sym)}
        aria-selected={isSelected}
      >
        <td>{sym}</td>
        <td data-align="right">{formattedShares}</td>
        <td data-align="right">{formattedPrice}</td>
        <td data-align="right">{formattedChange}</td>
        <td data-align="right">{formattedValue}</td>
        <td data-align="right">
          <button
            type="button"
            className="btn btn--icon"
            aria-label={`Remove ${sym}`}
            onClick={(event) => {
              event.stopPropagation();
              onRemove(sym);
            }}
          >
            &times;
          </button>
        </td>
      </tr>
    );
  }

  const sortedHoldings = getSortedHoldings();

  const renderSortIndicator = (column) => {
    if (sortColumn !== column) return null;
    return sortDirection === "asc" ? " ↑" : " ↓";
  };

  return (
    <div className="table-wrapper fade-in">
      <table className="table" aria-label="Holdings table">
        <thead>
          <tr>
            <th
              scope="col"
              onClick={() => handleHeaderClick("symbol")}
              style={{ cursor: "pointer", userSelect: "none" }}
              title="Click to sort by Symbol"
            >
              Symbol{renderSortIndicator("symbol")}
            </th>
            <th
              scope="col"
              onClick={() => handleHeaderClick("shares")}
              style={{ cursor: "pointer", userSelect: "none" }}
              title="Click to sort by Shares"
            >
              Shares{renderSortIndicator("shares")}
            </th>
            <th
              scope="col"
              onClick={() => handleHeaderClick("price")}
              style={{ cursor: "pointer", userSelect: "none" }}
              title="Click to sort by Price"
            >
              Price{renderSortIndicator("price")}
            </th>
            <th
              scope="col"
              onClick={() => handleHeaderClick("change")}
              style={{ cursor: "pointer", userSelect: "none" }}
              title="Click to sort by Today's Change"
            >
              Today's Change{renderSortIndicator("change")}
            </th>
            <th
              scope="col"
              onClick={() => handleHeaderClick("value")}
              style={{ cursor: "pointer", userSelect: "none" }}
              title="Click to sort by Value"
            >
              Value{renderSortIndicator("value")}
            </th>
            <th scope="col">
              <span className="sr-only">Remove holding</span>
            </th>
          </tr>
        </thead>
        <tbody>{sortedHoldings.map(renderRow)}</tbody>
      </table>
    </div>
  );
}
