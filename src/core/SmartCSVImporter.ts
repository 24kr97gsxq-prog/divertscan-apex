/**
 * DivertScan™ Apex Enterprise - Smart CSV Importer v3.0
 * Drag-and-Drop Header Mapper for iPad Files App Integration
 * Handles historical spreadsheet backlog imports
 */

import { offlineSync, auth, type WeightTicket, type MaterialType } from './SaaSArchitecture';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ImportSession {
  id: string;
  tenantId: string;
  projectId: string;
  filename: string;
  status: ImportStatus;
  totalRows: number;
  processedRows: number;
  successCount: number;
  errorCount: number;
  skippedCount: number;
  columnMapping: ColumnMapping;
  previewRows: ParsedRow[];
  errors: ImportError[];
  createdAt: Date;
  completedAt?: Date;
}

export type ImportStatus = 
  | 'uploading'
  | 'parsing'
  | 'mapping'
  | 'validating'
  | 'importing'
  | 'complete'
  | 'failed'
  | 'cancelled';

export interface ColumnMapping {
  [targetField: string]: MappedColumn | null;
}

export interface MappedColumn {
  sourceIndex: number;
  sourceName: string;
  transform?: TransformFunction;
  defaultValue?: any;
}

export type TransformFunction = 
  | 'none'
  | 'uppercase'
  | 'lowercase'
  | 'trim'
  | 'parse_date'
  | 'parse_number'
  | 'parse_weight'
  | 'parse_material'
  | 'parse_destination';

export interface ParsedRow {
  rowIndex: number;
  originalData: string[];
  mappedData: Partial<WeightTicket>;
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ImportError {
  rowIndex: number;
  column?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface CSVParseOptions {
  delimiter?: string;
  hasHeader?: boolean;
  encoding?: string;
  skipEmptyRows?: boolean;
  trimValues?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TARGET FIELD DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const TARGET_FIELDS: TargetFieldDefinition[] = [
  { 
    key: 'ticketNumber', 
    label: 'Ticket Number', 
    required: true,
    aliases: ['ticket', 'ticket #', 'ticket_num', 'receipt', 'scale ticket'],
    transform: 'trim'
  },
  { 
    key: 'date', 
    label: 'Date', 
    required: true,
    aliases: ['date', 'ticket date', 'weigh date', 'transaction date'],
    transform: 'parse_date'
  },
  { 
    key: 'grossWeight', 
    label: 'Gross Weight', 
    required: true,
    aliases: ['gross', 'gross weight', 'gross wt', 'in weight', 'incoming'],
    transform: 'parse_weight'
  },
  { 
    key: 'tareWeight', 
    label: 'Tare Weight', 
    required: true,
    aliases: ['tare', 'tare weight', 'tare wt', 'out weight', 'outgoing'],
    transform: 'parse_weight'
  },
  { 
    key: 'netWeight', 
    label: 'Net Weight', 
    required: false,
    aliases: ['net', 'net weight', 'net wt', 'actual weight'],
    transform: 'parse_weight'
  },
  { 
    key: 'weightUnit', 
    label: 'Weight Unit', 
    required: false,
    aliases: ['unit', 'weight unit', 'uom'],
    defaultValue: 'lbs'
  },
  { 
    key: 'materialType', 
    label: 'Material Type', 
    required: true,
    aliases: ['material', 'material type', 'waste type', 'product', 'commodity'],
    transform: 'parse_material'
  },
  { 
    key: 'destination', 
    label: 'Destination', 
    required: true,
    aliases: ['destination', 'dest', 'disposal', 'diversion'],
    transform: 'parse_destination'
  },
  { 
    key: 'facilityName', 
    label: 'Facility Name', 
    required: true,
    aliases: ['facility', 'facility name', 'site', 'location', 'vendor']
  },
  { 
    key: 'truckPlate', 
    label: 'Truck/License Plate', 
    required: false,
    aliases: ['truck', 'plate', 'license', 'tag', 'vehicle'],
    transform: 'uppercase'
  },
  { 
    key: 'driverName', 
    label: 'Driver Name', 
    required: false,
    aliases: ['driver', 'driver name', 'hauler', 'operator']
  },
  { 
    key: 'haulerCompany', 
    label: 'Hauler Company', 
    required: false,
    aliases: ['hauler', 'company', 'carrier', 'trucking company']
  },
  { 
    key: 'notes', 
    label: 'Notes', 
    required: false,
    aliases: ['notes', 'comments', 'remarks', 'description']
  }
];

interface TargetFieldDefinition {
  key: string;
  label: string;
  required: boolean;
  aliases: string[];
  transform?: TransformFunction;
  defaultValue?: any;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CSV PARSER
// ═══════════════════════════════════════════════════════════════════════════════

export class CSVParser {
  private options: Required<CSVParseOptions>;

  constructor(options: CSVParseOptions = {}) {
    this.options = {
      delimiter: options.delimiter ?? ',',
      hasHeader: options.hasHeader ?? true,
      encoding: options.encoding ?? 'utf-8',
      skipEmptyRows: options.skipEmptyRows ?? true,
      trimValues: options.trimValues ?? true
    };
  }

  async parseFile(file: File): Promise<ParseResult> {
    const text = await this.readFile(file);
    return this.parseText(text);
  }

  parseText(text: string): ParseResult {
    const lines = this.splitLines(text);
    const rows: string[][] = [];
    let headers: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (this.options.skipEmptyRows && !line.trim()) {
        continue;
      }

      const values = this.parseLine(line);

      if (this.options.hasHeader && headers.length === 0) {
        headers = values.map(h => h.toLowerCase().trim());
        continue;
      }

      rows.push(values);
    }

    // Auto-detect headers if not present
    if (!this.options.hasHeader) {
      headers = rows[0]?.map((_, i) => `Column ${i + 1}`) ?? [];
    }

    return { headers, rows, totalRows: rows.length };
  }

  private async readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file, this.options.encoding);
    });
  }

  private splitLines(text: string): string[] {
    // Handle different line endings
    return text.split(/\r\n|\r|\n/);
  }

  private parseLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === this.options.delimiter && !inQuotes) {
        values.push(this.options.trimValues ? current.trim() : current);
        current = '';
      } else {
        current += char;
      }
    }

    values.push(this.options.trimValues ? current.trim() : current);
    return values;
  }

  detectDelimiter(text: string): string {
    const firstLine = text.split(/\r\n|\r|\n/)[0];
    const delimiters = [',', '\t', ';', '|'];
    
    let bestDelimiter = ',';
    let maxCount = 0;

    for (const delimiter of delimiters) {
      const count = (firstLine.match(new RegExp(delimiter, 'g')) || []).length;
      if (count > maxCount) {
        maxCount = count;
        bestDelimiter = delimiter;
      }
    }

    return bestDelimiter;
  }
}

