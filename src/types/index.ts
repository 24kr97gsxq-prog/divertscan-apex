/**
 * DivertScan™ Apex Enterprise - TypeScript Types
 * Shared type definitions across the application
 */

// ═══════════════════════════════════════════════════════════════════════════════
// ENUMS
// ═══════════════════════════════════════════════════════════════════════════════

export enum MaterialType {
  CONCRETE = 'concrete',
  ASPHALT = 'asphalt',
  METAL_FERROUS = 'metal_ferrous',
  METAL_NONFERROUS = 'metal_nonferrous',
  WOOD_CLEAN = 'wood_clean',
  WOOD_TREATED = 'wood_treated',
  CARDBOARD = 'cardboard',
  PAPER = 'paper',
  PLASTIC = 'plastic',
  GLASS = 'glass',
  DRYWALL = 'drywall',
  INSULATION = 'insulation',
  ROOFING = 'roofing',
  BRICK_MASONRY = 'brick_masonry',
  SOIL = 'soil_land_clearing',
  MIXED_CD = 'mixed_c_and_d',
  HAZARDOUS = 'hazardous',
  OTHER = 'other'
}

export enum Destination {
  LANDFILL = 'landfill',
  RECYCLING = 'recycling',
  DONATION = 'donation',
  SALVAGE = 'salvage'
}

export enum TicketStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  DISPUTED = 'disputed',
  CLOSED = 'closed'
}

export enum InvoiceStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  SENT = 'sent',
  PAID = 'paid',
  OVERDUE = 'overdue'
}

export enum UserRole {
  ADMIN = 'admin',
  PROJECT_MANAGER = 'project_manager',
  FIELD_OPERATOR = 'field_operator',
  VIEWER = 'viewer'
}

export enum SubscriptionTier {
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise',
  PAY_PER_PROJECT = 'pay_per_project'
}

// ═══════════════════════════════════════════════════════════════════════════════
// CORE ENTITIES
// ═══════════════════════════════════════════════════════════════════════════════

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  stripeCustomerId?: string;
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: 'active' | 'past_due' | 'canceled' | 'canceling';
  qboConnected: boolean;
  settings: TenantSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantSettings {
  defaultWeightUnit: 'lbs' | 'tons' | 'kg';
  defaultTimezone: string;
  requirePhotos: boolean;
  requireSignature: boolean;
  smsReceiptsEnabled: boolean;
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  phone?: string;
  role: UserRole;
  permissions: string[];
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
}

export interface Project {
  id: string;
  tenantId: string;
  name: string;
  clientName: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  leedCertification: 'v4' | 'v4.1' | 'v5';
  targetDiversion: number; // 50 or 75
  billingType: 'subscription' | 'per_project';
  billingRatePerTon?: number;
  startDate?: Date;
  endDate?: Date;
  status: 'active' | 'closed' | 'pending';
  createdAt: Date;
  updatedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEIGHT TICKET
// ═══════════════════════════════════════════════════════════════════════════════

export interface WeightTicket {
  id: string;
  tenantId: string;
  projectId: string;
  facilityId: string;
  ticketNumber: string;
  
  // Weights
  grossWeight: number;
  tareWeight: number;
  netWeight: number;
  weightUnit: 'lbs' | 'tons' | 'kg';
  
  // Classification
  materialType: MaterialType;
  destination: Destination;
  
  // Vehicle
  truckPlate?: string;
  fleetNumber?: string;
  driverName?: string;
  haulerCompany?: string;
  
  // Signature
  driverSignature?: string;
  signatureTimestamp?: Date;
  
  // Location
  gpsCoordinates?: {
    lat: number;
    lng: number;
  };
  
  // Timestamps
  grossCapturedAt?: Date;
  tareCapturedAt?: Date;
  
  // OCR
  ocrSource: 'manual' | 'b_and_b' | 'liberty' | 'generic' | 'csv_import';
  ocrConfidence?: number;
  ocrRawText?: string;
  
  // Photos
  photos: TicketPhoto[];
  
  // Status
  status: TicketStatus;
  
  // Billing
  invoiced: boolean;
  invoiceId?: string;
  lineItemAmount?: number;
  
