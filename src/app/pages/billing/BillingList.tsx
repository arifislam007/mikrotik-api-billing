import { useState, useEffect, useCallback } from "react";
import { Plus, X, CheckCircle, Clock, AlertCircle, Filter, Zap, List, RefreshCw } from "lucide-react";

const API = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:8080/api" : "/api");
const authH = () => {
  const t = localStorage.getItem("auth_token");
  return { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) };
};

interface Invoice {
  id: string; invoice_number: string; customer: string; customer_name: string;
  billing_month: string; amount: number; received_amount: number; vat: number;
  discount: number; balance_due: number; advance: number;
  status: string; due_date: string | null; paid_date: string | null; payment_method: string | null;
  received_by: string | null; created_at: string;
}
interface BillStats { paidClients: number; unpaidClients: number; receivedBill: number; dueAmount: number; generatedBill: number; advanceAmount: number; }
interface Client { id: string; username: string; full_name: string; }

interface BillingClient {
  id: string; username: string; full_name: string; mobile: string;
  monthly_bill: number; billing_status: string; status: string;
  zone_name: string | null; package_name: string | null;
  invoice_id: string | null; invoice_number: string | null;
  amount: number | null; received_amount: number | null; balance_due: number | null;
  vat: number | null; discount: number | null;
  invoice_status: string | null; payment_method: string | null; paid_date: string | null;
}

interface QuickPayForm { amount: string; payment_method: string; received_by: string; vat: string; discount: string; note: string; }

const PAYMENT_METHODS = ["Cash", "bKash", "Nagad", "Bank Transfer", "Rocket", "Card", "Other"];
const STATUS_COLOR: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  pending: "bg-orange-100 text-orange-700",
  overdue: "bg-red-100 text-red-700",
};

const emptyQuickPay: QuickPayForm = { amount: "", payment_method: "Cash", received_by: "", vat: "0", discount: "0", note: "" };