interface ParseResult {
  headers: string[];
  rows: string[][];
  totalRows: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-MAPPING ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export class AutoMapper {
  static suggestMapping(headers: string[]): ColumnMapping {
    const mapping: ColumnMapping = {};

    for (const field of TARGET_FIELDS) {
      const matchIndex = this.findBestMatch(headers, field.aliases);
      
      if (matchIndex >= 0) {
        mapping[field.key] = {
          sourceIndex: matchIndex,
          sourceName: headers[matchIndex],
          transform: field.transform,
          defaultValue: field.defaultValue
        };
      } else {
        mapping[field.key] = null;
      }
    }

    return mapping;
  }

  private static findBestMatch(headers: string[], aliases: string[]): number {
    // Exact match first
    for (const alias of aliases) {
      const exactIndex = headers.findIndex(h => 
        h.toLowerCase() === alias.toLowerCase()
      );
      if (exactIndex >= 0) return exactIndex;
    }

    // Partial match
    for (const alias of aliases) {
      const partialIndex = headers.findIndex(h =>
        h.toLowerCase().includes(alias.toLowerCase()) ||
        alias.toLowerCase().includes(h.toLowerCase())
      );
      if (partialIndex >= 0) return partialIndex;
    }

    return -1;
  }

  static calculateMappingConfidence(mapping: ColumnMapping): number {
    const required = TARGET_FIELDS.filter(f => f.required);
    const mappedRequired = required.filter(f => mapping[f.key] !== null);
    return mappedRequired.length / required.length;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATA TRANSFORMERS
// ═══════════════════════════════════════════════════════════════════════════════

export class DataTransformer {
  static transform(value: string, transform: TransformFunction): any {
    if (!value || value.trim() === '') return null;

    switch (transform) {
      case 'none':
        return value;
      
      case 'uppercase':
        return value.toUpperCase();
      
      case 'lowercase':
        return value.toLowerCase();
      
      case 'trim':
        return value.trim();
      
      case 'parse_date':
        return this.parseDate(value);
      
      case 'parse_number':
        return this.parseNumber(value);
      
      case 'parse_weight':
        return this.parseWeight(value);
      
      case 'parse_material':
        return this.parseMaterial(value);
      
      case 'parse_destination':
        return this.parseDestination(value);
      
      default:
        return value;
    }
  }

  static parseDate(value: string): Date | null {
    // Handle various date formats
    const formats = [
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,       // MM/DD/YYYY
      /^(\d{1,2})-(\d{1,2})-(\d{4})$/,         // MM-DD-YYYY
      /^(\d{4})-(\d{2})-(\d{2})$/,             // YYYY-MM-DD
      /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/,       // MM/DD/YY
    ];

    for (const format of formats) {
      const match = value.match(format);
      if (match) {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    // Fallback to native parsing
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  static parseNumber(value: string): number | null {
    const cleaned = value.replace(/[^\d.-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  static parseWeight(value: string): number | null {
    // Remove unit indicators and parse
    const cleaned = value
      .replace(/lbs?\.?/gi, '')
      .replace(/tons?/gi, '')
      .replace(/kg/gi, '')
      .replace(/,/g, '')
      .trim();
    
    return this.parseNumber(cleaned);
  }

  static parseMaterial(value: string): MaterialType {
    const lower = value.toLowerCase();
    
    const materialMap: Record<string, MaterialType> = {
      'concrete': 'concrete',
      'cement': 'concrete',
      'asphalt': 'asphalt',
      'metal': 'metal_ferrous',
      'steel': 'metal_ferrous',
      'iron': 'metal_ferrous',
      'aluminum': 'metal_nonferrous',
      'copper': 'metal_nonferrous',
      'wood': 'wood_clean',
      'lumber': 'wood_clean',
      'treated': 'wood_treated',
      'cardboard': 'cardboard',
      'occ': 'cardboard',
      'paper': 'paper',
      'plastic': 'plastic',
      'drywall': 'drywall',
      'sheetrock': 'drywall',
      'roofing': 'roofing',
      'shingle': 'roofing',
      'brick': 'brick_masonry',
      'masonry': 'brick_masonry',
      'soil': 'soil_land_clearing',
      'dirt': 'soil_land_clearing',
      'mixed': 'mixed_c_and_d',
      'c&d': 'mixed_c_and_d',
      'debris': 'mixed_c_and_d'
    };

    for (const [keyword, materialType] of Object.entries(materialMap)) {
      if (lower.includes(keyword)) {
        return materialType;
      }
    }

    return 'other';
  }

  static parseDestination(value: string): 'landfill' | 'recycling' | 'donation' | 'salvage' {
    const lower = value.toLowerCase();
    
    if (lower.includes('recycle') || lower.includes('recycl') || lower.includes('diverted')) {
      return 'recycling';
    }
    if (lower.includes('donate') || lower.includes('charity')) {
      return 'donation';
    }
    if (lower.includes('salvage') || lower.includes('reuse')) {
      return 'salvage';
    }
    
    return 'landfill';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROW VALIDATOR
// ═══════════════════════════════════════════════════════════════════════════════

export class RowValidator {
  static validate(row: Partial<WeightTicket>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!row.ticketNumber) {
      errors.push('Missing ticket number');
    }

    if (!row.grossWeight && row.grossWeight !== 0) {
      errors.push('Missing gross weight');
    }

    if (!row.tareWeight && row.tareWeight !== 0) {
      errors.push('Missing tare weight');
    }

    if (!row.materialType) {
      errors.push('Missing material type');
    }

    if (!row.destination) {
      errors.push('Missing destination');
    }

    if (!row.facilityName) {
      errors.push('Missing facility name');
    }

    // Logical validations
    if (row.grossWeight !== undefined && row.tareWeight !== undefined) {
      if (row.tareWeight > row.grossWeight) {
        errors.push('Tare weight cannot exceed gross weight');
      }
      
      const net = row.grossWeight - row.tareWeight;
      if (net < 0) {
        errors.push('Net weight would be negative');
      }
      
      if (net > 100 && row.weightUnit === 'tons') {
        warnings.push('Net weight seems unusually high (>100 tons)');
      }
    }

    // Date validation
    if (row.timestamps?.grossCaptured) {
      const date = new Date(row.timestamps.grossCaptured);
      if (date > new Date()) {
        warnings.push('Date is in the future');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMPORT ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export class CSVImportEngine {
  private static instance: CSVImportEngine;
  private currentSession: ImportSession | null = null;
  private parser: CSVParser;
  private listeners: Set<(session: ImportSession) => void> = new Set();

  private constructor() {
    this.parser = new CSVParser();
  }

  static getInstance(): CSVImportEngine {
    if (!CSVImportEngine.instance) {
      CSVImportEngine.instance = new CSVImportEngine();
    }
    return CSVImportEngine.instance;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FILE HANDLING
  // ─────────────────────────────────────────────────────────────────────────────

  async loadFile(file: File, projectId: string): Promise<ImportSession> {
    const tenant = auth.getTenant();
    if (!tenant) throw new Error('Not authenticated');

    // Create new session
    this.currentSession = {
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      projectId,
      filename: file.name,
      status: 'uploading',
      totalRows: 0,
      processedRows: 0,
      successCount: 0,
      errorCount: 0,
      skippedCount: 0,
      columnMapping: {},
      previewRows: [],
      errors: [],
      createdAt: new Date()
    };

    this.notifyListeners();

    try {
      // Parse file
      this.currentSession.status = 'parsing';
      this.notifyListeners();

      const result = await this.parser.parseFile(file);
      this.currentSession.totalRows = result.totalRows;

      // Auto-suggest mapping
      this.currentSession.status = 'mapping';
      this.currentSession.columnMapping = AutoMapper.suggestMapping(result.headers);

      // Generate preview
      this.currentSession.previewRows = this.generatePreview(result, 5);

      this.notifyListeners();
      return this.currentSession;

    } catch (error) {
      this.currentSession.status = 'failed';
      this.currentSession.errors.push({
        rowIndex: -1,
        message: `Parse error: ${error}`,
        severity: 'error'
      });
      this.notifyListeners();
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MAPPING
  // ─────────────────────────────────────────────────────────────────────────────

  updateMapping(targetField: string, mapping: MappedColumn | null): void {
    if (!this.currentSession) return;

    this.currentSession.columnMapping[targetField] = mapping;
    
    // Regenerate preview with new mapping
    // This would need the parsed data cached
    
    this.notifyListeners();
  }

  getMappingConfidence(): number {
    if (!this.currentSession) return 0;
    return AutoMapper.calculateMappingConfidence(this.currentSession.columnMapping);
  }

  getMissingRequiredFields(): string[] {
    if (!this.currentSession) return [];
    
    return TARGET_FIELDS
      .filter(f => f.required && !this.currentSession!.columnMapping[f.key])
      .map(f => f.label);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // IMPORT EXECUTION
  // ─────────────────────────────────────────────────────────────────────────────

  async executeImport(
    parsedData: ParseResult,
    pendingStatus: boolean = false
  ): Promise<ImportResult> {
    if (!this.currentSession) throw new Error('No active session');

    const missingFields = this.getMissingRequiredFields();
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    this.currentSession.status = 'validating';
    this.notifyListeners();

    const tickets: Partial<WeightTicket>[] = [];
    const errors: ImportError[] = [];

    // Process each row
    for (let i = 0; i < parsedData.rows.length; i++) {
      const row = parsedData.rows[i];
      this.currentSession.processedRows = i + 1;

      // Map row data
      const mapped = this.mapRow(row, parsedData.headers);
      
      // Validate
      const validation = RowValidator.validate(mapped);

      if (validation.isValid) {
        // Calculate net weight if not provided
        if (!mapped.netWeight && mapped.grossWeight && mapped.tareWeight) {
          mapped.netWeight = mapped.grossWeight - mapped.tareWeight;
        }

        // Set import metadata
        mapped.ocrSource = 'csv_import';
        mapped.status = pendingStatus ? 'pending' : 'verified';
        mapped.id = crypto.randomUUID();
        mapped.tenantId = this.currentSession.tenantId;
        mapped.projectId = this.currentSession.projectId;
        mapped.invoiced = false;

        tickets.push(mapped);
        this.currentSession.successCount++;
      } else {
        validation.errors.forEach(err => {
          errors.push({
            rowIndex: i + 2, // +2 for header and 0-index
            message: err,
            severity: 'error'
          });
        });
        this.currentSession.errorCount++;
      }

      validation.warnings.forEach(warn => {
        errors.push({
          rowIndex: i + 2,
          message: warn,
          severity: 'warning'
        });
      });

      // Notify progress every 10 rows
      if (i % 10 === 0) {
        this.notifyListeners();
      }
    }

    this.currentSession.errors = errors;

    // Execute import
    this.currentSession.status = 'importing';
    this.notifyListeners();

    // Batch upload tickets
    const BATCH_SIZE = 50;
    for (let i = 0; i < tickets.length; i += BATCH_SIZE) {
      const batch = tickets.slice(i, i + BATCH_SIZE);
      
      await offlineSync.queueOperation({
        endpoint: `/api/projects/${this.currentSession.projectId}/tickets/batch`,
        method: 'POST',
        body: { tickets: batch }
      });
    }

    this.currentSession.status = 'complete';
    this.currentSession.completedAt = new Date();
    this.notifyListeners();

    return {
      sessionId: this.currentSession.id,
      totalRows: this.currentSession.totalRows,
      successCount: this.currentSession.successCount,
      errorCount: this.currentSession.errorCount,
      errors
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  private mapRow(row: string[], headers: string[]): Partial<WeightTicket> {
    const mapped: Partial<WeightTicket> = {};
    const mapping = this.currentSession!.columnMapping;

    for (const [targetField, colMapping] of Object.entries(mapping)) {
      if (!colMapping) continue;

      const rawValue = row[colMapping.sourceIndex] ?? colMapping.defaultValue ?? '';
      const transform = colMapping.transform ?? 'none';
      const value = DataTransformer.transform(rawValue, transform);

      if (value !== null) {
        this.setNestedField(mapped, targetField, value);
      }
    }

    return mapped;
  }

  private setNestedField(obj: any, path: string, value: any): void {
    // Handle special cases
    if (path === 'date') {
      obj.timestamps = obj.timestamps || {};
      obj.timestamps.grossCaptured = value;
      obj.timestamps.tareCaptured = value;
      obj.timestamps.signed = value;
      return;
    }

    obj[path] = value;
  }

  private generatePreview(result: ParseResult, count: number): ParsedRow[] {
    const preview: ParsedRow[] = [];

    for (let i = 0; i < Math.min(count, result.rows.length); i++) {
      const row = result.rows[i];
      const mapped = this.mapRow(row, result.headers);
      const validation = RowValidator.validate(mapped);

      preview.push({
        rowIndex: i + 2,
        originalData: row,
        mappedData: mapped,
        isValid: validation.isValid,
        errors: validation.errors,
        warnings: validation.warnings
      });
    }

    return preview;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STATE MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  getSession(): ImportSession | null {
    return this.currentSession;
  }

  cancelSession(): void {
    if (this.currentSession) {
      this.currentSession.status = 'cancelled';
      this.notifyListeners();
      this.currentSession = null;
    }
  }

  subscribe(listener: (session: ImportSession) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    if (this.currentSession) {
      this.listeners.forEach(cb => cb(this.currentSession!));
    }
  }
}

interface ImportResult {
  sessionId: string;
  totalRows: number;
  successCount: number;
  errorCount: number;
  errors: ImportError[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILE DROP ZONE (IPAD FILES APP INTEGRATION)
// ═══════════════════════════════════════════════════════════════════════════════

export class FileDropZone {
  private element: HTMLElement;
  private onFile: (file: File) => void;
  private acceptedTypes = ['.csv', '.txt', '.tsv', 'text/csv', 'text/plain'];

  constructor(element: HTMLElement, onFile: (file: File) => void) {
    this.element = element;
    this.onFile = onFile;
    this.bindEvents();
  }

  private bindEvents(): void {
    // Drag and drop events
    this.element.addEventListener('dragenter', this.handleDragEnter.bind(this));
    this.element.addEventListener('dragover', this.handleDragOver.bind(this));
    this.element.addEventListener('dragleave', this.handleDragLeave.bind(this));
    this.element.addEventListener('drop', this.handleDrop.bind(this));

    // Click to open file picker
    this.element.addEventListener('click', this.handleClick.bind(this));
  }

  private handleDragEnter(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.element.classList.add('drop-zone-active');
  }

  private handleDragOver(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
  }

  private handleDragLeave(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.element.classList.remove('drop-zone-active');
  }

  private handleDrop(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.element.classList.remove('drop-zone-active');

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      this.processFile(files[0]);
    }
  }

  private handleClick(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = this.acceptedTypes.join(',');
    
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        this.processFile(file);
      }
    };

    input.click();
  }

  private processFile(file: File): void {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    const isValid = this.acceptedTypes.some(t => 
      t === file.type || t === ext
    );

    if (!isValid) {
      alert('Please select a CSV, TSV, or TXT file');
      return;
    }

    this.onFile(file);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export const csvImporter = CSVImportEngine.getInstance();

export {
  CSVParser,
  AutoMapper,
  DataTransformer,
  RowValidator,
  TARGET_FIELDS
};
