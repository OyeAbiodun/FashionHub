import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { getApiErrorMessage } from "../api/client";
import * as inventoryApi from "../api/inventory";
import { Button, Card, InlineError, inputStyles, selectStyles } from "./ui";

export function OrderMaterialsPanel({ orderId }: { orderId: string }) {
  const client = useQueryClient();
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const itemsQuery = useQuery({ queryKey: ["inventory", "items"], queryFn: () => inventoryApi.listInventory() });
  const usageQuery = useQuery({ queryKey: ["inventory", "order-materials", orderId], queryFn: () => inventoryApi.listOrderMaterials(orderId) });
  const mutation = useMutation({
    mutationFn: () => inventoryApi.consumeOrderMaterial(orderId, { item_id: itemId, quantity, notes: notes || undefined }),
    onSuccess: () => {
      setQuantity(""); setNotes(""); setError("");
      void client.invalidateQueries({ queryKey: ["inventory"] });
      void client.invalidateQueries({ queryKey: ["order", orderId] });
    },
    onError: (cause) => setError(getApiErrorMessage(cause)),
  });
  const selected = itemsQuery.data?.items.find((item) => item.id === itemId);

  return <Card className="p-5 sm:p-6">
    <h2 className="text-lg font-semibold text-ink">Materials used</h2>
    <p className="mt-1 text-sm text-muted">Record material consumption for this order. Stock decreases through an auditable movement entry.</p>
    {error ? <div className="mt-3"><InlineError message={error} /></div> : null}
    <form className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_130px_auto]" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
      <label className="grid gap-1"><span className="text-xs font-medium text-muted">Material</span><select className={selectStyles} value={itemId} onChange={(event) => setItemId(event.target.value)} required><option value="">Select material</option>{itemsQuery.data?.items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.current_stock} {item.unit}</option>)}</select></label>
      <label className="grid gap-1"><span className="text-xs font-medium text-muted">Quantity{selected ? ` (${selected.unit})` : ""}</span><input className={inputStyles} type="number" min="0.001" step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label>
      <div className="self-end"><Button type="submit" disabled={!itemId || !quantity || mutation.isPending}>{mutation.isPending ? "Saving…" : "Record use"}</Button></div>
      <label className="grid gap-1 sm:col-span-3"><span className="text-xs font-medium text-muted">Note (optional)</span><input className={inputStyles} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Garment or cutting note" /></label>
    </form>
    {usageQuery.data?.length ? <ul className="mt-5 divide-y divide-border">{usageQuery.data.map((usage) => <li key={usage.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span><strong>{usage.quantity} {usage.unit}</strong> {usage.item_name}{usage.notes ? <span className="text-muted"> · {usage.notes}</span> : null}</span><span className="text-xs text-muted">{usage.created_by_name}</span></li>)}</ul> : <p className="mt-4 text-sm text-muted">No inventory materials recorded for this order yet.</p>}
  </Card>;
}
