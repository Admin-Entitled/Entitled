import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./deliveryApi";

const today = new Date().toISOString().slice(0, 10);
const sixtyDaysAgo = new Date(Date.now() - 59 * 86400000).toISOString().slice(0, 10);
const label = (value) => value.replaceAll("_", " ").replace(/\b\w/g, (x) => x.toUpperCase());
const ist = (value) => value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(value)) : "—";

function ManualModal({ order, close, done }) {
  const [resolution, setResolution] = useState(order.resolution === "NOT_DELIVERED" ? "NOT_DELIVERED" : "DELIVERED");
  const [note, setNote] = useState(order.manual_note || ""); const [saving, setSaving] = useState(false);
  async function save() { setSaving(true); try { await api.manual(order.id, resolution, note); done(); } finally { setSaving(false); } }
  return <div className="modal-backdrop" role="presentation"><form className="modal" onSubmit={(event) => { event.preventDefault(); save(); }}>
    <h2>{order.resolution_source === "MANUAL" ? "Edit manual resolution" : "Resolve order"}</h2>
    <label><input type="radio" checked={resolution === "DELIVERED"} onChange={() => setResolution("DELIVERED")} /> Delivered</label>
    <label><input type="radio" checked={resolution === "NOT_DELIVERED"} onChange={() => setResolution("NOT_DELIVERED")} /> Not Delivered</label>
    <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional note" maxLength="1000" />
    <div className="actions"><button type="button" onClick={close}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button></div>
  </form></div>;
}

export default function App() {
  const [range, setRange] = useState({ start: sixtyDaysAgo, end: today }); const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState(""); const [data, setData] = useState({ orders: [], summary: {}, total: 0, page: 1 });
  const [loading, setLoading] = useState(true); const [message, setMessage] = useState(""); const [modal, setModal] = useState(null); const [csv, setCsv] = useState(null); const [mapping, setMapping] = useState(null);
  const load = useCallback(async (page = 1) => { setLoading(true); try { setData(await api.orders({ filter, search, page })); } catch (error) { setMessage(error.message); } finally { setLoading(false); } }, [filter, search]);
  useEffect(() => { load(); }, [load]);
  const cards = useMemo(() => [["Total Orders", data.total], ["Delivered", data.summary.DELIVERED || 0], ["Not Delivered", data.summary.NOT_DELIVERED || 0], ["Unresolved", data.summary.UNRESOLVED || 0]], [data]);
  async function sync() { setLoading(true); setMessage(""); try { const result = await api.sync(range); setMessage(`Synced ${result.summary.shopifyOrders} Shopify orders; ${result.summary.matched} Shiprocket matches.${result.summary.warning ? ` ${result.summary.warning}` : ""}`); await load(); } catch (error) { setMessage(error.message); setLoading(false); } }
  async function upload(selectedMapping) { if (!csv) return; try { const result = await api.upload(csv, selectedMapping); setMapping(null); setCsv(null); setMessage(`CSV: ${result.result.ordersMatched} matched, ${result.result.delivered} delivered, ${result.result.notDelivered} not delivered.`); load(); } catch (error) { if (error.needsMapping) setMapping({ columns: error.columns }); else setMessage(error.message); } }
  return <main><header><div><p>SHOPIFY UTILITY</p><h1>Delivery Resolution</h1></div></header>
    <section className="controls"><label>From<input type="date" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} max={range.end} /></label><label>To<input type="date" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} min={range.start} max={today} /></label><button className="primary" onClick={sync} disabled={loading}>Sync Orders</button><label className="upload">Upload Legacy CSV<input type="file" accept=".csv,text/csv" onChange={(e) => { setCsv(e.target.files[0]); setMapping(null); }} /></label><button onClick={() => upload()} disabled={!csv}>Import CSV</button><input className="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order or AWB" /></section>
    {mapping && <section className="mapping"><strong>Map the CSV columns</strong>{["orderNumber", "awb", "status", "deliveredAt"].map((key) => <label key={key}>{label(key)}<select id={key}><option value="">Not available</option>{mapping.columns.map((column) => <option key={column}>{column}</option>)}</select></label>)}<button className="primary" onClick={() => upload(Object.fromEntries(["orderNumber", "awb", "status", "deliveredAt"].map((key) => [key, document.getElementById(key).value])))}>Apply mapping</button></section>}
    {message && <p className="notice">{message}</p>}<section className="cards">{cards.map(([name, value]) => <article key={name}><small>{name}</small><strong>{value}</strong></article>)}</section>
    <nav>{["ALL", "DELIVERED", "NOT_DELIVERED", "UNRESOLVED"].map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{label(item)}</button>)}</nav>
    <section className="table-wrap">{loading ? <p>Loading orders…</p> : !data.orders.length ? <p>No orders found for this view.</p> : <table><thead><tr>{["Order", "Order Date", "Customer", "AWB", "Raw Status", "Resolution", "Source", "Updated", "Action"].map((name) => <th key={name}>{name}</th>)}</tr></thead><tbody>{data.orders.map((order) => <tr key={order.id} className={order.resolution === "UNRESOLVED" ? "unresolved" : ""}><td>{order.shopify_order_name}</td><td>{ist(order.order_created_at)}</td><td>{order.customer_name || "—"}</td><td>{order.awb || "—"}</td><td>{order.logistics_raw_status || "No matching shipment"}</td><td><span className={`badge ${order.resolution.toLowerCase()}`}>{label(order.resolution)}</span></td><td>{label(order.resolution_source)}</td><td>{ist(order.updated_at)}</td><td>{order.resolution_source === "MANUAL" ? <><button onClick={() => setModal(order)}>Edit</button><button onClick={async () => { await api.reset(order.id); load(); }}>Reset</button></> : <button onClick={() => setModal(order)}>Resolve</button>}</td></tr>)}</tbody></table>}</section>
    {data.total > data.pageSize && <footer><button disabled={data.page <= 1} onClick={() => load(data.page - 1)}>Previous</button><span>Page {data.page}</span><button disabled={data.page * data.pageSize >= data.total} onClick={() => load(data.page + 1)}>Next</button></footer>}
    {modal && <ManualModal order={modal} close={() => setModal(null)} done={() => { setModal(null); load(); }} />}</main>;
}
