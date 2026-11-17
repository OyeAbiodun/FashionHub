import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { acceptTeamInvitation } from "../api/team";
import { getApiErrorMessage } from "../api/client";
import { Button, Card, InlineError, inputStyles, labelStyles } from "../components/ui";

export function AcceptInvitationPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [validationError, setValidationError] = useState("");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (token) window.history.replaceState({}, document.title, "/accept-invitation");
  }, [token]);

  const acceptMutation = useMutation({
    mutationFn: acceptTeamInvitation,
    onSuccess: (session) => {
      queryClient.setQueryData(["auth", "session"], session);
      navigate("/dashboard", { replace: true });
    },
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError("");
    if (!token) {
      setValidationError("This invitation link is missing its token. Ask the business to send a new invitation.");
      return;
    }
    if (password.length < 8) {
      setValidationError("Use a password with at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      setValidationError("The passwords do not match.");
      return;
    }
    acceptMutation.mutate({ token, password });
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10 sm:py-16">
      <Card className="p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">Team invitation</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Set your password</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Create a private password to accept your FashionOS team invitation. The person who invited you cannot see it.</p>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <label className="block">
            <span className={labelStyles}>New password</span>
            <input className={inputStyles} type="password" autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          <label className="block">
            <span className={labelStyles}>Confirm password</span>
            <input className={inputStyles} type="password" autoComplete="new-password" minLength={8} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
          </label>
          {validationError ? <InlineError message={validationError} /> : null}
          {acceptMutation.isError ? <InlineError message={getApiErrorMessage(acceptMutation.error)} /> : null}
          <Button className="w-full" type="submit" disabled={acceptMutation.isPending}>
            {acceptMutation.isPending ? "Creating your account…" : "Accept invitation"}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-muted"><Link className="font-medium text-primary hover:underline" to="/login">Return to sign in</Link></p>
      </Card>
    </div>
  );
}
