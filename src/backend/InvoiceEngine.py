"""
DivertScan™ Apex Enterprise - Invoice Engine v3.0
QuickBooks Online Integration & Automated Billing
"""

import os
import json
import base64
import hashlib
import hmac
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field, asdict
from enum import Enum
import asyncio
import aiohttp
from io import BytesIO


# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class QBOConfig:
    client_id: str = field(default_factory=lambda: os.getenv("QBO_CLIENT_ID", ""))
    client_secret: str = field(default_factory=lambda: os.getenv("QBO_CLIENT_SECRET", ""))
    redirect_uri: str = field(default_factory=lambda: os.getenv("QBO_REDIRECT_URI", ""))
    environment: str = field(default_factory=lambda: os.getenv("QBO_ENVIRONMENT", "sandbox"))
    
    @property
    def base_url(self) -> str:
        if self.environment == "production":
            return "https://quickbooks.api.intuit.com"
        return "https://sandbox-quickbooks.api.intuit.com"
    
    @property
    def auth_url(self) -> str:
        return "https://appcenter.intuit.com/connect/oauth2"
    
    @property
    def token_url(self) -> str:
        return "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"


# ═══════════════════════════════════════════════════════════════════════════════
# DATA MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class InvoiceStatus(Enum):
    DRAFT = "draft"
    PENDING = "pending"
    SENT = "sent"
    PAID = "paid"
    OVERDUE = "overdue"
    VOID = "void"


class MaterialCategory(Enum):
    CONCRETE = "concrete"
    ASPHALT = "asphalt"
    METAL_FERROUS = "metal_ferrous"
    METAL_NONFERROUS = "metal_nonferrous"
    WOOD_CLEAN = "wood_clean"
    WOOD_TREATED = "wood_treated"
    CARDBOARD = "cardboard"
    DRYWALL = "drywall"
    MIXED_CND = "mixed_c_and_d"
    ROOFING = "roofing"
    OTHER = "other"


@dataclass
class QBOToken:
    access_token: str
    refresh_token: str
    realm_id: str
    expires_at: datetime
    refresh_expires_at: datetime
    
    def is_expired(self) -> bool:
        return datetime.utcnow() >= self.expires_at - timedelta(minutes=5)
    
    def needs_refresh(self) -> bool:
        return self.is_expired() and datetime.utcnow() < self.refresh_expires_at


@dataclass
class WeightTicket:
    id: str
    ticket_number: str
    project_id: str
    project_name: str
    gross_weight: float
    tare_weight: float
    net_weight: float
    weight_unit: str
    material_type: str
    destination: str
    facility_name: str
    driver_name: str
    truck_plate: str
    captured_at: datetime
    status: str
    pdf_url: Optional[str] = None
    line_item_amount: Optional[float] = None


@dataclass
class InvoiceLineItem:
    description: str
    quantity: float
    unit_price: float
    amount: float
    ticket_ids: List[str] = field(default_factory=list)
    material_type: Optional[str] = None
    service_date: Optional[datetime] = None
    
    def to_qbo_format(self, item_ref: Dict) -> Dict:
        line = {
            "DetailType": "SalesItemLineDetail",
            "Amount": round(self.amount, 2),
            "Description": self.description,
            "SalesItemLineDetail": {
                "ItemRef": item_ref,
                "Qty": self.quantity,
                "UnitPrice": round(self.unit_price, 2)
            }
        }
        if self.service_date:
            line["SalesItemLineDetail"]["ServiceDate"] = self.service_date.strftime("%Y-%m-%d")
        return line


