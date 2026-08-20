import { Navigate, Route, Routes } from "react-router-dom";

import { AuthLayout } from "./layouts/AuthLayout";
import { AppShell } from "./layouts/AppShell";
import { CustomerDetailPage } from "./pages/CustomerDetailPage";
import { CustomersPage } from "./pages/CustomersPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EditCustomerPage } from "./pages/EditCustomerPage";
import { EditOrderPage } from "./pages/EditOrderPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { LoginPage } from "./pages/LoginPage";
import { InvoicePage } from "./pages/InvoicePage";
import { MeasurementProfilePage } from "./pages/MeasurementProfilePage";
import { MeasurementTemplatesPage } from "./pages/MeasurementTemplatesPage";
import { MeasurementsPage } from "./pages/MeasurementsPage";
import { NewCustomerPage } from "./pages/NewCustomerPage";
import { NewMeasurementPage } from "./pages/NewMeasurementPage";
import { NewOrderPage } from "./pages/NewOrderPage";
import { OrderDetailPage } from "./pages/OrderDetailPage";
import { OrdersPage } from "./pages/OrdersPage";
import { ProfilePage } from "./pages/ProfilePage";
import { RegisterPage } from "./pages/RegisterPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ProtectedRoute, PublicOnlyRoute } from "./routes/RouteGuards";

export function App() {
  return (
    <Routes>
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
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/measurements" element={<MeasurementsPage />} />
          <Route
            path="/measurement-templates"
            element={<MeasurementTemplatesPage />}
          />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/orders" element={<OrdersPage />} />
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
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
