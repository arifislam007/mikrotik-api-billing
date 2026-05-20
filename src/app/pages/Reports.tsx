import { useState, useEffect } from "react";
import { Button } from "../components/Button";
import { Download, FileText, Users, DollarSign, MapPin, UserCog, Activity } from "lucide-react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { statsService } from "../services/api";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444"];

interface ReportData {
  totalUsers: number;
  activeUsers: number;
  disabledUsers: number;
  byLocation: { name: string; active: number; disabled: number }[];
  byReseller: { name: string; active: number; disabled: number }[];
  monthlyRevenue: number;
  byPaymentMethod: { method: string; amount: number; count: number }[];
  pendingInvoices: { count: number; amount: number };
}

export function Reports() {
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const data = await statsService.getReport();
        setReportData(data);
      } catch (err) {
        setError("Failed to load report data");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, []);

  const handleExportCSV = (reportType: string) => {
    if (!reportData) return;
    const rows = reportType === "User"
      ? [["Location", "Active", "Disabled"], ...reportData.byLocation.map((l) => [l.name, l.active, l.disabled])]
      : [["Payment Method", "Amount", "Count"], ...reportData.byPaymentMethod.map((p) => [p.method, p.amount, p.count])];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${reportType.toLowerCase()}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-gray-500">Loading report data...</p>
      </div>
    );
  }

  if (error || !reportData) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-red-500">{error || "No data available"}</p>
      </div>
    );
  }

  const statusPieData = [
    { name: "Active", value: reportData.activeUsers },
    { name: "Disabled", value: reportData.disabledUsers },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Monthly Reports</h1>
          <p className="text-gray-600 mt-1">Comprehensive user and account analytics</p>
        </div>
      </div>

      {/* User Report Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">User Report</h2>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" icon={FileText} onClick={() => handleExportCSV("User")}>
              Export CSV
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
            <p className="text-sm text-blue-700 mb-1">Total Users</p>
            <p className="text-3xl font-bold text-blue-900">{reportData.totalUsers.toLocaleString()}</p>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
            <p className="text-sm text-green-700 mb-1">Active Users</p>
            <p className="text-3xl font-bold text-green-900">{reportData.activeUsers.toLocaleString()}</p>
            {reportData.totalUsers > 0 && (
              <p className="text-sm text-green-700 mt-1">
                {((reportData.activeUsers / reportData.totalUsers) * 100).toFixed(1)}% of total
              </p>
            )}
          </div>
          <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
            <p className="text-sm text-orange-700 mb-1">Disabled Users</p>
            <p className="text-3xl font-bold text-orange-900">{reportData.disabledUsers.toLocaleString()}</p>
            {reportData.totalUsers > 0 && (
              <p className="text-sm text-orange-700 mt-1">
                {((reportData.disabledUsers / reportData.totalUsers) * 100).toFixed(1)}% of total
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Status Distribution</h3>
            {reportData.totalUsers > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={statusPieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    dataKey="value"
                  >
                    <Cell fill="#10b981" />
                    <Cell fill="#f59e0b" />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500 text-center py-8">No user data available</p>
            )}
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Users by Location</h3>
            {reportData.byLocation.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={reportData.byLocation}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="active" fill="#10b981" radius={[4, 4, 0, 0]} name="Active" />
                  <Bar dataKey="disabled" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Disabled" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500 text-center py-8">No location data available</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {reportData.byLocation.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-600" />
                Breakdown by Location
              </h3>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Active</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Disabled</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {reportData.byLocation.map((loc) => (
                      <tr key={loc.name}>
                        <td className="px-4 py-2 text-gray-900">{loc.name}</td>
                        <td className="px-4 py-2 text-right text-green-600 font-medium">{loc.active}</td>
                        <td className="px-4 py-2 text-right text-orange-600 font-medium">{loc.disabled}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {reportData.byReseller.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <UserCog className="w-5 h-5 text-purple-600" />
                Breakdown by Reseller
              </h3>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Reseller</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Active</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Disabled</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {reportData.byReseller.map((res) => (
                      <tr key={res.name}>
                        <td className="px-4 py-2 text-gray-900">{res.name}</td>
                        <td className="px-4 py-2 text-right text-green-600 font-medium">{res.active}</td>
                        <td className="px-4 py-2 text-right text-orange-600 font-medium">{res.disabled}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Account Report Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Account Report</h2>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" icon={FileText} onClick={() => handleExportCSV("Account")}>
              Export CSV
            </Button>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-6 border border-green-200 mb-6">
          <p className="text-sm text-green-700 mb-2">Total Revenue (Paid Invoices)</p>
          <p className="text-4xl font-bold text-green-900">${reportData.monthlyRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </div>

        {reportData.byPaymentMethod.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Method Breakdown</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              {reportData.byPaymentMethod.map((pm, index) => (
                <div key={pm.method} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <p className="text-sm text-gray-600 mb-1">{pm.method}</p>
                  <p className="text-2xl font-bold text-gray-900">${pm.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  <p className="text-sm text-gray-600 mt-1">{pm.count} transactions</p>
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={reportData.byPaymentMethod}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="method" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, "Amount"]} />
                <Bar dataKey="amount" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-4 border border-yellow-200">
          <h3 className="text-lg font-semibold text-yellow-900 mb-3 flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Pending Invoices
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-yellow-700">Total Invoices</p>
              <p className="text-2xl font-bold text-yellow-900">{reportData.pendingInvoices.count}</p>
            </div>
            <div>
              <p className="text-sm text-yellow-700">Total Amount</p>
              <p className="text-2xl font-bold text-yellow-900">
                ${reportData.pendingInvoices.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
