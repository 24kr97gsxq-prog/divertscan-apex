"""
DivertScan™ Apex Enterprise - Celery Background Tasks
Async processing for OCR, invoices, reports, notifications
"""

from celery import Celery, Task
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
import os
import logging

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════════
# CELERY CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

app = Celery(
    "divertscan",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["src.backend.tasks"]
)

app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,  # 5 minutes max
    task_soft_time_limit=240,  # 4 minutes soft limit
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    # Rate limiting
    task_annotations={
        "src.backend.tasks.process_ocr": {"rate_limit": "100/h"},
        "src.backend.tasks.send_sms": {"rate_limit": "60/m"},
    },
    # Retry configuration
    task_default_retry_delay=60,
    task_max_retries=3,
    # Beat schedule for periodic tasks
    beat_schedule={
        "check-permit-expirations": {
            "task": "src.backend.tasks.check_permit_expirations",
            "schedule": 86400.0,  # Daily
        },
        "generate-monthly-invoices": {
            "task": "src.backend.tasks.generate_monthly_invoices",
            "schedule": timedelta(days=1),
            "kwargs": {"day_of_month": 1}
        },
        "sync-qbo-invoices": {
            "task": "src.backend.tasks.sync_pending_invoices",
            "schedule": 3600.0,  # Hourly
        },
        "cleanup-old-sessions": {
            "task": "src.backend.tasks.cleanup_stale_sessions",
            "schedule": 86400.0,  # Daily
        },
    }
)

# ═══════════════════════════════════════════════════════════════════════════════
# BASE TASK WITH RETRY
# ═══════════════════════════════════════════════════════════════════════════════

class RetryableTask(Task):
    """Base task with automatic retry on failure"""
    
    autoretry_for = (Exception,)
    retry_backoff = True
    retry_backoff_max = 600  # Max 10 minutes between retries
    retry_jitter = True
    
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        logger.error(f"Task {self.name}[{task_id}] failed: {exc}")
        super().on_failure(exc, task_id, args, kwargs, einfo)

# ═══════════════════════════════════════════════════════════════════════════════
# OCR TASKS
# ═══════════════════════════════════════════════════════════════════════════════

@app.task(base=RetryableTask, bind=True)
def process_ocr(self, image_url: str, ticket_id: str, tenant_id: str):
    """
    Process ticket image through OCR pipeline
    Auto-detects source (B&B, Liberty, generic)
    """
    try:
        from .UnifiedOCR import UnifiedOCR
        
        logger.info(f"Processing OCR for ticket {ticket_id}")
        
        ocr = UnifiedOCR()
        result = ocr.extract_from_url(image_url)
        
        if result.confidence >= 0.7:
            # Update ticket with extracted data
            update_ticket_from_ocr.delay(
                ticket_id=ticket_id,
                tenant_id=tenant_id,
                ocr_data=result.to_dict()
            )
            logger.info(f"OCR completed for {ticket_id}: confidence {result.confidence}")
        else:
            logger.warning(f"Low OCR confidence for {ticket_id}: {result.confidence}")
            # Flag for manual review
            flag_ticket_for_review.delay(ticket_id, "Low OCR confidence")
        
        return {"ticket_id": ticket_id, "confidence": result.confidence}
        
    except Exception as e:
        logger.error(f"OCR failed for {ticket_id}: {e}")
        raise self.retry(exc=e)

@app.task
def update_ticket_from_ocr(ticket_id: str, tenant_id: str, ocr_data: dict):
    """Update ticket record with OCR extracted data"""
    # TODO: Implement database update
    logger.info(f"Updating ticket {ticket_id} with OCR data")

@app.task
def flag_ticket_for_review(ticket_id: str, reason: str):
    """Flag ticket for manual review"""
    # TODO: Implement flagging logic
    logger.info(f"Flagging ticket {ticket_id} for review: {reason}")

# ═══════════════════════════════════════════════════════════════════════════════
# INVOICE TASKS
# ═══════════════════════════════════════════════════════════════════════════════

