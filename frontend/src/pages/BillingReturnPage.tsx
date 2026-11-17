import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { verifySubscriptionCheckout } from "../api/subscription";
import { Button, Card, PageContainer, PageHeader } from "../components/ui";
import { getApiErrorMessage } from "../api/client";

export function BillingReturnPage() {
  const [params] = useSearchParams();
  const reference = params.get("reference") ?? params.get("trxref") ?? "";
  const transactionId = params.get("transaction_id") ?? params.get("transactionId") ?? undefined;
  const sessionId = params.get("session_id") ?? undefined;
  const { mutate: verifyPayment, ...verify } = useMutation({
    mutationFn: () => verifySubscriptionCheckout({ reference, transaction_id: transactionId, checkout_session_id: sessionId }),
  });
  useEffect(() => { if (reference) verifyPayment(); }, [reference, verifyPayment]);

  return <PageContainer>
    <PageHeader eyebrow="Subscription payment" title="Confirming your payment" description="FashionOS checks the payment directly with the provider before activating the selected plan." />
    <Card className="mx-auto mt-7 max-w-2xl p-6">
      {!reference ? <p className="text-sm text-red-700">No payment reference was returned. Open Plan &amp; Billing and retry checkout.</p> : verify.isPending ? <p className="text-sm text-muted">Verifying payment…</p> : null}
      {verify.isSuccess ? <div><p className="font-semibold text-ink">Payment confirmed</p><p className="mt-2 text-sm text-muted">Your plan is active. Reloading the workspace will update access.</p><Link to="/billing"><Button className="mt-4">Go to billing</Button></Link></div> : null}
      {verify.isError ? <div><p className="font-semibold text-red-800">Payment is not confirmed yet</p><p className="mt-2 text-sm text-muted">{getApiErrorMessage(verify.error)}</p><Button className="mt-4" variant="outline" onClick={() => verifyPayment()}>Check again</Button></div> : null}
    </Card>
  </PageContainer>;
}
