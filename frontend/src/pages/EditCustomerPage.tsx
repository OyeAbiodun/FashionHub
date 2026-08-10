import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { getApiErrorMessage } from "../api/client";
import { CustomerForm } from "../components/CustomerForm";
import { useCustomer, useUpdateCustomer } from "../hooks/useCustomers";
import type { CustomerCreateInput } from "../types/customer";
import {
  Card,
  InlineError,
  PageContainer,
  PageHeader,
  Skeleton,
} from "../components/ui";

export function EditCustomerPage() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const customerQuery = useCustomer(customerId);
  const updateMutation = useUpdateCustomer(customerId ?? "");
  const [apiError, setApiError] = useState("");

  async function handleSubmit(values: CustomerCreateInput) {
    if (!customerId) {
      return;
    }
    setApiError("");
    try {
      const customer = await updateMutation.mutateAsync(values);
      navigate(`/customers/${customer.id}`, {
        replace: true,
        state: { message: "Customer updated." },
      });
    } catch (error) {
      setApiError(getApiErrorMessage(error));
    }
  }

  if (customerQuery.isLoading) {
    return (
      <PageContainer className="max-w-5xl">
        <Skeleton className="h-96" />
      </PageContainer>
    );
  }

  if (customerQuery.isError || !customerQuery.data) {
    return (
      <PageContainer className="max-w-5xl">
        <InlineError message="Customer not found." />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-5xl">
      <Link
        className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
        to={`/customers/${customerQuery.data.id}`}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to customer
      </Link>
      <div className="mt-5">
        <PageHeader
          title="Edit customer"
          description="Keep contact details and customer context accurate."
        />
      </div>
      <Card className="mt-7 p-5 sm:p-7">
        <CustomerForm
          customer={customerQuery.data}
          apiError={apiError}
          isSubmitting={updateMutation.isPending}
          submitLabel="Save customer"
          onSubmit={handleSubmit}
        />
      </Card>
    </PageContainer>
  );
}
