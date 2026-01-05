/**
 * DivertScan™ Apex Enterprise SaaS Architecture v3.0
 * Multi-Tenant Authentication & Billing Infrastructure
 * iPad-Optimized | Offline-First Ready
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: SubscriptionPlan;
  stripeCustomerId: string;
  settings: TenantSettings;
  createdAt: Date;
  status: 'active' | 'suspended' | 'trial';
}

export interface TenantSettings {
  logoUrl?: string;
  primaryColor: string;
  timezone: string;
  defaultFacility?: string;
  leedTargets: { threshold50: boolean; threshold75: boolean };
  smsNotifications: boolean;
  autoInvoicing: boolean;
  qboIntegration: boolean;
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  role: UserRole;
  name: string;
  phone?: string;
  avatar?: string;
  permissions: Permission[];
  lastLogin?: Date;
}

export type UserRole = 'owner' | 'admin' | 'manager' | 'field_operator' | 'viewer';
export type Permission = 
  | 'projects:create' | 'projects:read' | 'projects:update' | 'projects:delete'
  | 'tickets:create' | 'tickets:read' | 'tickets:update' | 'tickets:delete' | 'tickets:verify'
  | 'invoices:create' | 'invoices:read' | 'invoices:send'
  | 'reports:view' | 'reports:export'
  | 'settings:manage' | 'users:manage' | 'billing:manage';

export type SubscriptionPlan = 'starter' | 'professional' | 'enterprise' | 'pay_per_project';

export interface PlanConfig {
  id: SubscriptionPlan;
  name: string;
  stripePriceId: string;
  monthlyPrice: number;
  projectLimit: number;
  userLimit: number;
  features: string[];
  ocrCredits: number;
  storageGB: number;
}

export interface Project {
  id: string;
  tenantId: string;
  name: string;
  address: string;
  leedCertification: 'v4' | 'v4.1' | 'v5';
  targetDiversion: number;
  startDate: Date;
  endDate?: Date;
  status: 'active' | 'closed' | 'pending';
  billingType: 'subscription' | 'per_project';
  stripeSubscriptionId?: string;
  generalContractor?: string;
  projectManager?: string;
  coordinates?: { lat: number; lng: number };
}

export interface WeightTicket {
  id: string;
  tenantId: string;
  projectId: string;
  ticketNumber: string;
  status: 'pending' | 'verified' | 'disputed' | 'closed';
  // Two-Stage Weighing
  grossWeight: number;
  tareWeight: number;
  netWeight: number;
  weightUnit: 'lbs' | 'tons' | 'kg';
  // Material Classification
  materialType: MaterialType;
  destination: 'landfill' | 'recycling' | 'donation' | 'salvage';
  facilityId: string;
  facilityName: string;
  // Audit Trail
  driverName: string;
  driverSignature: string;
  truckPlate: string;
  fleetNumber?: string;
  gpsCoordinates: { lat: number; lng: number };
  timestamps: {
    grossCaptured: Date;
    tareCaptured: Date;
    signed: Date;
    synced?: Date;
  };
  photos: TicketPhoto[];
  // OCR Source
  ocrSource?: 'manual' | 'b_and_b' | 'liberty' | 'csv_import';
  ocrConfidence?: number;
  rawOcrData?: string;
  // Billing
  invoiced: boolean;
  invoiceId?: string;
  lineItemAmount?: number;
}

export interface TicketPhoto {
  id: string;
  type: 'debris_pile' | 'scale_ticket' | 'truck' | 'signature';
  url: string;
  thumbnail: string;
  capturedAt: Date;
  gpsCoordinates?: { lat: number; lng: number };
}

export type MaterialType =
  | 'concrete' | 'asphalt' | 'metal_ferrous' | 'metal_nonferrous'
  | 'wood_clean' | 'wood_treated' | 'cardboard' | 'paper'
  | 'plastic' | 'glass' | 'drywall' | 'insulation'
  | 'roofing' | 'brick_masonry' | 'soil_land_clearing'
  | 'mixed_c_and_d' | 'hazardous' | 'other';

export interface Facility {
  id: string;
  tenantId: string;
  name: string;
  type: 'landfill' | 'mrf' | 'recycler' | 'transfer_station';
  address: string;
  coordinates?: { lat: number; lng: number };
  acceptedMaterials: MaterialType[];
  permitNumber: string;
  permitExpiration: Date;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  notes?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLAN CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const PLAN_CONFIGS: Record<SubscriptionPlan, PlanConfig> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    stripePriceId: 'price_starter_monthly',
    monthlyPrice: 99,
    projectLimit: 3,
    userLimit: 2,
    ocrCredits: 100,
    storageGB: 5,
    features: ['Basic LEED Tracking', 'PDF Reports', 'Email Support']
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    stripePriceId: 'price_professional_monthly',
    monthlyPrice: 299,
    projectLimit: 15,
    userLimit: 10,
    ocrCredits: 500,
    storageGB: 50,
    features: [
      'Advanced LEED v5 Analytics',
      'OCR Scale Ticket Processing',
      'SMS Driver Receipts',
      'QuickBooks Integration',
      'Priority Support'
    ]
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    stripePriceId: 'price_enterprise_monthly',
    monthlyPrice: 799,
    projectLimit: -1, // Unlimited
    userLimit: -1,
    ocrCredits: -1,
    storageGB: 500,
    features: [
      'Unlimited Projects & Users',
      'White-Label Branding',
      'API Access',
      'Dedicated Account Manager',
      'Custom Integrations',
      'ESG Carbon Reporting',
      'SSO/SAML'
    ]
  },
  pay_per_project: {
    id: 'pay_per_project',
    name: 'Pay Per Project',
    stripePriceId: 'price_per_project',
    monthlyPrice: 0,
    projectLimit: -1,
    userLimit: 5,
    ocrCredits: 50,
    storageGB: 10,
    features: [
      '$149/project/month',
      'Full Feature Access',
      'No Long-Term Commitment'
    ]
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// AUTHENTICATION SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export class AuthService {
  private static instance: AuthService;
  private currentUser: User | null = null;
  private currentTenant: Tenant | null = null;
  private tokenRefreshTimer: number | null = null;

  private constructor() {}

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  async initialize(): Promise<void> {
    const storedAuth = await this.getStoredAuth();
    if (storedAuth?.token && !this.isTokenExpired(storedAuth.token)) {
      await this.restoreSession(storedAuth);
    }
  }

  async signIn(email: string, password: string): Promise<{ user: User; tenant: Tenant }> {
    const response = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new AuthError(error.code, error.message);
    }

    const { user, tenant, token, refreshToken } = await response.json();
    
    await this.storeAuth({ token, refreshToken, userId: user.id, tenantId: tenant.id });
    this.currentUser = user;
    this.currentTenant = tenant;
    this.scheduleTokenRefresh(token);

    return { user, tenant };
  }

  async signUp(data: SignUpData): Promise<{ user: User; tenant: Tenant }> {
    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new AuthError(error.code, error.message);
    }

    const { user, tenant, token, refreshToken } = await response.json();
    
    await this.storeAuth({ token, refreshToken, userId: user.id, tenantId: tenant.id });
    this.currentUser = user;
    this.currentTenant = tenant;

    return { user, tenant };
  }

  async signOut(): Promise<void> {
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
    }
    await this.clearStoredAuth();
    this.currentUser = null;
    this.currentTenant = null;
  }

  async inviteUser(email: string, role: UserRole): Promise<void> {
    this.requirePermission('users:manage');
    
    await fetch('/api/auth/invite', {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ email, role, tenantId: this.currentTenant!.id })
    });
  }

  getUser(): User | null {
    return this.currentUser;
  }

  getTenant(): Tenant | null {
    return this.currentTenant;
  }

  hasPermission(permission: Permission): boolean {
    return this.currentUser?.permissions.includes(permission) ?? false;
  }

  requirePermission(permission: Permission): void {
    if (!this.hasPermission(permission)) {
      throw new AuthError('FORBIDDEN', `Missing permission: ${permission}`);
    }
  }

  getAuthHeaders(): Record<string, string> {
    const auth = this.getStoredAuthSync();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${auth?.token}`,
      'X-Tenant-ID': this.currentTenant?.id ?? ''
    };
  }

  private async restoreSession(storedAuth: StoredAuth): Promise<void> {
    const response = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${storedAuth.token}` }
    });

    if (response.ok) {
      const { user, tenant } = await response.json();
      this.currentUser = user;
      this.currentTenant = tenant;
      this.scheduleTokenRefresh(storedAuth.token);
    } else {
      await this.clearStoredAuth();
    }
  }

  private scheduleTokenRefresh(token: string): void {
    const payload = this.decodeToken(token);
    const expiresIn = (payload.exp * 1000) - Date.now() - 60000; // Refresh 1 min before expiry
    
    this.tokenRefreshTimer = window.setTimeout(async () => {
      await this.refreshToken();
    }, Math.max(expiresIn, 0));
  }

  private async refreshToken(): Promise<void> {
    const stored = await this.getStoredAuth();
    if (!stored?.refreshToken) return;

    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: stored.refreshToken })
    });

    if (response.ok) {
      const { token, refreshToken } = await response.json();
      await this.storeAuth({ ...stored, token, refreshToken });
      this.scheduleTokenRefresh(token);
    } else {
      await this.signOut();
    }
  }

  private isTokenExpired(token: string): boolean {
    const payload = this.decodeToken(token);
    return payload.exp * 1000 < Date.now();
  }

  private decodeToken(token: string): { exp: number; sub: string } {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  }

  private async storeAuth(auth: StoredAuth): Promise<void> {
    const db = await openAuthDB();
    const tx = db.transaction('auth', 'readwrite');
    await tx.objectStore('auth').put(auth, 'current');
    await tx.done;
  }

  private async getStoredAuth(): Promise<StoredAuth | null> {
    const db = await openAuthDB();
    return db.get('auth', 'current');
  }

  private getStoredAuthSync(): StoredAuth | null {
    const cached = localStorage.getItem('divertscan_auth_cache');
    return cached ? JSON.parse(cached) : null;
  }

  private async clearStoredAuth(): Promise<void> {
    const db = await openAuthDB();
    const tx = db.transaction('auth', 'readwrite');
    await tx.objectStore('auth').delete('current');
    await tx.done;
    localStorage.removeItem('divertscan_auth_cache');
  }
}

interface SignUpData {
  email: string;
  password: string;
  name: string;
  companyName: string;
  phone?: string;
  plan: SubscriptionPlan;
}

interface StoredAuth {
  token: string;
  refreshToken: string;
  userId: string;
  tenantId: string;
}

class AuthError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

async function openAuthDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('divertscan_auth', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as unknown as IDBDatabase);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('auth')) {
        db.createObjectStore('auth');
      }
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// STRIPE BILLING SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export class BillingService {
  private auth: AuthService;

  constructor() {
    this.auth = AuthService.getInstance();
  }

  async createSubscription(planId: SubscriptionPlan): Promise<{ clientSecret: string }> {
    const response = await fetch('/api/billing/subscribe', {
      method: 'POST',
      headers: this.auth.getAuthHeaders(),
      body: JSON.stringify({ planId })
    });

    if (!response.ok) throw new Error('Failed to create subscription');
    return response.json();
  }

  async createProjectSubscription(projectId: string): Promise<{ clientSecret: string }> {
    const response = await fetch('/api/billing/project-subscribe', {
      method: 'POST',
      headers: this.auth.getAuthHeaders(),
      body: JSON.stringify({ projectId })
    });

    if (!response.ok) throw new Error('Failed to create project subscription');
    return response.json();
  }

  async getUsage(): Promise<UsageMetrics> {
    const response = await fetch('/api/billing/usage', {
      headers: this.auth.getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to fetch usage');
    return response.json();
  }

  async getInvoices(): Promise<Invoice[]> {
    const response = await fetch('/api/billing/invoices', {
      headers: this.auth.getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to fetch invoices');
    return response.json();
  }

  async updatePaymentMethod(paymentMethodId: string): Promise<void> {
    await fetch('/api/billing/payment-method', {
      method: 'PUT',
      headers: this.auth.getAuthHeaders(),
      body: JSON.stringify({ paymentMethodId })
    });
  }

  async cancelSubscription(reason?: string): Promise<void> {
    await fetch('/api/billing/cancel', {
      method: 'POST',
      headers: this.auth.getAuthHeaders(),
      body: JSON.stringify({ reason })
    });
  }

  async changePlan(newPlanId: SubscriptionPlan): Promise<void> {
    await fetch('/api/billing/change-plan', {
      method: 'POST',
      headers: this.auth.getAuthHeaders(),
      body: JSON.stringify({ planId: newPlanId })
    });
  }
}

interface UsageMetrics {
  projectsUsed: number;
  projectsLimit: number;
  usersUsed: number;
  usersLimit: number;
  ocrCreditsUsed: number;
  ocrCreditsLimit: number;
  storageUsedGB: number;
  storageLimitGB: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

interface Invoice {
  id: string;
  number: string;
  amount: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'void';
  dueDate: Date;
  paidAt?: Date;
  pdfUrl: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MULTI-TENANT DATA SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export class TenantDataService {
  private auth: AuthService;
  private cache: Map<string, { data: unknown; expiry: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.auth = AuthService.getInstance();
  }

  // Projects
  async getProjects(filters?: ProjectFilters): Promise<Project[]> {
    const cacheKey = `projects_${JSON.stringify(filters)}`;
    const cached = this.getFromCache<Project[]>(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.search) params.set('search', filters.search);

    const response = await fetch(`/api/projects?${params}`, {
      headers: this.auth.getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to fetch projects');
    const projects = await response.json();
    this.setCache(cacheKey, projects);
    return projects;
  }

  async getProject(projectId: string): Promise<Project> {
    const response = await fetch(`/api/projects/${projectId}`, {
      headers: this.auth.getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to fetch project');
    return response.json();
  }

  async createProject(data: Partial<Project>): Promise<Project> {
    this.auth.requirePermission('projects:create');
    
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: this.auth.getAuthHeaders(),
      body: JSON.stringify(data)
    });

    if (!response.ok) throw new Error('Failed to create project');
    this.invalidateCache('projects_');
    return response.json();
  }

  async updateProject(projectId: string, data: Partial<Project>): Promise<Project> {
    this.auth.requirePermission('projects:update');
    
    const response = await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: this.auth.getAuthHeaders(),
      body: JSON.stringify(data)
    });

    if (!response.ok) throw new Error('Failed to update project');
    this.invalidateCache('projects_');
    return response.json();
  }

  // Weight Tickets
  async getTickets(projectId: string, filters?: TicketFilters): Promise<WeightTicket[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.materialType) params.set('materialType', filters.materialType);
    if (filters?.startDate) params.set('startDate', filters.startDate.toISOString());
    if (filters?.endDate) params.set('endDate', filters.endDate.toISOString());
    if (filters?.destination) params.set('destination', filters.destination);

    const response = await fetch(`/api/projects/${projectId}/tickets?${params}`, {
      headers: this.auth.getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to fetch tickets');
    return response.json();
  }

  async createTicket(projectId: string, data: Partial<WeightTicket>): Promise<WeightTicket> {
    this.auth.requirePermission('tickets:create');
    
    const response = await fetch(`/api/projects/${projectId}/tickets`, {
      method: 'POST',
      headers: this.auth.getAuthHeaders(),
      body: JSON.stringify(data)
    });

    if (!response.ok) throw new Error('Failed to create ticket');
    return response.json();
  }

  async updateTicket(projectId: string, ticketId: string, data: Partial<WeightTicket>): Promise<WeightTicket> {
    this.auth.requirePermission('tickets:update');
    
    const response = await fetch(`/api/projects/${projectId}/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: this.auth.getAuthHeaders(),
      body: JSON.stringify(data)
    });

    if (!response.ok) throw new Error('Failed to update ticket');
    return response.json();
  }

  async verifyTicket(projectId: string, ticketId: string): Promise<WeightTicket> {
    this.auth.requirePermission('tickets:verify');
    
    const response = await fetch(`/api/projects/${projectId}/tickets/${ticketId}/verify`, {
      method: 'POST',
      headers: this.auth.getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to verify ticket');
    return response.json();
  }

  // Facilities
  async getFacilities(): Promise<Facility[]> {
    const cached = this.getFromCache<Facility[]>('facilities');
    if (cached) return cached;

    const response = await fetch('/api/facilities', {
      headers: this.auth.getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to fetch facilities');
    const facilities = await response.json();
    this.setCache('facilities', facilities);
    return facilities;
  }

  async createFacility(data: Partial<Facility>): Promise<Facility> {
    const response = await fetch('/api/facilities', {
      method: 'POST',
      headers: this.auth.getAuthHeaders(),
      body: JSON.stringify(data)
    });

    if (!response.ok) throw new Error('Failed to create facility');
    this.invalidateCache('facilities');
    return response.json();
  }

  // Cache helpers
  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return cached.data as T;
    }
    this.cache.delete(key);
    return null;
  }

  private setCache(key: string, data: unknown): void {
    this.cache.set(key, { data, expiry: Date.now() + this.CACHE_TTL });
  }

  private invalidateCache(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }
}

interface ProjectFilters {
  status?: Project['status'];
  search?: string;
}

interface TicketFilters {
  status?: WeightTicket['status'];
  materialType?: MaterialType;
  startDate?: Date;
  endDate?: Date;
  destination?: WeightTicket['destination'];
}

// ═══════════════════════════════════════════════════════════════════════════════
// OFFLINE SYNC ENGINE (VANESSA PROTOCOL)
// ═══════════════════════════════════════════════════════════════════════════════

export class OfflineSyncEngine {
  private static instance: OfflineSyncEngine;
  private db: IDBDatabase | null = null;
  private syncQueue: SyncOperation[] = [];
  private isOnline: boolean = navigator.onLine;
  private syncInProgress: boolean = false;
  private listeners: Set<(status: SyncStatus) => void> = new Set();

  private constructor() {
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  static getInstance(): OfflineSyncEngine {
    if (!OfflineSyncEngine.instance) {
      OfflineSyncEngine.instance = new OfflineSyncEngine();
    }
    return OfflineSyncEngine.instance;
  }

  async initialize(): Promise<void> {
    this.db = await this.openDatabase();
    await this.loadPendingOperations();
    
    if (this.isOnline && this.syncQueue.length > 0) {
      this.processQueue();
    }
  }

  async queueOperation(operation: SyncOperation): Promise<void> {
    operation.id = crypto.randomUUID();
    operation.timestamp = Date.now();
    operation.attempts = 0;
    
    this.syncQueue.push(operation);
    await this.persistOperation(operation);
    this.notifyListeners();

    if (this.isOnline) {
      this.processQueue();
    }
  }

  async storeOfflineData(store: string, key: string, data: unknown): Promise<void> {
    if (!this.db) return;
    
    const tx = this.db.transaction(store, 'readwrite');
    const objectStore = tx.objectStore(store);
    await objectStore.put({ key, data, updatedAt: Date.now() });
  }

  async getOfflineData<T>(store: string, key: string): Promise<T | null> {
    if (!this.db) return null;
    
    const tx = this.db.transaction(store, 'readonly');
    const objectStore = tx.objectStore(store);
    const result = await new Promise<{ data: T } | undefined>((resolve) => {
      const request = objectStore.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
    });
    
    return result?.data ?? null;
  }

  subscribe(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getStatus(): SyncStatus {
    return {
      isOnline: this.isOnline,
      pendingCount: this.syncQueue.length,
      syncInProgress: this.syncInProgress,
      lastSyncAt: this.getLastSyncTime()
    };
  }

  private async processQueue(): Promise<void> {
    if (this.syncInProgress || !this.isOnline || this.syncQueue.length === 0) {
      return;
    }

    this.syncInProgress = true;
    this.notifyListeners();

    const auth = AuthService.getInstance();

    while (this.syncQueue.length > 0 && this.isOnline) {
      const operation = this.syncQueue[0];
      
      try {
        const response = await fetch(operation.endpoint, {
          method: operation.method,
          headers: auth.getAuthHeaders(),
          body: operation.body ? JSON.stringify(operation.body) : undefined
        });

        if (response.ok) {
          this.syncQueue.shift();
          await this.removePersistedOperation(operation.id!);
          
          if (operation.onSuccess) {
            const result = await response.json();
            operation.onSuccess(result);
          }
        } else if (response.status >= 400 && response.status < 500) {
          // Client error - don't retry
          this.syncQueue.shift();
          await this.removePersistedOperation(operation.id!);
          
          if (operation.onError) {
            operation.onError(new Error(`HTTP ${response.status}`));
          }
        } else {
          // Server error - retry with backoff
          operation.attempts = (operation.attempts ?? 0) + 1;
          if (operation.attempts >= 5) {
            this.syncQueue.shift();
            await this.removePersistedOperation(operation.id!);
            if (operation.onError) {
              operation.onError(new Error('Max retries exceeded'));
            }
          } else {
            await this.delay(Math.pow(2, operation.attempts) * 1000);
          }
        }
      } catch (error) {
        operation.attempts = (operation.attempts ?? 0) + 1;
        if (operation.attempts >= 5) {
          this.syncQueue.shift();
          await this.removePersistedOperation(operation.id!);
        }
        break; // Network error - stop processing
      }

      this.notifyListeners();
    }

    this.syncInProgress = false;
    this.setLastSyncTime(Date.now());
    this.notifyListeners();
  }

  private async openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('divertscan_offline', 2);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains('sync_queue')) {
          db.createObjectStore('sync_queue', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('tickets')) {
          const ticketStore = db.createObjectStore('tickets', { keyPath: 'key' });
          ticketStore.createIndex('projectId', 'data.projectId');
        }
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('photos')) {
          db.createObjectStore('photos', { keyPath: 'key' });
        }
      };
    });
  }

  private async persistOperation(operation: SyncOperation): Promise<void> {
    if (!this.db) return;
    const tx = this.db.transaction('sync_queue', 'readwrite');
    await tx.objectStore('sync_queue').put(operation);
  }

  private async removePersistedOperation(id: string): Promise<void> {
    if (!this.db) return;
    const tx = this.db.transaction('sync_queue', 'readwrite');
    await tx.objectStore('sync_queue').delete(id);
  }

  private async loadPendingOperations(): Promise<void> {
    if (!this.db) return;
    
    const tx = this.db.transaction('sync_queue', 'readonly');
    const store = tx.objectStore('sync_queue');
    
    this.syncQueue = await new Promise((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => resolve([]);
    });
  }

  private handleOnline(): void {
    this.isOnline = true;
    this.notifyListeners();
    this.processQueue();
  }

  private handleOffline(): void {
    this.isOnline = false;
    this.notifyListeners();
  }

  private notifyListeners(): void {
    const status = this.getStatus();
    this.listeners.forEach(listener => listener(status));
  }

  private getLastSyncTime(): Date | null {
    const stored = localStorage.getItem('divertscan_last_sync');
    return stored ? new Date(parseInt(stored)) : null;
  }

  private setLastSyncTime(timestamp: number): void {
    localStorage.setItem('divertscan_last_sync', timestamp.toString());
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

interface SyncOperation {
  id?: string;
  endpoint: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  timestamp?: number;
  attempts?: number;
  onSuccess?: (result: unknown) => void;
  onError?: (error: Error) => void;
}

interface SyncStatus {
  isOnline: boolean;
  pendingCount: number;
  syncInProgress: boolean;
  lastSyncAt: Date | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export const auth = AuthService.getInstance();
export const billing = new BillingService();
export const tenantData = new TenantDataService();
export const offlineSync = OfflineSyncEngine.getInstance();
