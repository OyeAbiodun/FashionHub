import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Boxes, History, Plus, Truck } from "lucide-react";
import { useState, type ReactNode } from "react";

import { getApiErrorMessage } from "../api/client";
import * as inventoryApi from "../api/inventory";
import type { InventoryItem, StockMovementType, Supplier } from "../types/inventory";
import {
  Button, Card, Dialog, EmptyState, InlineError, PageContainer, PageHeader,
  SectionHeader, StatusBadge, inputStyles, labelStyles, selectStyles,
} from "../components/ui";

export function InventoryPage() {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [lowStock, setLowStock] = useState(false);
  const [itemDialog, setItemDialog] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [supplierDialog, setSupplierDialog] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [movementItem, setMovementItem] = useState<InventoryItem | null>(null);
  const [movementType, setMovementType] = useState<"RECEIPT" | "ADJUSTMENT">("RECEIPT");
  const [ledgerItem, setLedgerItem] = useState<InventoryItem | null>(null);
  const [error, setError] = useState("");

  const itemsQuery = useQuery({ queryKey: ["inventory", "items", search, lowStock], queryFn: () => inventoryApi.listInventory({ search, low_stock_only: lowStock }) });
  const suppliersQuery = useQuery({ queryKey: ["inventory", "suppliers"], queryFn: inventoryApi.listSuppliers });
  const movementsQuery = useQuery({ queryKey: ["inventory", "movements", ledgerItem?.id], queryFn: () => inventoryApi.listStockMovements(ledgerItem!.id), enabled: Boolean(ledgerItem) });
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ["inventory"] });
    setError("");
  };
  const itemMutation = useMutation({
    mutationFn: (input: { body: inventoryApi.InventoryItemInput; id?: string }) => inventoryApi.saveInventoryItem(input.body, input.id),
    onSuccess: () => { invalidate(); setItemDialog(false); setEditing(null); },
    onError: (e) => setError(getApiErrorMessage(e)),
  });
  const supplierMutation = useMutation({
    mutationFn: (input: { body: inventoryApi.SupplierInput; id?: string }) => inventoryApi.saveSupplier(input.body, input.id),
    onSuccess: () => { invalidate(); setSupplierDialog(false); setEditingSupplier(null); },
    onError: (e) => setError(getApiErrorMessage(e)),
  });
  const archiveSupplierMutation = useMutation({
    mutationFn: inventoryApi.archiveSupplier,
    onSuccess: invalidate,
    onError: (e) => setError(getApiErrorMessage(e)),
  });
  const movementMutation = useMutation({
    mutationFn: (input: { itemId: string; type: StockMovementType; quantity: string; reason: string; unitCost?: string }) => inventoryApi.recordStockMovement(input.itemId, { movement_type: input.type as "RECEIPT" | "ADJUSTMENT", quantity: input.quantity, reason: input.reason, unit_cost: input.unitCost || undefined }),
    onSuccess: () => { invalidate(); setMovementItem(null); },
    onError: (e) => setError(getApiErrorMessage(e)),
  });

  const openEdit = (item: InventoryItem) => { setEditing(item); setItemDialog(true); };

  return (
    <PageContainer>
      <PageHeader eyebrow="Stock control" title="Inventory & materials" description="Track fabric, trims, and other supplies with a movement history. Stock changes are recorded as ledger entries." actions={<Button onClick={() => { setEditing(null); setItemDialog(true); }}><Plus className="mr-2 h-4 w-4" />Add material</Button>} />
      {error ? <div className="mt-5"><InlineError message={error} /></div> : null}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-5"><p className="text-sm text-muted">Active materials</p><p className="mt-2 text-2xl font-semibold">{itemsQuery.data?.total ?? "—"}</p></Card>
        <Card className="p-5"><p className="text-sm text-muted">Low stock</p><p className="mt-2 flex items-center gap-2 text-2xl font-semibold"><AlertTriangle className="h-5 w-5 text-amber-600" />{itemsQuery.data?.items.filter((item) => item.is_low_stock).length ?? "—"}</p></Card>
        <Card className="p-5"><p className="text-sm text-muted">Suppliers</p><p className="mt-2 text-2xl font-semibold">{suppliersQuery.data?.length ?? "—"}</p></Card>
      </div>
      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section>
          <SectionHeader title="Materials" description="Current quantities are calculated from receipts, adjustments, and order usage." action={<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={lowStock} onChange={(event) => setLowStock(event.target.checked)} />Low stock only</label>} />
          <div className="mt-4"><input className={inputStyles} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search material or SKU" aria-label="Search inventory" /></div>
          {itemsQuery.isLoading ? <p className="py-10 text-sm text-muted">Loading materials…</p> : itemsQuery.isError ? <div className="mt-4"><InlineError message="Could not load inventory." retry={() => void itemsQuery.refetch()} /></div> : itemsQuery.data?.items.length ? <div className="mt-4 grid gap-3">{itemsQuery.data.items.map((item) => <Card key={item.id} className="p-4 sm:p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{item.name}</h3>{item.is_low_stock ? <StatusBadge status="WARNING" label="Low stock" /> : null}</div><p className="mt-1 text-sm text-muted">{item.sku ? `SKU ${item.sku} · ` : ""}{item.supplier_name ?? "No supplier"}</p><p className="mt-2 text-sm">On hand <strong>{item.current_stock} {item.unit}</strong><span className="text-muted"> · reorder at {item.reorder_level}</span></p></div><div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" onClick={() => { setMovementItem(item); setMovementType("RECEIPT"); }}>Receive / adjust</Button><Button variant="ghost" size="sm" onClick={() => setLedgerItem(item)}><History className="mr-1.5 h-4 w-4" />Ledger</Button><Button variant="ghost" size="sm" onClick={() => openEdit(item)}>Edit</Button></div></div></Card>)}</div> : <div className="mt-4"><EmptyState icon={Boxes} title="No materials yet" description="Add the supplies your workroom tracks, then record stock receipts." action={<Button onClick={() => setItemDialog(true)}>Add material</Button>} /></div>}
        </section>
        <aside>
          <SectionHeader title="Suppliers" description="Keep supplier contact details with your materials." action={<Button variant="secondary" size="sm" onClick={() => { setEditingSupplier(null); setSupplierDialog(true); }}><Plus className="mr-1 h-4 w-4" />Add</Button>} />
          <div className="mt-4 space-y-2">{suppliersQuery.data?.map((supplier) => <SupplierRow key={supplier.id} supplier={supplier} onEdit={() => { setEditingSupplier(supplier); setSupplierDialog(true); }} onArchive={() => archiveSupplierMutation.mutate(supplier.id)} />)}{suppliersQuery.data?.length === 0 ? <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted">No suppliers saved.</p> : null}</div>
        </aside>
      </div>

      {itemDialog ? <ItemDialog item={editing} suppliers={suppliersQuery.data ?? []} onClose={() => { setItemDialog(false); setEditing(null); }} onSave={(body) => itemMutation.mutate({ body, id: editing?.id })} saving={itemMutation.isPending} /> : null}
      {supplierDialog ? <SupplierDialog supplier={editingSupplier} onClose={() => { setSupplierDialog(false); setEditingSupplier(null); }} onSave={(body) => supplierMutation.mutate({ body, id: editingSupplier?.id })} saving={supplierMutation.isPending} /> : null}
      {movementItem ? <MovementDialog item={movementItem} type={movementType} onType={setMovementType} onClose={() => setMovementItem(null)} onSave={(quantity, reason, cost) => movementMutation.mutate({ itemId: movementItem.id, type: movementType, quantity, reason, unitCost: cost })} saving={movementMutation.isPending} /> : null}
      {ledgerItem ? <Dialog title={`${ledgerItem.name} movement ledger`} description="Stock history is append-only; corrections should be recorded as adjustments." onClose={() => setLedgerItem(null)}><div className="max-h-[60vh] space-y-3 overflow-auto">{movementsQuery.isLoading ? <p>Loading ledger…</p> : movementsQuery.data?.map((entry) => <div className="border-b border-border pb-3" key={entry.id}><div className="flex items-center justify-between gap-2"><StatusBadge status={entry.movement_type} label={entry.movement_type.toLowerCase()} /><span className="font-semibold">{entry.quantity_delta} {ledgerItem.unit}</span></div><p className="mt-1 text-sm">{entry.reason}</p><p className="mt-1 text-xs text-muted">{entry.created_by_name} · {new Date(entry.created_at).toLocaleString()}</p></div>)}{movementsQuery.data?.length === 0 ? <p className="text-sm text-muted">No stock movements recorded.</p> : null}</div></Dialog> : null}
    </PageContainer>
  );
}

