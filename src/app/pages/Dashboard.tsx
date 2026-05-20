import { useEffect, useState } from "react";
import { StatsCard } from "../components/StatsCard";
import { Users, DollarSign, AlertCircle, TrendingUp } from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { statsService } from "../services/api";

const bandwidthData = [
  { month: "Jan", usage: 450 },
  { month: "Feb", usage: 520 },
  { month: "Mar", usage: 480 },
  { month: "Apr", usage: 600 },
  { month: "May", usage: 750 },
  { month: "Jun", usage: 680 },
];

const revenueData = [
  { month: "Jan", revenue: 12400, expenses: 8200 },
  { month: "Feb", revenue: 14200, expenses: 8500 },
  { month: "Mar", revenue: 13800, expenses: 8300 },
  { month: "Apr", revenue: 16500, expenses: 9100 },
  { month: "May", revenue: 18200, expenses: 9400 },
  { month: "Jun", revenue: 17800, expenses: 9200 },
];

const recentActivity = [
  { user: "user_mike_001", action: "Payment received", time: "5 min ago", status: "success" },
  { user: "user_sarah_042", action: "Account expired", time: "12 min ago", status: "warning" },
  { user: "user_john_089", action: "New registration", time: "24 min ago", status: "success" },
  { user: "user_anna_156", action: "Payment overdue", time: "1 hour ago", status: "error" },
  { user: "user_david_203", action: "Profile updated", time: "2 hours ago", status: "info" },
];

export function Dashboard() {
  const [stats, setStats] = useState({
    totalUsers: 1247,
    activeUsers: 0,
    expiredUsers: 0,
    monthlyRevenue: 17800,
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await statsService.getStats();
        setStats(data);
      } catch (err) {
        console.error("Failed to fetch stats:", err);
      }
    };
    fetchStats();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Overview of your MikroTik PPPoE system</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Active Users"
          value={stats.totalUsers.toLocaleString()}
          icon={Users}
          color="blue"
          trend={{ value: 12.5, isPositive: true }}
        />
        <StatsCard
          title="Expired Accounts"
          value={stats.expiredUsers.toLocaleString()}
          icon={AlertCircle}
          color="orange"
          trend={{ value: 5.2, isPositive: false }}
        />
        <StatsCard
          title="Payments Pending"
          value="34"
          icon={DollarSign}
          color="purple"
        />
        <StatsCard
          title="Monthly Revenue"
          value={`$${stats.monthlyRevenue.toLocaleString()}`}
          icon={TrendingUp}
          color="green"
          trend={{ value: 8.3, isPositive: true }}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bandwidth Usage Chart */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Bandwidth Usage (GB)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={bandwidthData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                }}
              />
              <Line
                type="monotone"
                dataKey="usage"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: "#3b82f6", r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue Chart */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Revenue vs Expenses</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                }}
              />
              <Legend />
              <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {recentActivity.map((activity, index) => {
            const statusColors = {
              success: "bg-green-100 text-green-700",
              warning: "bg-yellow-100 text-yellow-700",
              error: "bg-red-100 text-red-700",
              info: "bg-blue-100 text-blue-700",
            };

            return (
              <div key={index} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{activity.user}</p>
                  <p className="text-sm text-gray-600">{activity.action}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-500">{activity.time}</span>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      statusColors[activity.status as keyof typeof statusColors]
                    }`}
                  >
                    {activity.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
