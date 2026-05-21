import { useState, useEffect, useCallback } from "react";
import { Plus, X, CheckCircle, Clock, AlertCircle, Filter, Zap, List, RefreshCw,
         History, Power, PowerOff, Printer, Package, RotateCcw } from "lucide-react";
import { fmtDate } from "../../utils/fmt";

const API = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:8080/api" : "/api");
const authH = () => {
  const t = localStorage.getItem("auth_token");
  return { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) };
};

interface Invoice {
  id: string; invoice_number: string; customer: string; customer_name: string;
  billing_month: string; amount: number; received_amount: number; vat: number;
  discount: number; discount_reason: string | null; balance_due: number; advance: number;
  status: string; due_date: string | null; paid_date: string | null; payment_method: string | null;
  received_by: string | null; is_withdrawn: boolean; created_at: string;
}
interface BillStats { paidClients: number; unpaidClients: number; receivedBill: number; dueAmount: number; generatedBill: number; advanceAmount: number; }
interface Client { id: string; username: string; full_name: string; }
interface IspPackage { id: string; name: string; monthly_bill: number; }
interface MtProfile { name: string; rate_limit?: string; }

interface BillingClient {
  id: string; username: string; full_name: string; mobile: string;
  monthly_bill: number; billing_status: string; status: string;
  zone_name: string | null; package_name: string | null; package_id: string | null;
  server_id: string | null;
  invoice_id: string | null; invoice_number: string | null;
  amount: number | null; received_amount: number | null; balance_due: number | null;
  vat: number | null; discount: number | null;
  invoice_status: string | null; payment_method: string | null; paid_date: string | null;
}

interface QuickPayForm { amount: string; payment_method: string; received_by: string; vat: string; discount: string; discount_reason: string; note: string; }

const PAYMENT_METHODS = ["Cash", "bKash", "Nagad", "Bank Transfer", "Rocket", "Card", "Other"];
const STATUS_COLOR: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  pending: "bg-orange-100 text-orange-700",
  overdue: "bg-red-100 text-red-700",
};
const emptyQuickPay: QuickPayForm = { amount: "", payment_method: "Cash", received_by: "", vat: "0", discount: "0", discount_reason: "", note: "" };

// ── Invoice Print Template ──────────────────────────────────────
function printInvoice(inv: Invoice, client: { username: string; full_name?: string | null }) {
  const html = `
    <html><head><title>Invoice ${inv.invoice_number}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 40px; color: #111; }
      h1 { font-size: 22px; margin-bottom: 4px; }
      .sub { color: #555; font-size: 13px; margin-bottom: 24px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      td, th { padding: 8px 12px; border: 1px solid #ddd; font-size: 13px; }
      th { background: #f0f0f0; text-align: left; }
      .total { font-weight: bold; font-size: 15px; }
      .badge { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 12px;
               background: ${inv.status === 'paid' ? '#d1fae5' : '#fee2e2'}; color: ${inv.status === 'paid' ? '#065f46' : '#991b1b'}; }
      @media print { body { margin: 20px; } }
    </style></head><body>
    <h1>Invoice</h1>
    <div class="sub">${inv.invoice_number} &nbsp;|&nbsp; ${inv.billing_month}</div>
    <table>
      <tr><th>Client</th><td>${client.username}${client.full_name ? ` — ${client.full_name}` : ''}</td></tr>
      <tr><th>Amount</th><td>৳${Number(inv.amount).toLocaleString()}</td></tr>
      ${Number(inv.vat) > 0 ? `<tr><th>VAT</th><td>৳${Number(inv.vat).toLocaleString()}</td></tr>` : ''}
      ${Number(inv.discount) > 0 ? `<tr><th>Discount</th><td>৳${Number(inv.discount).toLocaleString()}${inv.discount_reason ? ` (${inv.discount_reason})` : ''}</td></tr>` : ''}
      <tr><th>Received</th><td>৳${Number(inv.received_amount || 0).toLocaleString()}</td></tr>
      <tr><th>Balance Due</th><td class="total">৳${Number(inv.balance_due || 0).toLocaleString()}</td></tr>
      <tr><th>Payment Method</th><td>${inv.payment_method || '—'}</td></tr>
      <tr><th>Paid Date</th><td>${fmtDate(inv.paid_date)}</td></tr>
      <tr><th>Status</th><td><span class="badge">${inv.status}</span></td></tr>
      ${inv.received_by ? `<tr><th>Received By</th><td>${inv.received_by}</td></tr>` : ''}
    </table>
    <p style="margin-top:32px;color:#888;font-size:11px;">Printed: ${new Date().toLocaleString()}</p>
    <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}</script>
    </body></html>`;
  const w = window.open('', '_blank', 'width=700,height=600');
  if (w) { w.document.write(html); w.document.close(); }
}

