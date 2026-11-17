import re
import uuid
from html import escape
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from urllib.parse import quote, urlencode

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.timezone import business_today
from app.core.config import Settings
from app.services.email_service import (
    EmailDeliveryError,
    TransactionalEmail,
    get_configured_email_provider,
)
from app.models.business import Business
from app.models.communication import (
    Communication,
    CommunicationAttempt,
    CommunicationChannel,
    CommunicationStatus,
    MessageTemplate,
)
from app.models.customer import Customer
from app.models.finance import (
    PaymentAllocation,
    PaymentInstallment,
    PaymentInstallmentPlan,
    PaymentStatus,
)
from app.models.order import Order, OrderStatus
from app.models.user import User
from app.schemas.communication import (
    CommunicationAttemptPublic,
    CommunicationCreate,
    CommunicationOutcome,
    CommunicationPublic,
    MessageTemplatePublic,
    MessageTemplateWrite,
    ReminderCandidate,
    ReminderCandidateList,
)
from app.services.financial_service import calculate_order_total, calculate_successful_payments


def _actor_name(actor: User | None) -> str:
    return " ".join(part for part in (actor.first_name, actor.last_name) if part) if actor else ""


def _template_public(template: MessageTemplate) -> MessageTemplatePublic:
    return MessageTemplatePublic.model_validate(template)


async def list_templates(session: AsyncSession, business: Business) -> list[MessageTemplatePublic]:
    rows = (
        (
            await session.execute(
                select(MessageTemplate)
                .where(MessageTemplate.business_id == business.id)
                .order_by(MessageTemplate.is_active.desc(), MessageTemplate.name)
            )
        )
        .scalars()
        .all()
    )
    return [_template_public(row) for row in rows]


async def save_template(
    session: AsyncSession,
    business: Business,
    payload: MessageTemplateWrite,
    template_id: uuid.UUID | None = None,
) -> MessageTemplatePublic:
    template = None
    if template_id:
        template = await session.scalar(
            select(MessageTemplate).where(
                MessageTemplate.id == template_id, MessageTemplate.business_id == business.id
            )
        )
        if template is None:
            raise HTTPException(status_code=404, detail="Message template not found")
    else:
        template = MessageTemplate(business_id=business.id)
        session.add(template)
    for key, value in payload.model_dump().items():
        setattr(template, key, value.strip() if isinstance(value, str) else value)
    await session.commit()
    await session.refresh(template)
    return _template_public(template)


async def archive_template(
    session: AsyncSession, business: Business, template_id: uuid.UUID
) -> None:
    template = await session.scalar(
        select(MessageTemplate).where(
            MessageTemplate.id == template_id, MessageTemplate.business_id == business.id
        )
    )
    if template is None:
        raise HTTPException(status_code=404, detail="Message template not found")
    template.is_active = False
    await session.commit()


def _order_context(order: Order | None, customer: Customer, business: Business) -> dict[str, str]:
    full_name = " ".join(part for part in (customer.first_name, customer.last_name) if part)
    values = {"customer_name": full_name, "business_name": business.name}
    if order:
        due = order.due_date.isoformat()
        balance = calculate_order_total(order) - calculate_successful_payments(order)
        values.update(
            {
                "order_number": order.order_number,
                "due_date": due,
                "balance": f"{max(balance, Decimal('0')):.2f}",
            }
        )
    else:
        values.update({"order_number": "", "due_date": "", "balance": ""})
    return values


def _render_template(text: str, context: dict[str, str]) -> str:
    return re.sub(r"\{\{\s*([a-z_]+)\s*\}\}", lambda match: context.get(match.group(1), ""), text)


def _handoff_url(
    channel: CommunicationChannel, recipient: str, body: str, subject: str | None
) -> str:
    if channel == CommunicationChannel.WHATSAPP:
        digits = re.sub(r"\D", "", recipient)
        if len(digits) == 11 and digits.startswith("0"):
            digits = "234" + digits[1:]
        if not 10 <= len(digits) <= 15:
            raise HTTPException(
                status_code=422,
                detail="WhatsApp handoff needs a customer phone number with a valid country code",
            )
        return f"https://wa.me/{digits}?{urlencode({'text': body})}"
    if channel == CommunicationChannel.SMS:
        return f"sms:{quote(recipient, safe='+')}?{urlencode({'body': body})}"
    params = {"subject": subject or "", "body": body}
    return f"mailto:{quote(recipient, safe='@.+-_')}?{urlencode(params)}"


