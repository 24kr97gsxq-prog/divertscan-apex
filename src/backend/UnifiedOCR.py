"""
DivertScan™ Apex Enterprise - Unified OCR Engine v3.0
Spatial OCR 2.0 for B&B (Handwritten), Liberty (Thermal), and General Scale Tickets
"""

import os
import re
import json
import base64
import asyncio
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple, Union
from dataclasses import dataclass, field
from enum import Enum
from abc import ABC, abstractmethod
import aiohttp
from io import BytesIO


# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class OCRConfig:
    openai_api_key: str = field(default_factory=lambda: os.getenv("OPENAI_API_KEY", ""))
    anthropic_api_key: str = field(default_factory=lambda: os.getenv("ANTHROPIC_API_KEY", ""))
    google_vision_key: str = field(default_factory=lambda: os.getenv("GOOGLE_VISION_API_KEY", ""))
    default_provider: str = "anthropic"
    max_retries: int = 3
    confidence_threshold: float = 0.75
    enable_preprocessing: bool = True


# ═══════════════════════════════════════════════════════════════════════════════
# DATA MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class TicketSource(Enum):
    B_AND_B = "b_and_b"           # Handwritten red ink
    LIBERTY = "liberty"           # Thermal scale printout
    GENERIC_SCALE = "generic"     # Standard digital scale
    MANUAL = "manual"             # Manual entry
    CSV_IMPORT = "csv_import"     # Bulk import


class WeightUnit(Enum):
    LBS = "lbs"
    TONS = "tons"
    KG = "kg"


class MaterialType(Enum):
    CONCRETE = "concrete"
    ASPHALT = "asphalt"
    METAL_FERROUS = "metal_ferrous"
    METAL_NONFERROUS = "metal_nonferrous"
    WOOD_CLEAN = "wood_clean"
    WOOD_TREATED = "wood_treated"
    CARDBOARD = "cardboard"
    PAPER = "paper"
    PLASTIC = "plastic"
    GLASS = "glass"
    DRYWALL = "drywall"
    INSULATION = "insulation"
    ROOFING = "roofing"
    BRICK_MASONRY = "brick_masonry"
    SOIL_LAND_CLEARING = "soil_land_clearing"
    MIXED_CND = "mixed_c_and_d"
    HAZARDOUS = "hazardous"
    OTHER = "other"


@dataclass
class OCRField:
    """Represents a single extracted field with confidence."""
    value: Any
    confidence: float
    bounding_box: Optional[List[int]] = None
    raw_text: Optional[str] = None
    
    @property
    def is_confident(self) -> bool:
        return self.confidence >= 0.75


