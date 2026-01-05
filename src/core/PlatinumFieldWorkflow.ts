/**
 * DivertScan™ Apex Enterprise - Platinum Field Workflow v3.0
 * "Raul's Mode" - Complete Two-Stage Live Load System
 * iPad-Optimized | Offline-First
 */

import { offlineSync, auth, type WeightTicket, type TicketPhoto, type MaterialType } from './SaaSArchitecture';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

export interface LiveLoadSession {
  id: string;
  projectId: string;
  status: 'awaiting_gross' | 'awaiting_tare' | 'awaiting_signature' | 'complete' | 'cancelled';
  
  // Stage 1: Incoming (Gross)
  grossWeight?: number;
  grossTimestamp?: Date;
  grossGps?: GeoCoordinates;
  grossPhoto?: CapturedPhoto;
  
  // Stage 2: Outgoing (Tare)
  tareWeight?: number;
  tareTimestamp?: Date;
  tareGps?: GeoCoordinates;
  tarePhoto?: CapturedPhoto;
  
  // Calculated
  netWeight?: number;
  weightUnit: WeightUnit;
  
  // Vehicle & Driver
  truckPlate: string;
  fleetNumber?: string;
  driverName: string;
  driverPhone?: string;
  haulerCompany?: string;
  
  // Material
  materialType: MaterialType;
  destination: Destination;
  facilityId: string;
  facilityName: string;
  
  // Debris Photos (3 required)
  debrisPhotos: CapturedPhoto[];
  
  // Signature
  signature?: SignatureData;
  signedAt?: Date;
  
  // Metadata
  ticketNumber?: string;
  createdAt: Date;
  createdBy: string;
  notes?: string;
}

export interface GeoCoordinates {
  lat: number;
  lng: number;
  accuracy: number;
  altitude?: number;
  timestamp: Date;
}

export interface CapturedPhoto {
  id: string;
  type: 'gross' | 'tare' | 'debris' | 'ticket' | 'signature';
  dataUrl: string;
  thumbnailUrl?: string;
  gps?: GeoCoordinates;
  timestamp: Date;
  fileSize: number;
}

export interface SignatureData {
  dataUrl: string;
  points: SignaturePoint[][];
  driverName: string;
  capturedAt: Date;
}

export interface SignaturePoint {
  x: number;
  y: number;
  pressure?: number;
  timestamp: number;
}

export interface SMSReceipt {
  id: string;
  ticketId: string;
  recipientPhone: string;
  receiptUrl: string;
  sentAt?: Date;
  status: 'pending' | 'sent' | 'delivered' | 'failed';
  twilioSid?: string;
}

export type WeightUnit = 'lbs' | 'tons' | 'kg';
export type Destination = 'landfill' | 'recycling' | 'donation' | 'salvage';