function ItemDialog({ item, suppliers, onClose, onSave, saving }: { item: InventoryItem | null; suppliers: Supplier[]; onClose: () => void; onSave: (body: inventoryApi.InventoryItemInput) => void; saving: boolean }) {
  const [name, setName] = useState(item?.name ?? "");
  const [sku, setSku] = useState(item?.sku ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "yard");
  const [reorder, setReorder] = useState(item?.reorder_level ?? "0");
  const [supplier, setSupplier] = useState(item?.supplier_id ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  return <Dialog title={item ? "Edit material" : "Add material"} description="Quantity on hand is built from the stock ledger." onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={saving || !name.trim() || !unit.trim()} onClick={() => onSave({ name: name.trim(), sku: sku.trim() || undefined, unit: unit.trim(), reorder_level: reorder || "0", supplier_id: supplier || null, description: description.trim() || undefined, is_active: item?.is_active ?? true })}>{saving ? "Saving…" : "Save material"}</Button></>}>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Material name"><input className={inputStyles} value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="Unit"><input className={inputStyles} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="yard, metre, piece" /></Field><Field label="SKU (optional)"><input className={inputStyles} value={sku} onChange={(e) => setSku(e.target.value)} /></Field><Field label="Low-stock threshold"><input className={inputStyles} type="number" min="0" step="0.001" value={reorder} onChange={(e) => setReorder(e.target.value)} /></Field><Field label="Supplier"><select className={selectStyles} value={supplier} onChange={(e) => setSupplier(e.target.value)}><option value="">None</option>{suppliers.map((row) => <option value={row.id} key={row.id}>{row.name}</option>)}</select></Field><Field label="Description"><input className={inputStyles} value={description} onChange={(e) => setDescription(e.target.value)} /></Field></div>
  </Dialog>;
}

