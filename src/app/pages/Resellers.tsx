import { useState, useEffect } from "react";
import { Button } from "../components/Button";
import { SearchInput } from "../components/SearchInput";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Plus, TrendingUp, Users, DollarSign, Edit, Trash2, X, Check } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { resellerService } from "../services/api";

interface Reseller {
  id: string;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  commission_rate: number;
}

export function Resellers() {
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [resellerToDelete, setResellerToDelete] = useState<Reseller | null>(null);
  const [formError, setFormError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const emptyForm = { name: "", contact_person: "", email: "", phone: "", commission_rate: "15" };
  const [newReseller, setNewReseller] = useState(emptyForm);
  const [editForm, setEditForm] = useState(emptyForm);

  useEffect(() => {
    fetchResellers();
  }, []);

  const fetchResellers = async () => {
    try {
      const data = await resellerService.getAll();
      setResellers(data);
    } catch (err) {
      console.error("Failed to fetch resellers:", err);
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (msg: string) => {
    setActionMessage(msg);
    setTimeout(() => setActionMessage(""), 3000);
  };

  const handleCreate = async () => {
    setFormError("");
    if (!newReseller.name.trim()) { setFormError("Name is required"); return; }
    try {
      const result = await resellerService.create({
        name: newReseller.name.trim(),
        contact_person: newReseller.contact_person.trim() || null,
        email: newReseller.email.trim() || null,
        phone: newReseller.phone.trim() || null,
        commission_rate: Number(newReseller.commission_rate) || 15,
      });
      setResellers((prev) => [...prev, result]);
      setNewReseller(emptyForm);
      setShowAddForm(false);
      showMessage("Reseller added successfully");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to add reseller");
    }
  };

  const startEdit = (reseller: Reseller) => {
    setEditingId(reseller.id);
    setEditForm({
      name: reseller.name,
      contact_person: reseller.contact_person || "",
      email: reseller.email || "",
      phone: reseller.phone || "",
      commission_rate: String(reseller.commission_rate),
    });
  };

  const handleUpdate = async (id: string) => {
    try {
      const result = await resellerService.update(id, {
        name: editForm.name.trim(),
        contact_person: editForm.contact_person.trim() || null,
        email: editForm.email.trim() || null,
        phone: editForm.phone.trim() || null,
        commission_rate: Number(editForm.commission_rate) || 15,
      });
      setResellers((prev) => prev.map((r) => (r.id === id ? result : r)));
      setEditingId(null);
      showMessage("Reseller updated");
    } catch (err) {
      console.error("Failed to update reseller:", err);
    }
  };

  const handleDelete = async () => {
    if (!resellerToDelete) return;
    try {
      await resellerService.delete(resellerToDelete.id);
      setResellers((prev) => prev.filter((r) => r.id !== resellerToDelete.id));
      showMessage("Reseller deleted");
    } catch (err) {
      console.error("Failed to delete reseller:", err);
    }
    setResellerToDelete(null);
  };

  const filteredResellers = resellers.filter(
    (r) =>
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.email || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const chartData = resellers.map((r) => ({ name: r.name.split(" ")[0], commission: Number(r.commission_rate) }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reseller Management</h1>
          <p className="text-gray-600 mt-1">Manage resellers and commission rates</p>
        </div>
        <Button icon={Plus} onClick={() => setShowAddForm((p) => !p)}>
          {showAddForm ? "Hide Form" : "Add Reseller"}
        </Button>
      </div>

      {actionMessage && <p className="text-sm text-green-600">{actionMessage}</p>}

      {showAddForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">New Reseller</h2>
            <button onClick={() => { setShowAddForm(false); setFormError(""); }} className="p-1 hover:bg-gray-100 rounded">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <input placeholder="Company Name *" value={newReseller.name} onChange={(e) => setNewReseller((p) => ({ ...p, name: e.target.value }))} className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input placeholder="Contact Person" value={newReseller.contact_person} onChange={(e) => setNewReseller((p) => ({ ...p, contact_person: e.target.value }))} className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input placeholder="Email" type="email" value={newReseller.email} onChange={(e) => setNewReseller((p) => ({ ...p, email: e.target.value }))} className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input placeholder="Phone" value={newReseller.phone} onChange={(e) => setNewReseller((p) => ({ ...p, phone: e.target.value }))} className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input placeholder="Commission Rate %" type="number" min="0" max="100" step="0.1" value={newReseller.commission_rate} onChange={(e) => setNewReseller((p) => ({ ...p, commission_rate: e.target.value }))} className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex gap-2">
            <Button onClick={handleCreate}>Add Reseller</Button>
            <Button variant="secondary" onClick={() => { setShowAddForm(false); setFormError(""); }}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Total Resellers</p>
              <p className="text-3xl font-semibold text-gray-900">{resellers.length}</p>
            </div>
            <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Avg Commission Rate</p>
              <p className="text-3xl font-semibold text-gray-900">
                {resellers.length ? (resellers.reduce((s, r) => s + Number(r.commission_rate), 0) / resellers.length).toFixed(1) : "0"}%
              </p>
            </div>
            <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Active Agreements</p>
              <p className="text-3xl font-semibold text-gray-900">{resellers.length}</p>
            </div>
            <div className="w-12 h-12 bg-purple-500 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {resellers.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Commission Rates by Reseller</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" unit="%" />
              <Tooltip formatter={(v) => [`${v}%`, "Commission Rate"]} contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px" }} />
              <Bar dataKey="commission" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="max-w-md">
          <SearchInput placeholder="Search resellers..." value={searchTerm} onChange={setSearchTerm} />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact Person</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Commission Rate</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredResellers.map((reseller) =>
                editingId === reseller.id ? (
                  <tr key={reseller.id} className="bg-blue-50">
                    <td className="px-4 py-3"><input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm" /></td>
                    <td className="px-4 py-3"><input value={editForm.contact_person} onChange={(e) => setEditForm((p) => ({ ...p, contact_person: e.target.value }))} className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm" /></td>
                    <td className="px-4 py-3"><input value={editForm.email} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))} className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm" /></td>
                    <td className="px-4 py-3"><input value={editForm.phone} onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))} className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm" /></td>
                    <td className="px-4 py-3"><input type="number" min="0" max="100" step="0.1" value={editForm.commission_rate} onChange={(e) => setEditForm((p) => ({ ...p, commission_rate: e.target.value }))} className="w-24 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm" /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleUpdate(reseller.id)} className="p-1 hover:bg-green-100 rounded" title="Save"><Check className="w-4 h-4 text-green-600" /></button>
                        <button onClick={() => setEditingId(null)} className="p-1 hover:bg-gray-100 rounded" title="Cancel"><X className="w-4 h-4 text-gray-500" /></button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={reseller.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{reseller.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700">{reseller.contact_person || "—"}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700">{reseller.email || "—"}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700">{reseller.phone || "—"}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-700">{Number(reseller.commission_rate).toFixed(1)}%</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <button onClick={() => startEdit(reseller)} className="p-1 hover:bg-gray-100 rounded" title="Edit"><Edit className="w-4 h-4 text-gray-600" /></button>
                        <button onClick={() => setResellerToDelete(reseller)} className="p-1 hover:bg-red-100 rounded" title="Delete"><Trash2 className="w-4 h-4 text-red-600" /></button>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>

        {loading ? (
          <div className="text-center py-12"><p className="text-gray-500">Loading resellers...</p></div>
        ) : filteredResellers.length === 0 ? (
          <div className="text-center py-12"><p className="text-gray-500">No resellers found</p></div>
        ) : null}
      </div>

      <div className="text-sm text-gray-600">
        <p>Showing {filteredResellers.length} of {resellers.length} resellers</p>
      </div>

      <ConfirmDialog
        isOpen={!!resellerToDelete}
        onClose={() => setResellerToDelete(null)}
        onConfirm={handleDelete}
        title="Delete Reseller"
        message={`Delete ${resellerToDelete?.name}? This cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}
