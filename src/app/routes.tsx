import { createBrowserRouter, Navigate } from "react-router";
import { Layout } from "./components/Layout";
import { ResellerLayout } from "./components/ResellerLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Resellers } from "./pages/Resellers";
import { Reports } from "./pages/Reports";
import { MikroTikServers } from "./pages/MikroTikServers";
import { ClientList } from "./pages/clients/ClientList";
import { NewClient } from "./pages/clients/NewClient";
import { BillingList } from "./pages/billing/BillingList";
import { Collections } from "./pages/billing/Collections";
import { Zones, SubZones, Boxes, ConnectionTypes, ClientTypes, IspPackages } from "./pages/config/Zones";
import { ResellerDashboard } from "./pages/reseller/Dashboard";
import { ResellerUsers } from "./pages/reseller/Users";
import { ResellerBilling } from "./pages/reseller/Billing";
import { ResellerPackages } from "./pages/reseller/Packages";

export const router = createBrowserRouter([
  { path: "/login", Component: Login },

  // Admin routes
  {
    path: "/",
    element: <ProtectedRoute requiredRole="admin" />,
    children: [
      {
        Component: Layout,
        children: [
          { index: true, Component: Dashboard },

          // Clients
          { path: "clients",      Component: ClientList },
          { path: "clients/new",  Component: NewClient },
          { path: "clients/left", element: <ClientList leftOnly /> },

          // Billing
          { path: "billing",             Component: BillingList },
          { path: "billing/collections", Component: Collections },

          // Configuration
          { path: "config/zones",            Component: Zones },
          { path: "config/sub-zones",        Component: SubZones },
          { path: "config/boxes",            Component: Boxes },
          { path: "config/connection-types", Component: ConnectionTypes },
          { path: "config/client-types",     Component: ClientTypes },
          { path: "config/packages",         Component: IspPackages },

          // Other admin pages
          { path: "mikrotik",  Component: MikroTikServers },
          { path: "resellers", Component: Resellers },
          { path: "reports",   Component: Reports },
        ],
      },
    ],
  },

  // Reseller routes
  {
    path: "/reseller",
    element: <ProtectedRoute requiredRole="reseller" />,
    children: [
      {
        Component: ResellerLayout,
        children: [
          { index: true, Component: ResellerDashboard },
          { path: "users",    Component: ResellerUsers },
          { path: "billing",  Component: ResellerBilling },
          { path: "packages", Component: ResellerPackages },
        ],
      },
    ],
  },

  { path: "*", element: <Navigate to="/login" replace /> },
]);
