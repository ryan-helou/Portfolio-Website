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

  return (
    <div className="table-wrapper fade-in">
      <table className="table" aria-label="Holdings table">
        <thead>
          <tr>
            <th scope="col">Symbol</th>
            <th scope="col">Shares</th>
            <th scope="col">Price</th>
            <th scope="col">Today's Change</th>
            <th scope="col">Value</th>
            <th scope="col">
              <span className="sr-only">Remove holding</span>
            </th>
          </tr>
        </thead>
        <tbody>{holdings.map(renderRow)}</tbody>
      </table>
    </div>
  );
}
