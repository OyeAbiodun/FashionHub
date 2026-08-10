import { Route, Routes } from "react-router-dom";
import { screen } from "@testing-library/react";

import { ProtectedRoute } from "./RouteGuards";
import { renderWithAuth } from "../test/render";

test("protected route redirects unauthenticated users to login", async () => {
  renderWithAuth(
    <Routes>
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<div>Dashboard</div>} />
      </Route>
      <Route path="/login" element={<div>Login route</div>} />
    </Routes>,
    { route: "/dashboard" },
  );
  expect(await screen.findByText("Login route")).toBeInTheDocument();
});