def _communication_public(record: Communication) -> CommunicationPublic:
    customer_name = " ".join(
        part for part in (record.customer.first_name, record.customer.last_name) if part
    )
    attempts = []
    for attempt in record.attempts:
        attempts.append(
            CommunicationAttemptPublic(
                id=attempt.id,
                status=attempt.status,
                note=attempt.note,
                created_by_name=_actor_name(attempt.created_by),
                created_at=attempt.created_at,
            )
        )
    return CommunicationPublic(
        id=record.id,
        customer_id=record.customer_id,
        customer_name=customer_name,
        order_id=record.order_id,
        order_number=record.order.order_number if record.order else None,
        channel=record.channel,
        status=record.status,
        recipient=record.recipient,
        subject=record.subject,
        body=record.body,
        handoff_url=record.handoff_url,
        created_by_name=_actor_name(record.created_by),
        created_at=record.created_at,
        attempts=attempts,
    )


_COMMUNICATION_LOADS = (
    selectinload(Communication.customer),
    selectinload(Communication.order),
    selectinload(Communication.created_by),
    selectinload(Communication.attempts).selectinload(CommunicationAttempt.created_by),
)


async def prepare_communication(
    session: AsyncSession, business: Business, actor: User, payload: CommunicationCreate
) -> CommunicationPublic:
    customer = await session.scalar(
        select(Customer).where(
            Customer.id == payload.customer_id,
            Customer.business_id == business.id,
            Customer.archived_at.is_(None),
        )
    )
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    order = None
    if payload.order_id:
        order = await session.scalar(
            select(Order)
            .options(selectinload(Order.items), selectinload(Order.payments))
            .where(
                Order.id == payload.order_id,
                Order.business_id == business.id,
                Order.customer_id == customer.id,
            )
        )
        if order is None:
            raise HTTPException(status_code=404, detail="Order not found")
    template = None
    if payload.template_id:
        template = await session.scalar(
            select(MessageTemplate).where(
                MessageTemplate.id == payload.template_id,
                MessageTemplate.business_id == business.id,
                MessageTemplate.is_active.is_(True),
            )
        )
        if template is None:
            raise HTTPException(status_code=404, detail="Active message template not found")
    channel = payload.channel or (template.channel if template else None)
    if channel is None:
        raise HTTPException(status_code=422, detail="Choose a channel or message template")
    if template and channel != template.channel:
        raise HTTPException(status_code=422, detail="Selected template channel does not match")
    subject = (
        payload.subject if payload.subject is not None else (template.subject if template else None)
    )
    source_body = (
        payload.body if payload.body is not None else (template.body if template else None)
    )
    if not source_body or not source_body.strip():
        raise HTTPException(status_code=422, detail="Message body is required")
    if channel == CommunicationChannel.EMAIL:
        recipient = customer.email
        if not recipient:
            raise HTTPException(status_code=422, detail="Customer does not have an email address")
    else:
        recipient = customer.phone
        if not recipient:
            raise HTTPException(status_code=422, detail="Customer does not have a phone number")
    body = _render_template(source_body, _order_context(order, customer, business))
    handoff = _handoff_url(channel, recipient, body, subject)
    record = Communication(
        business_id=business.id,
        customer_id=customer.id,
        order_id=order.id if order else None,
        template_id=template.id if template else None,
        channel=channel,
        status=CommunicationStatus.PREPARED,
        recipient=recipient,
        subject=subject,
        body=body,
        handoff_url=handoff,
        created_by_id=actor.id,
        created_at=datetime.now(UTC),
    )
    session.add(record)
    await session.commit()
    record = await session.scalar(
        select(Communication)
        .options(*_COMMUNICATION_LOADS)
        .where(Communication.id == record.id, Communication.business_id == business.id)
    )
    return _communication_public(record)