@app.task(base=RetryableTask, bind=True)
def generate_invoice(
    self,
    tenant_id: str,
    project_id: str,
    period_start: str,
    period_end: str,
    sync_to_qbo: bool = True
):
    """
    Generate invoice from tickets in date range
    Optionally syncs to QuickBooks Online
    """
    try:
        from .InvoiceEngine import InvoiceGenerator
        
        logger.info(f"Generating invoice for project {project_id}")
        
        generator = InvoiceGenerator(tenant_id)
        invoice = generator.generate(
            project_id=project_id,
            period_start=datetime.fromisoformat(period_start),
            period_end=datetime.fromisoformat(period_end)
        )
        
        if sync_to_qbo:
            sync_invoice_to_qbo.delay(tenant_id, invoice.id)
        
        # Send notification
        send_invoice_notification.delay(tenant_id, invoice.id)
        
        return {"invoice_id": invoice.id, "total": invoice.total_amount}
        
    except Exception as e:
        logger.error(f"Invoice generation failed: {e}")
        raise self.retry(exc=e)

@app.task(base=RetryableTask, bind=True)
def sync_invoice_to_qbo(self, tenant_id: str, invoice_id: str):
    """Sync invoice to QuickBooks Online"""
    try:
        from .InvoiceEngine import QBOClient
        
        logger.info(f"Syncing invoice {invoice_id} to QBO")
        
        client = QBOClient(tenant_id)
        qbo_invoice = client.create_invoice(invoice_id)
        
        # Optionally send via QBO
        client.send_invoice(qbo_invoice.id)
        
        return {"qbo_invoice_id": qbo_invoice.id}
        
    except Exception as e:
        logger.error(f"QBO sync failed for {invoice_id}: {e}")
        raise self.retry(exc=e)

@app.task
def generate_monthly_invoices(day_of_month: int = 1):
    """Generate invoices for all active projects (scheduled task)"""
    if datetime.utcnow().day != day_of_month:
        return
    
    logger.info("Starting monthly invoice generation")
    
    # Get all active projects with tickets
    # TODO: Implement database query
    projects = []
    
    for project in projects:
        last_month_start = (datetime.utcnow().replace(day=1) - timedelta(days=1)).replace(day=1)
        last_month_end = datetime.utcnow().replace(day=1) - timedelta(days=1)
        
        generate_invoice.delay(
            tenant_id=project["tenant_id"],
            project_id=project["id"],
            period_start=last_month_start.isoformat(),
            period_end=last_month_end.isoformat()
        )

@app.task
def sync_pending_invoices():
    """Sync all pending invoices to QBO (scheduled task)"""
    # TODO: Query pending invoices and sync each
    logger.info("Checking for pending QBO syncs")

# ═══════════════════════════════════════════════════════════════════════════════
# SMS TASKS
# ═══════════════════════════════════════════════════════════════════════════════

@app.task(base=RetryableTask, bind=True)
def send_sms(self, to: str, message: str, ticket_id: Optional[str] = None):
    """Send SMS via Twilio"""
    try:
        from twilio.rest import Client
        
        account_sid = os.getenv("TWILIO_ACCOUNT_SID")
        auth_token = os.getenv("TWILIO_AUTH_TOKEN")
        from_number = os.getenv("TWILIO_PHONE_NUMBER")
        
        client = Client(account_sid, auth_token)
        
        # Format phone number
        if not to.startswith("+"):
            to = f"+1{to.replace('-', '').replace(' ', '')}"
        
        result = client.messages.create(
            body=message,
            from_=from_number,
            to=to
        )
        
        logger.info(f"SMS sent to {to}: {result.sid}")
        return {"sid": result.sid, "status": result.status}
        
    except Exception as e:
        logger.error(f"SMS failed to {to}: {e}")
        raise self.retry(exc=e)

@app.task
def send_ticket_receipt(ticket_id: str, phone: str, tenant_id: str):
    """Send digital receipt SMS to driver"""
    receipt_url = f"https://app.divertscan.com/receipt/{ticket_id}"
    
    message = (
        f"DivertScan Receipt\n"
        f"Your weight ticket is ready.\n"
        f"View: {receipt_url}"
    )
    
    send_sms.delay(phone, message, ticket_id)

# ═══════════════════════════════════════════════════════════════════════════════
# NOTIFICATION TASKS
# ═══════════════════════════════════════════════════════════════════════════════

@app.task
def send_invoice_notification(tenant_id: str, invoice_id: str):
    """Send invoice ready notification"""
    # TODO: Implement email notification
    logger.info(f"Sending invoice notification for {invoice_id}")