@dataclass
class ExtractedTicketData:
    """Complete extracted data from a scale ticket."""
    
    # Core identifiers
    ticket_number: Optional[OCRField] = None
    
    # Weights
    gross_weight: Optional[OCRField] = None
    tare_weight: Optional[OCRField] = None
    net_weight: Optional[OCRField] = None
    weight_unit: Optional[OCRField] = None
    
    # Date/Time
    date: Optional[OCRField] = None
    time_in: Optional[OCRField] = None
    time_out: Optional[OCRField] = None
    
    # Vehicle info
    truck_id: Optional[OCRField] = None
    license_plate: Optional[OCRField] = None
    driver_name: Optional[OCRField] = None
    hauler_company: Optional[OCRField] = None
    
    # Material & destination
    material_type: Optional[OCRField] = None
    material_description: Optional[OCRField] = None
    destination: Optional[OCRField] = None
    
    # Facility info
    facility_name: Optional[OCRField] = None
    facility_address: Optional[OCRField] = None
    
    # Project/customer
    project_name: Optional[OCRField] = None
    customer_name: Optional[OCRField] = None
    job_number: Optional[OCRField] = None
    po_number: Optional[OCRField] = None
    
    # Metadata
    source: TicketSource = TicketSource.GENERIC_SCALE
    overall_confidence: float = 0.0
    raw_ocr_text: str = ""
    processing_notes: List[str] = field(default_factory=list)
    
    def calculate_net_weight(self) -> Optional[float]:
        """Calculate net weight from gross and tare if not directly extracted."""
        if self.net_weight and self.net_weight.value:
            return float(self.net_weight.value)
        
        if self.gross_weight and self.tare_weight:
            gross = self.gross_weight.value
            tare = self.tare_weight.value
            if gross is not None and tare is not None:
                return float(gross) - float(tare)
        
        return None
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for API response."""
        result = {}
        for field_name, field_value in self.__dict__.items():
            if isinstance(field_value, OCRField):
                result[field_name] = {
                    "value": field_value.value,
                    "confidence": field_value.confidence,
                    "raw_text": field_value.raw_text
                }
            elif isinstance(field_value, (TicketSource, WeightUnit, MaterialType)):
                result[field_name] = field_value.value
            elif isinstance(field_value, list):
                result[field_name] = field_value
            else:
                result[field_name] = field_value
        return result


# ═══════════════════════════════════════════════════════════════════════════════
# OCR PROVIDER INTERFACE
# ═══════════════════════════════════════════════════════════════════════════════

class OCRProvider(ABC):
    """Abstract base class for OCR providers."""
    
    @abstractmethod
    async def extract_text(self, image_data: bytes, content_type: str) -> str:
        """Extract raw text from image."""
        pass
    
    @abstractmethod
    async def extract_structured(self, image_data: bytes, content_type: str, 
                                  prompt: str) -> Dict:
        """Extract structured data using vision model."""
        pass


class AnthropicOCR(OCRProvider):
    """Anthropic Claude Vision for OCR extraction."""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.anthropic.com/v1/messages"
    
    async def extract_text(self, image_data: bytes, content_type: str) -> str:
        async with aiohttp.ClientSession() as session:
            b64_image = base64.b64encode(image_data).decode()
            
            payload = {
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 4096,
                "messages": [{
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": content_type,
                                "data": b64_image
                            }
                        },
                        {
                            "type": "text",
                            "text": "Extract ALL text visible in this scale ticket image. Preserve the layout and structure. Include all numbers, dates, weights, and handwritten text."
                        }
                    ]
                }]
            }
            
            async with session.post(
                self.base_url,
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json"
                },
                json=payload
            ) as response:
                if response.status != 200:
                    raise OCRError(f"Anthropic API error: {await response.text()}")
                
                result = await response.json()
                return result["content"][0]["text"]
    
    async def extract_structured(self, image_data: bytes, content_type: str,
                                  prompt: str) -> Dict:
        async with aiohttp.ClientSession() as session:
            b64_image = base64.b64encode(image_data).decode()
            
            payload = {
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 4096,
                "messages": [{
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": content_type,
                                "data": b64_image
                            }
                        },
                        {
                            "type": "text",
                            "text": prompt
                        }
                    ]
                }]
            }
            
            async with session.post(
                self.base_url,
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json"
                },
                json=payload
            ) as response:
                if response.status != 200:
                    raise OCRError(f"Anthropic API error: {await response.text()}")
                
                result = await response.json()
                text = result["content"][0]["text"]
                
                # Extract JSON from response
                json_match = re.search(r'\{[\s\S]*\}', text)
                if json_match:
                    return json.loads(json_match.group())
                
                raise OCRError("Could not extract JSON from response")


class OpenAIOCR(OCRProvider):
    """OpenAI GPT-4 Vision for OCR extraction."""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.openai.com/v1/chat/completions"
    
    async def extract_text(self, image_data: bytes, content_type: str) -> str:
        async with aiohttp.ClientSession() as session:
            b64_image = base64.b64encode(image_data).decode()
            
            payload = {
                "model": "gpt-4o",
                "max_tokens": 4096,
                "messages": [{
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{content_type};base64,{b64_image}"
                            }
                        },
                        {
                            "type": "text",
                            "text": "Extract ALL text visible in this scale ticket image. Preserve the layout and structure."
                        }
                    ]
                }]
            }
            
            async with session.post(
                self.base_url,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                },
                json=payload
            ) as response:
                if response.status != 200:
                    raise OCRError(f"OpenAI API error: {await response.text()}")
                
                result = await response.json()
                return result["choices"][0]["message"]["content"]
    
    async def extract_structured(self, image_data: bytes, content_type: str,
                                  prompt: str) -> Dict:
        async with aiohttp.ClientSession() as session:
            b64_image = base64.b64encode(image_data).decode()
            
            payload = {
                "model": "gpt-4o",
                "max_tokens": 4096,
                "response_format": {"type": "json_object"},
                "messages": [{
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{content_type};base64,{b64_image}"
                            }
                        },
                        {
                            "type": "text",
                            "text": prompt
                        }
                    ]
                }]
            }
            
            async with session.post(
                self.base_url,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                },
                json=payload
            ) as response:
                if response.status != 200:
                    raise OCRError(f"OpenAI API error: {await response.text()}")
                
                result = await response.json()
                return json.loads(result["choices"][0]["message"]["content"])


# ═══════════════════════════════════════════════════════════════════════════════
# SPECIALIZED EXTRACTORS
# ═══════════════════════════════════════════════════════════════════════════════

class BAndBExtractor:
    """
    Specialized extractor for B&B scale tickets.
    Handles handwritten red ink entries common on B&B tickets.
    """
    
    EXTRACTION_PROMPT = """
    Analyze this B&B scale ticket image. This ticket likely has HANDWRITTEN entries in RED INK.
    Pay special attention to handwritten numbers and text.
    
    Extract the following information into a JSON object:
    {
        "ticket_number": "the ticket/receipt number",
        "gross_weight": "gross weight as a number only",
        "tare_weight": "tare weight as a number only", 
        "net_weight": "net weight as a number only",
        "weight_unit": "lbs, tons, or kg",
        "date": "date in MM/DD/YYYY format",
        "time_in": "time in HH:MM format",
        "time_out": "time out in HH:MM format",
        "truck_id": "truck number or fleet ID",
        "license_plate": "license plate number",
        "driver_name": "driver's name",
        "hauler_company": "hauling company name",
        "material_type": "type of material (concrete, wood, metal, mixed, etc)",
        "material_description": "detailed description if available",
        "facility_name": "B&B facility name",
        "customer_name": "customer or project name",
        "job_number": "job or PO number",
        "confidence_notes": "any areas of uncertainty in reading handwritten text"
    }
    
    IMPORTANT:
    - For handwritten numbers, be careful to distinguish 1/7, 4/9, 5/6, 0/6/8
    - Red ink may appear faded - look carefully
    - Include ONLY extracted values, use null for fields not found
    - For weights, extract numbers only without units
    
    Return ONLY the JSON object, no additional text.
    """
    
    def __init__(self, provider: OCRProvider):
        self.provider = provider
    
    async def extract(self, image_data: bytes, content_type: str) -> ExtractedTicketData:
        # Get structured extraction
        raw_data = await self.provider.extract_structured(
            image_data, content_type, self.EXTRACTION_PROMPT
        )
        
        # Also get raw text for reference
        raw_text = await self.provider.extract_text(image_data, content_type)
        
        return self._parse_extraction(raw_data, raw_text)
    
    def _parse_extraction(self, data: Dict, raw_text: str) -> ExtractedTicketData:
        result = ExtractedTicketData(
            source=TicketSource.B_AND_B,
            raw_ocr_text=raw_text
        )
        
        # Parse each field with confidence scoring
        field_mappings = [
            ("ticket_number", "ticket_number"),
            ("gross_weight", "gross_weight"),
            ("tare_weight", "tare_weight"),
            ("net_weight", "net_weight"),
            ("weight_unit", "weight_unit"),
            ("date", "date"),
            ("time_in", "time_in"),
            ("time_out", "time_out"),
            ("truck_id", "truck_id"),
            ("license_plate", "license_plate"),
            ("driver_name", "driver_name"),
            ("hauler_company", "hauler_company"),
            ("material_type", "material_type"),
            ("material_description", "material_description"),
            ("facility_name", "facility_name"),
            ("customer_name", "customer_name"),
            ("job_number", "job_number")
        ]
        
        confidences = []
        for attr_name, json_key in field_mappings:
            value = data.get(json_key)
            if value is not None:
                # B&B handwritten tickets have lower base confidence
                confidence = 0.70 if json_key in ["gross_weight", "tare_weight", "net_weight"] else 0.80
                
                # Numeric validation boosts confidence
                if json_key in ["gross_weight", "tare_weight", "net_weight"]:
                    try:
                        float(value)
                        confidence += 0.15
                    except (ValueError, TypeError):
                        confidence -= 0.20
                
                setattr(result, attr_name, OCRField(
                    value=self._clean_value(value, json_key),
                    confidence=min(confidence, 1.0),
                    raw_text=str(value)
                ))
                confidences.append(confidence)
        
        # Parse confidence notes
        if "confidence_notes" in data and data["confidence_notes"]:
            result.processing_notes.append(f"B&B Notes: {data['confidence_notes']}")
        
        result.overall_confidence = sum(confidences) / len(confidences) if confidences else 0.0
        return result
    
    def _clean_value(self, value: Any, field: str) -> Any:
        if value is None:
            return None
        
        if field in ["gross_weight", "tare_weight", "net_weight"]:
            # Clean numeric values
            if isinstance(value, (int, float)):
                return float(value)
            cleaned = re.sub(r'[^\d.]', '', str(value))
            try:
                return float(cleaned) if cleaned else None
            except ValueError:
                return None
        
        return str(value).strip() if value else None


class LibertyExtractor:
    """
    Specialized extractor for Liberty thermal scale printouts.
    Handles thermal paper formatting and standard Liberty layout.
    """
    
    EXTRACTION_PROMPT = """
    Analyze this Liberty scale ticket (thermal printout). Liberty tickets have a standard format
    with printed (not handwritten) text.
    
    Extract the following information into a JSON object:
    {
        "ticket_number": "the ticket/scale ticket number",
        "gross_weight": "gross/in weight as a number only",
        "tare_weight": "tare/out weight as a number only",
        "net_weight": "net weight as a number only",
        "weight_unit": "lbs, tons, or kg (Liberty usually uses lbs or tons)",
        "date": "date in MM/DD/YYYY format",
        "time_in": "time in in HH:MM format",
        "time_out": "time out in HH:MM format",
        "truck_id": "truck ID or vehicle number",
        "license_plate": "tag/license plate",
        "driver_name": "driver name",
        "hauler_company": "carrier/hauler company",
        "material_type": "product/material type code or name",
        "material_description": "material description",
        "destination": "destination (landfill, recycling, etc)",
        "facility_name": "Liberty facility or location name",
        "customer_name": "customer/account name",
        "job_number": "job number or ticket reference",
        "po_number": "PO number if present"
    }
    
    IMPORTANT:
    - Liberty thermal prints may have faded sections - extract what's visible
    - Look for standard Liberty layout: header, weights section, footer
    - Weight units are typically shown next to weight values
    - Include ONLY extracted values, use null for fields not found
    
    Return ONLY the JSON object, no additional text.
    """
    
    def __init__(self, provider: OCRProvider):
        self.provider = provider
    
    async def extract(self, image_data: bytes, content_type: str) -> ExtractedTicketData:
        raw_data = await self.provider.extract_structured(
            image_data, content_type, self.EXTRACTION_PROMPT
        )
        
        raw_text = await self.provider.extract_text(image_data, content_type)
        
        return self._parse_extraction(raw_data, raw_text)
    
    def _parse_extraction(self, data: Dict, raw_text: str) -> ExtractedTicketData:
        result = ExtractedTicketData(
            source=TicketSource.LIBERTY,
            raw_ocr_text=raw_text
        )
        
        field_mappings = [
            ("ticket_number", "ticket_number"),
            ("gross_weight", "gross_weight"),
            ("tare_weight", "tare_weight"),
            ("net_weight", "net_weight"),
            ("weight_unit", "weight_unit"),
            ("date", "date"),
            ("time_in", "time_in"),
            ("time_out", "time_out"),
            ("truck_id", "truck_id"),
            ("license_plate", "license_plate"),
            ("driver_name", "driver_name"),
            ("hauler_company", "hauler_company"),
            ("material_type", "material_type"),
            ("material_description", "material_description"),
            ("destination", "destination"),
            ("facility_name", "facility_name"),
            ("customer_name", "customer_name"),
            ("job_number", "job_number"),
            ("po_number", "po_number")
        ]
        
        confidences = []
        for attr_name, json_key in field_mappings:
            value = data.get(json_key)
            if value is not None:
                # Liberty thermal prints have higher base confidence
                confidence = 0.88
                
                # Numeric validation
                if json_key in ["gross_weight", "tare_weight", "net_weight"]:
                    try:
                        float(value)
                        confidence = 0.95
                    except (ValueError, TypeError):
                        confidence = 0.60
                
                setattr(result, attr_name, OCRField(
                    value=self._clean_value(value, json_key),
                    confidence=min(confidence, 1.0),
                    raw_text=str(value)
                ))
                confidences.append(confidence)
        
        result.overall_confidence = sum(confidences) / len(confidences) if confidences else 0.0
        return result
    
    def _clean_value(self, value: Any, field: str) -> Any:
        if value is None:
            return None
        
        if field in ["gross_weight", "tare_weight", "net_weight"]:
            if isinstance(value, (int, float)):
                return float(value)
            cleaned = re.sub(r'[^\d.]', '', str(value))
            try:
                return float(cleaned) if cleaned else None
            except ValueError:
                return None
        
        return str(value).strip() if value else None


class GenericScaleExtractor:
    """Generic extractor for standard scale tickets."""
    
    EXTRACTION_PROMPT = """
    Analyze this scale ticket image and extract all relevant information.
    
    Extract into a JSON object:
    {
        "ticket_number": "ticket/receipt number",
        "gross_weight": "gross weight (number only)",
        "tare_weight": "tare weight (number only)",
        "net_weight": "net weight (number only)",
        "weight_unit": "lbs, tons, or kg",
        "date": "date (MM/DD/YYYY)",
        "time_in": "time in (HH:MM)",
        "time_out": "time out (HH:MM)",
        "truck_id": "truck/vehicle ID",
        "license_plate": "license plate",
        "driver_name": "driver name",
        "hauler_company": "hauling company",
        "material_type": "material type",
        "material_description": "material description",
        "destination": "destination type",
        "facility_name": "facility name",
        "customer_name": "customer name",
        "job_number": "job number",
        "po_number": "PO number"
    }
    
    Return ONLY the JSON object with extracted values. Use null for missing fields.
    """
    
    def __init__(self, provider: OCRProvider):
        self.provider = provider
    
    async def extract(self, image_data: bytes, content_type: str) -> ExtractedTicketData:
        raw_data = await self.provider.extract_structured(
            image_data, content_type, self.EXTRACTION_PROMPT
        )
        
        raw_text = await self.provider.extract_text(image_data, content_type)
        
        result = ExtractedTicketData(
            source=TicketSource.GENERIC_SCALE,
            raw_ocr_text=raw_text
        )
        
        # Map all fields
        for field in [
            "ticket_number", "gross_weight", "tare_weight", "net_weight",
            "weight_unit", "date", "time_in", "time_out", "truck_id",
            "license_plate", "driver_name", "hauler_company", "material_type",
            "material_description", "destination", "facility_name",
            "customer_name", "job_number", "po_number"
        ]:
            value = raw_data.get(field)
            if value is not None:
                setattr(result, field, OCRField(
                    value=value,
                    confidence=0.85,
                    raw_text=str(value)
                ))
        
        result.overall_confidence = 0.85
        return result


# ═══════════════════════════════════════════════════════════════════════════════
# SOURCE DETECTOR
# ═══════════════════════════════════════════════════════════════════════════════

class TicketSourceDetector:
    """Detects the source/type of scale ticket from image."""
    
    DETECTION_PROMPT = """
    Analyze this scale ticket image and determine its source type.
    
    Possible types:
    1. "b_and_b" - B&B scale ticket (typically has handwritten entries in red ink, B&B branding)
    2. "liberty" - Liberty scale ticket (thermal printout, Liberty branding, standard format)
    3. "generic" - Generic/other scale ticket
    
    Return a JSON object:
    {
        "source_type": "b_and_b" or "liberty" or "generic",
        "confidence": 0.0 to 1.0,
        "indicators": ["list of visual indicators that led to this classification"]
    }
    
    Return ONLY the JSON object.
    """
    
    def __init__(self, provider: OCRProvider):
        self.provider = provider
    
    async def detect(self, image_data: bytes, content_type: str) -> Tuple[TicketSource, float]:
        try:
            result = await self.provider.extract_structured(
                image_data, content_type, self.DETECTION_PROMPT
            )
            
            source_map = {
                "b_and_b": TicketSource.B_AND_B,
                "liberty": TicketSource.LIBERTY,
                "generic": TicketSource.GENERIC_SCALE
            }
            
            source_type = result.get("source_type", "generic")
            confidence = float(result.get("confidence", 0.5))
            
            return source_map.get(source_type, TicketSource.GENERIC_SCALE), confidence
            
        except Exception:
            return TicketSource.GENERIC_SCALE, 0.5


# ═══════════════════════════════════════════════════════════════════════════════
# UNIFIED OCR ENGINE
# ═══════════════════════════════════════════════════════════════════════════════

class UnifiedOCREngine:
    """
    Main OCR engine that orchestrates extraction across different ticket types.
    """
    
    def __init__(self, config: Optional[OCRConfig] = None):
        self.config = config or OCRConfig()
        self._provider: Optional[OCRProvider] = None
        self._detector: Optional[TicketSourceDetector] = None
        self._extractors: Dict[TicketSource, Any] = {}
    
    def _get_provider(self) -> OCRProvider:
        if self._provider is None:
            if self.config.default_provider == "anthropic" and self.config.anthropic_api_key:
                self._provider = AnthropicOCR(self.config.anthropic_api_key)
            elif self.config.openai_api_key:
                self._provider = OpenAIOCR(self.config.openai_api_key)
            else:
                raise OCRError("No valid OCR provider configured")
        return self._provider
    
    def _get_detector(self) -> TicketSourceDetector:
        if self._detector is None:
            self._detector = TicketSourceDetector(self._get_provider())
        return self._detector
    
    def _get_extractor(self, source: TicketSource):
        if source not in self._extractors:
            provider = self._get_provider()
            
            if source == TicketSource.B_AND_B:
                self._extractors[source] = BAndBExtractor(provider)
            elif source == TicketSource.LIBERTY:
                self._extractors[source] = LibertyExtractor(provider)
            else:
                self._extractors[source] = GenericScaleExtractor(provider)
        
        return self._extractors[source]
    
    async def process_ticket(
        self,
        image_data: bytes,
        content_type: str = "image/jpeg",
        source_hint: Optional[TicketSource] = None,
        auto_detect: bool = True
    ) -> ExtractedTicketData:
        """
        Process a scale ticket image and extract structured data.
        
        Args:
            image_data: Raw image bytes
            content_type: MIME type of image
            source_hint: Optional hint for ticket source type
            auto_detect: Whether to auto-detect source if no hint provided
        
        Returns:
            ExtractedTicketData with all extracted fields
        """
        
        # Determine source type
        if source_hint:
            source = source_hint
        elif auto_detect:
            source, detection_confidence = await self._get_detector().detect(
                image_data, content_type
            )
        else:
            source = TicketSource.GENERIC_SCALE
        
        # Get appropriate extractor
        extractor = self._get_extractor(source)
        
        # Perform extraction with retries
        last_error = None
        for attempt in range(self.config.max_retries):
            try:
                result = await extractor.extract(image_data, content_type)
                
                # Validate extraction
                if result.overall_confidence >= self.config.confidence_threshold:
                    return result
                elif attempt < self.config.max_retries - 1:
                    result.processing_notes.append(
                        f"Low confidence ({result.overall_confidence:.2f}), retrying..."
                    )
                    continue
                else:
                    result.processing_notes.append(
                        f"Low confidence after {self.config.max_retries} attempts"
                    )
                    return result
                    
            except Exception as e:
                last_error = e
                if attempt < self.config.max_retries - 1:
                    await asyncio.sleep(1 * (attempt + 1))  # Backoff
                continue
        
        raise OCRError(f"OCR extraction failed after {self.config.max_retries} attempts: {last_error}")
    
    async def process_batch(
        self,
        images: List[Tuple[bytes, str]],
        source_hint: Optional[TicketSource] = None,
        concurrency: int = 3
    ) -> List[ExtractedTicketData]:
        """
        Process multiple ticket images concurrently.
        
        Args:
            images: List of (image_data, content_type) tuples
            source_hint: Optional source type hint for all images
            concurrency: Maximum concurrent extractions
        
        Returns:
            List of ExtractedTicketData results
        """
        
        semaphore = asyncio.Semaphore(concurrency)
        
        async def process_with_semaphore(image_data: bytes, content_type: str) -> ExtractedTicketData:
            async with semaphore:
                try:
                    return await self.process_ticket(image_data, content_type, source_hint)
                except Exception as e:
                    result = ExtractedTicketData()
                    result.processing_notes.append(f"Error: {str(e)}")
                    result.overall_confidence = 0.0
                    return result
        
        tasks = [
            process_with_semaphore(img_data, ct)
            for img_data, ct in images
        ]
        
        return await asyncio.gather(*tasks)


# ═══════════════════════════════════════════════════════════════════════════════
# MATERIAL TYPE CLASSIFIER
# ═══════════════════════════════════════════════════════════════════════════════

class MaterialClassifier:
    """Classifies material types from extracted descriptions."""
    
    MATERIAL_KEYWORDS = {
        MaterialType.CONCRETE: ["concrete", "cement", "rebar", "sidewalk", "foundation"],
        MaterialType.ASPHALT: ["asphalt", "pavement", "blacktop", "tar"],
        MaterialType.METAL_FERROUS: ["steel", "iron", "ferrous", "metal scrap", "rebar"],
        MaterialType.METAL_NONFERROUS: ["aluminum", "copper", "brass", "non-ferrous", "nonferrous"],
        MaterialType.WOOD_CLEAN: ["clean wood", "untreated wood", "lumber", "pallet", "timber"],
        MaterialType.WOOD_TREATED: ["treated wood", "pressure treated", "painted wood"],
        MaterialType.CARDBOARD: ["cardboard", "occ", "corrugated"],
        MaterialType.PAPER: ["paper", "office paper", "newspaper"],
        MaterialType.PLASTIC: ["plastic", "hdpe", "ldpe", "pet", "pvc"],
        MaterialType.GLASS: ["glass", "window", "bottle"],
        MaterialType.DRYWALL: ["drywall", "sheetrock", "gypsum", "wallboard"],
        MaterialType.INSULATION: ["insulation", "fiberglass", "foam board"],
        MaterialType.ROOFING: ["roofing", "shingle", "tar paper", "roof"],
        MaterialType.BRICK_MASONRY: ["brick", "block", "masonry", "cmu", "stone"],
        MaterialType.SOIL_LAND_CLEARING: ["soil", "dirt", "land clearing", "brush", "vegetation"],
        MaterialType.MIXED_CND: ["mixed", "c&d", "c and d", "construction", "demolition", "debris"],
        MaterialType.HAZARDOUS: ["hazardous", "hazmat", "asbestos", "lead", "contaminated"]
    }
    
    @classmethod
    def classify(cls, description: str) -> Tuple[MaterialType, float]:
        """
        Classify material type from description.
        Returns (MaterialType, confidence)
        """
        if not description:
            return MaterialType.OTHER, 0.0
        
        description_lower = description.lower()
        
        scores = {}
        for material_type, keywords in cls.MATERIAL_KEYWORDS.items():
            score = sum(1 for kw in keywords if kw in description_lower)
            if score > 0:
                scores[material_type] = score
        
        if not scores:
            return MaterialType.OTHER, 0.3
        
        best_match = max(scores.items(), key=lambda x: x[1])
        confidence = min(0.5 + (best_match[1] * 0.15), 0.95)
        
        return best_match[0], confidence


# ═══════════════════════════════════════════════════════════════════════════════
# EXCEPTIONS
# ═══════════════════════════════════════════════════════════════════════════════

class OCRError(Exception):
    """OCR processing error."""
    pass


# ═══════════════════════════════════════════════════════════════════════════════
# EXPORTS
# ═══════════════════════════════════════════════════════════════════════════════

__all__ = [
    "OCRConfig",
    "TicketSource",
    "WeightUnit",
    "MaterialType",
    "OCRField",
    "ExtractedTicketData",
    "UnifiedOCREngine",
    "BAndBExtractor",
    "LibertyExtractor",
    "GenericScaleExtractor",
    "TicketSourceDetector",
    "MaterialClassifier",
    "OCRError"
]
