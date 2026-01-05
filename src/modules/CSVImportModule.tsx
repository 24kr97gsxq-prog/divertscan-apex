/**
 * DivertScan™ Apex Enterprise - CSV Import Module
 * Smart Column Mapping | Validation | Batch Upload
 * iPad Optimized
 */

import React, { useState, useRef, useCallback } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface CSVImportProps {
  projectId: string;
  onComplete: (count: number) => void;
}

type ImportStage = 'upload' | 'mapping' | 'preview' | 'importing' | 'complete';

interface ParsedCSV {
  headers: string[];
  rows: string[][];
  fileName: string;
  rowCount: number;
}

interface ColumnMapping {
  [sourceColumn: string]: string;
}

interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

interface ValidationWarning {
  row: number;
  field: string;
  message: string;
}

interface PreviewRow {
  rowIndex: number;
  data: Record<string, string>;
  validation: ValidationResult;
}

interface ImportProgress {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  errors: string[];
}

const TARGET_FIELDS = [
  { key: 'ticket_number', label: 'Ticket Number', required: true },
  { key: 'date', label: 'Date', required: true },
  { key: 'gross_weight', label: 'Gross Weight', required: true },
  { key: 'tare_weight', label: 'Tare Weight', required: true },
  { key: 'material_type', label: 'Material Type', required: true },
  { key: 'destination', label: 'Destination', required: true },
  { key: 'facility_name', label: 'Facility Name', required: true },
  { key: 'truck_plate', label: 'Truck/Plate', required: false },
  { key: 'driver_name', label: 'Driver Name', required: false },
  { key: 'hauler', label: 'Hauler Company', required: false },
  { key: 'notes', label: 'Notes', required: false },
  { key: 'weight_unit', label: 'Weight Unit', required: false },
  { key: 'status', label: 'Status', required: false }
];