@dataclass
class Invoice:
    id: Optional[str] = None
    tenant_id: str = ""
    project_id: str = ""
    project_name: str = ""
    customer_name: str = ""
    customer_email: Optional[str] = None
    status: InvoiceStatus = InvoiceStatus.DRAFT
    line_items: List[InvoiceLineItem] = field(default_factory=list)
    subtotal: float = 0.0
    tax_rate: float = 0.0
    tax_amount: float = 0.0
    total: float = 0.0
    due_date: Optional[datetime] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    sent_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    qbo_invoice_id: Optional[str] = None
    qbo_doc_number: Optional[str] = None
    attachments: List[str] = field(default_factory=list)
    notes: Optional[str] = None
    
    def calculate_totals(self) -> None:
        self.subtotal = sum(item.amount for item in self.line_items)
        self.tax_amount = round(self.subtotal * self.tax_rate, 2)
        self.total = round(self.subtotal + self.tax_amount, 2)


@dataclass
class Customer:
    id: Optional[str] = None
    display_name: str = ""
    company_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    billing_address: Optional[Dict] = None
    qbo_customer_id: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════════════════
# QBO OAUTH CLIENT
# ═══════════════════════════════════════════════════════════════════════════════

class QBOAuthClient:
    def __init__(self, config: QBOConfig):
        self.config = config
        self._session: Optional[aiohttp.ClientSession] = None
    
    async def get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session
    
    async def close(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()
    
    def get_authorization_url(self, state: str, scope: str = "com.intuit.quickbooks.accounting") -> str:
        params = {
            "client_id": self.config.client_id,
            "response_type": "code",
            "scope": scope,
            "redirect_uri": self.config.redirect_uri,
            "state": state
        }
        query = "&".join(f"{k}={v}" for k, v in params.items())
        return f"{self.config.auth_url}?{query}"
    
    async def exchange_code(self, code: str, realm_id: str) -> QBOToken:
        session = await self.get_session()
        
        auth_header = base64.b64encode(
            f"{self.config.client_id}:{self.config.client_secret}".encode()
        ).decode()
        
        async with session.post(
            self.config.token_url,
            headers={
                "Authorization": f"Basic {auth_header}",
                "Content-Type": "application/x-www-form-urlencoded"
            },
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": self.config.redirect_uri
            }
        ) as response:
            if response.status != 200:
                error = await response.text()
                raise QBOError(f"Token exchange failed: {error}")
            
            data = await response.json()
            return QBOToken(
                access_token=data["access_token"],
                refresh_token=data["refresh_token"],
                realm_id=realm_id,
                expires_at=datetime.utcnow() + timedelta(seconds=data["expires_in"]),
                refresh_expires_at=datetime.utcnow() + timedelta(seconds=data.get("x_refresh_token_expires_in", 8726400))
            )
    
    async def refresh_token(self, token: QBOToken) -> QBOToken:
        session = await self.get_session()
        
        auth_header = base64.b64encode(
            f"{self.config.client_id}:{self.config.client_secret}".encode()
        ).decode()
        
        async with session.post(
            self.config.token_url,
            headers={
                "Authorization": f"Basic {auth_header}",
                "Content-Type": "application/x-www-form-urlencoded"
            },
            data={
                "grant_type": "refresh_token",
                "refresh_token": token.refresh_token
            }
        ) as response:
            if response.status != 200:
                error = await response.text()
                raise QBOError(f"Token refresh failed: {error}")
            
            data = await response.json()
            return QBOToken(
                access_token=data["access_token"],
                refresh_token=data["refresh_token"],
                realm_id=token.realm_id,
                expires_at=datetime.utcnow() + timedelta(seconds=data["expires_in"]),
                refresh_expires_at=datetime.utcnow() + timedelta(seconds=data.get("x_refresh_token_expires_in", 8726400))
            )


# ═══════════════════════════════════════════════════════════════════════════════
# QBO API CLIENT
# ═══════════════════════════════════════════════════════════════════════════════

