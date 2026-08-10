import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { getApiErrorMessage } from "../api/client";
import { CustomerForm } from "../components/CustomerForm";
import { Card, PageContainer, PageHeader } from "../components/ui";
import { useCreateCustomer } from "../hooks/useCustomers";
import type { CustomerCreateInput } from "../types/customer";

export function NewCustomerPage() {
  const navigate = useNavigate();
  const createMutation = useCreateCustomer();
  const [apiError, setApiError] = useState("");

  async function handleSubmit(values: CustomerCreateInput) {
    setApiError("");
    try {
      const customer = await createMutation.mutateAsync(values);
      navigate(`/customers/${customer.id}`, {
        replace: true,
        state: { message: "Customer created." },
      });
    } catch (error) {
      setApiError(getApiErrorMessage(error));
    }
  }

  return (
    <PageContainer className="max-w-5xl">
      <Link
        className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
        to="/customers"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to customers
      </Link>
      <div className="mt-5">
        <PageHeader
          title="Add customer"
          description="Create a complete client record for measurements, orders, and communication."
        />
      </div>
      <Card className="mt-7 p-5 sm:p-7">
        <CustomerForm
          apiError={apiError}
          isSubmitting={createMutation.isPending}
          submitLabel="Create customer"
          onSubmit={handleSubmit}
        />
      </Card>
    </PageContainer>
  );
}