const COLUMN_ALIASES: Record<string, string[]> = {
  ticket_number: ['ticket', 'ticket #', 'ticket_no', 'ticketno', 'ticket number', 'id', 'ref', 'reference'],
  date: ['date', 'ticket date', 'transaction date', 'trans date', 'weighdate', 'weigh date'],
  gross_weight: ['gross', 'gross weight', 'gross_wt', 'grosswt', 'in weight', 'loaded'],
  tare_weight: ['tare', 'tare weight', 'tare_wt', 'tarewt', 'out weight', 'empty'],
  material_type: ['material', 'material type', 'materialtype', 'debris', 'waste type', 'commodity'],
  destination: ['destination', 'dest', 'disposal', 'diversion', 'recycled', 'landfill'],
  facility_name: ['facility', 'facility name', 'site', 'location', 'disposal site', 'destination name'],
  truck_plate: ['truck', 'plate', 'license', 'vehicle', 'truck #', 'truck_no'],
  driver_name: ['driver', 'driver name', 'operator', 'driver_name'],
  hauler: ['hauler', 'hauler name', 'company', 'contractor', 'vendor'],
  notes: ['notes', 'comments', 'remarks', 'memo'],
  weight_unit: ['unit', 'weight unit', 'uom', 'units'],
  status: ['status', 'state', 'verified']
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function CSVImportModule({ projectId, onComplete }: CSVImportProps) {
  const [stage, setStage] = useState<ImportStage>('upload');
  const [parsedCSV, setParsedCSV] = useState<ParsedCSV | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [importStatus, setImportStatus] = useState<'pending' | 'verified'>('pending');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // FILE HANDLING
  // ─────────────────────────────────────────────────────────────────────────────

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      parseFile(file);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      parseFile(file);
    }
  };

  const parseFile = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    
    if (lines.length < 2) {
      alert('CSV file must have headers and at least one data row');
      return;
    }

    const headers = parseCSVLine(lines[0]);
    const rows = lines.slice(1).map(line => parseCSVLine(line));

    const parsed: ParsedCSV = {
      headers,
      rows,
      fileName: file.name,
      rowCount: rows.length
    };

    setParsedCSV(parsed);
    
    // Auto-map columns
    const autoMapping = autoMapColumns(headers);
    setMapping(autoMapping);
    
    setStage('mapping');
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if ((char === ',' || char === '\t') && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());

    return result;
  };

  const autoMapColumns = (headers: string[]): ColumnMapping => {
    const mapping: ColumnMapping = {};

    for (const header of headers) {
      const normalized = header.toLowerCase().trim();
      
      for (const [targetField, aliases] of Object.entries(COLUMN_ALIASES)) {
        if (aliases.some(alias => normalized.includes(alias) || alias.includes(normalized))) {
          mapping[header] = targetField;
          break;
        }
      }
    }

    return mapping;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // MAPPING
  // ─────────────────────────────────────────────────────────────────────────────

  const updateMapping = (sourceColumn: string, targetField: string) => {
    setMapping(prev => ({
      ...prev,
      [sourceColumn]: targetField
    }));
  };

  const getMappedFields = (): Set<string> => {
    return new Set(Object.values(mapping));
  };

  const getUnmappedRequired = (): string[] => {
    const mapped = getMappedFields();
    return TARGET_FIELDS
      .filter(f => f.required && !mapped.has(f.key))
      .map(f => f.label);
  };

  const canProceedToPreview = getUnmappedRequired().length === 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // PREVIEW & VALIDATION
  // ─────────────────────────────────────────────────────────────────────────────

  const generatePreview = () => {
    if (!parsedCSV) return;

    const previewRows = parsedCSV.rows.slice(0, 5).map((row, index) => {
      const data: Record<string, string> = {};
      
      parsedCSV.headers.forEach((header, i) => {
        const targetField = mapping[header];
        if (targetField) {
          data[targetField] = row[i] || '';
        }
      });

      const validation = validateRow(data, index + 2); // +2 for header and 0-index

      return {
        rowIndex: index + 2,
        data,
        validation
      };
    });

    setPreview(previewRows);
    setStage('preview');
  };

  const validateRow = (data: Record<string, string>, rowNum: number): ValidationResult => {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Required field checks
    for (const field of TARGET_FIELDS.filter(f => f.required)) {
      if (!data[field.key]?.trim()) {
        errors.push({
          row: rowNum,
          field: field.label,
          message: `${field.label} is required`
        });
      }
    }

    // Weight validation
    const gross = parseFloat(data.gross_weight || '0');
    const tare = parseFloat(data.tare_weight || '0');

    if (gross > 0 && tare > 0 && tare > gross) {
      errors.push({
        row: rowNum,
        field: 'Tare Weight',
        message: 'Tare weight cannot exceed gross weight'
      });
    }

    // Date validation
    if (data.date) {
      const date = new Date(data.date);
      if (isNaN(date.getTime())) {
        errors.push({
          row: rowNum,
          field: 'Date',
          message: 'Invalid date format'
        });
      } else if (date > new Date()) {
        warnings.push({
          row: rowNum,
          field: 'Date',
          message: 'Date is in the future'
        });
      }
    }

    // Unusually high weight warning
    const net = gross - tare;
    if (net > 200000) { // 100 tons in lbs
      warnings.push({
        row: rowNum,
        field: 'Weight',
        message: 'Unusually high net weight (>100 tons)'
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // IMPORT
  // ─────────────────────────────────────────────────────────────────────────────

  const startImport = async () => {
    if (!parsedCSV) return;

    setStage('importing');
    
    const total = parsedCSV.rows.length;
    const batchSize = 50;
    let processed = 0;
    let successful = 0;
    let failed = 0;
    const errors: string[] = [];

    setProgress({ total, processed, successful, failed, errors });

    for (let i = 0; i < parsedCSV.rows.length; i += batchSize) {
      const batch = parsedCSV.rows.slice(i, i + batchSize);
      
      const tickets = batch.map((row, batchIndex) => {
        const data: Record<string, string> = {};
        
        parsedCSV.headers.forEach((header, j) => {
          const targetField = mapping[header];
          if (targetField) {
            data[targetField] = row[j] || '';
          }
        });

        return transformRowToTicket(data, i + batchIndex);
      });

      try {
        const response = await fetch(`/api/projects/${projectId}/tickets/batch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            tickets,
            status: importStatus
          })
        });

        if (response.ok) {
          const result = await response.json();
          successful += result.created || batch.length;
        } else {
          failed += batch.length;
          errors.push(`Batch ${Math.floor(i / batchSize) + 1} failed`);
        }
      } catch (err) {
        failed += batch.length;
        errors.push(`Batch ${Math.floor(i / batchSize) + 1} error`);
      }

      processed += batch.length;
      setProgress({ total, processed, successful, failed, errors });

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    setStage('complete');
    setTimeout(() => onComplete(successful), 2000);
  };

  const transformRowToTicket = (data: Record<string, string>, rowIndex: number) => {
    const gross = parseFloat(data.gross_weight || '0');
    const tare = parseFloat(data.tare_weight || '0');
    const unit = (data.weight_unit || 'lbs').toLowerCase();

    return {
      ticketNumber: data.ticket_number || `IMP-${Date.now()}-${rowIndex}`,
      date: parseDate(data.date),
      grossWeight: gross,
      tareWeight: tare,
      netWeight: gross - tare,
      weightUnit: unit.includes('ton') ? 'tons' : 'lbs',
      materialType: parseMaterialType(data.material_type),
      destination: parseDestination(data.destination),
      facilityName: data.facility_name,
      truckPlate: data.truck_plate,
      driverName: data.driver_name,
      haulerCompany: data.hauler,
      notes: data.notes,
      ocrSource: 'csv_import',
      status: importStatus
    };
  };

  const parseDate = (dateStr: string): string => {
    if (!dateStr) return new Date().toISOString();
    
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }

    // Try common formats
    const formats = [
      /(\d{1,2})\/(\d{1,2})\/(\d{4})/, // MM/DD/YYYY
      /(\d{1,2})-(\d{1,2})-(\d{4})/, // MM-DD-YYYY
      /(\d{4})-(\d{1,2})-(\d{1,2})/ // YYYY-MM-DD
    ];

    for (const format of formats) {
      const match = dateStr.match(format);
      if (match) {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString();
        }
      }
    }

    return new Date().toISOString();
  };

  const parseMaterialType = (material: string): string => {
    const normalized = material.toLowerCase();
    
    if (normalized.includes('concrete')) return 'concrete';
    if (normalized.includes('asphalt')) return 'asphalt';
    if (normalized.includes('metal') && normalized.includes('ferrous')) return 'metal_ferrous';
    if (normalized.includes('metal')) return 'metal_nonferrous';
    if (normalized.includes('wood') && normalized.includes('treat')) return 'wood_treated';
    if (normalized.includes('wood')) return 'wood_clean';
    if (normalized.includes('cardboard') || normalized.includes('occ')) return 'cardboard';
    if (normalized.includes('drywall')) return 'drywall';
    if (normalized.includes('roof')) return 'roofing';
    if (normalized.includes('mixed') || normalized.includes('c&d') || normalized.includes('c and d')) return 'mixed_c_and_d';
    
    return 'other';
  };

  const parseDestination = (dest: string): string => {
    const normalized = dest.toLowerCase();
    
    if (normalized.includes('recycle') || normalized.includes('divert')) return 'recycling';
    if (normalized.includes('donat')) return 'donation';
    if (normalized.includes('salvage')) return 'salvage';
    
    return 'landfill';
  };

  const reset = () => {
    setStage('upload');
    setParsedCSV(null);
    setMapping({});
    setPreview([]);
    setProgress(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="csv-import">
      <style>{importStyles}</style>

      {/* Header */}
      <div className="import-header">
        <h1>Import Tickets from CSV</h1>
        <p>Upload historical weight tickets from spreadsheets</p>
      </div>

      {/* Stage Content */}
      {stage === 'upload' && (
        <UploadStage
          fileInputRef={fileInputRef}
          onFileDrop={handleFileDrop}
          onFileSelect={handleFileSelect}
        />
      )}

      {stage === 'mapping' && parsedCSV && (
        <MappingStage
          parsedCSV={parsedCSV}
          mapping={mapping}
          onUpdateMapping={updateMapping}
          unmappedRequired={getUnmappedRequired()}
          canProceed={canProceedToPreview}
          onNext={generatePreview}
          onBack={reset}
        />
      )}

      {stage === 'preview' && (
        <PreviewStage
          preview={preview}
          totalRows={parsedCSV?.rowCount || 0}
          importStatus={importStatus}
          onStatusChange={setImportStatus}
          onImport={startImport}
          onBack={() => setStage('mapping')}
        />
      )}

      {stage === 'importing' && progress && (
        <ImportingStage progress={progress} />
      )}

      {stage === 'complete' && progress && (
        <CompleteStage
          successful={progress.successful}
          failed={progress.failed}
          onReset={reset}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function UploadStage({ fileInputRef, onFileDrop, onFileSelect }: {
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileDrop: (e: React.DragEvent) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div className="upload-stage">
      <div
        className={`drop-zone ${isDragging ? 'dragging' : ''}`}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => { setIsDragging(false); onFileDrop(e); }}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="drop-icon">📄</div>
        <h3>Drop CSV file here</h3>
        <p>or click to browse</p>
        <span className="file-hint">Supports .csv files up to 10MB</span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={onFileSelect}
        style={{ display: 'none' }}
      />

      <div className="upload-tips">
        <h4>Tips for successful import:</h4>
        <ul>
          <li>First row should contain column headers</li>
          <li>Required: Ticket #, Date, Gross Weight, Tare Weight, Material, Destination, Facility</li>
          <li>Dates should be in MM/DD/YYYY or YYYY-MM-DD format</li>
          <li>Weights can be in pounds or tons (specify in a Unit column)</li>
        </ul>
      </div>
    </div>
  );
}

function MappingStage({ parsedCSV, mapping, onUpdateMapping, unmappedRequired, canProceed, onNext, onBack }: {
  parsedCSV: ParsedCSV;
  mapping: ColumnMapping;
  onUpdateMapping: (source: string, target: string) => void;
  unmappedRequired: string[];
  canProceed: boolean;
  onNext: () => void;
  onBack: () => void;
}) {
  const mappedFields = new Set(Object.values(mapping));

  return (
    <div className="mapping-stage">
      <div className="file-info">
        <span className="file-name">📄 {parsedCSV.fileName}</span>
        <span className="row-count">{parsedCSV.rowCount} rows</span>
      </div>

      <h3>Map Your Columns</h3>
      <p className="mapping-subtitle">Match your CSV columns to DivertScan fields</p>

      {unmappedRequired.length > 0 && (
        <div className="mapping-warning">
          ⚠️ Missing required fields: {unmappedRequired.join(', ')}
        </div>
      )}

      <div className="mapping-grid">
        {parsedCSV.headers.map(header => (
          <div key={header} className="mapping-row">
            <div className="source-column">
              <span className="column-name">{header}</span>
              <span className="sample-value">
                {parsedCSV.rows[0]?.[parsedCSV.headers.indexOf(header)] || '—'}
              </span>
            </div>
            
            <div className="mapping-arrow">→</div>
            
            <select
              value={mapping[header] || ''}
              onChange={e => onUpdateMapping(header, e.target.value)}
              className={mapping[header] ? 'mapped' : ''}
            >
              <option value="">Skip this column</option>
              {TARGET_FIELDS.map(field => (
                <option 
                  key={field.key} 
                  value={field.key}
                  disabled={mappedFields.has(field.key) && mapping[header] !== field.key}
                >
                  {field.label} {field.required ? '*' : ''}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="stage-actions">
        <button className="btn-secondary" onClick={onBack}>← Cancel</button>
        <button 
          className="btn-primary"
          onClick={onNext}
          disabled={!canProceed}
        >
          Preview Data →
        </button>
      </div>
    </div>
  );
}

function PreviewStage({ preview, totalRows, importStatus, onStatusChange, onImport, onBack }: {
  preview: PreviewRow[];
  totalRows: number;
  importStatus: 'pending' | 'verified';
  onStatusChange: (status: 'pending' | 'verified') => void;
  onImport: () => void;
  onBack: () => void;
}) {
  const hasErrors = preview.some(p => !p.validation.isValid);
  const hasWarnings = preview.some(p => p.validation.warnings.length > 0);

  return (
    <div className="preview-stage">
      <h3>Preview Import</h3>
      <p className="preview-subtitle">
        Showing first {preview.length} of {totalRows} rows
      </p>

      {hasErrors && (
        <div className="preview-error">
          ⚠️ Some rows have validation errors and will be skipped
        </div>
      )}

      {hasWarnings && !hasErrors && (
        <div className="preview-warning">
          ⚡ Some rows have warnings but can still be imported
        </div>
      )}

      <div className="preview-table-wrapper">
        <table className="preview-table">
          <thead>
            <tr>
              <th>Row</th>
              <th>Ticket #</th>
              <th>Date</th>
              <th>Gross</th>
              <th>Tare</th>
              <th>Net</th>
              <th>Material</th>
              <th>Destination</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {preview.map(row => (
              <tr key={row.rowIndex} className={row.validation.isValid ? '' : 'invalid'}>
                <td>{row.rowIndex}</td>
                <td>{row.data.ticket_number}</td>
                <td>{row.data.date}</td>
                <td>{row.data.gross_weight}</td>
                <td>{row.data.tare_weight}</td>
                <td>
                  {(parseFloat(row.data.gross_weight || '0') - parseFloat(row.data.tare_weight || '0')).toLocaleString()}
                </td>
                <td>{row.data.material_type}</td>
                <td>{row.data.destination}</td>
                <td>
                  {row.validation.isValid ? (
                    <span className="status-ok">✓</span>
                  ) : (
                    <span className="status-error" title={row.validation.errors.map(e => e.message).join(', ')}>
                      ✗
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="import-options">
        <label className="option-label">Import tickets as:</label>
        <div className="status-toggle">
          <button
            type="button"
            className={`toggle-btn ${importStatus === 'pending' ? 'active' : ''}`}
            onClick={() => onStatusChange('pending')}
          >
            <span className="toggle-icon">⏳</span>
            Pending
            <span className="toggle-desc">Awaiting verification</span>
          </button>
          <button
            type="button"
            className={`toggle-btn ${importStatus === 'verified' ? 'active' : ''}`}
            onClick={() => onStatusChange('verified')}
          >
            <span className="toggle-icon">✓</span>
            Verified
            <span className="toggle-desc">Count toward LEED</span>
          </button>
        </div>
      </div>

      <div className="stage-actions">
        <button className="btn-secondary" onClick={onBack}>← Back</button>
        <button className="btn-primary" onClick={onImport}>
          Import {totalRows} Tickets →
        </button>
      </div>
    </div>
  );
}

function ImportingStage({ progress }: { progress: ImportProgress }) {
  const percentage = Math.round((progress.processed / progress.total) * 100);

  return (
    <div className="importing-stage">
      <div className="import-spinner" />
      <h3>Importing Tickets...</h3>
      <p className="import-count">
        {progress.processed} of {progress.total}
      </p>

      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${percentage}%` }} />
      </div>

      <div className="import-stats">
        <span className="stat success">✓ {progress.successful} successful</span>
        {progress.failed > 0 && (
          <span className="stat failed">✗ {progress.failed} failed</span>
        )}
      </div>
    </div>
  );
}

function CompleteStage({ successful, failed, onReset }: {
  successful: number;
  failed: number;
  onReset: () => void;
}) {
  return (
    <div className="complete-stage">
      <div className="complete-icon">✓</div>
      <h3>Import Complete!</h3>
      <p className="complete-stats">
        Successfully imported <strong>{successful}</strong> tickets
        {failed > 0 && (
          <span className="failed-note"> ({failed} failed)</span>
        )}
      </p>

      <button className="btn-primary" onClick={onReset}>
        Import More Tickets
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const importStyles = `
  .csv-import {
    max-width: 900px;
    margin: 0 auto;
  }

  .import-header {
    margin-bottom: 32px;
  }

  .import-header h1 {
    font-size: 24px;
    font-weight: 700;
    color: #1e293b;
    margin-bottom: 8px;
  }

  .import-header p {
    color: #64748b;
  }

  /* Upload Stage */
  .upload-stage {
    display: flex;
    flex-direction: column;
    gap: 32px;
  }

  .drop-zone {
    background: white;
    border: 2px dashed #e2e8f0;
    border-radius: 16px;
    padding: 64px 32px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .drop-zone:hover,
  .drop-zone.dragging {
    border-color: #1a5f2a;
    background: rgba(26, 95, 42, 0.02);
  }

  .drop-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }

  .drop-zone h3 {
    font-size: 18px;
    font-weight: 600;
    color: #1e293b;
    margin-bottom: 4px;
  }

  .drop-zone p {
    color: #64748b;
    margin-bottom: 12px;
  }

  .file-hint {
    font-size: 13px;
    color: #94a3b8;
  }

  .upload-tips {
    background: #f8fafc;
    border-radius: 12px;
    padding: 20px 24px;
  }

  .upload-tips h4 {
    font-size: 14px;
    font-weight: 600;
    color: #1e293b;
    margin-bottom: 12px;
  }

  .upload-tips ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .upload-tips li {
    font-size: 14px;
    color: #64748b;
    padding: 6px 0;
    padding-left: 20px;
    position: relative;
  }

  .upload-tips li::before {
    content: '•';
    position: absolute;
    left: 0;
    color: #1a5f2a;
  }

  /* Mapping Stage */
  .mapping-stage {
    background: white;
    border-radius: 16px;
    padding: 32px;
  }

  .file-info {
    display: flex;
    gap: 16px;
    align-items: center;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid #e2e8f0;
  }

  .file-name {
    font-weight: 600;
    color: #1e293b;
  }

  .row-count {
    color: #64748b;
    font-size: 14px;
  }

  .mapping-stage h3 {
    font-size: 18px;
    font-weight: 600;
    color: #1e293b;
    margin-bottom: 8px;
  }

  .mapping-subtitle {
    color: #64748b;
    margin-bottom: 20px;
  }

  .mapping-warning {
    background: #fef3c7;
    color: #92400e;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 14px;
    margin-bottom: 20px;
  }

  .mapping-grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 24px;
  }

  .mapping-row {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 16px;
    background: #f8fafc;
    border-radius: 10px;
  }

  .source-column {
    flex: 1;
    min-width: 0;
  }

  .column-name {
    display: block;
    font-weight: 600;
    color: #1e293b;
    font-size: 14px;
  }

  .sample-value {
    display: block;
    font-size: 12px;
    color: #94a3b8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }

  .mapping-arrow {
    color: #94a3b8;
    font-size: 18px;
  }

  .mapping-row select {
    flex: 1;
    padding: 10px 14px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-size: 14px;
    min-width: 200px;
  }

  .mapping-row select.mapped {
    border-color: #1a5f2a;
    background: rgba(26, 95, 42, 0.05);
  }

  /* Preview Stage */
  .preview-stage {
    background: white;
    border-radius: 16px;
    padding: 32px;
  }

  .preview-stage h3 {
    font-size: 18px;
    font-weight: 600;
    color: #1e293b;
    margin-bottom: 8px;
  }

  .preview-subtitle {
    color: #64748b;
    margin-bottom: 16px;
  }

  .preview-error {
    background: #fef2f2;
    color: #dc2626;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 14px;
    margin-bottom: 16px;
  }

  .preview-warning {
    background: #fef3c7;
    color: #92400e;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 14px;
    margin-bottom: 16px;
  }

  .preview-table-wrapper {
    overflow-x: auto;
    margin-bottom: 24px;
    -webkit-overflow-scrolling: touch;
  }

  .preview-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .preview-table th,
  .preview-table td {
    padding: 10px 12px;
    text-align: left;
    border-bottom: 1px solid #e2e8f0;
  }

  .preview-table th {
    background: #f8fafc;
    font-weight: 600;
    color: #64748b;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .preview-table tr.invalid {
    background: #fef2f2;
  }

  .status-ok {
    color: #10b981;
    font-weight: 600;
  }

  .status-error {
    color: #ef4444;
    font-weight: 600;
    cursor: help;
  }

  .import-options {
    margin-bottom: 24px;
  }

  .option-label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    color: #374151;
    margin-bottom: 12px;
  }

  .status-toggle {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .toggle-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 20px;
    border: 2px solid #e2e8f0;
    border-radius: 12px;
    background: white;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .toggle-btn.active {
    border-color: #1a5f2a;
    background: rgba(26, 95, 42, 0.05);
  }

  .toggle-icon {
    font-size: 24px;
  }

  .toggle-btn span:not(.toggle-icon):not(.toggle-desc) {
    font-size: 16px;
    font-weight: 600;
    color: #1e293b;
  }

  .toggle-desc {
    font-size: 12px;
    color: #64748b;
  }

  /* Importing Stage */
  .importing-stage {
    background: white;
    border-radius: 16px;
    padding: 64px 32px;
    text-align: center;
  }

  .import-spinner {
    width: 48px;
    height: 48px;
    border: 4px solid #e2e8f0;
    border-top-color: #1a5f2a;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 24px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .importing-stage h3 {
    font-size: 20px;
    font-weight: 600;
    color: #1e293b;
    margin-bottom: 8px;
  }

  .import-count {
    color: #64748b;
    margin-bottom: 24px;
  }

  .progress-bar {
    height: 8px;
    background: #e2e8f0;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 16px;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #1a5f2a, #2d8b47);
    transition: width 0.3s ease;
  }

  .import-stats {
    display: flex;
    justify-content: center;
    gap: 24px;
  }

  .stat {
    font-size: 14px;
    font-weight: 500;
  }

  .stat.success { color: #10b981; }
  .stat.failed { color: #ef4444; }

  /* Complete Stage */
  .complete-stage {
    background: white;
    border-radius: 16px;
    padding: 64px 32px;
    text-align: center;
  }

  .complete-icon {
    width: 64px;
    height: 64px;
    background: #10b981;
    color: white;
    font-size: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 24px;
  }

  .complete-stage h3 {
    font-size: 20px;
    font-weight: 600;
    color: #1e293b;
    margin-bottom: 8px;
  }

  .complete-stats {
    color: #64748b;
    margin-bottom: 24px;
  }

  .failed-note {
    color: #ef4444;
  }

  /* Actions */
  .stage-actions {
    display: flex;
    gap: 16px;
    margin-top: 24px;
  }

  .btn-primary,
  .btn-secondary {
    flex: 1;
    padding: 14px 24px;
    border: none;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    min-height: 52px;
    transition: all 0.15s ease;
  }

  .btn-primary {
    background: #1a5f2a;
    color: white;
  }

  .btn-primary:disabled {
    background: #94a3b8;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: #f1f5f9;
    color: #374151;
  }

  @media (max-width: 768px) {
    .mapping-row {
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
    }

    .mapping-arrow {
      display: none;
    }

    .mapping-row select {
      min-width: 100%;
    }

    .status-toggle {
      grid-template-columns: 1fr;
    }
  }
`;