class QBOClient:
    def __init__(self, config: QBOConfig, token: QBOToken):
        self.config = config
        self.token = token
        self._session: Optional[aiohttp.ClientSession] = None
    
    async def get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session
    
    async def close(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()
    
    def _get_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token.access_token}",
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
    
    def _build_url(self, endpoint: str) -> str:
        return f"{self.config.base_url}/v3/company/{self.token.realm_id}/{endpoint}"
    
    async def _request(self, method: str, endpoint: str, data: Optional[Dict] = None) -> Dict:
        session = await self.get_session()
        url = self._build_url(endpoint)
        
        kwargs = {"headers": self._get_headers()}
        if data:
            kwargs["json"] = data
        
        async with session.request(method, url, **kwargs) as response:
            if response.status >= 400:
                error = await response.text()
                raise QBOError(f"QBO API error ({response.status}): {error}")
            return await response.json()
    
    # ─────────────────────────────────────────────────────────────────────────────
    # CUSTOMERS
    # ─────────────────────────────────────────────────────────────────────────────
    
    async def find_customer(self, display_name: str) -> Optional[Dict]:
        query = f"SELECT * FROM Customer WHERE DisplayName = '{display_name}'"
        result = await self._request("GET", f"query?query={query}")
        customers = result.get("QueryResponse", {}).get("Customer", [])
        return customers[0] if customers else None
    
    async def create_customer(self, customer: Customer) -> Dict:
        data = {
            "DisplayName": customer.display_name,
            "CompanyName": customer.company_name or customer.display_name
        }
        
        if customer.email:
            data["PrimaryEmailAddr"] = {"Address": customer.email}
        
        if customer.phone:
            data["PrimaryPhone"] = {"FreeFormNumber": customer.phone}
        
        if customer.billing_address:
            data["BillAddr"] = customer.billing_address
        
        result = await self._request("POST", "customer", data)
        return result["Customer"]
    
    async def get_or_create_customer(self, customer: Customer) -> Dict:
        existing = await self.find_customer(customer.display_name)
        if existing:
            return existing
        return await self.create_customer(customer)
    
    # ─────────────────────────────────────────────────────────────────────────────
    # ITEMS (SERVICES/PRODUCTS)
    # ─────────────────────────────────────────────────────────────────────────────
    
    async def find_item(self, name: str) -> Optional[Dict]:
        query = f"SELECT * FROM Item WHERE Name = '{name}'"
        result = await self._request("GET", f"query?query={query}")
        items = result.get("QueryResponse", {}).get("Item", [])
        return items[0] if items else None
    
    async def create_item(self, name: str, description: str, unit_price: float) -> Dict:
        # Get income account
        income_account = await self._get_income_account()
        
        data = {
            "Name": name,
            "Description": description,
            "Type": "Service",
            "UnitPrice": unit_price,
            "IncomeAccountRef": {"value": income_account["Id"]}
        }
        
        result = await self._request("POST", "item", data)
        return result["Item"]
    
    async def get_or_create_item(self, name: str, description: str, unit_price: float = 0) -> Dict:
        existing = await self.find_item(name)
        if existing:
            return existing
        return await self.create_item(name, description, unit_price)
    
    async def _get_income_account(self) -> Dict:
        query = "SELECT * FROM Account WHERE AccountType = 'Income' MAXRESULTS 1"
        result = await self._request("GET", f"query?query={query}")
        accounts = result.get("QueryResponse", {}).get("Account", [])
        if not accounts:
            raise QBOError("No income account found")
        return accounts[0]
    
    # ─────────────────────────────────────────────────────────────────────────────
    # INVOICES
    # ─────────────────────────────────────────────────────────────────────────────
    
    async def create_invoice(self, invoice: Invoice, customer_ref: Dict, item_ref: Dict) -> Dict:
        lines = [item.to_qbo_format(item_ref) for item in invoice.line_items]
        
        data = {
            "CustomerRef": {"value": customer_ref["Id"]},
            "Line": lines,
            "DueDate": invoice.due_date.strftime("%Y-%m-%d") if invoice.due_date else None,
            "PrivateNote": invoice.notes or f"DivertScan Invoice - Project: {invoice.project_name}"
        }
        
        # Remove None values
        data = {k: v for k, v in data.items() if v is not None}
        
        result = await self._request("POST", "invoice", data)
        return result["Invoice"]
    
    async def get_invoice(self, invoice_id: str) -> Dict:
        result = await self._request("GET", f"invoice/{invoice_id}")
        return result["Invoice"]
    
    async def send_invoice(self, invoice_id: str, email: Optional[str] = None) -> Dict:
        url = f"invoice/{invoice_id}/send"
        if email:
            url += f"?sendTo={email}"
        result = await self._request("POST", url)
        return result["Invoice"]
    
    async def void_invoice(self, invoice_id: str) -> Dict:
        invoice = await self.get_invoice(invoice_id)
        invoice["sparse"] = True
        invoice["Voided"] = True
        result = await self._request("POST", "invoice", invoice)
        return result["Invoice"]
    
    # ─────────────────────────────────────────────────────────────────────────────
    # ATTACHMENTS
    # ─────────────────────────────────────────────────────────────────────────────
    
    async def upload_attachment(self, entity_type: str, entity_id: str, 
                                filename: str, content: bytes, content_type: str) -> Dict:
        session = await self.get_session()
        url = f"{self.config.base_url}/v3/company/{self.token.realm_id}/upload"
        
        form = aiohttp.FormData()
        form.add_field("file_metadata_01", 
                       json.dumps({
                           "AttachableRef": [{"EntityRef": {"type": entity_type, "value": entity_id}}],
                           "FileName": filename,
                           "ContentType": content_type
                       }),
                       content_type="application/json")
        form.add_field("file_content_01", content, 
                       filename=filename, content_type=content_type)
        
        async with session.post(
            url,
            headers={"Authorization": f"Bearer {self.token.access_token}"},
            data=form
        ) as response:
            if response.status >= 400:
                error = await response.text()
                raise QBOError(f"Attachment upload failed: {error}")
            return await response.json()