async def list_communications(
    session: AsyncSession, business: Business, customer_id: uuid.UUID | None = None
) -> list[CommunicationPublic]:
    stmt = (
        select(Communication)
        .options(*_COMMUNICATION_LOADS)
        .where(Communication.business_id == business.id)
    )
    if customer_id:
        stmt = stmt.where(Communication.customer_id == customer_id)
    rows = (
        (await session.execute(stmt.order_by(Communication.created_at.desc()).limit(100)))
        .scalars()
        .all()
    )
    return [_communication_public(row) for row in rows]


async def record_communication_outcome(
    session: AsyncSession,
    business: Business,
    actor: User,
    communication_id: uuid.UUID,
    payload: CommunicationOutcome,
) -> CommunicationPublic:
    record = await session.scalar(
        select(Communication)
        .options(*_COMMUNICATION_LOADS)
        .where(Communication.id == communication_id, Communication.business_id == business.id)
        .with_for_update()
    )
    if record is None:
        raise HTTPException(status_code=404, detail="Communication record not found")
    if payload.status == CommunicationStatus.PREPARED:
        raise HTTPException(status_code=422, detail="Outcome must be sent or failed")
    record.status = payload.status
    record.attempts.append(
        CommunicationAttempt(
            status=payload.status,
            note=payload.note,
            created_by_id=actor.id,
            created_at=datetime.now(UTC),
        )
    )
    await session.commit()
    record = await session.scalar(
        select(Communication)
        .options(*_COMMUNICATION_LOADS)
        .where(Communication.id == communication_id, Communication.business_id == business.id)
    )
    return _communication_public(record)


async def send_communication_email(
    session: AsyncSession,
    business: Business,
    actor: User,
    communication_id: uuid.UUID,
    settings: Settings,
) -> CommunicationPublic:
    record = await session.scalar(
        select(Communication)
        .options(*_COMMUNICATION_LOADS)
        .where(Communication.id == communication_id, Communication.business_id == business.id)
        .with_for_update()
    )
    if record is None:
        raise HTTPException(status_code=404, detail="Communication record not found")
    if record.status != CommunicationStatus.PREPARED:
        raise HTTPException(status_code=409, detail="Only prepared messages can be sent")
    if record.channel != CommunicationChannel.EMAIL:
        raise HTTPException(status_code=422, detail="Direct sending is currently available for email messages only")

    try:
        provider = await get_configured_email_provider(session, settings)
    except EmailDeliveryError as exc:
        raise HTTPException(status_code=503, detail="Platform email configuration is unavailable") from exc
    if provider is None:
        raise HTTPException(status_code=409, detail="Platform email delivery is not configured and enabled")

    subject = record.subject or f"A message from {business.name}"
    safe_body = escape(record.body).replace("\n", "<br>")
    message = TransactionalEmail(
        to=record.recipient,
        subject=subject,
        text=f"{record.body}\n\n{business.name}",
        html=f"<p>{escape(business.name)}</p><div>{safe_body}</div>",
        from_name=business.name,
        reply_to=business.email,
    )
    try:
        await provider.send(message)
    except EmailDeliveryError as exc:
        record.status = CommunicationStatus.FAILED
        record.attempts.append(CommunicationAttempt(
            status=CommunicationStatus.FAILED,
            note="Platform email service could not confirm submission.",
            created_by_id=actor.id,
            created_at=datetime.now(UTC),
        ))
        await session.commit()
        raise HTTPException(status_code=502, detail="Email could not be submitted. Check platform email settings and try preparing a new message.") from exc

    record.status = CommunicationStatus.SENT
    record.attempts.append(CommunicationAttempt(
        status=CommunicationStatus.SENT,
        note="Submitted to the configured platform email service.",
        created_by_id=actor.id,
        created_at=datetime.now(UTC),
    ))
    await session.commit()
    sent = await session.scalar(
        select(Communication)
        .options(*_COMMUNICATION_LOADS)
        .where(Communication.id == communication_id, Communication.business_id == business.id)
    )
    return _communication_public(sent)