// ═══════════════════════════════════════════════════════════════════════════════
// GPS SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export class GPSService {
  private static instance: GPSService;
  private watchId: number | null = null;
  private lastPosition: GeoCoordinates | null = null;
  private listeners: Set<(pos: GeoCoordinates) => void> = new Set();

  private constructor() {}

  static getInstance(): GPSService {
    if (!GPSService.instance) {
      GPSService.instance = new GPSService();
    }
    return GPSService.instance;
  }

  async getCurrentPosition(highAccuracy: boolean = true): Promise<GeoCoordinates> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords: GeoCoordinates = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude ?? undefined,
            timestamp: new Date(position.timestamp)
          };
          this.lastPosition = coords;
          resolve(coords);
        },
        (error) => {
          // Return last known position if available
          if (this.lastPosition) {
            resolve(this.lastPosition);
          } else {
            reject(new Error(`GPS error: ${error.message}`));
          }
        },
        {
          enableHighAccuracy: highAccuracy,
          timeout: 10000,
          maximumAge: 30000
        }
      );
    });
  }

  startWatching(): void {
    if (this.watchId !== null) return;

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        const coords: GeoCoordinates = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude ?? undefined,
          timestamp: new Date(position.timestamp)
        };
        this.lastPosition = coords;
        this.listeners.forEach(cb => cb(coords));
      },
      () => {},
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  }

  stopWatching(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  subscribe(listener: (pos: GeoCoordinates) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getLastPosition(): GeoCoordinates | null {
    return this.lastPosition;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAMERA SERVICE (IPAD OPTIMIZED)
// ═══════════════════════════════════════════════════════════════════════════════

export class CameraService {
  private static readonly MAX_WIDTH = 1920;
  private static readonly MAX_HEIGHT = 1080;
  private static readonly THUMBNAIL_SIZE = 200;
  private static readonly JPEG_QUALITY = 0.85;

  static async capturePhoto(type: CapturedPhoto['type']): Promise<CapturedPhoto> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';

    return new Promise((resolve, reject) => {
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          reject(new Error('No file selected'));
          return;
        }

        try {
          const [dataUrl, thumbnailUrl] = await Promise.all([
            this.processImage(file, this.MAX_WIDTH, this.MAX_HEIGHT),
            this.processImage(file, this.THUMBNAIL_SIZE, this.THUMBNAIL_SIZE)
          ]);

          const gps = await GPSService.getInstance().getCurrentPosition().catch(() => undefined);

          resolve({
            id: crypto.randomUUID(),
            type,
            dataUrl,
            thumbnailUrl,
            gps,
            timestamp: new Date(),
            fileSize: dataUrl.length
          });
        } catch (error) {
          reject(error);
        }
      };

      input.click();
    });
  }

  private static async processImage(file: File, maxWidth: number, maxHeight: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;

          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width *= ratio;
            height *= ratio;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0, width, height);

          resolve(canvas.toDataURL('image/jpeg', this.JPEG_QUALITY));
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIGNATURE CAPTURE (IPAD TOUCH OPTIMIZED)
// ═══════════════════════════════════════════════════════════════════════════════

export class SignatureCapture {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private isDrawing: boolean = false;
  private strokes: SignaturePoint[][] = [];
  private currentStroke: SignaturePoint[] = [];
  private driverName: string = '';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.setupCanvas();
    this.bindEvents();
  }

  private setupCanvas(): void {
    // High DPI support for iPad Retina
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    
    this.ctx.scale(dpr, dpr);
    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 2;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    
    this.clear();
  }

  private bindEvents(): void {
    // Touch events (iPad)
    this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
    this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
    this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));
    this.canvas.addEventListener('touchcancel', this.handleTouchEnd.bind(this));

    // Mouse events (fallback)
    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.canvas.addEventListener('mouseleave', this.handleMouseUp.bind(this));
  }

  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault();
    const touch = e.touches[0];
    this.startStroke(this.getPoint(touch));
  }

  private handleTouchMove(e: TouchEvent): void {
    e.preventDefault();
    if (!this.isDrawing) return;
    const touch = e.touches[0];
    this.continueStroke(this.getPoint(touch));
  }

  private handleTouchEnd(): void {
    this.endStroke();
  }

  private handleMouseDown(e: MouseEvent): void {
    this.startStroke(this.getMousePoint(e));
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.isDrawing) return;
    this.continueStroke(this.getMousePoint(e));
  }

  private handleMouseUp(): void {
    this.endStroke();
  }

  private getPoint(touch: Touch): SignaturePoint {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
      pressure: (touch as any).force || 0.5,
      timestamp: Date.now()
    };
  }

  private getMousePoint(e: MouseEvent): SignaturePoint {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: 0.5,
      timestamp: Date.now()
    };
  }

  private startStroke(point: SignaturePoint): void {
    this.isDrawing = true;
    this.currentStroke = [point];
    this.ctx.beginPath();
    this.ctx.moveTo(point.x, point.y);
  }

  private continueStroke(point: SignaturePoint): void {
    this.currentStroke.push(point);
    
    // Smooth line drawing
    const prev = this.currentStroke[this.currentStroke.length - 2];
    const midX = (prev.x + point.x) / 2;
    const midY = (prev.y + point.y) / 2;
    
    this.ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
    this.ctx.stroke();
    this.ctx.beginPath();
    this.ctx.moveTo(midX, midY);
  }

  private endStroke(): void {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    
    if (this.currentStroke.length > 0) {
      this.strokes.push([...this.currentStroke]);
      this.currentStroke = [];
    }
  }

  setDriverName(name: string): void {
    this.driverName = name;
  }

  clear(): void {
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw signature line
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.strokeStyle = '#cccccc';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(20, rect.height - 40);
    this.ctx.lineTo(rect.width - 20, rect.height - 40);
    this.ctx.stroke();
    
    // Reset stroke style
    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 2;
    
    this.strokes = [];
    this.currentStroke = [];
  }

  isEmpty(): boolean {
    return this.strokes.length === 0;
  }

  getSignatureData(): SignatureData | null {
    if (this.isEmpty()) return null;

    return {
      dataUrl: this.canvas.toDataURL('image/png'),
      points: this.strokes,
      driverName: this.driverName,
      capturedAt: new Date()
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SMS SERVICE (TWILIO INTEGRATION)
// ═══════════════════════════════════════════════════════════════════════════════

export class SMSService {
  private static readonly API_ENDPOINT = '/api/sms/send';

  static async sendReceipt(
    ticketId: string,
    recipientPhone: string,
    receiptUrl: string
  ): Promise<SMSReceipt> {
    const receipt: SMSReceipt = {
      id: crypto.randomUUID(),
      ticketId,
      recipientPhone,
      receiptUrl,
      status: 'pending'
    };

    try {
      const response = await fetch(this.API_ENDPOINT, {
        method: 'POST',
        headers: auth.getAuthHeaders(),
        body: JSON.stringify({
          to: recipientPhone,
          message: `DivertScan Receipt: Your weight ticket is ready. View at: ${receiptUrl}`,
          ticketId
        })
      });

      if (!response.ok) {
        throw new Error('SMS send failed');
      }

      const result = await response.json();
      receipt.status = 'sent';
      receipt.sentAt = new Date();
      receipt.twilioSid = result.sid;

    } catch (error) {
      receipt.status = 'failed';
      
      // Queue for offline retry
      await offlineSync.queueOperation({
        endpoint: this.API_ENDPOINT,
        method: 'POST',
        body: {
          to: recipientPhone,
          message: `DivertScan Receipt: Your weight ticket is ready. View at: ${receiptUrl}`,
          ticketId
        }
      });
    }

    return receipt;
  }

  static formatPhoneNumber(phone: string): string {
    // Clean and format to E.164
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `+1${cleaned}`;
    }
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+${cleaned}`;
    }
    return `+${cleaned}`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIVE LOAD SESSION MANAGER
// ═══════════════════════════════════════════════════════════════════════════════

export class LiveLoadManager {
  private static instance: LiveLoadManager;
  private currentSession: LiveLoadSession | null = null;
  private gps: GPSService;
  private listeners: Set<(session: LiveLoadSession | null) => void> = new Set();

  private constructor() {
    this.gps = GPSService.getInstance();
  }

  static getInstance(): LiveLoadManager {
    if (!LiveLoadManager.instance) {
      LiveLoadManager.instance = new LiveLoadManager();
    }
    return LiveLoadManager.instance;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SESSION LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────────

  async startSession(params: StartSessionParams): Promise<LiveLoadSession> {
    const user = auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const gps = await this.gps.getCurrentPosition().catch(() => undefined);

    this.currentSession = {
      id: crypto.randomUUID(),
      projectId: params.projectId,
      status: 'awaiting_gross',
      weightUnit: params.weightUnit || 'lbs',
      truckPlate: params.truckPlate,
      fleetNumber: params.fleetNumber,
      driverName: params.driverName,
      driverPhone: params.driverPhone,
      haulerCompany: params.haulerCompany,
      materialType: params.materialType,
      destination: params.destination,
      facilityId: params.facilityId,
      facilityName: params.facilityName,
      debrisPhotos: [],
      createdAt: new Date(),
      createdBy: user.id,
      notes: params.notes
    };

    // Store in offline DB
    await offlineSync.storeOfflineData(
      'live_sessions',
      this.currentSession.id,
      this.currentSession
    );

    this.notifyListeners();
    return this.currentSession;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STAGE 1: GROSS WEIGHT CAPTURE
  // ─────────────────────────────────────────────────────────────────────────────

  async captureGrossWeight(weight: number): Promise<LiveLoadSession> {
    if (!this.currentSession) throw new Error('No active session');
    if (this.currentSession.status !== 'awaiting_gross') {
      throw new Error('Session not awaiting gross weight');
    }

    const gps = await this.gps.getCurrentPosition().catch(() => undefined);

    this.currentSession.grossWeight = weight;
    this.currentSession.grossTimestamp = new Date();
    this.currentSession.grossGps = gps;
    this.currentSession.status = 'awaiting_tare';

    await this.saveSession();
    return this.currentSession;
  }

  async captureGrossPhoto(): Promise<CapturedPhoto> {
    if (!this.currentSession) throw new Error('No active session');

    const photo = await CameraService.capturePhoto('gross');
    this.currentSession.grossPhoto = photo;
    
    await this.saveSession();
    return photo;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STAGE 2: TARE WEIGHT CAPTURE
  // ─────────────────────────────────────────────────────────────────────────────

  async captureTareWeight(weight: number): Promise<LiveLoadSession> {
    if (!this.currentSession) throw new Error('No active session');
    if (this.currentSession.status !== 'awaiting_tare') {
      throw new Error('Session not awaiting tare weight');
    }

    const gps = await this.gps.getCurrentPosition().catch(() => undefined);

    this.currentSession.tareWeight = weight;
    this.currentSession.tareTimestamp = new Date();
    this.currentSession.tareGps = gps;
    
    // Calculate net weight
    if (this.currentSession.grossWeight !== undefined) {
      this.currentSession.netWeight = this.currentSession.grossWeight - weight;
    }

    this.currentSession.status = 'awaiting_signature';

    await this.saveSession();
    return this.currentSession;
  }

  async captureTarePhoto(): Promise<CapturedPhoto> {
    if (!this.currentSession) throw new Error('No active session');

    const photo = await CameraService.capturePhoto('tare');
    this.currentSession.tarePhoto = photo;
    
    await this.saveSession();
    return photo;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DEBRIS PHOTOS (3 REQUIRED)
  // ─────────────────────────────────────────────────────────────────────────────

  async captureDebrisPhoto(): Promise<CapturedPhoto> {
    if (!this.currentSession) throw new Error('No active session');
    if (this.currentSession.debrisPhotos.length >= 3) {
      throw new Error('Maximum debris photos already captured');
    }

    const photo = await CameraService.capturePhoto('debris');
    this.currentSession.debrisPhotos.push(photo);
    
    await this.saveSession();
    return photo;
  }

  removeDebrisPhoto(photoId: string): void {
    if (!this.currentSession) return;
    
    this.currentSession.debrisPhotos = this.currentSession.debrisPhotos.filter(
      p => p.id !== photoId
    );
    
    this.saveSession();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SIGNATURE & COMPLETION
  // ─────────────────────────────────────────────────────────────────────────────

  async captureSignature(signatureData: SignatureData): Promise<LiveLoadSession> {
    if (!this.currentSession) throw new Error('No active session');
    if (this.currentSession.status !== 'awaiting_signature') {
      throw new Error('Session not awaiting signature');
    }

    this.currentSession.signature = signatureData;
    this.currentSession.signedAt = new Date();
    this.currentSession.status = 'complete';

    // Generate ticket number
    this.currentSession.ticketNumber = this.generateTicketNumber();

    await this.saveSession();
    return this.currentSession;
  }

  async completeSession(sendSMS: boolean = true): Promise<WeightTicket> {
    if (!this.currentSession) throw new Error('No active session');
    if (this.currentSession.status !== 'complete') {
      throw new Error('Session not complete');
    }

    // Validate required data
    this.validateSession();

    // Convert to WeightTicket
    const ticket = this.convertToWeightTicket();

    // Queue for sync
    await offlineSync.queueOperation({
      endpoint: `/api/projects/${this.currentSession.projectId}/tickets`,
      method: 'POST',
      body: ticket,
      onSuccess: async (result: any) => {
        // Send SMS receipt if requested
        if (sendSMS && this.currentSession?.driverPhone) {
          const receiptUrl = `${window.location.origin}/receipt/${result.id}`;
          await SMSService.sendReceipt(
            result.id,
            SMSService.formatPhoneNumber(this.currentSession.driverPhone),
            receiptUrl
          );
        }
      }
    });

    // Clear session
    const completedSession = this.currentSession;
    this.currentSession = null;
    await offlineSync.storeOfflineData('live_sessions', completedSession.id, null);
    
    this.notifyListeners();
    return ticket;
  }

  cancelSession(): void {
    if (this.currentSession) {
      this.currentSession.status = 'cancelled';
      offlineSync.storeOfflineData('live_sessions', this.currentSession.id, null);
      this.currentSession = null;
      this.notifyListeners();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  private async saveSession(): Promise<void> {
    if (this.currentSession) {
      await offlineSync.storeOfflineData(
        'live_sessions',
        this.currentSession.id,
        this.currentSession
      );
      this.notifyListeners();
    }
  }

  private validateSession(): void {
    const s = this.currentSession!;
    
    if (s.grossWeight === undefined) throw new Error('Missing gross weight');
    if (s.tareWeight === undefined) throw new Error('Missing tare weight');
    if (s.netWeight === undefined) throw new Error('Missing net weight');
    if (!s.signature) throw new Error('Missing signature');
    if (s.debrisPhotos.length < 3) throw new Error('Minimum 3 debris photos required');
  }

  private convertToWeightTicket(): WeightTicket {
    const s = this.currentSession!;
    const tenant = auth.getTenant();

    return {
      id: crypto.randomUUID(),
      tenantId: tenant?.id ?? '',
      projectId: s.projectId,
      ticketNumber: s.ticketNumber!,
      status: 'pending',
      grossWeight: s.grossWeight!,
      tareWeight: s.tareWeight!,
      netWeight: s.netWeight!,
      weightUnit: s.weightUnit,
      materialType: s.materialType,
      destination: s.destination,
      facilityId: s.facilityId,
      facilityName: s.facilityName,
      driverName: s.driverName,
      driverSignature: s.signature!.dataUrl,
      truckPlate: s.truckPlate,
      fleetNumber: s.fleetNumber,
      gpsCoordinates: s.grossGps ?? { lat: 0, lng: 0 },
      timestamps: {
        grossCaptured: s.grossTimestamp!,
        tareCaptured: s.tareTimestamp!,
        signed: s.signedAt!
      },
      photos: [
        ...s.debrisPhotos.map(p => ({
          id: p.id,
          type: 'debris_pile' as const,
          url: p.dataUrl,
          thumbnail: p.thumbnailUrl ?? p.dataUrl,
          capturedAt: p.timestamp,
          gpsCoordinates: p.gps
        })),
        ...(s.grossPhoto ? [{
          id: s.grossPhoto.id,
          type: 'scale_ticket' as const,
          url: s.grossPhoto.dataUrl,
          thumbnail: s.grossPhoto.thumbnailUrl ?? s.grossPhoto.dataUrl,
          capturedAt: s.grossPhoto.timestamp,
          gpsCoordinates: s.grossPhoto.gps
        }] : [])
      ],
      ocrSource: 'manual',
      invoiced: false
    };
  }

  private generateTicketNumber(): string {
    const date = new Date();
    const datePart = date.toISOString().slice(2, 10).replace(/-/g, '');
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `DS-${datePart}-${randomPart}`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STATE MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  getSession(): LiveLoadSession | null {
    return this.currentSession;
  }

  hasActiveSession(): boolean {
    return this.currentSession !== null;
  }

  subscribe(listener: (session: LiveLoadSession | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(cb => cb(this.currentSession));
  }

  async restoreSession(): Promise<void> {
    // Try to restore from IndexedDB on app load
    const db = await openSessionDB();
    const sessions = await db.getAll('live_sessions');
    
    const activeSession = sessions.find(
      (s: any) => s.data?.status && !['complete', 'cancelled'].includes(s.data.status)
    );

    if (activeSession) {
      this.currentSession = activeSession.data;
      this.notifyListeners();
    }
  }
}

interface StartSessionParams {
  projectId: string;
  truckPlate: string;
  fleetNumber?: string;
  driverName: string;
  driverPhone?: string;
  haulerCompany?: string;
  materialType: MaterialType;
  destination: Destination;
  facilityId: string;
  facilityName: string;
  weightUnit?: WeightUnit;
  notes?: string;
}

async function openSessionDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('divertscan_sessions', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as unknown as IDBDatabase);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('live_sessions')) {
        db.createObjectStore('live_sessions', { keyPath: 'key' });
      }
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// DIGITAL RECEIPT GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

export class ReceiptGenerator {
  static generateHTML(ticket: WeightTicket, session?: LiveLoadSession): string {
    const formatDate = (d: Date) => new Date(d).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    const formatWeight = (w: number, unit: string) => {
      return `${w.toLocaleString()} ${unit}`;
    };

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DivertScan Receipt - ${ticket.ticketNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      padding: 20px;
    }
    .receipt {
      max-width: 400px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #1a5f2a 0%, #2d8b47 100%);
      color: white;
      padding: 24px;
      text-align: center;
    }
    .header h1 { font-size: 24px; margin-bottom: 8px; }
    .header .ticket-num { font-size: 14px; opacity: 0.9; }
    .body { padding: 24px; }
    .row {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid #eee;
    }
    .row:last-child { border-bottom: none; }
    .label { color: #666; font-size: 14px; }
    .value { font-weight: 600; text-align: right; }
    .weights {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 16px;
      margin: 16px 0;
    }
    .weight-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
    }
    .net-weight {
      background: #1a5f2a;
      color: white;
      padding: 12px;
      border-radius: 6px;
      margin-top: 8px;
    }
    .net-weight .label { color: rgba(255,255,255,0.8); }
    .net-weight .value { font-size: 24px; }
    .signature {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px dashed #ccc;
    }
    .signature img {
      max-width: 100%;
      height: 80px;
      object-fit: contain;
    }
    .footer {
      text-align: center;
      padding: 16px;
      background: #f8f9fa;
      font-size: 12px;
      color: #666;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .status-pending { background: #fff3cd; color: #856404; }
    .status-verified { background: #d4edda; color: #155724; }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <h1>DivertScan™</h1>
      <div class="ticket-num">Ticket #${ticket.ticketNumber}</div>
    </div>
    
    <div class="body">
      <div class="row">
        <span class="label">Date</span>
        <span class="value">${formatDate(ticket.timestamps.grossCaptured)}</span>
      </div>
      
      <div class="row">
        <span class="label">Status</span>
        <span class="value">
          <span class="status-badge status-${ticket.status}">${ticket.status}</span>
        </span>
      </div>
      
      <div class="row">
        <span class="label">Driver</span>
        <span class="value">${ticket.driverName}</span>
      </div>
      
      <div class="row">
        <span class="label">Truck</span>
        <span class="value">${ticket.truckPlate}${ticket.fleetNumber ? ` (${ticket.fleetNumber})` : ''}</span>
      </div>
      
      <div class="row">
        <span class="label">Material</span>
        <span class="value">${ticket.materialType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
      </div>
      
      <div class="row">
        <span class="label">Destination</span>
        <span class="value">${ticket.destination.replace(/\b\w/g, c => c.toUpperCase())}</span>
      </div>
      
      <div class="row">
        <span class="label">Facility</span>
        <span class="value">${ticket.facilityName}</span>
      </div>
      
      <div class="weights">
        <div class="weight-row">
          <span class="label">Gross Weight</span>
          <span class="value">${formatWeight(ticket.grossWeight, ticket.weightUnit)}</span>
        </div>
        <div class="weight-row">
          <span class="label">Tare Weight</span>
          <span class="value">${formatWeight(ticket.tareWeight, ticket.weightUnit)}</span>
        </div>
        <div class="net-weight">
          <div class="weight-row">
            <span class="label">Net Weight</span>
            <span class="value">${formatWeight(ticket.netWeight, ticket.weightUnit)}</span>
          </div>
        </div>
      </div>
      
      ${ticket.driverSignature ? `
      <div class="signature">
        <div class="label" style="margin-bottom: 8px;">Driver Signature</div>
        <img src="${ticket.driverSignature}" alt="Signature">
      </div>
      ` : ''}
    </div>
    
    <div class="footer">
      <div>Powered by DivertScan™</div>
      <div>LEED v5 Waste Management</div>
    </div>
  </div>
</body>
</html>
    `.trim();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export const liveLoad = LiveLoadManager.getInstance();
export const gpsService = GPSService.getInstance();
