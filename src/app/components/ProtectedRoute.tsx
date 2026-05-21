import { Navigate, Outlet } from "react-router";
import { useAuth } from "../contexts/AuthContext";

interface ProtectedRouteProps {
  requiredRole?: "admin" | "reseller";
}

export function ProtectedRoute({ requiredRole }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to={user.role === "admin" ? "/" : "/reseller"} replace />;
  }

  return <Outlet />;
}