@app.task
def send_permit_expiration_alert(tenant_id: str, permit_id: str, days_remaining: int):
    """Send permit expiration alert email"""
    # TODO: Implement email notification
    logger.info(f"Permit {permit_id} expires in {days_remaining} days")

@app.task
def check_permit_expirations():
    """Check for expiring permits and send alerts (scheduled task)"""
    logger.info("Checking permit expirations")
    
    # TODO: Query expiring permits
    # For each permit within alert window, send notification
    expiring_permits = []
    
    for permit in expiring_permits:
        days_remaining = (permit["expiration_date"] - datetime.utcnow()).days
        send_permit_expiration_alert.delay(
            permit["tenant_id"],
            permit["id"],
            days_remaining
        )

# ═══════════════════════════════════════════════════════════════════════════════
# REPORT TASKS
# ═══════════════════════════════════════════════════════════════════════════════

@app.task(base=RetryableTask, bind=True)
def generate_leed_report(
    self,
    tenant_id: str,
    project_id: str,
    start_date: str,
    end_date: str,
    format: str = "pdf"
):
    """Generate LEED compliance report"""
    try:
        from .LEEDAnalyticsEngine import ESGReportGenerator
        
        logger.info(f"Generating LEED report for project {project_id}")
        
        generator = ESGReportGenerator(tenant_id)
        report = generator.generate(
            project_id=project_id,
            start_date=datetime.fromisoformat(start_date),
            end_date=datetime.fromisoformat(end_date),
            format=format
        )
        
        return {"report_url": report.url, "format": format}
        
    except Exception as e:
        logger.error(f"Report generation failed: {e}")
        raise self.retry(exc=e)

@app.task
def generate_carbon_report(tenant_id: str, project_id: str, year: int):
    """Generate annual carbon savings report"""
    logger.info(f"Generating carbon report for {project_id} year {year}")
    # TODO: Implement carbon report generation

# ═══════════════════════════════════════════════════════════════════════════════
# CLEANUP TASKS
# ═══════════════════════════════════════════════════════════════════════════════

@app.task
def cleanup_stale_sessions():
    """Clean up abandoned live load sessions (scheduled task)"""
    logger.info("Cleaning up stale sessions")
    
    # Sessions older than 24 hours with status != complete
    cutoff = datetime.utcnow() - timedelta(hours=24)
    
    # TODO: Implement database cleanup
    # DELETE FROM live_sessions WHERE status != 'complete' AND updated_at < cutoff

@app.task
def cleanup_old_receipts():
    """Archive or delete old receipt data (scheduled task)"""
    logger.info("Archiving old receipts")
    # Receipts older than 7 years can be archived

# ═══════════════════════════════════════════════════════════════════════════════
# SYNC TASKS
# ═══════════════════════════════════════════════════════════════════════════════

@app.task(base=RetryableTask, bind=True)
def process_sync_queue(self, tenant_id: str, batch_size: int = 50):
    """Process offline sync queue for tenant"""
    try:
        logger.info(f"Processing sync queue for tenant {tenant_id}")
        
        # TODO: Get pending items from sync_queue table
        # For each item, execute the appropriate operation
        # Mark as processed on success
        
        return {"processed": 0}
        
    except Exception as e:
        logger.error(f"Sync queue processing failed: {e}")
        raise self.retry(exc=e)

# ═══════════════════════════════════════════════════════════════════════════════
# BATCH PROCESSING
# ═══════════════════════════════════════════════════════════════════════════════

@app.task
def process_csv_import(
    tenant_id: str,
    project_id: str,
    file_url: str,
    mappings: dict,
    status_override: Optional[str] = None
):
    """Process CSV import in background"""
    logger.info(f"Processing CSV import for project {project_id}")
    
    # Download file
    # Parse CSV with mappings
    # Validate rows
    # Insert in batches
    # Send completion notification
    
    return {"imported": 0, "errors": 0}

@app.task
def batch_ocr_processing(tenant_id: str, ticket_ids: List[str]):
    """Process multiple tickets through OCR"""
    logger.info(f"Batch OCR for {len(ticket_ids)} tickets")
    
    for ticket_id in ticket_ids:
        # Get ticket image URL
        # Queue OCR task
        process_ocr.delay(
            image_url=f"/storage/{tenant_id}/tickets/{ticket_id}/photo.jpg",
            ticket_id=ticket_id,
            tenant_id=tenant_id
        )