# ═══════════════════════════════════════════════════════════════════════════════
# INVOICE GENERATOR
# ═══════════════════════════════════════════════════════════════════════════════

class InvoiceGenerator:
    """Generates invoices from closed weight tickets for a project."""
    
    MATERIAL_RATES: Dict[str, float] = {
        "concrete": 35.00,
        "asphalt": 38.00,
        "metal_ferrous": 45.00,
        "metal_nonferrous": 85.00,
        "wood_clean": 42.00,
        "wood_treated": 55.00,
        "cardboard": 28.00,
        "drywall": 48.00,
        "mixed_c_and_d": 52.00,
        "roofing": 58.00,
        "other": 50.00
    }
    
    def __init__(self, tenant_id: str):
        self.tenant_id = tenant_id
    
    def generate_from_tickets(self, tickets: List[WeightTicket], project_name: str,
                              customer_name: str, customer_email: Optional[str] = None,
                              group_by_material: bool = True) -> Invoice:
        """Generate an invoice from a list of weight tickets."""
        
        invoice = Invoice(
            tenant_id=self.tenant_id,
            project_id=tickets[0].project_id if tickets else "",
            project_name=project_name,
            customer_name=customer_name,
            customer_email=customer_email,
            due_date=datetime.utcnow() + timedelta(days=30)
        )
        
        if group_by_material:
            invoice.line_items = self._group_by_material(tickets)
        else:
            invoice.line_items = self._individual_lines(tickets)
        
        invoice.calculate_totals()
        return invoice
    
    def _group_by_material(self, tickets: List[WeightTicket]) -> List[InvoiceLineItem]:
        """Group tickets by material type for consolidated line items."""
        
        material_groups: Dict[str, Dict] = {}
        
        for ticket in tickets:
            key = ticket.material_type
            if key not in material_groups:
                material_groups[key] = {
                    "total_weight": 0.0,
                    "ticket_ids": [],
                    "destination": ticket.destination,
                    "min_date": ticket.captured_at,
                    "max_date": ticket.captured_at
                }
            
            group = material_groups[key]
            weight_tons = self._convert_to_tons(ticket.net_weight, ticket.weight_unit)
            group["total_weight"] += weight_tons
            group["ticket_ids"].append(ticket.id)
            group["min_date"] = min(group["min_date"], ticket.captured_at)
            group["max_date"] = max(group["max_date"], ticket.captured_at)
        
        line_items = []
        for material_type, group in material_groups.items():
            rate = self.MATERIAL_RATES.get(material_type, self.MATERIAL_RATES["other"])
            quantity = round(group["total_weight"], 2)
            amount = round(quantity * rate, 2)
            
            description = self._format_line_description(
                material_type=material_type,
                destination=group["destination"],
                ticket_count=len(group["ticket_ids"]),
                date_range=(group["min_date"], group["max_date"])
            )
            
            line_items.append(InvoiceLineItem(
                description=description,
                quantity=quantity,
                unit_price=rate,
                amount=amount,
                ticket_ids=group["ticket_ids"],
                material_type=material_type,
                service_date=group["max_date"]
            ))
        
        return sorted(line_items, key=lambda x: x.amount, reverse=True)
    
    def _individual_lines(self, tickets: List[WeightTicket]) -> List[InvoiceLineItem]:
        """Create individual line items for each ticket."""
        
        line_items = []
        for ticket in tickets:
            rate = self.MATERIAL_RATES.get(ticket.material_type, self.MATERIAL_RATES["other"])
            weight_tons = self._convert_to_tons(ticket.net_weight, ticket.weight_unit)
            amount = round(weight_tons * rate, 2)
            
            description = f"Ticket #{ticket.ticket_number} - {self._format_material(ticket.material_type)}"
            description += f" ({ticket.destination.title()}) - {ticket.facility_name}"
            
            line_items.append(InvoiceLineItem(
                description=description,
                quantity=round(weight_tons, 2),
                unit_price=rate,
                amount=amount,
                ticket_ids=[ticket.id],
                material_type=ticket.material_type,
                service_date=ticket.captured_at
            ))
        
        return line_items
    
    def _convert_to_tons(self, weight: float, unit: str) -> float:
        """Convert weight to tons."""
        if unit == "tons":
            return weight
        elif unit == "lbs":
            return weight / 2000
        elif unit == "kg":
            return weight / 907.185
        return weight
    
    def _format_line_description(self, material_type: str, destination: str,
                                  ticket_count: int, date_range: tuple) -> str:
        """Format a grouped line item description."""
        material = self._format_material(material_type)
        start_date = date_range[0].strftime("%m/%d/%Y")
        end_date = date_range[1].strftime("%m/%d/%Y")
        
        if start_date == end_date:
            date_str = start_date
        else:
            date_str = f"{start_date} - {end_date}"
        
        return f"{material} ({destination.title()}) - {ticket_count} tickets - {date_str}"
    
    def _format_material(self, material_type: str) -> str:
        """Format material type for display."""
        return material_type.replace("_", " ").title()