async def reminder_candidates(
    session: AsyncSession, business: Business, days_ahead: int = 7
) -> ReminderCandidateList:
    today = business_today(business)
    cutoff = today + timedelta(days=days_ahead)
    # Load payment records used to derive balances and installment allocations.
    stmt = (
        select(Order)
        .options(
            selectinload(Order.customer),
            selectinload(Order.items),
            selectinload(Order.payments),
            selectinload(Order.payment_plan)
            .selectinload(PaymentInstallmentPlan.allocations)
            .selectinload(PaymentAllocation.payment),
            selectinload(Order.payment_plan)
            .selectinload(PaymentInstallmentPlan.installments)
            .selectinload(PaymentInstallment.allocations)
            .selectinload(PaymentAllocation.payment),
        )
        .where(
            Order.business_id == business.id,
            Order.status.not_in(
                [OrderStatus.DRAFT, OrderStatus.DELIVERED, OrderStatus.CANCELLED]
            ),
            or_(
                Order.due_date <= cutoff,
                Order.payment_plan.has(
                    or_(
                        PaymentInstallmentPlan.advance_due_date <= cutoff,
                        PaymentInstallmentPlan.installments.any(
                            PaymentInstallment.due_date <= cutoff
                        ),
                    )
                ),
            ),
        )
    )
    orders = (await session.execute(stmt.order_by(Order.due_date).limit(500))).scalars().all()
    items: list[ReminderCandidate] = []
    for order in orders:
        customer = order.customer
        if order.due_date <= cutoff:
            balance = max(
                calculate_order_total(order) - calculate_successful_payments(order), Decimal("0")
            )
            if balance > 0:
                days = (order.due_date - today).days
                items.append(
                    ReminderCandidate(
                        customer_id=customer.id,
                        customer_name=" ".join(
                            part for part in (customer.first_name, customer.last_name) if part
                        ),
                        phone=customer.phone,
                        email=customer.email,
                        order_id=order.id,
                        order_number=order.order_number,
                        due_date=order.due_date,
                        outstanding_balance=balance,
                        days_until_due=days,
                        reminder_reason="Overdue order balance"
                        if days < 0
                        else "Order due date approaching",
                    )
                )
        if order.payment_plan:
            plan = order.payment_plan
            if plan.advance_amount and plan.advance_amount > 0:
                advance_due = plan.advance_due_date or order.order_date
                if advance_due <= cutoff:
                    advance_paid = sum(
                        (
                            allocation.amount
                            for allocation in plan.allocations
                            if allocation.is_advance
                            and allocation.payment
                            and allocation.payment.status == PaymentStatus.SUCCESSFUL
                        ),
                        Decimal("0"),
                    )
                    advance_balance = max(plan.advance_amount - advance_paid, Decimal("0"))
                    if advance_balance > 0:
                        days = (advance_due - today).days
                        items.append(
                            ReminderCandidate(
                                customer_id=customer.id,
                                customer_name=" ".join(
                                    part
                                    for part in (customer.first_name, customer.last_name)
                                    if part
                                ),
                                phone=customer.phone,
                                email=customer.email,
                                order_id=order.id,
                                order_number=order.order_number,
                                due_date=advance_due,
                                outstanding_balance=advance_balance,
                                days_until_due=days,
                                reminder_reason="Advance payment overdue"
                                if days < 0
                                else "Advance payment due soon",
                            )
                        )
            for installment in order.payment_plan.installments:
                if installment.due_date > cutoff:
                    continue
                paid = sum(
                    (
                        allocation.amount
                        for allocation in installment.allocations
                        if allocation.payment
                        and allocation.payment.status == PaymentStatus.SUCCESSFUL
                    ),
                    Decimal("0"),
                )
                balance = max(installment.amount - paid, Decimal("0"))
                if balance <= 0:
                    continue
                days = (installment.due_date - today).days
                items.append(
                    ReminderCandidate(
                        customer_id=customer.id,
                        customer_name=" ".join(
                            part for part in (customer.first_name, customer.last_name) if part
                        ),
                        phone=customer.phone,
                        email=customer.email,
                        order_id=order.id,
                        order_number=order.order_number,
                        due_date=installment.due_date,
                        outstanding_balance=balance,
                        days_until_due=days,
                        reminder_reason=f"{installment.label} installment overdue"
                        if days < 0
                        else f"{installment.label} installment due soon",
                    )
                )
    items.sort(key=lambda item: (item.due_date, item.customer_name.casefold()))
    return ReminderCandidateList(items=items)
