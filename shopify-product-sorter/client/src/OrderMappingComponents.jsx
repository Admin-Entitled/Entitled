import { formatCurrency, formatDateTime, formatText } from "./utils/format.js";
import {
  getEmail,
  getOrderLabel,
  getOrderStatusDisplay,
  getSubtitle,
} from "./orderMappingView.js";

/**
 * Order Mapping presentational components (OrderCard, MetricCard, OrderTable).
 *
 * Pure render helpers: no API calls, no state. Status presentation reuses the
 * canonical view mapping from orderMappingView.js (backend-normalized states).
 */

export function OrderCard({ order }) {
  const email = getEmail(order);
  const status = getOrderStatusDisplay(order);

  return (
    <article className="order-mapping-card">
      <div className="order-mapping-card-title">
        <strong>{getOrderLabel(order)}</strong>
        <span>{formatDateTime(order.order_date)}</span>
      </div>

      <dl className="order-mapping-card-grid">
        <div>
          <dt>Customer</dt>
          <dd>{formatText(order.customer_name)}</dd>
        </div>
        {email ? (
          <div>
            <dt>Email</dt>
            <dd>{email}</dd>
          </div>
        ) : null}
        <div>
          <dt>Created</dt>
          <dd>{formatDateTime(order.order_date)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{status.label}</dd>
        </div>
        <div>
          <dt>Amount</dt>
          <dd>{formatCurrency(order.order_amount)}</dd>
        </div>
        <div>
          <dt>Details</dt>
          <dd>{status.detail}</dd>
        </div>
      </dl>
    </article>
  );
}

export function MetricCard({ label, value, detail, tone = "default" }) {
  return (
    <article className={`order-mapping-metric-card order-mapping-metric-card--${tone}`}>
      <span className="order-mapping-metric-label">{label}</span>
      <strong className="order-mapping-metric-value">{value}</strong>
      {detail ? <span className="order-mapping-metric-detail">{detail}</span> : null}
    </article>
  );
}

export function OrderTable({ orders }) {
  return (
    <div className="order-mapping-table-wrap">
      <table className="order-mapping-table">
        <thead>
          <tr>
            <th scope="col">Order</th>
            <th scope="col">Customer</th>
            <th scope="col">Created</th>
            <th scope="col">Status</th>
            <th scope="col">Amount</th>
            <th scope="col">Details</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const status = getOrderStatusDisplay(order);

            return (
              <tr key={order.id}>
                <td className="order-mapping-cell order-mapping-cell--order">
                  <div className="order-mapping-primary">{getOrderLabel(order)}</div>
                  <div className="order-mapping-secondary">{getSubtitle(order)}</div>
                </td>
                <td className="order-mapping-cell">
                  <div className="order-mapping-primary">{formatText(order.customer_name)}</div>
                </td>
                <td className="order-mapping-cell">{formatDateTime(order.order_date)}</td>
                <td className="order-mapping-cell">
                  <span className={`order-mapping-pill order-mapping-pill--${status.tone}`}>
                    {status.label}
                  </span>
                </td>
                <td className="order-mapping-cell">{formatCurrency(order.order_amount)}</td>
                <td className="order-mapping-cell">{status.detail}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
