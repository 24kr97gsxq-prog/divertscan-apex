"""
DivertScan™ Apex Enterprise - Stripe Webhook Handlers
Subscription management, payment events, billing
"""

from fastapi import APIRouter, Request, HTTPException, Header
from datetime import datetime
import stripe
import os
from typing import Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/webhooks/stripe", tags=["webhooks"])

# Initialize Stripe
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")

# Subscription tier mapping
TIER_MAP = {
    "price_starter_monthly": "starter",
    "price_professional_monthly": "professional", 
    "price_enterprise_monthly": "enterprise",
    "price_per_project": "pay_per_project"
}

# ═══════════════════════════════════════════════════════════════════════════════
# WEBHOOK ENDPOINT
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="Stripe-Signature")
):
    """
    Handle Stripe webhook events for subscription lifecycle
    """
    payload = await request.body()
    
    # Verify webhook signature
    try:
        event = stripe.Webhook.construct_event(
            payload, stripe_signature, STRIPE_WEBHOOK_SECRET
        )
    except ValueError as e:
        logger.error(f"Invalid payload: {e}")
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError as e:
        logger.error(f"Invalid signature: {e}")
        raise HTTPException(status_code=400, detail="Invalid signature")
    
    # Route to appropriate handler
    event_type = event["type"]
    event_data = event["data"]["object"]
    
    handlers = {
        "checkout.session.completed": handle_checkout_completed,
        "customer.subscription.created": handle_subscription_created,
        "customer.subscription.updated": handle_subscription_updated,
        "customer.subscription.deleted": handle_subscription_deleted,
        "invoice.paid": handle_invoice_paid,
        "invoice.payment_failed": handle_payment_failed,
        "customer.created": handle_customer_created,
    }
    
    handler = handlers.get(event_type)
    if handler:
        try:
            await handler(event_data)
            logger.info(f"Processed Stripe event: {event_type}")
        except Exception as e:
            logger.error(f"Error processing {event_type}: {e}")
            raise HTTPException(status_code=500, detail="Webhook processing failed")
    else:
        logger.info(f"Unhandled Stripe event: {event_type}")
    
    return {"status": "success"}

# ═══════════════════════════════════════════════════════════════════════════════
# EVENT HANDLERS
# ═══════════════════════════════════════════════════════════════════════════════

async def handle_checkout_completed(session: dict):
    """
    Handle successful checkout session
    Creates or updates tenant subscription
    """
    customer_id = session.get("customer")
    subscription_id = session.get("subscription")
    metadata = session.get("metadata", {})
    tenant_id = metadata.get("tenant_id")
    
    if not tenant_id:
        logger.warning(f"Checkout completed without tenant_id: {session.get('id')}")
        return
    
    # Get subscription details
    if subscription_id:
        subscription = stripe.Subscription.retrieve(subscription_id)
        price_id = subscription["items"]["data"][0]["price"]["id"]
        tier = TIER_MAP.get(price_id, "starter")
        
        # Update tenant in database
        # TODO: Replace with actual database update
        logger.info(f"Activating {tier} subscription for tenant {tenant_id}")
        
        await update_tenant_subscription(
            tenant_id=tenant_id,
            stripe_customer_id=customer_id,
            subscription_tier=tier,
            subscription_status="active"
        )

async def handle_subscription_created(subscription: dict):
    """
    Handle new subscription creation
    """
    customer_id = subscription.get("customer")
    status = subscription.get("status")
    price_id = subscription["items"]["data"][0]["price"]["id"]
    tier = TIER_MAP.get(price_id, "starter")
    
    # Find tenant by Stripe customer ID
    tenant = await get_tenant_by_stripe_customer(customer_id)
    if tenant:
        await update_tenant_subscription(
            tenant_id=tenant["id"],
            subscription_tier=tier,
            subscription_status=status
        )
        logger.info(f"Subscription created: {tier} for tenant {tenant['id']}")

async def handle_subscription_updated(subscription: dict):
    """
    Handle subscription updates (plan changes, renewals)
    """
    customer_id = subscription.get("customer")
    status = subscription.get("status")
    price_id = subscription["items"]["data"][0]["price"]["id"]
    tier = TIER_MAP.get(price_id, "starter")
    
    # Handle plan changes
    if subscription.get("cancel_at_period_end"):
        status = "canceling"
    
    tenant = await get_tenant_by_stripe_customer(customer_id)
    if tenant:
        await update_tenant_subscription(
            tenant_id=tenant["id"],
            subscription_tier=tier,
            subscription_status=status
        )
        logger.info(f"Subscription updated: {tier}/{status} for tenant {tenant['id']}")

async def handle_subscription_deleted(subscription: dict):
    """
    Handle subscription cancellation
    """
    customer_id = subscription.get("customer")
    
    tenant = await get_tenant_by_stripe_customer(customer_id)
    if tenant:
        await update_tenant_subscription(
            tenant_id=tenant["id"],
            subscription_status="canceled"
        )
        logger.info(f"Subscription canceled for tenant {tenant['id']}")
        
        # Optionally: Send cancellation email, schedule data cleanup, etc.

