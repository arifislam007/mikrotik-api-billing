import { useState, useEffect } from "react";
import { Plus, X, CheckCircle, Clock, AlertCircle, Filter } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "/api";
const authH = () => {
  const t = localStorage.getItem("auth_token");
  return { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) };
};

interface Invoice {
  id: string; invoice_number: string; customer: string; customer_name: string;
  billing_month: string; amount: number; received_amount: number; vat: number;
  discount: number; balance_due: number; advance: number;
  status: string; due_date: string|null; paid_date: string|null; payment_method: string|null;
  received_by: string|null; created_at: string;
}
interface BillStats { paidClients: number; unpaidClients: number; receivedBill: number; dueAmount: number; generatedBill: number; advanceAmount: number; }
interface Client { id: string; username: string; full_name: string; }

const PAYMENT_METHODS = ["Cash","bKash","Nagad","Bank Transfer","Rocket","Card","Other"];
const STATUS_COLOR: Record<string,string> = {
  paid:    "bg-emerald-100 text-emerald-700",
  pending: "bg-orange-100 text-orange-700",
  overdue: "bg-red-100 text-red-700",
};

export function BillingList() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [stats, setStats]       = useState<BillStats | null>(null);
  const [clients, setClients]   = useState<Client[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState({ month: new Date().toISOString().slice(0,7), status: "" });
  const [showForm, setShowForm] = useState(false);
  const [payingId, setPayingId] = useState<string|null>(null);
  const [payMethod, setPayMethod] = useState("");
  const [msg, setMsg]           = useState("");
  const emptyForm = { user_id:"", amount:"", billing_month: new Date().toISOString().slice(0,7), due_date:"", vat:"0", discount:"0", note:"", received_by:"" };
  const [form, setForm]         = useState(emptyForm);
  const [formErr, setFormErr]   = useState("");

  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter.month)  params.set("month",  filter.month);
    if (filter.status) params.set("status", filter.status);
    const [inv, st, cl] = await Promise.all([
      fetch(`${API}/billing?${params}`, { headers: authH() }).then(r => r.json()),
      fetch(`${API}/billing/stats?month=${filter.month}`, { headers: authH() }).then(r => r.json()),
      fetch(`${API}/clients`,           { headers: authH() }).then(r => r.json()),
    ]);
    setInvoices(Array.isArray(inv) ? inv : []);
    setStats(st);
    setClients(Array.isArray(cl) ? cl : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter.month, filter.status]);

  const handleCreate = async () => {
    setFormErr("");
    if (!form.user_id||!form.amount) { setFormErr("Client and amount are required"); return; }
    const res = await fetch(`${API}/billing`, { method:"POST", headers: authH(), body: JSON.stringify({ ...form, amount: Number(form.amount), vat: Number(form.vat), discount: Number(form.discount) }) });
    if (!res.ok) { const d = await res.json(); setFormErr(d.error||"Failed"); return; }
    setForm(emptyForm); setShowForm(false); showMsg("Invoice created"); load();
  };

  const handlePay = async (id: string) => {
    if (!payMethod) return;
    const now = new Date().toISOString().split("T")[0];
    await fetch(`${API}/billing/${id}`, { method:"PUT", headers: authH(), body: JSON.stringify({ status:"paid", paid_date:now, payment_method:payMethod, received_amount: invoices.find(i=>i.id===id)?.amount }) });
    setPayingId(null); setPayMethod(""); showMsg("Marked as paid"); load();
  };

  const inp = "px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500";

  const statCards = stats ? [
    { label:"Paid Clients",     value: stats.paidClients,                 color:"bg-emerald-500" },
    { label:"Unpaid Clients",   value: stats.unpaidClients,               color:"bg-red-500" },
    { label:"Received Bill",    value: `৳${stats.receivedBill.toLocaleString()}`, color:"bg-blue-500" },
    { label:"Due Amount",       value: `৳${stats.dueAmount.toLocaleString()}`,    color:"bg-orange-500" },
    { label:"Generated Bills",  value: stats.generatedBill,               color:"bg-violet-500" },
    { label:"Advance Amount",   value: `৳${stats.advanceAmount.toLocaleString()}`,color:"bg-cyan-500" },
  ] : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing List</h1>
          <p className="text-sm text-gray-500 mt-0.5">Monthly billing management</p>
        </div>
        <button onClick={() => setShowForm(p=>!p)}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} />{showForm ? "Hide Form" : "New Invoice"}
        </button>
      </div>

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

      {msg && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm">{msg}</div>}

      {/* Create Invoice Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">New Invoice</h2>
            <button onClick={() => setShowForm(false)} className="p-1 hover:bg-gray-100 rounded"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <select value={form.user_id} onChange={e=>setForm(f=>({...f,user_id:e.target.value}))} className={inp}>
              <option value="">Select Client *</option>
              {clients.map(c=><option key={c.id} value={c.id}>{c.username}{c.full_name?` — ${c.full_name}`:""}</option>)}
            </select>
            <input type="number" min="0" step="0.01" placeholder="Amount (৳) *" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} className={inp} />
            <input type="month" value={form.billing_month} onChange={e=>setForm(f=>({...f,billing_month:e.target.value}))} className={inp} />
            <input type="date" placeholder="Due Date" value={form.due_date} onChange={e=>setForm(f=>({...f,due_date:e.target.value}))} className={inp} />
            <input type="number" min="0" step="0.01" placeholder="VAT" value={form.vat} onChange={e=>setForm(f=>({...f,vat:e.target.value}))} className={inp} />
            <input type="number" min="0" step="0.01" placeholder="Discount" value={form.discount} onChange={e=>setForm(f=>({...f,discount:e.target.value}))} className={inp} />
            <input placeholder="Received By" value={form.received_by} onChange={e=>setForm(f=>({...f,received_by:e.target.value}))} className={inp} />
            <input placeholder="Note / Remarks" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} className={inp} />
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
        <input type="month" value={filter.month} onChange={e=>setFilter(f=>({...f,month:e.target.value}))} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        <select value={filter.status} onChange={e=>setFilter(f=>({...f,status:e.target.value}))} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
          <option value="">All Status</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="overdue">Overdue</option>
        </select>
        <span className="text-xs text-gray-400 ml-auto">{invoices.length} invoices</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 text-white">
                {["Invoice #","Client","Month","Amount","Received","VAT","Discount","Balance Due","Due Date","Paid Date","Method","Status","Actions"].map(h=>(
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
                  <td className="px-4 py-3 text-xs text-gray-600">{inv.billing_month||"—"}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">৳{Number(inv.amount).toLocaleString()}</td>
                  <td className="px-4 py-3 text-emerald-600 font-medium">৳{Number(inv.received_amount||0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">৳{Number(inv.vat||0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-blue-600 text-xs">৳{Number(inv.discount||0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-red-600 font-medium text-xs">৳{Number(inv.balance_due||0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{inv.paid_date ? new Date(inv.paid_date).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{inv.payment_method||"—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[inv.status]||"bg-gray-100 text-gray-600"}`}>
                      {inv.status==="paid" ? <CheckCircle size={10} /> : inv.status==="overdue" ? <AlertCircle size={10} /> : <Clock size={10} />}
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {inv.status !== "paid" && (
                      payingId === inv.id ? (
                        <div className="flex items-center gap-1">
                          <select value={payMethod} onChange={e=>setPayMethod(e.target.value)} className="px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500">
                            <option value="">Method…</option>
                            {PAYMENT_METHODS.map(m=><option key={m} value={m}>{m}</option>)}
                          </select>
                          <button onClick={()=>handlePay(inv.id)} disabled={!payMethod} className="px-2 py-0.5 bg-cyan-600 text-white rounded text-xs disabled:bg-cyan-300">Pay</button>
                          <button onClick={()=>{setPayingId(null);setPayMethod("");}} className="p-0.5 hover:bg-gray-100 rounded"><X size={12} /></button>
                        </div>
                      ) : (
                        <button onClick={()=>setPayingId(inv.id)} className="px-2 py-1 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 rounded text-xs font-medium">Mark Paid</button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <div className="text-center py-12 text-gray-400">Loading invoices…</div>}
        {!loading && invoices.length === 0 && <div className="text-center py-12 text-gray-400">No invoices for this period</div>}
      </div>
    </div>
  );
}