function MovementDialog({ item, type, onType, onClose, onSave, saving }: { item: InventoryItem; type: "RECEIPT" | "ADJUSTMENT"; onType: (value: "RECEIPT" | "ADJUSTMENT") => void; onClose: () => void; onSave: (quantity: string, reason: string, cost: string) => void; saving: boolean }) {
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [cost, setCost] = useState("");
  return <Dialog title="Record stock movement" description={`Current stock: ${item.current_stock} ${item.unit}. Adjustments use a signed quantity (for example, -2.5).`} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={saving || !quantity || Number(quantity) === 0 || !reason.trim()} onClick={() => onSave(quantity, reason, cost)}>{saving ? "Saving…" : "Record movement"}</Button></>}>
    <div className="grid gap-4"><Field label="Movement"><select className={selectStyles} value={type} onChange={(e) => onType(e.target.value as "RECEIPT" | "ADJUSTMENT")}><option value="RECEIPT">Receive stock</option><option value="ADJUSTMENT">Correct stock count</option></select></Field><Field label={`Quantity (${item.unit})`}><input className={inputStyles} type="number" step="0.001" min={type === "RECEIPT" ? "0.001" : undefined} value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field>{type === "RECEIPT" ? <Field label="Unit cost (optional)"><input className={inputStyles} type="number" step="0.01" min="0" value={cost} onChange={(e) => setCost(e.target.value)} /></Field> : null}<Field label="Reason"><textarea className={inputStyles} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Supplier delivery, count correction…" /></Field></div>
  </Dialog>;
}

function SupplierDialog({ supplier, onClose, onSave, saving }: { supplier: Supplier | null; onClose: () => void; onSave: (body: inventoryApi.SupplierInput) => void; saving: boolean }) {
  const [name, setName] = useState(supplier?.name ?? ""); const [contact, setContact] = useState(supplier?.contact_name ?? ""); const [phone, setPhone] = useState(supplier?.phone ?? ""); const [email, setEmail] = useState(supplier?.email ?? ""); const [notes, setNotes] = useState(supplier?.notes ?? "");
  return <Dialog title={supplier ? "Edit supplier" : "Add supplier"} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={saving || !name.trim()} onClick={() => onSave({ name, contact_name: contact || undefined, phone: phone || undefined, email: email || undefined, notes: notes || undefined })}>{saving ? "Saving…" : "Save supplier"}</Button></>}><div className="grid gap-4"><Field label="Supplier name"><input className={inputStyles} value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="Contact person"><input className={inputStyles} value={contact} onChange={(e) => setContact(e.target.value)} /></Field><Field label="Phone"><input className={inputStyles} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field><Field label="Email"><input className={inputStyles} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field><Field label="Notes"><textarea className={inputStyles} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div></Dialog>;
}

function SupplierRow({ supplier, onEdit, onArchive }: { supplier: Supplier; onEdit: () => void; onArchive: () => void }) {
  return <Card className="flex items-start gap-3 p-4"><Truck className="mt-0.5 h-4 w-4 text-muted" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{supplier.name}</p><p className="mt-1 truncate text-xs text-muted">{supplier.phone || supplier.email || "Contact not added"}</p><div className="mt-2 flex gap-3"><button className="text-xs text-primary underline" type="button" onClick={onEdit}>Edit</button><button className="text-xs text-muted underline" type="button" onClick={onArchive}>Archive</button></div></div></Card>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-1.5"><span className={labelStyles}>{label}</span>{children}</label>; }