# ═══════════════════════════════════════════════════════════════════════════════
# INVOICE ENGINE (MAIN ORCHESTRATOR)
# ═══════════════════════════════════════════════════════════════════════════════

class InvoiceEngine:
    """Main orchestrator for invoice generation and QBO sync."""
    
    def __init__(self, config: Optional[QBOConfig] = None):
        self.config = config or QBOConfig()
        self.auth_client = QBOAuthClient(self.config)
        self._qbo_client: Optional[QBOClient] = None
        self._token: Optional[QBOToken] = None
    
    async def initialize(self, token: QBOToken) -> None:
        """Initialize with an existing token."""
        self._token = token
        self._qbo_client = QBOClient(self.config, token)
    
    async def ensure_token_valid(self) -> None:
        """Ensure the current token is valid, refreshing if needed."""
        if self._token and self._token.needs_refresh():
            self._token = await self.auth_client.refresh_token(self._token)
            self._qbo_client = QBOClient(self.config, self._token)
    
    async def close(self) -> None:
        """Close all connections."""
        await self.auth_client.close()
        if self._qbo_client:
            await self._qbo_client.close()
    
    async def generate_project_invoice(
        self,
        tenant_id: str,
        project_id: str,
        project_name: str,
        customer_name: str,
        tickets: List[WeightTicket],
        customer_email: Optional[str] = None,
        group_by_material: bool = True,
        auto_send: bool = False,
        attach_ticket_pdfs: bool = True
    ) -> Invoice:
        """Generate and optionally send an invoice for closed project tickets."""
        
        if not tickets:
            raise InvoiceError("No tickets provided for invoice generation")
        
        # Ensure we have a valid QBO connection
        await self.ensure_token_valid()
        
        if not self._qbo_client:
            raise InvoiceError("QBO client not initialized")
        
        # Generate the invoice locally
        generator = InvoiceGenerator(tenant_id)
        invoice = generator.generate_from_tickets(
            tickets=tickets,
            project_name=project_name,
            customer_name=customer_name,
            customer_email=customer_email,
            group_by_material=group_by_material
        )
        
        # Get or create QBO customer
        customer = Customer(
            display_name=customer_name,
            email=customer_email
        )
        qbo_customer = await self._qbo_client.get_or_create_customer(customer)
        
        # Get or create service item
        service_item = await self._qbo_client.get_or_create_item(
            name="Waste Hauling Services",
            description="C&D Waste Management and Recycling Services",
            unit_price=0
        )
        
        # Create invoice in QBO
        qbo_invoice = await self._qbo_client.create_invoice(
            invoice=invoice,
            customer_ref=qbo_customer,
            item_ref={"value": service_item["Id"]}
        )
        
        invoice.qbo_invoice_id = qbo_invoice["Id"]
        invoice.qbo_doc_number = qbo_invoice.get("DocNumber")
        
        # Attach ticket PDFs if requested
        if attach_ticket_pdfs:
            await self._attach_ticket_pdfs(invoice, tickets)
        
        # Send invoice if requested
        if auto_send and customer_email:
            await self._qbo_client.send_invoice(
                invoice_id=qbo_invoice["Id"],
                email=customer_email
            )
            invoice.status = InvoiceStatus.SENT
            invoice.sent_at = datetime.utcnow()
        else:
            invoice.status = InvoiceStatus.PENDING
        
        return invoice
    
    async def _attach_ticket_pdfs(self, invoice: Invoice, tickets: List[WeightTicket]) -> None:
        """Attach ticket PDFs to the QBO invoice."""
        
        if not self._qbo_client or not invoice.qbo_invoice_id:
            return
        
        for ticket in tickets:
            if ticket.pdf_url:
                try:
                    # Fetch PDF content
                    async with aiohttp.ClientSession() as session:
                        async with session.get(ticket.pdf_url) as response:
                            if response.status == 200:
                                content = await response.read()
                                
                                await self._qbo_client.upload_attachment(
                                    entity_type="Invoice",
                                    entity_id=invoice.qbo_invoice_id,
                                    filename=f"ticket_{ticket.ticket_number}.pdf",
                                    content=content,
                                    content_type="application/pdf"
                                )
                                invoice.attachments.append(ticket.pdf_url)
                except Exception as e:
                    # Log but don't fail the invoice
                    print(f"Failed to attach PDF for ticket {ticket.ticket_number}: {e}")
    
    async def get_invoice_status(self, qbo_invoice_id: str) -> Dict:
        """Get the current status of a QBO invoice."""
        
        await self.ensure_token_valid()
        
        if not self._qbo_client:
            raise InvoiceError("QBO client not initialized")
        
        qbo_invoice = await self._qbo_client.get_invoice(qbo_invoice_id)
        
        balance = float(qbo_invoice.get("Balance", 0))
        total = float(qbo_invoice.get("TotalAmt", 0))
        
        if balance == 0 and total > 0:
            status = InvoiceStatus.PAID
        elif qbo_invoice.get("EmailStatus") == "EmailSent":
            due_date = datetime.strptime(qbo_invoice["DueDate"], "%Y-%m-%d")
            if datetime.utcnow() > due_date:
                status = InvoiceStatus.OVERDUE
            else:
                status = InvoiceStatus.SENT
        else:
            status = InvoiceStatus.PENDING
        
        return {
            "qbo_invoice_id": qbo_invoice["Id"],
            "doc_number": qbo_invoice.get("DocNumber"),
            "status": status.value,
            "total": total,
            "balance": balance,
            "due_date": qbo_invoice.get("DueDate"),
            "email_status": qbo_invoice.get("EmailStatus")
        }
    
    async def send_invoice(self, qbo_invoice_id: str, email: Optional[str] = None) -> None:
        """Send an invoice via QBO."""
        
        await self.ensure_token_valid()
        
        if not self._qbo_client:
            raise InvoiceError("QBO client not initialized")
        
        await self._qbo_client.send_invoice(qbo_invoice_id, email)
    
    async def void_invoice(self, qbo_invoice_id: str) -> None:
        """Void an invoice in QBO."""
        
        await self.ensure_token_valid()
        
        if not self._qbo_client:
            raise InvoiceError("QBO client not initialized")
        
        await self._qbo_client.void_invoice(qbo_invoice_id)


