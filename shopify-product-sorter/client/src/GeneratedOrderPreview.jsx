import { formatMoney } from "./utils/format.js";

/**
 * GeneratedOrderPreview — the rendered preview of a backend-generated order.
 *
 * Pure presentational component: owns no API calls and no Shopify writes. All
 * state (preview, manual reorder, stale/mismatch flags, score expansion) is
 * owned by the Sorter parent and passed down.
 */
export default function GeneratedOrderPreview({
  preview,
  previewTop,
  isManualOrderModified,
  previewStale,
  isStrategyMismatched,
  strategyUsed,
  expandedScoreIds,
  onToggleScore,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onMoveUp,
  onMoveDown,
  onResetToGenerated,
  onClear,
  fallbackImage,
}) {
  if (!preview.newOrder || preview.newOrder.length === 0) {
    return null;
  }

  return (
    <section className="panel preview-panel" aria-label="Generated order preview">
      <div className="preview-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3>Generated Order Preview</h3>
          <p className="preview-note">Preview only — no changes are written to Shopify until you Apply.</p>
          <div style={{ marginTop: "6px", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{
              padding: "4px 8px",
              borderRadius: "4px",
              fontSize: "12px",
              fontWeight: "bold",
              background: isManualOrderModified ? "#fff3cd" : "#d1e7dd",
              color: isManualOrderModified ? "#664d03" : "#0f5132",
            }}>
              {isManualOrderModified ? "MANUALLY ADJUSTED" : "GENERATED ORDER"}
            </span>
            {previewStale && (
              <span style={{
                padding: "4px 8px",
                borderRadius: "4px",
                fontSize: "12px",
                fontWeight: "bold",
                background: "var(--danger)",
                color: "#fff",
              }}>
                STALE — Generated using previous strategy
              </span>
            )}
            {isStrategyMismatched && (
              <span style={{
                padding: "4px 8px",
                borderRadius: "4px",
                fontSize: "12px",
                fontWeight: "bold",
                background: "var(--danger)",
                color: "#fff",
              }}>
                STRATEGY MISMATCH: Generated order used a different strategy than the currently saved strategy.
              </span>
            )}
            {strategyUsed && (
              <span style={{
                padding: "4px 10px",
                borderRadius: "4px",
                fontSize: "11px",
                background: "#e8f0fe",
                color: "#1a3c8c",
                border: "1px solid #b6caf7",
                lineHeight: "1.5",
              }}>
                <strong>GENERATED USING</strong>{" "}
                {strategyUsed.preset || "Custom"} · {strategyUsed.source === "collection" ? "Collection Override" : "Global"} · v{strategyUsed.version}
                {strategyUsed.weights && (
                  <span style={{ marginLeft: "8px", fontFamily: "monospace", fontSize: "10px" }}>
                    S{Math.round(strategyUsed.weights.salesWeight * 100)}%
                    {" "}R{Math.round(strategyUsed.weights.revenueWeight * 100)}%
                    {" "}I{Math.round(strategyUsed.weights.inventoryWeight * 100)}%
                    {" "}N{Math.round(strategyUsed.weights.newnessWeight * 100)}%
                    {" "}M{Math.round(strategyUsed.weights.momentumWeight * 100)}%
                    {" "}Rot{Math.round(strategyUsed.weights.rotationWeight * 100)}%
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {isManualOrderModified && (
            <button
              type="button"
              className="button ghost compact"
              onClick={onResetToGenerated}
            >
              Reset to Generated Order
            </button>
          )}
          <button
            type="button"
            className="button ghost compact"
            onClick={onClear}
          >
            Clear Preview
          </button>
        </div>
      </div>
      <div className="preview-list">
        {previewTop.map((product, index) => {
          const newPosition = index + 1;
          const recommendedPosition = preview.newOrder.findIndex(p => p.id === product.id) + 1;
          const moved = product.collectionPosition !== newPosition;
          const score = Number.isFinite(product.finalScore) ? (product.finalScore * 100).toFixed(1) : null;
          return (
            <div
              className="preview-item"
              key={product.id}
              draggable
              onDragStart={(e) => onDragStart(e, index)}
              onDragOver={(e) => onDragOver(e, index)}
              onDrop={(e) => onDrop(e, index)}
              onDragEnd={onDragEnd}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "10px",
                borderBottom: "1px solid rgba(0,0,0,0.05)",
                cursor: "grab",
              }}
            >
              <span className="preview-rank" style={{ minWidth: "24px", fontWeight: "bold" }}>{index + 1}</span>
              <img
                src={product.imageUrl || product.image || fallbackImage}
                alt={product.title}
                style={{ width: "40px", height: "40px", objectFit: "cover", borderRadius: "4px", flexShrink: 0 }}
                onError={(e) => {
                  if (e.target.src !== fallbackImage) {
                    e.target.src = fallbackImage;
                  }
                }}
              />
              <div className="preview-item-main" style={{ flexGrow: 1, minWidth: 0 }}>
                <strong>{product.title}</strong>
                {/* Raw business metrics — always factual, not normalized scores */}
                <div style={{ fontSize: "11px", color: "#666", marginTop: "2px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {product.rawMetrics?.recentRevenue > 0 && (
                    <span>{formatMoney(product.rawMetrics.recentRevenue)} revenue (90d)</span>
                  )}
                  {product.rawMetrics?.recentUnits > 0 && (
                    <span>{product.rawMetrics.recentUnits} units (30d)</span>
                  )}
                  {product.scoreRank && (
                    <span>Score Rank #{product.scoreRank}/{preview.newOrder.length}</span>
                  )}
                  {product.rawMetrics?.ageDays !== null && product.rawMetrics?.ageDays <= 30 && (
                    <span style={{ color: "#0f7d3a", fontWeight: "bold" }}>
                      New ({product.rawMetrics.ageDays}d old)
                    </span>
                  )}
                </div>
                <div className="preview-movement-row">
                  <span className="position-tag">Shopify: {product.collectionPosition}</span>
                  {isManualOrderModified && (
                    <span className="position-tag">Rec: {recommendedPosition}</span>
                  )}
                  <span className="position-tag arrow">→</span>
                  <span className="position-tag new">Preview: {newPosition}</span>
                  {moved ? (
                    <span className={`movement-tag ${product.collectionPosition > newPosition ? "up" : "down"}`}>
                      {product.collectionPosition > newPosition ? "↑" : "↓"} {Math.abs(product.collectionPosition - newPosition)}
                    </span>
                  ) : null}
                  {newPosition !== recommendedPosition && !isManualOrderModified ? null : (
                    newPosition !== (preview.newOrder.findIndex(p => p.id === product.id) + 1) ? (
                      <span style={{ fontSize: "11px", color: "#664d03", background: "#fff3cd", padding: "1px 5px", borderRadius: "3px" }}>
                        MANUALLY ADJUSTED
                      </span>
                    ) : null
                  )}
                  {score !== null ? (
                    <button
                      className="score-tag button ghost compact"
                      style={{ border: "none", padding: "0 4px", fontSize: "12px", background: "none", textDecoration: "underline", cursor: "pointer" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleScore(product.id);
                      }}
                    >
                      Score: {score}
                    </button>
                  ) : null}
                  {/* Placement reason — WHY IS IT IN THIS POSITION */}
                  {product.primaryReason ? (
                    <span className="reason-tag" title="Placement reason: why this product is in this position">{product.primaryReason}</span>
                  ) : null}
                </div>
                {expandedScoreIds[product.id] && score !== null && product.components && (
                  <div className="score-explanation-details" style={{ padding: "8px", background: "rgba(0,0,0,0.03)", borderRadius: "4px", marginTop: "8px", fontSize: "12px" }}>
                    <div style={{ fontWeight: "bold", marginBottom: "4px" }}>Score Breakdown</div>
                    {/* Separate: WHY IT SCORED THIS WAY vs WHY IT IS IN THIS POSITION */}
                    {product.placementType && product.placementType !== "score" && (
                      <div style={{ marginBottom: "6px", padding: "4px 6px", background: "#e8f5e9", borderRadius: "3px", color: "#1b5e20" }}>
                        <strong>Position reason:</strong> {product.primaryReason}
                        {product.scoreRank && (
                          <span style={{ marginLeft: "6px", color: "#555" }}>
                            (Score Rank: #{product.scoreRank}/{preview.newOrder.length})
                          </span>
                        )}
                      </div>
                    )}
                    <div style={{ fontWeight: "bold", fontSize: "11px", color: "#555", marginBottom: "2px" }}>Top score drivers:</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "2px 8px", marginTop: "2px" }}>
                      <div style={{ color: "#888", fontSize: "10px" }}>Factor</div>
                      <div style={{ color: "#888", fontSize: "10px" }}>Norm. Score</div>
                      <div style={{ color: "#888", fontSize: "10px" }}>Contribution</div>
                      <div>Sales Velocity</div><div>{(product.components?.sales?.normalizedScore * 100).toFixed(0)}%</div><div>+{(product.components?.sales?.contribution * 100).toFixed(1)}</div>
                      <div>Revenue</div><div>{(product.components?.revenue?.normalizedScore * 100).toFixed(0)}%</div><div>+{(product.components?.revenue?.contribution * 100).toFixed(1)}</div>
                      <div>Inventory</div><div>{(product.components?.inventory?.normalizedScore * 100).toFixed(0)}%</div><div>+{(product.components?.inventory?.contribution * 100).toFixed(1)}</div>
                      <div>Newness</div><div>{(product.components?.newness?.normalizedScore * 100).toFixed(0)}%</div><div>+{(product.components?.newness?.contribution * 100).toFixed(1)}</div>
                      <div>Momentum</div><div>{(product.components?.momentum?.normalizedScore * 100).toFixed(0)}%</div><div>+{(product.components?.momentum?.contribution * 100).toFixed(1)}</div>
                      <div>Rotation</div><div>{(product.components?.rotation?.normalizedScore * 100).toFixed(0)}%</div><div>+{(product.components?.rotation?.contribution * 100).toFixed(1)}</div>
                    </div>
                    {/* Raw metrics for reference */}
                    {product.rawMetrics && (
                      <div style={{ marginTop: "6px", borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: "4px", color: "#555" }}>
                        Revenue (90d): {formatMoney(product.rawMetrics.recentRevenue)} ·
                        Units sold (30d): {product.rawMetrics.recentUnits} ·
                        Inventory: {product.rawMetrics.inventory} units
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="manual-reorder-controls" style={{ display: "flex", gap: "4px", marginLeft: "auto", flexShrink: 0 }}>
                <button
                  type="button"
                  className="button ghost compact"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveUp(index);
                  }}
                  disabled={index === 0}
                  title="Move Up"
                >
                  ▲
                </button>
                <button
                  type="button"
                  className="button ghost compact"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveDown(index);
                  }}
                  disabled={index >= previewTop.length - 1}
                  title="Move Down"
                >
                  ▼
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
