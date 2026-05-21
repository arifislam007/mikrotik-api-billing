import { useState, useEffect } from "react";
import { Plus, X, CreditCard, Clock, CheckCircle } from "lucide-react";
import { fmtDate } from "../../utils/fmt";
import { resellerPortalService } from "../../services/api";

interface Invoice {
  id: string;
  invoice_number: string;
  customer: string;
  amount: number;
  status: string;
  due_date: string | null;
  paid_date: string | null;
  payment_method: string | null;
  created_at: string;
}

interface User { id: string; username: string; }

const PAYMENT_METHODS = ["Cash", "Bank Transfer", "Mobile Banking", "bKash", "Nagad", "Card", "Other"];

export function ResellerBilling() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "paid">("all");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [formError, setFormError] = useState("");

  const emptyForm = { user_id: "", amount: "", due_date: "" };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    resellerPortalService.getBilling().then(setInvoices).catch(console.error).finally(() => setLoading(false));
    resellerPortalService.getUsers().then(setUsers).catch(console.error);
  }, []);

  const showMsg = (type: "ok" | "err", text: string) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 4000); };

  const handleCreate = async () => {
    setFormError("");
    if (!form.user_id) { setFormError("Select a user"); return; }
    if (!form.amount || Number(form.amount) <= 0) { setFormError("Enter a valid amount"); return; }
    try {
      const inv = await resellerPortalService.createInvoice({ user_id: form.user_id, amount: Number(form.amount), due_date: form.due_date || undefined });
      setInvoices((p) => [inv, ...p]);
      setForm(emptyForm);
      setShowForm(false);
      showMsg("ok", `Invoice ${inv.invoice_number} created`);
    } catch (e) { setFormError(e instanceof Error ? e.message : "Failed"); }
  };

  const handlePay = async (id: string) => {
    if (!payMethod) return;
    try {
      const updated = await resellerPortalService.payInvoice(id, { payment_method: payMethod });
      setInvoices((p) => p.map((inv) => inv.id === id ? updated : inv));
      setPayingId(null);
      setPayMethod("");
      showMsg("ok", "Invoice marked as paid");
    } catch (e) { showMsg("err", e instanceof Error ? e.message : "Failed"); }
  };

  const filtered = invoices.filter((inv) => filter === "all" || inv.status === filter);

  const totalPaid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.amount), 0);
  const totalPending = invoices.filter((i) => i.status === "pending").reduce((s, i) => s + Number(i.amount), 0);

  const inputCls = "px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
          <p className="text-gray-500 mt-1 text-sm">Manage invoices for your users</p>
        </div>
        <button onClick={() => setShowForm((p) => !p)} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" />{showForm ? "Hide Form" : "New Invoice"}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
          <div className="w-11 h-11 bg-green-500 rounded-lg flex items-center justify-center"><CheckCircle className="w-5 h-5 text-white" /></div>
          <div><p className="text-sm text-gray-500">Total Collected</p><p className="text-xl font-bold text-gray-900">${totalPaid.toFixed(2)}</p></div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
          <div className="w-11 h-11 bg-orange-500 rounded-lg flex items-center justify-center"><Clock className="w-5 h-5 text-white" /></div>
          <div><p className="text-sm text-gray-500">Pending Amount</p><p className="text-xl font-bold text-gray-900">${totalPending.toFixed(2)}</p></div>
        </div>
      </div>

      {msg && (
        <div className={`px-4 py-3 rounded-lg text-sm border ${msg.type === "ok" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
          {msg.text}
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">New Invoice</h2>
            <button onClick={() => { setShowForm(false); setFormError(""); }} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4 text-gray-500" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select value={form.user_id} onChange={(e) => setForm((f) => ({ ...f, user_id: e.target.value }))} className={inputCls}>
              <option value="">Select User *</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
            </select>
            <input type="number" min="0" step="0.01" placeholder="Amount ($) *" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className={inputCls} />
            <div>
              <label className="block text-xs text-gray-500 mb-1">Due Date (optional)</label>
              <input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} className={inputCls + " w-full"} />
            </div>
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex gap-2">
            <button onClick={handleCreate} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium">Create Invoice</button>
            <button onClick={() => { setShowForm(false); setFormError(""); }} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-3 flex gap-2">
        {(["all", "pending", "paid"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${filter === f ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {f}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Invoice #", "Customer", "Amount", "Status", "Due Date", "Paid Date", "Method", "Actions"].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-mono text-xs text-gray-900">{inv.invoice_number}</td>
                  <td className="px-5 py-3 font-medium text-gray-900">{inv.customer}</td>
                  <td className="px-5 py-3 font-semibold text-gray-900">${Number(inv.amount).toFixed(2)}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${inv.status === "paid" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                      {inv.status === "paid" ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-600 text-xs">{fmtDate(inv.due_date)}</td>
                  <td className="px-5 py-3 text-gray-600 text-xs">{fmtDate(inv.paid_date)}</td>
                  <td className="px-5 py-3 text-gray-600 text-xs">{inv.payment_method || "—"}</td>
                  <td className="px-5 py-3">
                    {inv.status === "pending" && (
                      payingId === inv.id ? (
                        <div className="flex items-center gap-2">
                          <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-green-500">
                            <option value="">Payment method…</option>
                            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                          </select>
                          <button onClick={() => handlePay(inv.id)} disabled={!payMethod}
                            className="px-2 py-1 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white rounded text-xs font-medium">
                            Confirm
                          </button>
                          <button onClick={() => { setPayingId(null); setPayMethod(""); }} className="p-1 hover:bg-gray-100 rounded">
                            <X className="w-3.5 h-3.5 text-gray-500" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setPayingId(inv.id)}
                          className="flex items-center gap-1 px-2 py-1 bg-green-50 hover:bg-green-100 text-green-700 rounded text-xs font-medium transition-colors">
                          <CreditCard className="w-3 h-3" /> Mark Paid
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading invoices…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">{filter !== "all" ? `No ${filter} invoices` : "No invoices yet"}</div>
        ) : null}
      </div>
    </div>
  );
}