export function BillingList() {
  const [tab, setTab] = useState<"dashboard" | "invoices">("dashboard");

  // --- Generate bills ---
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

  // --- Billing history modal ---
  const [historyClient, setHistoryClient] = useState<BillingClient | null>(null);
  const [historyData, setHistoryData] = useState<Invoice[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [withdrawReason, setWithdrawReason] = useState("");

  // --- Package change modal ---
  const [pkgClient, setPkgClient] = useState<BillingClient | null>(null);
  const [packages, setPackages] = useState<IspPackage[]>([]);
  const [profiles, setProfiles] = useState<MtProfile[]>([]);
  const [pkgForm, setPkgForm] = useState({ package_id: "", profile: "", monthly_bill: "" });
  const [pkgLoading, setPkgLoading] = useState(false);
  const [pkgErr, setPkgErr] = useState("");

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
  const emptyForm = { user_id: "", amount: "", billing_month: new Date().toISOString().slice(0, 7), due_date: "", vat: "0", discount: "0", discount_reason: "", note: "", received_by: "" };
  const [form, setForm] = useState(emptyForm);
  const [formErr, setFormErr] = useState("");

  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };

  // ── Loaders ─────────────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    setDashLoading(true);
    try {
      const data = await fetch(`${API}/billing/clients?month=${dashMonth}`, { headers: authH() }).then(r => r.json());
      setBillingClients(Array.isArray(data) ? data : []);
    } catch { setBillingClients([]); }
    setDashLoading(false);
  }, [dashMonth]);

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

  // ── Generate bills ───────────────────────────────────────────
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`${API}/billing/generate`, { method: "POST", headers: authH(), body: JSON.stringify({ month: dashMonth }) });
      const data = await res.json();
      if (!res.ok) showMsg(`Error: ${data.error}`);
      else showMsg(`Generated ${data.created} invoice(s) for ${data.month} (${data.skipped} already existed)`);
      loadDashboard(); loadInvoices();
    } catch { showMsg("Network error"); }
    setGenerating(false);
  };

  // ── Quick Pay ────────────────────────────────────────────────
  const openQuickPay = (c: BillingClient) => {
    setQuickPayId(c.id);
    setQuickPayErr("");
    setQuickPayForm({ ...emptyQuickPay, amount: String(c.monthly_bill || "") });
  };

  const handleQuickPay = async (userId: string) => {
    setQuickPayErr("");
    if (!quickPayForm.amount) { setQuickPayErr("Amount is required"); return; }
    if (Number(quickPayForm.discount) > 0 && !quickPayForm.discount_reason.trim()) { setQuickPayErr("Discount reason is required"); return; }
    setQuickPayLoading(true);
    try {
      const res = await fetch(`${API}/billing/quick-pay`, {
        method: "POST", headers: authH(),
        body: JSON.stringify({ user_id: userId, month: dashMonth, amount: Number(quickPayForm.amount), payment_method: quickPayForm.payment_method, received_by: quickPayForm.received_by || null, vat: Number(quickPayForm.vat) || 0, discount: Number(quickPayForm.discount) || 0, discount_reason: quickPayForm.discount_reason || null, note: quickPayForm.note || null }),
      });
      if (!res.ok) { const d = await res.json(); setQuickPayErr(d.error || "Payment failed"); setQuickPayLoading(false); return; }
      setQuickPayId(null);
      showMsg("Payment recorded");
      loadDashboard();
    } catch { setQuickPayErr("Network error"); }
    setQuickPayLoading(false);
  };

  // ── Toggle MikroTik disable/enable ───────────────────────────
  const toggleClientStatus = async (c: BillingClient) => {
    const newStatus = c.status === "active" ? "disabled" : "active";
    const newBilling = newStatus === "disabled" ? "suspended" : "active";
    try {
      await fetch(`${API}/clients/${c.id}`, { method: "PUT", headers: authH(), body: JSON.stringify({ status: newStatus, billing_status: newBilling }) });
      showMsg(`${c.username} ${newStatus === "active" ? "enabled" : "disabled"} on MikroTik`);
      loadDashboard();
    } catch { showMsg("Failed to update status"); }
  };

  // ── Billing History ──────────────────────────────────────────
  const openHistory = async (c: BillingClient) => {
    setHistoryClient(c);
    setHistoryData([]);
    setHistoryLoading(true);
    setWithdrawingId(null);
    setWithdrawReason("");
    try {
      const data = await fetch(`${API}/clients/${c.id}/billing-history`, { headers: authH() }).then(r => r.json());
      setHistoryData(Array.isArray(data) ? data : []);
    } catch { setHistoryData([]); }
    setHistoryLoading(false);
  };

  const handleWithdraw = async (invId: string) => {
    if (!withdrawReason.trim()) return;
    try {
      await fetch(`${API}/billing/${invId}/withdraw`, { method: "POST", headers: authH(), body: JSON.stringify({ reason: withdrawReason, withdrawn_by: "admin" }) });
      showMsg("Invoice withdrawn — client is now due");
      setWithdrawingId(null);
      setWithdrawReason("");
      if (historyClient) openHistory(historyClient);
      loadDashboard();
    } catch { showMsg("Withdraw failed"); }
  };

  // ── Package Change ────────────────────────────────────────────
  const openPackageChange = async (c: BillingClient) => {
    setPkgClient(c);
    setPkgErr("");
    setPkgForm({ package_id: c.package_id || "", profile: "", monthly_bill: String(c.monthly_bill || "") });
    if (!packages.length) {
      const data = await fetch(`${API}/config/isp_packages`, { headers: authH() }).then(r => r.json()).catch(() => []);
      setPackages(Array.isArray(data) ? data : []);
    }
    if (c.server_id && !profiles.length) {
      const data = await fetch(`${API}/mikrotik/servers/${c.server_id}/profiles`, { headers: authH() }).then(r => r.json()).catch(() => []);
      setProfiles(Array.isArray(data) ? data : []);
    }
  };

  const handlePackageChange = async () => {
    if (!pkgClient) return;
    setPkgLoading(true); setPkgErr("");
    try {
      const body: Record<string, unknown> = {};
      if (pkgForm.package_id) body.package_id = pkgForm.package_id;
      if (pkgForm.profile) body.profile = pkgForm.profile;
      if (pkgForm.monthly_bill) body.monthly_bill = Number(pkgForm.monthly_bill);
      const res = await fetch(`${API}/clients/${pkgClient.id}`, { method: "PUT", headers: authH(), body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json(); setPkgErr(d.error || "Failed"); setPkgLoading(false); return; }
      showMsg(`Package updated for ${pkgClient.username}`);
      setPkgClient(null);
      loadDashboard();
    } catch { setPkgErr("Network error"); }
    setPkgLoading(false);
  };

  // ── Invoice list handlers ─────────────────────────────────────
  const handleCreate = async () => {
    setFormErr("");
    if (!form.user_id || !form.amount) { setFormErr("Client and amount are required"); return; }
    if (Number(form.discount) > 0 && !form.discount_reason.trim()) { setFormErr("Discount reason is required"); return; }
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

  const filteredClients = billingClients.filter(c => {
    const matchSearch = !dashSearch || c.username.toLowerCase().includes(dashSearch.toLowerCase()) || (c.full_name || "").toLowerCase().includes(dashSearch.toLowerCase());
    const matchFilter = dashFilter === "all" || (dashFilter === "paid" && c.invoice_status === "paid") || (dashFilter === "unpaid" && c.invoice_status !== "paid");
    return matchSearch && matchFilter;
  });

  const dashStats = {
    total: billingClients.length,
    paid: billingClients.filter(c => c.invoice_status === "paid").length,
    unpaid: billingClients.filter(c => c.invoice_status !== "paid").length,
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
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium">
            <Plus size={16} />{showForm ? "Hide Form" : "New Invoice"}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button onClick={() => setTab("dashboard")} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === "dashboard" ? "bg-white text-cyan-700 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}>
          <Zap size={14} /> Billing Dashboard
        </button>
        <button onClick={() => setTab("invoices")} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === "invoices" ? "bg-white text-cyan-700 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}>
          <List size={14} /> Invoice List
        </button>
      </div>

      {msg && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm">{msg}</div>}

      {/* ===== BILLING DASHBOARD TAB ===== */}
      {tab === "dashboard" && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap gap-3 items-center">
            <input type="month" value={dashMonth} onChange={e => setDashMonth(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
            <input type="text" placeholder="Search…" value={dashSearch} onChange={e => setDashSearch(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 w-48" />
            <div className="flex gap-1">
              {(["all", "unpaid", "paid"] as const).map(f => (
                <button key={f} onClick={() => setDashFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${dashFilter === f ? "bg-cyan-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  {f === "all" ? `All (${dashStats.total})` : f === "unpaid" ? `Unpaid (${dashStats.unpaid})` : `Paid (${dashStats.paid})`}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-gray-400">{filteredClients.length} clients</span>
              <button onClick={handleGenerate} disabled={generating} className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white rounded-lg text-xs font-medium">
                <RefreshCw size={13} className={generating ? "animate-spin" : ""} />{generating ? "Generating…" : "Generate Bills"}
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
                    {["#","Username","Name","Zone","Package","M.Bill","Invoice","Balance","Actions"].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredClients.map((c, i) => (
                    <>
                      <tr key={c.id} className={`hover:bg-gray-50 ${quickPayId === c.id ? "bg-cyan-50" : ""}`}>
                        <td className="px-3 py-3 text-gray-400 text-xs">{i + 1}</td>
                        <td className="px-3 py-3 font-medium text-gray-900 text-xs">{c.username}</td>
                        <td className="px-3 py-3 text-gray-600 text-xs">{c.full_name || "—"}</td>
                        <td className="px-3 py-3 text-gray-500 text-xs">{c.zone_name || "—"}</td>
                        <td className="px-3 py-3 text-gray-500 text-xs">{c.package_name || "—"}</td>
                        <td className="px-3 py-3 font-semibold text-gray-900 text-xs">৳{Number(c.monthly_bill || 0).toLocaleString()}</td>
                        <td className="px-3 py-3">
                          {c.invoice_status ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[c.invoice_status] || "bg-gray-100 text-gray-600"}`}>
                              {c.invoice_status === "paid" ? <CheckCircle size={10} /> : <Clock size={10} />}{c.invoice_status}
                            </span>
                          ) : <span className="text-xs text-gray-400 italic">No invoice</span>}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {c.invoice_status === "paid" ? <span className="text-emerald-600 font-medium">৳0</span> : <span className="text-red-500 font-medium">৳{Number(c.monthly_bill || 0).toLocaleString()}</span>}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1 flex-wrap">
                            {c.invoice_status !== "paid" && (
                              quickPayId === c.id
                                ? <button onClick={() => setQuickPayId(null)} className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">Cancel</button>
                                : <button onClick={() => openQuickPay(c)} className="px-2 py-1 bg-cyan-600 hover:bg-cyan-700 text-white rounded text-xs font-medium">Pay</button>
                            )}
                            <button onClick={() => openHistory(c)} className="p-1 hover:bg-gray-100 rounded" title="Billing History"><History size={13} className="text-gray-500" /></button>
                            <button onClick={() => openPackageChange(c)} className="p-1 hover:bg-gray-100 rounded" title="Change Package"><Package size={13} className="text-gray-500" /></button>
                            {c.status === "active"
                              ? <button onClick={() => toggleClientStatus(c)} className="p-1 hover:bg-red-100 rounded" title="Disable on MikroTik"><PowerOff size={13} className="text-red-500" /></button>
                              : <button onClick={() => toggleClientStatus(c)} className="p-1 hover:bg-green-100 rounded" title="Enable on MikroTik"><Power size={13} className="text-green-600" /></button>
                            }
                          </div>
                        </td>
                      </tr>

                      {/* Inline Quick Pay form */}
                      {quickPayId === c.id && (
                        <tr key={`qp-${c.id}`}><td colSpan={9} className="px-4 py-4 bg-cyan-50">
                          <div className="bg-white rounded-lg border border-cyan-200 p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold text-gray-800">Quick Pay — <span className="text-cyan-700">{c.username}</span> ({dashMonth})</p>
                              <button onClick={() => setQuickPayId(null)} className="p-1 hover:bg-gray-100 rounded"><X size={14} /></button>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                              <div><label className="text-xs text-gray-500 mb-1 block">Amount (৳) *</label>
                                <input type="number" min="0" value={quickPayForm.amount} onChange={e => setQuickPayForm(f => ({ ...f, amount: e.target.value }))} className={inp} /></div>
                              <div><label className="text-xs text-gray-500 mb-1 block">Method *</label>
                                <select value={quickPayForm.payment_method} onChange={e => setQuickPayForm(f => ({ ...f, payment_method: e.target.value }))} className={inp}>
                                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                                </select></div>
                              <div><label className="text-xs text-gray-500 mb-1 block">Discount (৳)</label>
                                <input type="number" min="0" value={quickPayForm.discount} onChange={e => setQuickPayForm(f => ({ ...f, discount: e.target.value }))} className={inp} /></div>
                              {Number(quickPayForm.discount) > 0 && (
                                <div className="col-span-2 sm:col-span-1"><label className="text-xs text-red-500 mb-1 block">Discount Reason *</label>
                                  <input value={quickPayForm.discount_reason} onChange={e => setQuickPayForm(f => ({ ...f, discount_reason: e.target.value }))} className={inp} placeholder="Required" /></div>
                              )}
                              <div><label className="text-xs text-gray-500 mb-1 block">VAT (৳)</label>
                                <input type="number" min="0" value={quickPayForm.vat} onChange={e => setQuickPayForm(f => ({ ...f, vat: e.target.value }))} className={inp} /></div>
                              <div><label className="text-xs text-gray-500 mb-1 block">Received By</label>
                                <input value={quickPayForm.received_by} onChange={e => setQuickPayForm(f => ({ ...f, received_by: e.target.value }))} className={inp} /></div>
                              <div><label className="text-xs text-gray-500 mb-1 block">Note</label>
                                <input value={quickPayForm.note} onChange={e => setQuickPayForm(f => ({ ...f, note: e.target.value }))} className={inp} /></div>
                            </div>
                            {quickPayErr && <p className="text-xs text-red-600">{quickPayErr}</p>}
                            <div className="flex gap-2">
                              <button onClick={() => handleQuickPay(c.id)} disabled={quickPayLoading} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-300 text-white rounded-lg text-sm font-medium">
                                {quickPayLoading ? "Processing…" : "Confirm Payment"}
                              </button>
                              <button onClick={() => setQuickPayId(null)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm">Cancel</button>
                            </div>
                          </div>
                        </td></tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
            {dashLoading && <div className="text-center py-12 text-gray-400">Loading…</div>}
            {!dashLoading && filteredClients.length === 0 && <div className="text-center py-12 text-gray-400">No billable clients found</div>}
          </div>
        </div>
      )}

      {/* ===== INVOICE LIST TAB ===== */}
      {tab === "invoices" && (
        <div className="space-y-4">
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
                <input type="number" min="0" placeholder="Amount (৳) *" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className={inp} />
                <input type="month" value={form.billing_month} onChange={e => setForm(f => ({ ...f, billing_month: e.target.value }))} className={inp} />
                <input type="date" placeholder="Due Date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className={inp} />
                <input type="number" min="0" placeholder="VAT" value={form.vat} onChange={e => setForm(f => ({ ...f, vat: e.target.value }))} className={inp} />
                <input type="number" min="0" placeholder="Discount" value={form.discount} onChange={e => setForm(f => ({ ...f, discount: e.target.value }))} className={inp} />
                {Number(form.discount) > 0 && (
                  <input placeholder="Discount Reason *" value={form.discount_reason} onChange={e => setForm(f => ({ ...f, discount_reason: e.target.value }))} className={inp + " border-red-300"} />
                )}
                <input placeholder="Received By" value={form.received_by} onChange={e => setForm(f => ({ ...f, received_by: e.target.value }))} className={inp} />
                <input placeholder="Note" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} className={inp} />
              </div>
              {formErr && <p className="text-sm text-red-600">{formErr}</p>}
              <div className="flex gap-2">
                <button onClick={handleCreate} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium">Create Invoice</button>
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm">Cancel</button>
              </div>
            </div>
          )}

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

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    {["Invoice #","Client","Month","Amount","Received","Discount","Balance","Paid Date","Method","Status","Actions"].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoices.map(inv => (
                    <tr key={inv.id} className={`hover:bg-gray-50 ${inv.is_withdrawn ? "opacity-60 bg-gray-50" : ""}`}>
                      <td className="px-3 py-3 font-mono text-xs text-gray-700">{inv.invoice_number}</td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-gray-900 text-xs">{inv.customer}</div>
                        {inv.customer_name && <div className="text-gray-500 text-xs">{inv.customer_name}</div>}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-600">{inv.billing_month || "—"}</td>
                      <td className="px-3 py-3 font-semibold text-gray-900 text-xs">৳{Number(inv.amount).toLocaleString()}</td>
                      <td className="px-3 py-3 text-emerald-600 font-medium text-xs">৳{Number(inv.received_amount || 0).toLocaleString()}</td>
                      <td className="px-3 py-3 text-xs">
                        {Number(inv.discount) > 0 ? (
                          <span className="text-blue-600" title={inv.discount_reason || ""}>৳{Number(inv.discount).toLocaleString()}</span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-3 text-red-600 font-medium text-xs">৳{Number(inv.balance_due || 0).toLocaleString()}</td>
                      <td className="px-3 py-3 text-gray-500 text-xs">{fmtDate(inv.paid_date)}</td>
                      <td className="px-3 py-3 text-gray-600 text-xs">{inv.payment_method || "—"}</td>
                      <td className="px-3 py-3">
                        {inv.is_withdrawn
                          ? <span className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full text-xs">withdrawn</span>
                          : <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[inv.status] || "bg-gray-100 text-gray-600"}`}>
                              {inv.status === "paid" ? <CheckCircle size={10} /> : inv.status === "overdue" ? <AlertCircle size={10} /> : <Clock size={10} />}
                              {inv.status}
                            </span>}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          {inv.status === "paid" && !inv.is_withdrawn && (
                            <button onClick={() => printInvoice(inv, { username: inv.customer, full_name: inv.customer_name })} className="p-1 hover:bg-gray-100 rounded" title="Print Invoice">
                              <Printer size={13} className="text-gray-600" />
                            </button>
                          )}
                          {inv.status !== "paid" && !inv.is_withdrawn && (
                            payingId === inv.id ? (
                              <div className="flex items-center gap-1">
                                <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none">
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
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {invLoading && <div className="text-center py-12 text-gray-400">Loading…</div>}
            {!invLoading && invoices.length === 0 && <div className="text-center py-12 text-gray-400">No invoices for this period</div>}
          </div>
        </div>
      )}

      {/* ===== BILLING HISTORY MODAL ===== */}
      {historyClient && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto py-6 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Billing History</h2>
                <p className="text-sm text-gray-500">{historyClient.username}{historyClient.full_name ? ` — ${historyClient.full_name}` : ""}</p>
              </div>
              <button onClick={() => setHistoryClient(null)} className="p-2 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="p-4 overflow-x-auto">
              {historyLoading ? (
                <div className="text-center py-12 text-gray-400">Loading…</div>
              ) : historyData.length === 0 ? (
                <div className="text-center py-12 text-gray-400">No billing history</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      {["Invoice #","Month","Amount","Received","Discount","Balance","Status","Paid Date","Method","Actions"].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {historyData.map(inv => (
                      <>
                        <tr key={inv.id} className={`hover:bg-gray-50 ${inv.is_withdrawn ? "opacity-60" : ""}`}>
                          <td className="px-3 py-2 font-mono text-xs text-gray-600">{inv.invoice_number}</td>
                          <td className="px-3 py-2 text-xs text-gray-700">{inv.billing_month}</td>
                          <td className="px-3 py-2 text-xs font-semibold">৳{Number(inv.amount).toLocaleString()}</td>
                          <td className="px-3 py-2 text-xs text-emerald-600">৳{Number(inv.received_amount || 0).toLocaleString()}</td>
                          <td className="px-3 py-2 text-xs text-blue-600">
                            {Number(inv.discount) > 0 ? `৳${Number(inv.discount).toLocaleString()}` : "—"}
                            {inv.discount_reason && <span className="block text-gray-400 text-[10px]">{inv.discount_reason}</span>}
                          </td>
                          <td className="px-3 py-2 text-xs text-red-500 font-medium">৳{Number(inv.balance_due || 0).toLocaleString()}</td>
                          <td className="px-3 py-2">
                            {inv.is_withdrawn
                              ? <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded text-xs">withdrawn</span>
                              : <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLOR[inv.status] || "bg-gray-100 text-gray-600"}`}>{inv.status}</span>}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500">{fmtDate(inv.paid_date)}</td>
                          <td className="px-3 py-2 text-xs text-gray-500">{inv.payment_method || "—"}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1">
                              {inv.status === "paid" && !inv.is_withdrawn && (
                                <>
                                  <button onClick={() => printInvoice(inv, { username: historyClient.username, full_name: historyClient.full_name })} className="p-1 hover:bg-gray-100 rounded" title="Print">
                                    <Printer size={12} className="text-gray-500" />
                                  </button>
                                  {withdrawingId !== inv.id && (
                                    <button onClick={() => { setWithdrawingId(inv.id); setWithdrawReason(""); }} className="p-1 hover:bg-red-100 rounded" title="Withdraw">
                                      <RotateCcw size={12} className="text-red-500" />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                        {withdrawingId === inv.id && (
                          <tr key={`wd-${inv.id}`}><td colSpan={10} className="px-3 py-3 bg-red-50">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-red-700 font-medium">Withdraw reason:</span>
                              <input value={withdrawReason} onChange={e => setWithdrawReason(e.target.value)} placeholder="Enter reason *" className="flex-1 px-2 py-1 border border-red-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-red-400" />
                              <button onClick={() => handleWithdraw(inv.id)} disabled={!withdrawReason.trim()} className="px-3 py-1 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded text-xs font-medium">Confirm</button>
                              <button onClick={() => setWithdrawingId(null)} className="p-1 hover:bg-gray-100 rounded"><X size={12} /></button>
                            </div>
                          </td></tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== PACKAGE CHANGE MODAL ===== */}
      {pkgClient && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Change Package</h2>
                <p className="text-sm text-gray-500">{pkgClient.username} — current: {pkgClient.package_name || "none"}</p>
              </div>
              <button onClick={() => setPkgClient(null)} className="p-2 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">ISP Package</label>
                <select value={pkgForm.package_id} onChange={e => {
                  const pkg = packages.find(p => p.id === e.target.value);
                  setPkgForm(f => ({ ...f, package_id: e.target.value, monthly_bill: pkg ? String(pkg.monthly_bill) : f.monthly_bill, profile: pkg ? pkg.name : f.profile }));
                }} className={inp}>
                  <option value="">Select Package</option>
                  {packages.map(p => <option key={p.id} value={p.id}>{p.name} — ৳{p.monthly_bill}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Bandwidth Profile (MikroTik)</label>
                <select value={pkgForm.profile} onChange={e => setPkgForm(f => ({ ...f, profile: e.target.value }))} className={inp}>
                  <option value="">Select Profile</option>
                  {profiles.map(p => <option key={p.name} value={p.name}>{p.name}{p.rate_limit ? ` (${p.rate_limit})` : ""}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Monthly Bill (৳)</label>
                <input type="number" min="0" value={pkgForm.monthly_bill} onChange={e => setPkgForm(f => ({ ...f, monthly_bill: e.target.value }))} className={inp} />
              </div>
              {pkgErr && <p className="text-sm text-red-600">{pkgErr}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={handlePackageChange} disabled={pkgLoading} className="flex-1 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-300 text-white font-semibold rounded-lg text-sm">
                  {pkgLoading ? "Updating…" : "Apply Change"}
                </button>
                <button onClick={() => setPkgClient(null)} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm">Cancel</button>
              </div>
              <p className="text-xs text-gray-400">Package change will immediately sync to MikroTik.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
