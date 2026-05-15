import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Package, Plus, Loader2, AlertTriangle, ArrowDownLeft, ArrowUpRight,
  IndianRupee, BarChart3, ShoppingCart, Truck, Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  getStockItems, createStockItem, getStockSummary, getReorderAlerts,
  createStockMovement, getOrders, createOrder,
} from "../../api/inventory";

const TABS = ["items", "movements", "orders", "alerts"];
const TAB_LABELS = { items: "Stock Items", movements: "Stock In/Out", orders: "Purchase / Sales Orders", alerts: "Reorder Alerts" };
const fmt = (v) => `₹${(v || 0).toLocaleString("en-IN")}`;

export default function InventoryPage() {
  const [tab, setTab] = useState("items");
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showMovement, setShowMovement] = useState(false);
  const [showOrder, setShowOrder] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [s, a] = await Promise.all([getStockSummary(), getReorderAlerts()]);
      setItems(s.data.items || []);
      setSummary(s.data);
      setAlerts(a.data.alerts || []);
    } catch { toast.error("Failed to load"); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (tab === "orders") getOrders().then(r => setOrders(r.data.orders || [])).catch(() => {}); }, [tab]);

  const handleAddItem = async (data) => {
    try { await createStockItem(data); toast.success("Item added"); setShowAdd(false); load(); }
    catch { toast.error("Failed"); }
  };

  const handleMovement = async (data) => {
    try { await createStockMovement(data); toast.success("Stock updated"); setShowMovement(false); load(); }
    catch { toast.error("Failed"); }
  };

  const handleOrder = async (data) => {
    try { await createOrder(data); toast.success("Order created"); setShowOrder(false); getOrders().then(r => setOrders(r.data.orders || [])); }
    catch { toast.error("Failed"); }
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", paddingBottom: 40 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", margin: 0 }}>Inventory</h1>
          <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 2 }}>Stock management, purchase & sales orders</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {tab === "items" && <button onClick={() => setShowAdd(true)} className="btn-primary" style={{ gap: 6, fontSize: 13 }}><Plus size={14} /> Add Item</button>}
          {tab === "items" && <button onClick={() => setShowMovement(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", fontSize: 13, color: "var(--text-2)", cursor: "pointer", fontWeight: 600 }}><ArrowDownLeft size={14} /> Stock In/Out</button>}
          {tab === "orders" && <button onClick={() => setShowOrder(true)} className="btn-primary" style={{ gap: 6, fontSize: 13 }}><Plus size={14} /> New Order</button>}
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
          {[
            { label: "Total Items", value: summary.totalItems, icon: Package, color: "#3b82f6" },
            { label: "Stock Value", value: fmt(summary.totalValue), icon: IndianRupee, color: "#22c55e" },
            { label: "Low Stock", value: summary.lowStock, icon: AlertTriangle, color: "#f59e0b" },
            { label: "Out of Stock", value: summary.outOfStock, icon: Package, color: "#ef4444" },
          ].map((c, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>{c.label}</span>
                <div style={{ width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: `${c.color}15` }}>
                  <c.icon size={13} style={{ color: c.color }} />
                </div>
              </div>
              <p style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", margin: 0 }}>{c.value}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border)" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", background: "none", border: "none",
            borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
            color: tab === t ? "var(--accent)" : "var(--text-3)",
          }}>{TAB_LABELS[t]}{t === "alerts" && alerts.length > 0 ? ` (${alerts.length})` : ""}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Loader2 size={24} style={{ color: "var(--accent)", animation: "spin 0.8s linear infinite" }} /></div>
      ) : (
        <>
          {tab === "items" && (
            <>
              {showAdd && <AddItemForm onSubmit={handleAddItem} onCancel={() => setShowAdd(false)} />}
              {showMovement && <MovementForm items={items} onSubmit={handleMovement} onCancel={() => setShowMovement(false)} />}
              <ItemList items={items} />
            </>
          )}
          {tab === "orders" && (
            <>
              {showOrder && <OrderForm items={items} onSubmit={handleOrder} onCancel={() => setShowOrder(false)} />}
              <OrderList orders={orders} />
            </>
          )}
          {tab === "alerts" && <AlertList alerts={alerts} />}
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ItemList({ items }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((item, i) => {
        const isLow = item.reorderLevel > 0 && item.currentQty <= item.reorderLevel;
        return (
          <motion.div key={item._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
            className="card" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, borderLeft: isLow ? "3px solid #f59e0b" : undefined }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(59,130,246,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Package size={16} style={{ color: "#3b82f6" }} />
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{item.name}</span>
              {item.sku && <span style={{ fontSize: 10, color: "var(--text-3)", marginLeft: 8 }}>SKU: {item.sku}</span>}
              {item.hsnCode && <span style={{ fontSize: 10, color: "var(--text-3)", marginLeft: 8 }}>HSN: {item.hsnCode}</span>}
            </div>
            <div style={{ textAlign: "center", minWidth: 60 }}>
              <p style={{ fontSize: 16, fontWeight: 800, color: isLow ? "#f59e0b" : "var(--text)", margin: 0 }}>{item.currentQty}</p>
              <p style={{ fontSize: 9, color: "var(--text-3)", margin: 0 }}>{item.unit}</p>
            </div>
            <div style={{ textAlign: "right", minWidth: 80 }}>
              <p style={{ fontSize: 12, color: "var(--text)", margin: 0 }}>Buy: {fmt(item.purchaseRate)}</p>
              <p style={{ fontSize: 12, color: "#22c55e", margin: 0 }}>Sell: {fmt(item.sellingRate)}</p>
            </div>
            <span style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600 }}>GST {item.taxPercent}%</span>
          </motion.div>
        );
      })}
      {items.length === 0 && <p style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>No stock items. Add your first item to get started.</p>}
    </div>
  );
}

function AlertList({ alerts }) {
  return alerts.length === 0 ? (
    <p style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>🎉 No reorder alerts. All stock levels are healthy!</p>
  ) : (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {alerts.map(a => (
        <div key={a._id} className="card" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, borderLeft: "3px solid #f59e0b" }}>
          <AlertTriangle size={16} style={{ color: "#f59e0b" }} />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{a.name}</span>
          <span style={{ fontSize: 12, color: "#ef4444", fontWeight: 700 }}>Qty: {a.currentQty}</span>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>Reorder at: {a.reorderLevel}</span>
        </div>
      ))}
    </div>
  );
}