async def handle_invoice_paid(invoice: dict):
    """
    Handle successful invoice payment
    """
    customer_id = invoice.get("customer")
    amount_paid = invoice.get("amount_paid", 0) / 100  # Convert from cents
    invoice_id = invoice.get("id")
    
    tenant = await get_tenant_by_stripe_customer(customer_id)
    if tenant:
        # Record payment
        await record_payment(
            tenant_id=tenant["id"],
            stripe_invoice_id=invoice_id,
            amount=amount_paid,
            status="paid"
        )
        logger.info(f"Payment recorded: ${amount_paid} for tenant {tenant['id']}")

async def handle_payment_failed(invoice: dict):
    """
    Handle failed payment
    """
    customer_id = invoice.get("customer")
    attempt_count = invoice.get("attempt_count", 1)
    next_attempt = invoice.get("next_payment_attempt")
    
    tenant = await get_tenant_by_stripe_customer(customer_id)
    if tenant:
        # Update tenant status
        if attempt_count >= 3:
            await update_tenant_subscription(
                tenant_id=tenant["id"],
                subscription_status="past_due"
            )
        
        # Send notification
        await send_payment_failed_notification(
            tenant_id=tenant["id"],
            attempt_count=attempt_count,
            next_attempt=datetime.fromtimestamp(next_attempt) if next_attempt else None
        )
        logger.warning(f"Payment failed (attempt {attempt_count}) for tenant {tenant['id']}")

async def handle_customer_created(customer: dict):
    """
    Handle new Stripe customer creation
    """
    customer_id = customer.get("id")
    email = customer.get("email")
    metadata = customer.get("metadata", {})
    tenant_id = metadata.get("tenant_id")
    
    if tenant_id:
        await update_tenant_stripe_customer(tenant_id, customer_id)
        logger.info(f"Stripe customer {customer_id} linked to tenant {tenant_id}")

# ═══════════════════════════════════════════════════════════════════════════════
# DATABASE HELPERS (Placeholder implementations)
# ═══════════════════════════════════════════════════════════════════════════════

async def get_tenant_by_stripe_customer(customer_id: str) -> Optional[dict]:
    """Get tenant by Stripe customer ID"""
    # TODO: Implement actual database query
    # SELECT * FROM tenants WHERE stripe_customer_id = $1
    return None

async def update_tenant_subscription(
    tenant_id: str,
    stripe_customer_id: str = None,
    subscription_tier: str = None,
    subscription_status: str = None
):
    """Update tenant subscription details"""
    # TODO: Implement actual database update
    # UPDATE tenants SET ... WHERE id = $1
    pass

async def update_tenant_stripe_customer(tenant_id: str, customer_id: str):
    """Link Stripe customer to tenant"""
    # TODO: Implement actual database update
    # UPDATE tenants SET stripe_customer_id = $2 WHERE id = $1
    pass

async def record_payment(
    tenant_id: str,
    stripe_invoice_id: str,
    amount: float,
    status: str
):
    """Record payment in billing history"""
    # TODO: Implement actual database insert
    pass

async def send_payment_failed_notification(
    tenant_id: str,
    attempt_count: int,
    next_attempt: Optional[datetime]
):
    """Send payment failed notification via email"""
    # TODO: Implement email sending
    pass

# ═══════════════════════════════════════════════════════════════════════════════
# BILLING API ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

billing_router = APIRouter(prefix="/api/billing", tags=["billing"])

@billing_router.post("/create-checkout-session")
async def create_checkout_session(
    tenant_id: str,
    price_id: str,
    success_url: str,
    cancel_url: str
):
    """Create Stripe checkout session for subscription"""
    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            payment_method_types=["card"],
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={"tenant_id": tenant_id},
            subscription_data={
                "metadata": {"tenant_id": tenant_id}
            }
        )
        return {"session_id": session.id, "url": session.url}
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))

@billing_router.post("/create-portal-session")
async def create_portal_session(tenant_id: str, return_url: str):
    """Create Stripe billing portal session for customer self-service"""
    tenant = await get_tenant_by_id(tenant_id)
    if not tenant or not tenant.get("stripe_customer_id"):
        raise HTTPException(status_code=404, detail="No billing account found")
    
    try:
        session = stripe.billing_portal.Session.create(
            customer=tenant["stripe_customer_id"],
            return_url=return_url
        )
        return {"url": session.url}
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))

@billing_router.get("/subscription")
async def get_subscription(tenant_id: str):
    """Get current subscription details"""
    tenant = await get_tenant_by_id(tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    return {
        "tier": tenant.get("subscription_tier", "starter"),
        "status": tenant.get("subscription_status", "active"),
        "stripe_customer_id": tenant.get("stripe_customer_id")
    }

async def get_tenant_by_id(tenant_id: str) -> Optional[dict]:
    """Get tenant by ID"""
    # TODO: Implement actual database query
    return None