export function BillingList() {
  const [tab, setTab] = useState<"dashboard" | "invoices">("dashboard");

  // --- Generate bills state ---
  const [generating, setGenerating] = useState(false);

  // --- Dashboard state ---
  const [billingClients, setBillingClients] = useState<BillingClient[]>([]);
  const [dashLoading, setDashLoading] = useState(true);
  const [dashMonth, setDashMonth] = useState(new Date().toISOString().slice(0, 7));
  const [quickPayId, setQuickPayId] = useState<string | null>(null);
  const [quickPayForm, setQuickPayForm] = useState<QuickPayForm>(emptyQuickPay);
  const [quickPayErr, setQuickPayErr] = useState("");
  const [quickPayLoading, setQuickPayLoading] = useState(false);
  const [dashSearch, setDashSearch] = useState("");
  const [dashFilter, setDashFilter] = useState<"all" | "unpaid" | "paid">("all");

  // --- Invoice list state ---
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [stats, setStats] = useState<BillStats | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [invLoading, setInvLoading] = useState(true);
  const [filter, setFilter] = useState({ month: new Date().toISOString().slice(0, 7), status: "" });
  const [showForm, setShowForm] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState("");
  const [msg, setMsg] = useState("");
  const emptyForm = { user_id: "", amount: "", billing_month: new Date().toISOString().slice(0, 7), due_date: "", vat: "0", discount: "0", note: "", received_by: "" };
  const [form, setForm] = useState(emptyForm);
  const [formErr, setFormErr] = useState("");

  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`${API}/billing/generate`, {
        method: "POST",
        headers: authH(),
        body: JSON.stringify({ month: dashMonth }),
      });
      const data = await res.json();
      if (!res.ok) { showMsg(`Error: ${data.error}`); }
      else { showMsg(`Generated ${data.created} invoice(s) for ${data.month} (${data.skipped} already existed)`); }
      loadDashboard();
      loadInvoices();
    } catch { showMsg("Network error"); }
    setGenerating(false);
  };

  // Load billing dashboard clients
  const loadDashboard = useCallback(async () => {
    setDashLoading(true);
    try {
      const data = await fetch(`${API}/billing/clients?month=${dashMonth}`, { headers: authH() }).then(r => r.json());
      setBillingClients(Array.isArray(data) ? data : []);
    } catch { setBillingClients([]); }
    setDashLoading(false);
  }, [dashMonth]);

  // Load invoices tab
  const loadInvoices = useCallback(async () => {
    setInvLoading(true);
    const params = new URLSearchParams();
    if (filter.month) params.set("month", filter.month);
    if (filter.status) params.set("status", filter.status);
    const [inv, st, cl] = await Promise.all([
      fetch(`${API}/billing?${params}`, { headers: authH() }).then(r => r.json()),
      fetch(`${API}/billing/stats?month=${filter.month}`, { headers: authH() }).then(r => r.json()),
      fetch(`${API}/clients`, { headers: authH() }).then(r => r.json()),
    ]);
    setInvoices(Array.isArray(inv) ? inv : []);
    setStats(st);
    setClients(Array.isArray(cl) ? cl : []);
    setInvLoading(false);
  }, [filter.month, filter.status]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  // Quick-pay open
  const openQuickPay = (c: BillingClient) => {
    setQuickPayId(c.id);
    setQuickPayErr("");
    setQuickPayForm({ ...emptyQuickPay, amount: String(c.monthly_bill || "") });
  };

  const handleQuickPay = async (userId: string) => {
    setQuickPayErr("");
    if (!quickPayForm.amount) { setQuickPayErr("Amount is required"); return; }
    if (!quickPayForm.payment_method) { setQuickPayErr("Payment method is required"); return; }
    setQuickPayLoading(true);
    try {
      const res = await fetch(`${API}/billing/quick-pay`, {
        method: "POST",
        headers: authH(),
        body: JSON.stringify({
          user_id: userId,
          month: dashMonth,
          amount: Number(quickPayForm.amount),
          payment_method: quickPayForm.payment_method,
          received_by: quickPayForm.received_by || null,
          vat: Number(quickPayForm.vat) || 0,
          discount: Number(quickPayForm.discount) || 0,
          note: quickPayForm.note || null,
        }),
      });
      if (!res.ok) { const d = await res.json(); setQuickPayErr(d.error || "Payment failed"); setQuickPayLoading(false); return; }
      setQuickPayId(null);
      showMsg("Payment recorded successfully");
      loadDashboard();
    } catch { setQuickPayErr("Network error"); }
    setQuickPayLoading(false);
  };

  const handleCreate = async () => {
    setFormErr("");
    if (!form.user_id || !form.amount) { setFormErr("Client and amount are required"); return; }
    const res = await fetch(`${API}/billing`, { method: "POST", headers: authH(), body: JSON.stringify({ ...form, amount: Number(form.amount), vat: Number(form.vat), discount: Number(form.discount) }) });
    if (!res.ok) { const d = await res.json(); setFormErr(d.error || "Failed"); return; }
    setForm(emptyForm); setShowForm(false); showMsg("Invoice created"); loadInvoices();
  };

  const handlePay = async (id: string) => {
    if (!payMethod) return;
    const now = new Date().toISOString().split("T")[0];
    await fetch(`${API}/billing/${id}`, { method: "PUT", headers: authH(), body: JSON.stringify({ status: "paid", paid_date: now, payment_method: payMethod, received_amount: invoices.find(i => i.id === id)?.amount }) });
    setPayingId(null); setPayMethod(""); showMsg("Marked as paid"); loadInvoices();
  };

  const inp = "px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500";

  // Dashboard filtered clients
  const filteredClients = billingClients.filter(c => {
    const matchSearch = !dashSearch || c.username.toLowerCase().includes(dashSearch.toLowerCase()) || (c.full_name || "").toLowerCase().includes(dashSearch.toLowerCase());
    const matchFilter = dashFilter === "all" || (dashFilter === "paid" && c.invoice_status === "paid") || (dashFilter === "unpaid" && c.invoice_status !== "paid");
    return matchSearch && matchFilter;
  });

  const dashStats = {
    total: billingClients.length,
    paid: billingClients.filter(c => c.invoice_status === "paid").length,
    unpaid: billingClients.filter(c => c.invoice_status !== "paid").length,
    collected: billingClients.filter(c => c.invoice_status === "paid").reduce((s, c) => s + Number(c.received_amount || 0), 0),
    due: billingClients.filter(c => c.invoice_status !== "paid").reduce((s, c) => s + Number(c.monthly_bill || 0), 0),
  };

  const statCards = stats ? [
    { label: "Paid Clients", value: stats.paidClients, color: "bg-emerald-500" },
    { label: "Unpaid Clients", value: stats.unpaidClients, color: "bg-red-500" },
    { label: "Received Bill", value: `৳${stats.receivedBill.toLocaleString()}`, color: "bg-blue-500" },
    { label: "Due Amount", value: `৳${stats.dueAmount.toLocaleString()}`, color: "bg-orange-500" },
    { label: "Generated Bills", value: stats.generatedBill, color: "bg-violet-500" },
    { label: "Advance Amount", value: `৳${stats.advanceAmount.toLocaleString()}`, color: "bg-cyan-500" },
  ] : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
          <p className="text-sm text-gray-500 mt-0.5">Monthly billing management</p>
        </div>
        {tab === "invoices" && (
          <button onClick={() => setShowForm(p => !p)}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} />{showForm ? "Hide Form" : "New Invoice"}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button onClick={() => setTab("dashboard")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === "dashboard" ? "bg-white text-cyan-700 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}>
          <Zap size={14} /> Billing Dashboard
        </button>
        <button onClick={() => setTab("invoices")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === "invoices" ? "bg-white text-cyan-700 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}>
          <List size={14} /> Invoice List
        </button>
      </div>

      {msg && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm">{msg}</div>}

      {/* ===== BILLING DASHBOARD TAB ===== */}
      {tab === "dashboard" && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap gap-3 items-center">
            <input type="month" value={dashMonth} onChange={e => setDashMonth(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
            <input type="text" placeholder="Search username or name…" value={dashSearch} onChange={e => setDashSearch(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 w-52" />
            <div className="flex gap-1">
              {(["all", "unpaid", "paid"] as const).map(f => (
                <button key={f} onClick={() => setDashFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${dashFilter === f ? "bg-cyan-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  {f === "all" ? `All (${dashStats.total})` : f === "unpaid" ? `Unpaid (${dashStats.unpaid})` : `Paid (${dashStats.paid})`}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-gray-400">{filteredClients.length} clients</span>
              <button onClick={handleGenerate} disabled={generating}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white rounded-lg text-xs font-medium transition-colors">
                <RefreshCw size={13} className={generating ? "animate-spin" : ""} />
                {generating ? "Generating…" : "Generate Bills"}
              </button>
            </div>
          </div>

          {/* Summary tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-cyan-500 rounded-xl p-4 text-white"><p className="text-white/80 text-xs">Total Billable</p><p className="text-2xl font-bold mt-1">{dashStats.total}</p></div>
            <div className="bg-emerald-500 rounded-xl p-4 text-white"><p className="text-white/80 text-xs">Paid</p><p className="text-2xl font-bold mt-1">{dashStats.paid}</p></div>
            <div className="bg-red-500 rounded-xl p-4 text-white"><p className="text-white/80 text-xs">Unpaid</p><p className="text-2xl font-bold mt-1">{dashStats.unpaid}</p></div>
            <div className="bg-orange-500 rounded-xl p-4 text-white"><p className="text-white/80 text-xs">Outstanding Due</p><p className="text-xl font-bold mt-1">৳{dashStats.due.toLocaleString()}</p></div>
          </div>

          {/* Client table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    {["#", "Username", "Name", "Zone", "Package", "Monthly Bill", "Invoice Status", "Balance Due", "Quick Pay"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredClients.map((c, i) => (
                    <>
                      <tr key={c.id} className={`hover:bg-gray-50 ${quickPayId === c.id ? "bg-cyan-50" : ""}`}>
                        <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                        <td className="px-4 py-3 font-medium text-gray-900 text-xs">{c.username}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{c.full_name || "—"}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{c.zone_name || "—"}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{c.package_name || "—"}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">৳{Number(c.monthly_bill || 0).toLocaleString()}</td>
                        <td className="px-4 py-3">
                          {c.invoice_status ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[c.invoice_status] || "bg-gray-100 text-gray-600"}`}>
                              {c.invoice_status === "paid" ? <CheckCircle size={10} /> : <Clock size={10} />}
                              {c.invoice_status}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400 italic">No invoice</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {c.invoice_status === "paid"
                            ? <span className="text-emerald-600 font-medium">৳0</span>
                            : <span className="text-red-500 font-medium">৳{Number(c.monthly_bill || 0).toLocaleString()}</span>
                          }
                        </td>
                        <td className="px-4 py-3">
                          {c.invoice_status !== "paid" ? (
                            quickPayId === c.id ? (
                              <button onClick={() => setQuickPayId(null)} className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-xs">Cancel</button>
                            ) : (
                              <button onClick={() => openQuickPay(c)} className="px-3 py-1 bg-cyan-600 hover:bg-cyan-700 text-white rounded text-xs font-medium">Pay Now</button>
                            )
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>

                      {/* Inline quick-pay form */}
                      {quickPayId === c.id && (
                        <tr key={`qp-${c.id}`} className="bg-cyan-50">
                          <td colSpan={9} className="px-4 py-4">
                            <div className="bg-white rounded-lg border border-cyan-200 p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-semibold text-gray-800">Quick Pay — <span className="text-cyan-700">{c.username}</span> ({dashMonth})</p>
                                <button onClick={() => setQuickPayId(null)} className="p-1 hover:bg-gray-100 rounded"><X size={14} /></button>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                                <div>
                                  <label className="text-xs text-gray-500 mb-1 block">Amount (৳) *</label>
                                  <input type="number" min="0" value={quickPayForm.amount}
                                    onChange={e => setQuickPayForm(f => ({ ...f, amount: e.target.value }))}
                                    className={inp} placeholder="Amount" />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-500 mb-1 block">Payment Method *</label>
                                  <select value={quickPayForm.payment_method}
                                    onChange={e => setQuickPayForm(f => ({ ...f, payment_method: e.target.value }))}
                                    className={inp}>
                                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-xs text-gray-500 mb-1 block">Discount (৳)</label>
                                  <input type="number" min="0" value={quickPayForm.discount}
                                    onChange={e => setQuickPayForm(f => ({ ...f, discount: e.target.value }))}
                                    className={inp} placeholder="0" />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-500 mb-1 block">VAT (৳)</label>
                                  <input type="number" min="0" value={quickPayForm.vat}
                                    onChange={e => setQuickPayForm(f => ({ ...f, vat: e.target.value }))}
                                    className={inp} placeholder="0" />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-500 mb-1 block">Received By</label>
                                  <input type="text" value={quickPayForm.received_by}
                                    onChange={e => setQuickPayForm(f => ({ ...f, received_by: e.target.value }))}
                                    className={inp} placeholder="Staff name" />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-500 mb-1 block">Note</label>
                                  <input type="text" value={quickPayForm.note}
                                    onChange={e => setQuickPayForm(f => ({ ...f, note: e.target.value }))}
                                    className={inp} placeholder="Optional" />
                                </div>
                              </div>
                              {quickPayErr && <p className="text-xs text-red-600">{quickPayErr}</p>}
                              <div className="flex gap-2">
                                <button onClick={() => handleQuickPay(c.id)} disabled={quickPayLoading}
                                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-300 text-white rounded-lg text-sm font-medium">
                                  {quickPayLoading ? "Processing…" : "Confirm Payment"}
                                </button>
                                <button onClick={() => setQuickPayId(null)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm">Cancel</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
            {dashLoading && <div className="text-center py-12 text-gray-400">Loading billing clients…</div>}
            {!dashLoading && filteredClients.length === 0 && <div className="text-center py-12 text-gray-400">No billable clients found</div>}
          </div>
        </div>
      )}

      {/* ===== INVOICE LIST TAB ===== */}
      {tab === "invoices" && (
        <div className="space-y-4">
          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {statCards.map(s => (
                <div key={s.label} className={`${s.color} rounded-xl p-4 text-white`}>
                  <p className="text-white/80 text-xs">{s.label}</p>
                  <p className="text-xl font-bold mt-1">{s.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Create Invoice Form */}
          {showForm && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-800">New Invoice</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded"><X size={16} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <select value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} className={inp}>
                  <option value="">Select Client *</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.username}{c.full_name ? ` — ${c.full_name}` : ""}</option>)}
                </select>
                <input type="number" min="0" step="0.01" placeholder="Amount (৳) *" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className={inp} />
                <input type="month" value={form.billing_month} onChange={e => setForm(f => ({ ...f, billing_month: e.target.value }))} className={inp} />
                <input type="date" placeholder="Due Date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className={inp} />
                <input type="number" min="0" step="0.01" placeholder="VAT" value={form.vat} onChange={e => setForm(f => ({ ...f, vat: e.target.value }))} className={inp} />
                <input type="number" min="0" step="0.01" placeholder="Discount" value={form.discount} onChange={e => setForm(f => ({ ...f, discount: e.target.value }))} className={inp} />
                <input placeholder="Received By" value={form.received_by} onChange={e => setForm(f => ({ ...f, received_by: e.target.value }))} className={inp} />
                <input placeholder="Note / Remarks" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} className={inp} />
              </div>
              {formErr && <p className="text-sm text-red-600">{formErr}</p>}
              <div className="flex gap-2">
                <button onClick={handleCreate} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium">Create Invoice</button>
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium">Cancel</button>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap gap-3 items-center">
            <Filter size={15} className="text-gray-400" />
            <input type="month" value={filter.month} onChange={e => setFilter(f => ({ ...f, month: e.target.value }))} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
            <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
              <option value="">All Status</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
            </select>
            <span className="text-xs text-gray-400 ml-auto">{invoices.length} invoices</span>
          </div>

          {/* Invoice Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    {["Invoice #", "Client", "Month", "Amount", "Received", "VAT", "Discount", "Balance Due", "Due Date", "Paid Date", "Method", "Status", "Actions"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoices.map(inv => (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{inv.invoice_number}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 text-xs">{inv.customer}</div>
                        {inv.customer_name && <div className="text-gray-500 text-xs">{inv.customer_name}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{inv.billing_month || "—"}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">৳{Number(inv.amount).toLocaleString()}</td>
                      <td className="px-4 py-3 text-emerald-600 font-medium">৳{Number(inv.received_amount || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">৳{Number(inv.vat || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-blue-600 text-xs">৳{Number(inv.discount || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-red-600 font-medium text-xs">৳{Number(inv.balance_due || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "—"}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{inv.paid_date ? new Date(inv.paid_date).toLocaleDateString() : "—"}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{inv.payment_method || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[inv.status] || "bg-gray-100 text-gray-600"}`}>
                          {inv.status === "paid" ? <CheckCircle size={10} /> : inv.status === "overdue" ? <AlertCircle size={10} /> : <Clock size={10} />}
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {inv.status !== "paid" && (
                          payingId === inv.id ? (
                            <div className="flex items-center gap-1">
                              <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500">
                                <option value="">Method…</option>
                                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                              </select>
                              <button onClick={() => handlePay(inv.id)} disabled={!payMethod} className="px-2 py-0.5 bg-cyan-600 text-white rounded text-xs disabled:bg-cyan-300">Pay</button>
                              <button onClick={() => { setPayingId(null); setPayMethod(""); }} className="p-0.5 hover:bg-gray-100 rounded"><X size={12} /></button>
                            </div>
                          ) : (
                            <button onClick={() => setPayingId(inv.id)} className="px-2 py-1 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 rounded text-xs font-medium">Mark Paid</button>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {invLoading && <div className="text-center py-12 text-gray-400">Loading invoices…</div>}
            {!invLoading && invoices.length === 0 && <div className="text-center py-12 text-gray-400">No invoices for this period</div>}
          </div>
        </div>
      )}
    </div>
  );
}