function OrderList({ orders }) {
  const statusColors = { draft: "#94a3b8", confirmed: "#3b82f6", partially_delivered: "#f59e0b", delivered: "#22c55e", cancelled: "#ef4444" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {orders.map(o => (
        <div key={o._id} className="card" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          {o.type === "purchase" ? <Truck size={16} style={{ color: "#f97316" }} /> : <ShoppingCart size={16} style={{ color: "#3b82f6" }} />}
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{o.orderNumber}</span>
            <p style={{ fontSize: 11, color: "var(--text-3)", margin: "2px 0 0" }}>{o.partyName || "—"}</p>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, textTransform: "uppercase", background: `${statusColors[o.status]}15`, color: statusColors[o.status] }}>{o.status}</span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, textTransform: "uppercase", background: o.type === "purchase" ? "rgba(249,115,22,0.1)" : "rgba(59,130,246,0.1)", color: o.type === "purchase" ? "#f97316" : "#3b82f6" }}>{o.type}</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text)" }}>{fmt(o.grandTotal)}</span>
        </div>
      ))}
      {orders.length === 0 && <p style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>No orders yet.</p>}
    </div>
  );
}

function AddItemForm({ onSubmit, onCancel }) {
  const [f, setF] = useState({ name: "", sku: "", hsnCode: "", unit: "pcs", purchaseRate: 0, sellingRate: 0, taxPercent: 18, openingQty: 0, reorderLevel: 0 });
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const inp = { background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "var(--text)", outline: "none" };
  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <h4 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>New Stock Item</h4>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
        <input placeholder="Name *" value={f.name} onChange={e => u("name", e.target.value)} autoFocus style={inp} />
        <input placeholder="SKU" value={f.sku} onChange={e => u("sku", e.target.value)} style={inp} />
        <input placeholder="HSN Code" value={f.hsnCode} onChange={e => u("hsnCode", e.target.value)} style={inp} />
        <input placeholder="Purchase Rate ₹" type="number" value={f.purchaseRate} onChange={e => u("purchaseRate", Number(e.target.value))} style={inp} />
        <input placeholder="Selling Rate ₹" type="number" value={f.sellingRate} onChange={e => u("sellingRate", Number(e.target.value))} style={inp} />
        <input placeholder="GST %" type="number" value={f.taxPercent} onChange={e => u("taxPercent", Number(e.target.value))} style={inp} />
        <input placeholder="Opening Qty" type="number" value={f.openingQty} onChange={e => u("openingQty", Number(e.target.value))} style={inp} />
        <input placeholder="Reorder Level" type="number" value={f.reorderLevel} onChange={e => u("reorderLevel", Number(e.target.value))} style={inp} />
        <select value={f.unit} onChange={e => u("unit", e.target.value)} style={inp}>
          {["pcs", "kg", "ltr", "box", "pack", "mtr", "nos"].map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 16px", fontSize: 12, color: "var(--text-3)", cursor: "pointer" }}>Cancel</button>
        <button onClick={() => f.name && onSubmit(f)} className="btn-primary" style={{ fontSize: 12 }}>Add Item</button>
      </div>
    </div>
  );
}