# ═══════════════════════════════════════════════════════════════════════════════
# MONTH-END BATCH PROCESSOR
# ═══════════════════════════════════════════════════════════════════════════════

class MonthEndProcessor:
    """Automated month-end invoice batch processing."""
    
    def __init__(self, engine: InvoiceEngine):
        self.engine = engine
    
    async def process_project_month_end(
        self,
        tenant_id: str,
        project_id: str,
        project_name: str,
        customer_name: str,
        tickets: List[WeightTicket],
        customer_email: Optional[str] = None,
        billing_period: Optional[tuple] = None
    ) -> Invoice:
        """Process month-end invoicing for a project."""
        
        # Filter to closed/verified tickets only
        billable_tickets = [
            t for t in tickets 
            if t.status in ("verified", "closed") and not t.line_item_amount
        ]
        
        if not billable_tickets:
            raise InvoiceError("No billable tickets found for this period")
        
        # Generate and send invoice
        invoice = await self.engine.generate_project_invoice(
            tenant_id=tenant_id,
            project_id=project_id,
            project_name=project_name,
            customer_name=customer_name,
            tickets=billable_tickets,
            customer_email=customer_email,
            group_by_material=True,
            auto_send=True,
            attach_ticket_pdfs=True
        )
        
        return invoice
    
    async def process_all_projects(
        self,
        tenant_id: str,
        projects_data: List[Dict]
    ) -> List[Dict]:
        """Process month-end for multiple projects."""
        
        results = []
        
        for project in projects_data:
            try:
                invoice = await self.process_project_month_end(
                    tenant_id=tenant_id,
                    project_id=project["project_id"],
                    project_name=project["project_name"],
                    customer_name=project["customer_name"],
                    tickets=project["tickets"],
                    customer_email=project.get("customer_email")
                )
                
                results.append({
                    "project_id": project["project_id"],
                    "status": "success",
                    "invoice_id": invoice.qbo_invoice_id,
                    "total": invoice.total,
                    "ticket_count": len(invoice.line_items)
                })
            except Exception as e:
                results.append({
                    "project_id": project["project_id"],
                    "status": "error",
                    "error": str(e)
                })
        
        return results


# ═══════════════════════════════════════════════════════════════════════════════
# EXCEPTIONS
# ═══════════════════════════════════════════════════════════════════════════════

class QBOError(Exception):
    """QuickBooks Online API error."""
    pass


class InvoiceError(Exception):
    """Invoice generation error."""
    pass


# ═══════════════════════════════════════════════════════════════════════════════
# EXPORTS
# ═══════════════════════════════════════════════════════════════════════════════

__all__ = [
    "QBOConfig",
    "QBOToken",
    "QBOAuthClient",
    "QBOClient",
    "Invoice",
    "InvoiceLineItem",
    "InvoiceStatus",
    "InvoiceGenerator",
    "InvoiceEngine",
    "MonthEndProcessor",
    "WeightTicket",
    "Customer",
    "QBOError",
    "InvoiceError"
]
