import { useState, useEffect } from "react";
import { Plus, X, Check, CheckCircle, Trash2, Filter } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "/api";
const authH = () => {
  const t = localStorage.getItem("auth_token");
  return { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) };
};

interface Collection {
  id: string; billing_id: string; collection_date: string;
  c_code: string; username: string; customer_name: string; mobile: string;
  received_amount: number; vat: number; discount: number; balance_due: number;
  payment_method: string | null; note: string | null;
  received_by: string | null; approved_by: string | null;
  transaction_status: string; amount: number; billing_month: string;
}
interface CollectionStats { totalReceived: number; totalDiscount: number; totalDue: number; totalCount: number; }
interface Invoice { id: string; invoice_number: string; customer: string; customer_name: string; amount: number; balance_due: number; }

const PAYMENT_METHODS = ["Cash", "bKash", "Nagad", "Bank Transfer", "Rocket", "Card", "Other"];

const STATUS_COLOR: Record<string, string> = {
  pending:  "bg-orange-100 text-orange-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

export function Collections() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [stats, setStats]             = useState<CollectionStats | null>(null);
  const [invoices, setInvoices]       = useState<Invoice[]>([]);
  const [loading, setLoading]         = useState(true);
  const [date, setDate]               = useState(new Date().toISOString().slice(0, 10));
  const [showForm, setShowForm]       = useState(false);
  const [msg, setMsg]                 = useState("");
  const [formErr, setFormErr]         = useState("");

  const emptyForm = {
    billing_id: "", received_amount: "", vat: "0", discount: "0",
    payment_method: "", note: "", received_by: "", collection_date: new Date().toISOString().slice(0, 10),
  };
  const [form, setForm] = useState(emptyForm);

  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const load = async () => {
    setLoading(true);
    const [cols, st, inv] = await Promise.all([
      fetch(`${API}/billing/collections?date=${date}`, { headers: authH() }).then(r => r.json()),
      fetch(`${API}/billing/collections/stats?date=${date}`, { headers: authH() }).then(r => r.json()),
      fetch(`${API}/billing?status=pending`, { headers: authH() }).then(r => r.json()),
    ]);
    setCollections(Array.isArray(cols) ? cols : []);
    setStats(st?.totalReceived !== undefined ? st : null);
    setInvoices(Array.isArray(inv) ? inv : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [date]);

  const handleCreate = async () => {
    setFormErr("");
    if (!form.billing_id || !form.received_amount) { setFormErr("Invoice and received amount are required"); return; }
    const res = await fetch(`${API}/billing/collections`, {
      method: "POST", headers: authH(),
      body: JSON.stringify({
        ...form,
        received_amount: Number(form.received_amount),
        vat: Number(form.vat),
        discount: Number(form.discount),
      }),
    });
    if (!res.ok) { const d = await res.json(); setFormErr(d.error || "Failed"); return; }
    setForm(emptyForm); setShowForm(false); showMsg("Collection recorded"); load();
  };

  const handleApprove = async (id: string) => {
    await fetch(`${API}/billing/collections/${id}/approve`, { method: "POST", headers: authH() });
    showMsg("Approved"); load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this collection record?")) return;
    await fetch(`${API}/billing/collections/${id}`, { method: "DELETE", headers: authH() });
    showMsg("Deleted"); load();
  };

  const inp = "px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500";

  const selectedInvoice = invoices.find(i => i.id === form.billing_id);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Daily Bill Collections</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track daily payment collections</p>
        </div>
        <button onClick={() => setShowForm(p => !p)}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} />{showForm ? "Hide Form" : "Receive Bill"}
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Collections",      value: stats.totalCount,                                  color: "bg-violet-500" },
            { label: "Total Received",   value: `৳${Number(stats.totalReceived||0).toLocaleString()}`, color: "bg-emerald-500" },
            { label: "Total Discount",   value: `৳${Number(stats.totalDiscount||0).toLocaleString()}`, color: "bg-blue-500" },
            { label: "Total Due",        value: `৳${Number(stats.totalDue||0).toLocaleString()}`,       color: "bg-orange-500" },
          ].map(s => (
            <div key={s.label} className={`${s.color} rounded-xl p-4 text-white`}>
              <p className="text-white/80 text-xs">{s.label}</p>
              <p className="text-xl font-bold mt-1">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {msg && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm">{msg}</div>}

      {/* Receive Bill Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Receive Bill</h2>
            <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="sm:col-span-2 lg:col-span-2">
              <label className="block text-xs text-gray-600 mb-1">Select Invoice *</label>
              <select value={form.billing_id} onChange={e => setForm(f => ({ ...f, billing_id: e.target.value }))} className={inp + " w-full"}>
                <option value="">Choose pending invoice…</option>
                {invoices.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.invoice_number} — {i.customer}{i.customer_name ? ` (${i.customer_name})` : ""} — ৳{Number(i.amount).toLocaleString()}
                  </option>
                ))}
              </select>
              {selectedInvoice && (
                <p className="text-xs text-gray-500 mt-1">Balance due: ৳{Number(selectedInvoice.balance_due).toLocaleString()}</p>
              )}
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Collection Date</label>
              <input type="date" value={form.collection_date} onChange={e => setForm(f => ({ ...f, collection_date: e.target.value }))} className={inp + " w-full"} />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Received Amount (৳) *</label>
              <input type="number" min="0" step="0.01" value={form.received_amount} onChange={e => setForm(f => ({ ...f, received_amount: e.target.value }))} className={inp + " w-full"} />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">VAT (৳)</label>
              <input type="number" min="0" step="0.01" value={form.vat} onChange={e => setForm(f => ({ ...f, vat: e.target.value }))} className={inp + " w-full"} />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Discount (৳)</label>
              <input type="number" min="0" step="0.01" value={form.discount} onChange={e => setForm(f => ({ ...f, discount: e.target.value }))} className={inp + " w-full"} />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Payment Method</label>
              <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))} className={inp + " w-full"}>
                <option value="">Select…</option>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Received By</label>
              <input value={form.received_by} onChange={e => setForm(f => ({ ...f, received_by: e.target.value }))} placeholder="Staff name" className={inp + " w-full"} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-600 mb-1">Note / Remarks</label>
              <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Optional note" className={inp + " w-full"} />
            </div>
          </div>
          {formErr && <p className="text-sm text-red-600">{formErr}</p>}
          <div className="flex gap-2">
            <button onClick={handleCreate} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium">Save Collection</button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium">Cancel</button>
          </div>
        </div>
      )}

      {/* Date Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap gap-3 items-center">
        <Filter size={15} className="text-gray-400" />
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        <span className="text-xs text-gray-400 ml-auto">{collections.length} records</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 text-white">
                {["Date","C.Code","Username","Cus. Name","Mobile","Note","M.Bill","Received","VAT","Discount","Balance","Method","Received By","Approved By","Status","Actions"].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {collections.map(col => (
                <tr key={col.id} className="hover:bg-gray-50">
                  <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">{col.collection_date ? new Date(col.collection_date).toLocaleDateString() : "—"}</td>
                  <td className="px-3 py-3 text-xs text-gray-500 font-mono">{col.c_code || "—"}</td>
                  <td className="px-3 py-3 font-medium text-gray-900 text-xs">{col.username}</td>
                  <td className="px-3 py-3 text-gray-700 text-xs">{col.customer_name || "—"}</td>
                  <td className="px-3 py-3 text-gray-500 text-xs">{col.mobile || "—"}</td>
                  <td className="px-3 py-3 text-gray-500 text-xs max-w-32 truncate">{col.note || "—"}</td>
                  <td className="px-3 py-3 font-semibold text-gray-900 text-xs">৳{Number(col.amount||0).toLocaleString()}</td>
                  <td className="px-3 py-3 text-emerald-600 font-medium text-xs">৳{Number(col.received_amount||0).toLocaleString()}</td>
                  <td className="px-3 py-3 text-gray-600 text-xs">৳{Number(col.vat||0).toLocaleString()}</td>
                  <td className="px-3 py-3 text-blue-600 text-xs">৳{Number(col.discount||0).toLocaleString()}</td>
                  <td className="px-3 py-3 text-red-600 font-medium text-xs">৳{Number(col.balance_due||0).toLocaleString()}</td>
                  <td className="px-3 py-3 text-gray-600 text-xs">{col.payment_method || "—"}</td>
                  <td className="px-3 py-3 text-gray-600 text-xs">{col.received_by || "—"}</td>
                  <td className="px-3 py-3 text-gray-600 text-xs">{col.approved_by || "—"}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[col.transaction_status] || "bg-gray-100 text-gray-600"}`}>
                      {col.transaction_status === "approved" && <CheckCircle size={10} />}
                      {col.transaction_status}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      {col.transaction_status !== "approved" && (
                        <button onClick={() => handleApprove(col.id)} className="p-1 hover:bg-green-100 rounded" title="Approve">
                          <Check size={14} className="text-green-600" />
                        </button>
                      )}
                      <button onClick={() => handleDelete(col.id)} className="p-1 hover:bg-red-100 rounded" title="Delete">
                        <Trash2 size={14} className="text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <div className="text-center py-12 text-gray-400">Loading collections…</div>}
        {!loading && collections.length === 0 && <div className="text-center py-12 text-gray-400">No collections for this date</div>}
      </div>
    </div>
  );
}