function MovementForm({ items, onSubmit, onCancel }) {
  const [stockItemId, setStockItemId] = useState(items[0]?._id || "");
  const [type, setType] = useState("in");
  const [quantity, setQuantity] = useState(1);
  const [rate, setRate] = useState(0);
  const [narration, setNarration] = useState("");
  const inp = { background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "var(--text)", outline: "none" };
  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <h4 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Stock Movement</h4>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
        <select value={stockItemId} onChange={e => setStockItemId(e.target.value)} style={inp}>
          {items.map(i => <option key={i._id} value={i._id}>{i.name} (Qty: {i.currentQty})</option>)}
        </select>
        <select value={type} onChange={e => setType(e.target.value)} style={inp}>
          <option value="in">Stock In</option><option value="out">Stock Out</option><option value="adjustment">Adjustment</option><option value="return">Return</option>
        </select>
        <input type="number" placeholder="Qty" value={quantity} onChange={e => setQuantity(Number(e.target.value))} style={inp} />
        <input type="number" placeholder="Rate ₹" value={rate} onChange={e => setRate(Number(e.target.value))} style={inp} />
      </div>
      <input placeholder="Narration" value={narration} onChange={e => setNarration(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box", marginBottom: 10 }} />
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 16px", fontSize: 12, color: "var(--text-3)", cursor: "pointer" }}>Cancel</button>
        <button onClick={() => onSubmit({ stockItemId, type, quantity, rate, narration })} className="btn-primary" style={{ fontSize: 12 }}>Record</button>
      </div>
    </div>
  );
}

function OrderForm({ items, onSubmit, onCancel }) {
  const [type, setType] = useState("purchase");
  const [partyName, setPartyName] = useState("");
  const [orderItems, setOrderItems] = useState([{ stockItemId: items[0]?._id || "", name: items[0]?.name || "", quantity: 1, rate: 0, taxPercent: 18 }]);
  const inp = { background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", fontSize: 12, color: "var(--text)", outline: "none" };

  const addLine = () => setOrderItems([...orderItems, { stockItemId: "", name: "", quantity: 1, rate: 0, taxPercent: 18 }]);
  const updateLine = (i, k, v) => { const n = [...orderItems]; n[i] = { ...n[i], [k]: v }; if (k === "stockItemId") { const it = items.find(x => x._id === v); n[i].name = it?.name || ""; n[i].rate = type === "purchase" ? (it?.purchaseRate || 0) : (it?.sellingRate || 0); } setOrderItems(n); };

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <h4 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>New Order</h4>
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <select value={type} onChange={e => setType(e.target.value)} style={inp}><option value="purchase">Purchase Order</option><option value="sales">Sales Order</option></select>
        <input placeholder="Party Name" value={partyName} onChange={e => setPartyName(e.target.value)} style={{ ...inp, flex: 1 }} />
      </div>
      {orderItems.map((item, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 0.7fr 1fr 0.7fr", gap: 8, marginBottom: 8 }}>
          <select value={item.stockItemId} onChange={e => updateLine(i, "stockItemId", e.target.value)} style={inp}>
            <option value="">Select item</option>{items.map(x => <option key={x._id} value={x._id}>{x.name}</option>)}
          </select>
          <input type="number" placeholder="Qty" value={item.quantity} onChange={e => updateLine(i, "quantity", Number(e.target.value))} style={inp} />
          <input type="number" placeholder="Rate ₹" value={item.rate} onChange={e => updateLine(i, "rate", Number(e.target.value))} style={inp} />
          <input type="number" placeholder="GST %" value={item.taxPercent} onChange={e => updateLine(i, "taxPercent", Number(e.target.value))} style={inp} />
        </div>
      ))}
      <button onClick={addLine} style={{ background: "none", border: "1px dashed var(--border)", borderRadius: 8, padding: "5px 12px", fontSize: 11, color: "var(--text-3)", cursor: "pointer", marginBottom: 12 }}>+ Add Line</button>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 16px", fontSize: 12, color: "var(--text-3)", cursor: "pointer" }}>Cancel</button>
        <button onClick={() => onSubmit({ type, partyName, items: orderItems })} className="btn-primary" style={{ fontSize: 12 }}>Create Order</button>
      </div>
    </div>
  );
}
