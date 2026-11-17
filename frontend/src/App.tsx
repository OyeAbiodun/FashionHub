import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AuthLayout } from "./layouts/AuthLayout";
import { AppShell } from "./layouts/AppShell";
import { ProtectedRoute, PublicOnlyRoute, SubscriptionGate, SuperAdminRoute } from "./routes/RouteGuards";

const AcceptInvitationPage = lazy(() => import("./pages/AcceptInvitationPage").then((page) => ({ default: page.AcceptInvitationPage })));
const BillingPage = lazy(() => import("./pages/BillingPage").then((page) => ({ default: page.BillingPage })));
const BillingReturnPage = lazy(() => import("./pages/BillingReturnPage").then((page) => ({ default: page.BillingReturnPage })));
const CalendarPage = lazy(() => import("./pages/CalendarPage").then((page) => ({ default: page.CalendarPage })));
const CustomerDetailPage = lazy(() => import("./pages/CustomerDetailPage").then((page) => ({ default: page.CustomerDetailPage })));
const CustomersPage = lazy(() => import("./pages/CustomersPage").then((page) => ({ default: page.CustomersPage })));
const CommunicationPage = lazy(() => import("./pages/CommunicationPage").then((page) => ({ default: page.CommunicationPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((page) => ({ default: page.DashboardPage })));
const EditCustomerPage = lazy(() => import("./pages/EditCustomerPage").then((page) => ({ default: page.EditCustomerPage })));
const EditOrderPage = lazy(() => import("./pages/EditOrderPage").then((page) => ({ default: page.EditOrderPage })));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage").then((page) => ({ default: page.ForgotPasswordPage })));
const InventoryPage = lazy(() => import("./pages/InventoryPage").then((page) => ({ default: page.InventoryPage })));
const HelpPage = lazy(() => import("./pages/HelpPage").then((page) => ({ default: page.HelpPage })));
const InvoicePage = lazy(() => import("./pages/InvoicePage").then((page) => ({ default: page.InvoicePage })));
const LoginPage = lazy(() => import("./pages/LoginPage").then((page) => ({ default: page.LoginPage })));
const MeasurementProfilePage = lazy(() => import("./pages/MeasurementProfilePage").then((page) => ({ default: page.MeasurementProfilePage })));
const MeasurementTemplatesPage = lazy(() => import("./pages/MeasurementTemplatesPage").then((page) => ({ default: page.MeasurementTemplatesPage })));
const MeasurementsPage = lazy(() => import("./pages/MeasurementsPage").then((page) => ({ default: page.MeasurementsPage })));
const NewCustomerPage = lazy(() => import("./pages/NewCustomerPage").then((page) => ({ default: page.NewCustomerPage })));
const NewMeasurementPage = lazy(() => import("./pages/NewMeasurementPage").then((page) => ({ default: page.NewMeasurementPage })));
const NewOrderPage = lazy(() => import("./pages/NewOrderPage").then((page) => ({ default: page.NewOrderPage })));
const OrderDetailPage = lazy(() => import("./pages/OrderDetailPage").then((page) => ({ default: page.OrderDetailPage })));
const OrdersPage = lazy(() => import("./pages/OrdersPage").then((page) => ({ default: page.OrdersPage })));
const PaymentsPage = lazy(() => import("./pages/PaymentsPage").then((page) => ({ default: page.PaymentsPage })));
const PlatformAuditPage = lazy(() => import("./pages/PlatformAuditPage").then((page) => ({ default: page.PlatformAuditPage })));
const ProfilePage = lazy(() => import("./pages/ProfilePage").then((page) => ({ default: page.ProfilePage })));
const RegisterPage = lazy(() => import("./pages/RegisterPage").then((page) => ({ default: page.RegisterPage })));
const ReportsPage = lazy(() => import("./pages/ReportsPage").then((page) => ({ default: page.ReportsPage })));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage").then((page) => ({ default: page.ResetPasswordPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((page) => ({ default: page.SettingsPage })));
const SubscriptionPage = lazy(() => import("./pages/SubscriptionPage").then((page) => ({ default: page.SubscriptionPage })));
const SuperAdminPage = lazy(() => import("./pages/SuperAdminPage").then((page) => ({ default: page.SuperAdminPage })));
const PlatformSystemPage = lazy(() => import("./pages/PlatformSystemPage").then((page) => ({ default: page.PlatformSystemPage })));
const AdminBusinessDetailPage = lazy(() => import("./pages/AdminBusinessDetailPage").then((page) => ({ default: page.AdminBusinessDetailPage })));
const TasksPage = lazy(() => import("./pages/TasksPage").then((page) => ({ default: page.TasksPage })));
const TeamPage = lazy(() => import("./pages/TeamPage").then((page) => ({ default: page.TeamPage })));
const AuditPage = lazy(() => import("./pages/AuditPage").then((page) => ({ default: page.AuditPage })));

export function App() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted" role="status">Loading page…</div>}>
    <Routes>
      <Route
        path="/accept-invitation"
        element={<AuthLayout><AcceptInvitationPage /></AuthLayout>}
      />
      <Route element={<PublicOnlyRoute />}>
        <Route
          path="/login"
          element={
            <AuthLayout>
              <LoginPage />
            </AuthLayout>
          }
        />
        <Route
          path="/register"
          element={
            <AuthLayout>
              <RegisterPage />
            </AuthLayout>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <AuthLayout>
              <ForgotPasswordPage />
            </AuthLayout>
          }
        />
        <Route
          path="/reset-password"
          element={
            <AuthLayout>
              <ResetPasswordPage />
            </AuthLayout>
          }
        />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<SubscriptionGate />}>
          <Route path="/subscription" element={<SubscriptionPage />} />
          <Route element={<AppShell />}>
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/billing/return" element={<BillingReturnPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route element={<SuperAdminRoute />}>
            <Route path="/admin" element={<SuperAdminPage />} />
            <Route path="/admin/system" element={<PlatformSystemPage />} />
            <Route path="/admin/businesses/:businessId" element={<AdminBusinessDetailPage />} />
            <Route path="/admin/audit" element={<PlatformAuditPage />} />
          </Route>
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/measurements" element={<MeasurementsPage />} />
          <Route
            path="/measurement-templates"
            element={<MeasurementTemplatesPage />}
          />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/communication" element={<CommunicationPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/orders/new" element={<NewOrderPage />} />
          <Route path="/orders/:orderId" element={<OrderDetailPage />} />
          <Route path="/orders/:orderId/edit" element={<EditOrderPage />} />
          <Route path="/invoices/:invoiceId" element={<InvoicePage />} />
          <Route path="/customers/new" element={<NewCustomerPage />} />
          <Route
            path="/customers/:customerId"
            element={<CustomerDetailPage />}
          />
          <Route
            path="/customers/:customerId/edit"
            element={<EditCustomerPage />}
          />
          <Route
            path="/customers/:customerId/measurements/new"
            element={<NewMeasurementPage />}
          />
          <Route
            path="/measurement-profiles/:profileId"
            element={<MeasurementProfilePage />}
          />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
    </Suspense>
  );
}
