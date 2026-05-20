import { useState, useEffect } from "react";
import { Button } from "../components/Button";
import { StatusBadge } from "../components/StatusBadge";
import { SearchInput } from "../components/SearchInput";
import { PaymentReceipt } from "../components/PaymentReceipt";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Plus, Download, CreditCard, DollarSign, ToggleLeft, ToggleRight, Smartphone, Building2, Wallet, Trash2, X } from "lucide-react";
import { billingService, userService } from "../services/api";

interface Invoice {
  id: string;
  invoice_number: string;
  user_id: string;
  customer: string;
  amount: number;
  status: "paid" | "pending" | "overdue";
  due_date: string;
  paid_date?: string;
  payment_method?: string;
}

interface User {
  id: string;
  username: string;
}

export function Billing() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [autoSuspendEnabled, setAutoSuspendEnabled] = useState(true);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState({ transactionId: "", amount: 0, method: "", customer: "", date: "", invoiceNumber: "" });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newInvoice, setNewInvoice] = useState({ user_id: "", amount: "", status: "pending", due_date: "", payment_method: "" });
  const [createError, setCreateError] = useState("");
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    Promise.all([fetchInvoices(), fetchUsers()]).finally(() => setLoading(false));
  }, []);

  const fetchInvoices = async () => {
    try {
      const data = await billingService.getAll();
      setInvoices(data);
    } catch (err) {
      console.error("Failed to fetch invoices:", err);
    }
  };

  const fetchUsers = async () => {
    try {
      const data = await userService.getAll();
      setUsers(data);
    } catch (err) {
      console.error("Failed to fetch users:", err);
    }
  };

  const handleCreateInvoice = async () => {
    setCreateError("");
    if (!newInvoice.user_id) { setCreateError("Select a customer"); return; }
    if (!newInvoice.amount || Number(newInvoice.amount) <= 0) { setCreateError("Enter a valid amount"); return; }
    if (!newInvoice.due_date) { setCreateError("Due date is required"); return; }

    try {
      const result = await billingService.create({
        user_id: newInvoice.user_id,
        amount: Number(newInvoice.amount),
        status: newInvoice.status,
        due_date: newInvoice.due_date,
        payment_method: newInvoice.payment_method || null,
      });
      setInvoices((prev) => [result, ...prev]);
      setShowCreateForm(false);
      setNewInvoice({ user_id: "", amount: "", status: "pending", due_date: "", payment_method: "" });
      setActionMessage("Invoice created successfully");
      setTimeout(() => setActionMessage(""), 3000);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create invoice");
    }
  };

  const handleMarkPaid = async (invoice: Invoice, method: string) => {
    try {
      const updated = await billingService.update(invoice.id, {
        status: "paid",
        paid_date: new Date().toISOString().split("T")[0],
        payment_method: method,
      });
      setInvoices((prev) => prev.map((inv) => (inv.id === invoice.id ? { ...inv, ...updated } : inv)));
      const receipt = {
        transactionId: `TXN${Date.now()}`,
        amount: invoice.amount,
        method,
        customer: invoice.customer,
        date: new Date().toLocaleDateString(),
        invoiceNumber: invoice.invoice_number,
      };
      setReceiptData(receipt);
      setShowReceipt(true);
    } catch (err) {
      console.error("Failed to mark invoice as paid:", err);
    }
  };

  const handleDeleteInvoice = async () => {
    if (!invoiceToDelete) return;
    try {
      await billingService.delete(invoiceToDelete.id);
      setInvoices((prev) => prev.filter((inv) => inv.id !== invoiceToDelete.id));
      setActionMessage("Invoice deleted");
      setTimeout(() => setActionMessage(""), 3000);
    } catch (err) {
      console.error("Failed to delete invoice:", err);
    }
    setInvoiceToDelete(null);
  };

  const filteredInvoices = invoices.filter((invoice) => {
    const matchesSearch =
      (invoice.invoice_number || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (invoice.customer || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || invoice.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalRevenue = invoices.filter((inv) => inv.status === "paid").reduce((sum, inv) => sum + Number(inv.amount), 0);
  const pendingAmount = invoices.filter((inv) => inv.status === "pending").reduce((sum, inv) => sum + Number(inv.amount), 0);
  const overdueAmount = invoices.filter((inv) => inv.status === "overdue").reduce((sum, inv) => sum + Number(inv.amount), 0);

  const paymentMethods = [
    { name: "bKash", icon: Smartphone, color: "bg-pink-500" },
    { name: "Nagad", icon: Smartphone, color: "bg-orange-500" },
    { name: "Bank Transfer", icon: Building2, color: "bg-blue-500" },
    { name: "Cash Payment", icon: Wallet, color: "bg-green-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing System</h1>
          <p className="text-gray-600 mt-1">Manage invoices and payments</p>
        </div>
        <Button icon={Plus} onClick={() => setShowCreateForm((p) => !p)}>
          {showCreateForm ? "Hide Form" : "Create Invoice"}
        </Button>
      </div>

      {actionMessage && <p className="text-sm text-green-600">{actionMessage}</p>}

      {showCreateForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">New Invoice</h2>
            <button onClick={() => { setShowCreateForm(false); setCreateError(""); }} className="p-1 hover:bg-gray-100 rounded">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <select
              value={newInvoice.user_id}
              onChange={(e) => setNewInvoice((p) => ({ ...p, user_id: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select customer</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.username}</option>
              ))}
            </select>
            <input
              placeholder="Amount"
              type="number"
              min="0"
              step="0.01"
              value={newInvoice.amount}
              onChange={(e) => setNewInvoice((p) => ({ ...p, amount: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="date"
              placeholder="Due date"
              value={newInvoice.due_date}
              onChange={(e) => setNewInvoice((p) => ({ ...p, due_date: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={newInvoice.status}
              onChange={(e) => setNewInvoice((p) => ({ ...p, status: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
            <select
              value={newInvoice.payment_method}
              onChange={(e) => setNewInvoice((p) => ({ ...p, payment_method: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Payment method (optional)</option>
              <option value="bKash">bKash</option>
              <option value="Nagad">Nagad</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Cash Payment">Cash Payment</option>
            </select>
          </div>
          {createError && <p className="text-sm text-red-600">{createError}</p>}
          <div className="flex gap-2">
            <Button onClick={handleCreateInvoice}>Create Invoice</Button>
            <Button variant="secondary" onClick={() => { setShowCreateForm(false); setCreateError(""); }}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Total Revenue</p>
              <p className="text-3xl font-semibold text-gray-900">${totalRevenue.toFixed(2)}</p>
            </div>
            <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Pending Payments</p>
              <p className="text-3xl font-semibold text-gray-900">${pendingAmount.toFixed(2)}</p>
            </div>
            <div className="w-12 h-12 bg-yellow-500 rounded-lg flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Overdue Amount</p>
              <p className="text-3xl font-semibold text-gray-900">${overdueAmount.toFixed(2)}</p>
            </div>
            <div className="w-12 h-12 bg-red-500 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment Methods</h2>
          <div className="grid grid-cols-2 gap-3">
            {paymentMethods.map((method) => {
              const Icon = method.icon;
              const unpaidInvoice = invoices.find((inv) => inv.status !== "paid");
              return (
                <button
                  key={method.name}
                  onClick={() => { if (unpaidInvoice) handleMarkPaid(unpaidInvoice, method.name); }}
                  disabled={!unpaidInvoice}
                  className="p-4 bg-gradient-to-br from-gray-50 to-white border-2 border-gray-200 rounded-lg hover:border-blue-400 hover:shadow-md transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className={`w-12 h-12 ${method.color} rounded-lg flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <p className="font-medium text-gray-900 text-center">{method.name}</p>
                  <p className="text-xs text-gray-500 text-center mt-1">Available</p>
                </button>
              );
            })}
          </div>
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              Click a payment method to mark the oldest unpaid invoice as paid
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Automation Settings</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex-1">
                <p className="font-medium text-gray-900">Auto-suspend Unpaid Accounts</p>
                <p className="text-sm text-gray-600 mt-1">
                  Automatically disable accounts with overdue payments
                </p>
              </div>
              <button onClick={() => setAutoSuspendEnabled(!autoSuspendEnabled)} className="ml-4">
                {autoSuspendEnabled ? (
                  <ToggleRight className="w-12 h-12 text-blue-600" />
                ) : (
                  <ToggleLeft className="w-12 h-12 text-gray-400" />
                )}
              </button>
            </div>
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">Status: {autoSuspendEnabled ? "Enabled" : "Disabled"}</p>
              <p className="text-sm text-blue-700 mt-1">
                {autoSuspendEnabled
                  ? "Accounts will be suspended 3 days after payment is overdue"
                  : "Manual suspension required for overdue accounts"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 max-w-md">
            <SearchInput placeholder="Search invoices..." value={searchTerm} onChange={setSearchTerm} />
          </div>
          <div className="w-full md:w-48">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice #</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Paid Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredInvoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-gray-900">{invoice.invoice_number || "—"}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-700">{invoice.customer}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-medium text-gray-900">${Number(invoice.amount).toFixed(2)}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={invoice.status} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-700">{invoice.due_date}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-700">{invoice.paid_date || "—"}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-700">{invoice.payment_method || "—"}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      {invoice.status !== "paid" && (
                        <select
                          defaultValue=""
                          onChange={(e) => { if (e.target.value) { handleMarkPaid(invoice, e.target.value); e.target.value = ""; } }}
                          className="text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="">Mark paid via...</option>
                          <option value="bKash">bKash</option>
                          <option value="Nagad">Nagad</option>
                          <option value="Bank Transfer">Bank Transfer</option>
                          <option value="Cash Payment">Cash Payment</option>
                        </select>
                      )}
                      <button
                        className="p-1 hover:bg-gray-100 rounded"
                        title="Delete invoice"
                        onClick={() => setInvoiceToDelete(invoice)}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                      <button className="p-1 hover:bg-gray-100 rounded" title="Download">
                        <Download className="w-4 h-4 text-gray-600" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Loading invoices...</p>
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No invoices found</p>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between text-sm text-gray-600">
        <p>Showing {filteredInvoices.length} of {invoices.length} invoices</p>
      </div>

      <PaymentReceipt isOpen={showReceipt} onClose={() => setShowReceipt(false)} transactionData={receiptData} />

      <ConfirmDialog
        isOpen={!!invoiceToDelete}
        onClose={() => setInvoiceToDelete(null)}
        onConfirm={handleDeleteInvoice}
        title="Delete Invoice"
        message={`Delete invoice ${invoiceToDelete?.invoice_number}? This cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}
