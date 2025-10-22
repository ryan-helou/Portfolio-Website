const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const signedCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "always",
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "always",
});

export default function MetricsBar({ value, change }) {
  const isPositive = change >= 0;
  const formattedValue = currencyFormatter.format(value);
  const formattedChange = signedCurrencyFormatter.format(change);
  const percentChange = value !== 0 ? change / value : 0;
  const formattedPercent = percentFormatter.format(percentChange);
  const deltaClass = `kpi__delta ${isPositive ? "kpi__delta--up" : "kpi__delta--down"}`;
  const caret = isPositive ? "▲" : "▼";

  return (
    <div className="metrics-grid">
      <article className="kpi" role="status" aria-live="polite">
        <span className="kpi__label">Portfolio Value</span>
        <span className="kpi__value">{formattedValue}</span>
        <span className={deltaClass}>
          <span aria-hidden="true">{caret}</span>
          <span>{formattedChange}</span>
        </span>
      </article>

      <article className="kpi" role="status" aria-live="polite">
        <span className="kpi__label">Today&apos;s Change</span>
        <span className="kpi__value">{formattedChange}</span>
        <span className={deltaClass}>
          <span aria-hidden="true">{caret}</span>
          <span>{formattedPercent}</span>
        </span>
      </article>
    </div>
  );
}