  // Facility name (denormalized for display)
  facilityName: string;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface TicketPhoto {
  id: string;
  ticketId: string;
  photoType: 'debris_pile' | 'scale_display' | 'truck' | 'signature';
  url: string;
  thumbnailUrl?: string;
  capturedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACILITY
// ═══════════════════════════════════════════════════════════════════════════════

export interface Facility {
  id: string;
  tenantId: string;
  name: string;
  type: FacilityType;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  email?: string;
  contactName?: string;
  acceptedMaterials: MaterialType[];
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

export type FacilityType = 
  | 'recycling_center'
  | 'transfer_station'
  | 'landfill'
  | 'composting'
  | 'metals_processor'
  | 'donation_center'
  | 'salvage_yard';

export interface FacilityPermit {
  id: string;
  facilityId: string;
  permitNumber: string;
  permitType: PermitType;
  issuingAuthority: string;
  issueDate?: Date;
  expirationDate: Date;
  documentUrl?: string;
  notes?: string;
  alertDays: number;
  status: 'valid' | 'expiring_soon' | 'expired' | 'pending_renewal';
  createdAt: Date;
  updatedAt: Date;
}

export type PermitType = 
  | 'solid_waste_license'
  | 'recycling_facility'
  | 'transfer_station'
  | 'composting'
  | 'hazardous_waste'
  | 'air_quality'
  | 'water_discharge'
  | 'other';

// ═══════════════════════════════════════════════════════════════════════════════
// INVOICE
// ═══════════════════════════════════════════════════════════════════════════════

export interface Invoice {
  id: string;
  tenantId: string;
  projectId: string;
  invoiceNumber: string;
  customerName: string;
  customerEmail?: string;
  projectName: string;
  
  // Period
  periodStart?: Date;
  periodEnd?: Date;
  
  // Amounts
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  
  // Line items
  lineItems: InvoiceLineItem[];
  
  // Dates
  dueDate?: Date;
  paidDate?: Date;
  
  // QuickBooks
  qboInvoiceId?: string;
  qboDocNumber?: string;
  qboSynced: boolean;
  qboSyncedAt?: Date;
  
  // PDF
  pdfUrl?: string;
  
  status: InvoiceStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceLineItem {
  id: string;
  invoiceId: string;
  description: string;
  materialType?: MaterialType;
  quantity: number; // Weight in tons
  unitPrice: number;
  amount: number;
  ticketIds: string[];
  sortOrder: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════════

export interface LEEDAnalytics {
  diversionRate: number;
  targetRate: number;
  totalWaste: number;
  totalDiverted: number;
  totalLandfill: number;
  threshold50Achieved: boolean;
  threshold75Achieved: boolean;
  earnedPoints: 0 | 1 | 2;
  carbonMetrics: CarbonMetrics;
  materialBreakdown: MaterialBreakdown[];
  destinationBreakdown: DestinationBreakdown[];
  facilityBreakdown: FacilityBreakdown[];
  dailyMetrics: DailyMetric[];
}

export interface CarbonMetrics {
  totalCO2Avoided: number; // metric tons
  treesEquivalent: number;
  carsOffRoad: number;
  homesEnergy: number;
  waterSaved: number; // gallons
  energySaved: number; // kWh
}

export interface MaterialBreakdown {
  materialType: MaterialType;
  displayName: string;
  totalWeight: number;
  divertedWeight: number;
  landfillWeight: number;
  diversionRate: number;
  carbonSavings: number;
  ticketCount: number;
}

export interface DestinationBreakdown {
  destination: Destination;
  totalWeight: number;
  percentage: number;
  ticketCount: number;
}

export interface FacilityBreakdown {
  facilityId: string;
  facilityName: string;
  facilityType: FacilityType;
  totalWeight: number;
  percentage: number;
  ticketCount: number;
}

export interface DailyMetric {
  date: string;
  totalWeight: number;
  divertedWeight: number;
  diversionRate: number;
  ticketCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// API RESPONSES
// ═══════════════════════════════════════════════════════════════════════════════

export interface AuthResponse {
  user: User;
  tenant: Tenant;
  token: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ApiError {
  message: string;
  code: string;
  details?: Record<string, string[]>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIVE LOAD SESSION
// ═══════════════════════════════════════════════════════════════════════════════

export interface LiveLoadSession {
  id: string;
  tenantId: string;
  projectId: string;
  userId: string;
  stage: LiveLoadStage;
  
  // Setup data
  truckPlate?: string;
  fleetNumber?: string;
  driverName?: string;
  driverPhone?: string;
  materialType?: MaterialType;
  destination?: Destination;
  facilityId?: string;
  
  // Weight data
  grossWeight?: number;
  grossCapturedAt?: Date;
  grossGps?: { lat: number; lng: number };
  tareWeight?: number;
  tareCapturedAt?: Date;
  tareGps?: { lat: number; lng: number };
  
  // Photos
  photos: SessionPhoto[];
  
  // Signature
  signature?: string;
  signatureCapturedAt?: Date;
  
  // Timing
  startedAt: Date;
  completedAt?: Date;
  
  // Result
  ticketId?: string;
}

export type LiveLoadStage = 
  | 'setup'
  | 'gross_weight'
  | 'tare_weight'
  | 'photos'
  | 'signature'
  | 'review'
  | 'complete';

export interface SessionPhoto {
  id: string;
  blob?: Blob; // For local storage before upload
  url?: string; // After upload
  thumbnailUrl?: string;
  type: 'debris_pile' | 'scale_display' | 'truck';
  capturedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CSV IMPORT
// ═══════════════════════════════════════════════════════════════════════════════

export interface CSVColumnMapping {
  sourceColumn: string;
  targetField: keyof WeightTicket | '';
  transform?: 'date' | 'weight' | 'material' | 'destination' | 'none';
}

export interface CSVValidationResult {
  valid: boolean;
  errors: CSVValidationError[];
  warnings: CSVValidationWarning[];
  preview: CSVPreviewRow[];
}

export interface CSVValidationError {
  row: number;
  field: string;
  message: string;
}

export interface CSVValidationWarning {
  row: number;
  field: string;
  message: string;
}

export interface CSVPreviewRow {
  rowNumber: number;
  data: Partial<WeightTicket>;
  isValid: boolean;
  errors: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// OFFLINE SYNC
// ═══════════════════════════════════════════════════════════════════════════════

export interface SyncQueueItem {
  id: string;
  tenantId: string;
  userId: string;
  entityType: 'ticket' | 'photo' | 'session';
  entityId?: string;
  action: 'create' | 'update' | 'delete';
  payload: Record<string, any>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  lastAttemptAt?: Date;
  errorMessage?: string;
  createdAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UI STATE
// ═══════════════════════════════════════════════════════════════════════════════

export interface AppState {
  user: User | null;
  tenant: Tenant | null;
  currentProject: Project | null;
  isOnline: boolean;
  pendingSyncCount: number;
  notifications: Notification[];
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  timestamp: Date;
  dismissed: boolean;
}
