"""
DivertScan™ Apex Enterprise - Storage Service
S3-compatible storage for photos, documents, PDFs
Supports Cloudflare R2 and AWS S3
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
import uuid
import os
import hashlib
from PIL import Image
import io
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/storage", tags=["storage"])

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

STORAGE_PROVIDER = os.getenv("STORAGE_PROVIDER", "r2")  # r2 or s3

# Cloudflare R2 Configuration
R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID")
R2_ACCESS_KEY = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET = os.getenv("R2_BUCKET_NAME", "divertscan-uploads")
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL", "")

# AWS S3 Configuration (fallback)
AWS_ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
S3_BUCKET = os.getenv("S3_BUCKET_NAME", "divertscan-uploads")

# Upload limits
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
MAX_IMAGE_DIMENSION = 1920
THUMBNAIL_SIZE = 200
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic"}
ALLOWED_DOC_TYPES = {"application/pdf", "image/jpeg", "image/png"}

# ═══════════════════════════════════════════════════════════════════════════════
# S3 CLIENT
# ═══════════════════════════════════════════════════════════════════════════════

def get_s3_client():
    """Get S3-compatible client for R2 or AWS S3"""
    if STORAGE_PROVIDER == "r2":
        return boto3.client(
            "s3",
            endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
            aws_access_key_id=R2_ACCESS_KEY,
            aws_secret_access_key=R2_SECRET_KEY,
            config=Config(signature_version="s3v4"),
            region_name="auto"
        )
    else:
        return boto3.client(
            "s3",
            aws_access_key_id=AWS_ACCESS_KEY,
            aws_secret_access_key=AWS_SECRET_KEY,
            region_name=AWS_REGION
        )

def get_bucket_name():
    """Get bucket name based on provider"""
    return R2_BUCKET if STORAGE_PROVIDER == "r2" else S3_BUCKET

def get_public_url(key: str) -> str:
    """Get public URL for uploaded file"""
    if STORAGE_PROVIDER == "r2" and R2_PUBLIC_URL:
        return f"{R2_PUBLIC_URL}/{key}"
    elif STORAGE_PROVIDER == "s3":
        return f"https://{S3_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{key}"
    else:
        # Generate presigned URL as fallback
        client = get_s3_client()
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": get_bucket_name(), "Key": key},
            ExpiresIn=86400  # 24 hours
        )

# ═══════════════════════════════════════════════════════════════════════════════
# MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class UploadResponse(BaseModel):
    url: str
    thumbnail_url: Optional[str] = None
    key: str
    content_type: str
    size: int
    hash: str

class PresignedUrlRequest(BaseModel):
    filename: str
    content_type: str
    folder: str = "uploads"

class PresignedUrlResponse(BaseModel):
    upload_url: str
    public_url: str
    key: str
    expires_in: int

# ═══════════════════════════════════════════════════════════════════════════════
# UPLOAD ROUTES
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/upload", response_model=UploadResponse)
async def upload_file(
    file: UploadFile = File(...),
    folder: str = "uploads",
    tenant_id: str = None
):
    """
    Upload file directly to storage
    Supports images (with compression/thumbnails) and documents
    """
    # Validate file size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413, 
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE // 1024 // 1024}MB"
        )
    
    # Validate content type
    content_type = file.content_type or "application/octet-stream"
    is_image = content_type in ALLOWED_IMAGE_TYPES
    is_document = content_type in ALLOWED_DOC_TYPES
    
    if not (is_image or is_document):
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type: {content_type}"
        )
    
    # Generate unique key
    file_hash = hashlib.md5(content).hexdigest()[:12]
    ext = get_extension(file.filename, content_type)
    timestamp = datetime.utcnow().strftime("%Y%m%d")
    unique_id = uuid.uuid4().hex[:8]
    
    if tenant_id:
        key = f"{tenant_id}/{folder}/{timestamp}/{unique_id}-{file_hash}{ext}"
    else:
        key = f"{folder}/{timestamp}/{unique_id}-{file_hash}{ext}"
    
    # Process image if needed
    thumbnail_url = None
    if is_image:
        content, thumbnail_content = process_image(content, content_type)
        
        # Upload thumbnail
        if thumbnail_content:
            thumb_key = key.replace(ext, f"_thumb{ext}")
            await upload_to_s3(thumb_key, thumbnail_content, content_type)
            thumbnail_url = get_public_url(thumb_key)
    
    # Upload main file
    await upload_to_s3(key, content, content_type)
    url = get_public_url(key)
    
    return UploadResponse(
        url=url,
        thumbnail_url=thumbnail_url,
        key=key,
        content_type=content_type,
        size=len(content),
        hash=file_hash
    )

@router.post("/upload/batch", response_model=List[UploadResponse])
async def upload_batch(
    files: List[UploadFile] = File(...),
    folder: str = "uploads",
    tenant_id: str = None
):
    """Upload multiple files at once (max 10)"""
    if len(files) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 files per batch")
    
    results = []
    for file in files:
        try:
            result = await upload_file(file, folder, tenant_id)
            results.append(result)
        except HTTPException as e:
            logger.error(f"Failed to upload {file.filename}: {e.detail}")
            results.append(UploadResponse(
                url="",
                key="",
                content_type="error",
                size=0,
                hash=""
            ))
    
    return results

@router.post("/presigned-url", response_model=PresignedUrlResponse)
async def get_presigned_url(
    request: PresignedUrlRequest,
    tenant_id: str = None
):
    """
    Get presigned URL for client-side upload
    Use this for large files or direct browser uploads
    """
    # Generate key
    ext = get_extension(request.filename, request.content_type)
    timestamp = datetime.utcnow().strftime("%Y%m%d")
    unique_id = uuid.uuid4().hex[:8]
    
    if tenant_id:
        key = f"{tenant_id}/{request.folder}/{timestamp}/{unique_id}{ext}"
    else:
        key = f"{request.folder}/{timestamp}/{unique_id}{ext}"
    
    # Generate presigned URL
    client = get_s3_client()
    bucket = get_bucket_name()
    expires_in = 3600  # 1 hour
    
    try:
        upload_url = client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": bucket,
                "Key": key,
                "ContentType": request.content_type
            },
            ExpiresIn=expires_in
        )
    except ClientError as e:
        logger.error(f"Failed to generate presigned URL: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate upload URL")
    
    return PresignedUrlResponse(
        upload_url=upload_url,
        public_url=get_public_url(key),
        key=key,
        expires_in=expires_in
    )

@router.delete("/{key:path}")
async def delete_file(key: str, tenant_id: str = None):
    """Delete file from storage"""
    # Verify tenant ownership if provided
    if tenant_id and not key.startswith(f"{tenant_id}/"):
        raise HTTPException(status_code=403, detail="Access denied")
    
    client = get_s3_client()
    bucket = get_bucket_name()
    
    try:
        client.delete_object(Bucket=bucket, Key=key)
        
        # Also try to delete thumbnail if exists
        thumb_key = key.replace(".", "_thumb.")
        try:
            client.delete_object(Bucket=bucket, Key=thumb_key)
        except:
            pass
        
        return {"deleted": True, "key": key}
    except ClientError as e:
        logger.error(f"Failed to delete {key}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete file")

# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

async def upload_to_s3(key: str, content: bytes, content_type: str):
    """Upload content to S3/R2"""
    client = get_s3_client()
    bucket = get_bucket_name()
    
    try:
        client.put_object(
            Bucket=bucket,
            Key=key,
            Body=content,
            ContentType=content_type,
            CacheControl="public, max-age=31536000"  # 1 year cache
        )
    except ClientError as e:
        logger.error(f"Failed to upload to S3: {e}")
        raise HTTPException(status_code=500, detail="Upload failed")

def process_image(content: bytes, content_type: str) -> tuple[bytes, Optional[bytes]]:
    """
    Process image: resize if needed, create thumbnail
    Optimized for iPad photos (max 1920px, JPEG quality 85%)
    """
    try:
        img = Image.open(io.BytesIO(content))
        
        # Convert HEIC to JPEG
        if content_type == "image/heic":
            img = img.convert("RGB")
            content_type = "image/jpeg"
        
        # Rotate based on EXIF
        try:
            from PIL import ExifTags
            for orientation in ExifTags.TAGS.keys():
                if ExifTags.TAGS[orientation] == 'Orientation':
                    break
            exif = img._getexif()
            if exif:
                orientation_value = exif.get(orientation)
                if orientation_value == 3:
                    img = img.rotate(180, expand=True)
                elif orientation_value == 6:
                    img = img.rotate(270, expand=True)
                elif orientation_value == 8:
                    img = img.rotate(90, expand=True)
        except:
            pass
        
        # Resize if too large
        width, height = img.size
        if max(width, height) > MAX_IMAGE_DIMENSION:
            ratio = MAX_IMAGE_DIMENSION / max(width, height)
            new_size = (int(width * ratio), int(height * ratio))
            img = img.resize(new_size, Image.LANCZOS)
        
        # Save main image
        main_buffer = io.BytesIO()
        save_format = "JPEG" if content_type == "image/jpeg" else "PNG"
        if save_format == "JPEG":
            img = img.convert("RGB")
            img.save(main_buffer, format=save_format, quality=85, optimize=True)
        else:
            img.save(main_buffer, format=save_format, optimize=True)
        
        # Create thumbnail
        thumb = img.copy()
        thumb.thumbnail((THUMBNAIL_SIZE, THUMBNAIL_SIZE), Image.LANCZOS)
        thumb_buffer = io.BytesIO()
        if save_format == "JPEG":
            thumb.save(thumb_buffer, format="JPEG", quality=80, optimize=True)
        else:
            thumb.save(thumb_buffer, format="PNG", optimize=True)
        
        return main_buffer.getvalue(), thumb_buffer.getvalue()
        
    except Exception as e:
        logger.error(f"Image processing failed: {e}")
        # Return original if processing fails
        return content, None

def get_extension(filename: str, content_type: str) -> str:
    """Get file extension from filename or content type"""
    if filename and "." in filename:
        return "." + filename.rsplit(".", 1)[1].lower()
    
    mime_to_ext = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/heic": ".jpg",  # Will be converted
        "application/pdf": ".pdf"
    }
    
    return mime_to_ext.get(content_type, "")

# ═══════════════════════════════════════════════════════════════════════════════
# TICKET PHOTO HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

async def upload_ticket_photo(
    tenant_id: str,
    ticket_id: str,
    photo_type: str,  # debris_pile, scale_display, truck
    content: bytes,
    content_type: str = "image/jpeg"
) -> dict:
    """
    Upload ticket photo with standardized naming
    Returns URL and thumbnail URL
    """
    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    unique_id = uuid.uuid4().hex[:6]
    ext = ".jpg" if "jpeg" in content_type else ".png"
    
    key = f"{tenant_id}/tickets/{ticket_id}/{photo_type}-{timestamp}-{unique_id}{ext}"
    
    # Process image
    processed, thumbnail = process_image(content, content_type)
    
    # Upload main image
    await upload_to_s3(key, processed, content_type)
    
    # Upload thumbnail
    thumb_url = None
    if thumbnail:
        thumb_key = key.replace(ext, f"_thumb{ext}")
        await upload_to_s3(thumb_key, thumbnail, content_type)
        thumb_url = get_public_url(thumb_key)
    
    return {
        "url": get_public_url(key),
        "thumbnail_url": thumb_url,
        "key": key,
        "photo_type": photo_type
    }

async def upload_permit_document(
    tenant_id: str,
    facility_id: str,
    permit_id: str,
    content: bytes,
    content_type: str,
    filename: str
) -> dict:
    """
    Upload permit document (PDF or image)
    """
    ext = get_extension(filename, content_type)
    key = f"{tenant_id}/facilities/{facility_id}/permits/{permit_id}{ext}"
    
    await upload_to_s3(key, content, content_type)
    
    return {
        "url": get_public_url(key),
        "key": key,
        "filename": filename
    }
