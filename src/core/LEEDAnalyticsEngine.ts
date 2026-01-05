/**
 * DivertScan™ Apex Enterprise - LEED v5 Analytics Engine v3.0
 * Real-time Diversion Tracking, Carbon Credit Engine, ESG Reporting
 * Facility Permit Vault Management
 */

import { auth, tenantData, type WeightTicket, type Facility, type MaterialType, type Project } from './SaaSArchitecture';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

export interface LEEDMetrics {
  projectId: string;
  projectName: string;
  certification: 'v4' | 'v4.1' | 'v5';
  
  // Weight Totals
  totalWaste: number;
  totalDiverted: number;
  totalLandfill: number;
  weightUnit: 'tons' | 'lbs';
  
  // Diversion Metrics
  diversionRate: number;
  targetRate: number;
  threshold50Achieved: boolean;
  threshold75Achieved: boolean;
  
  // Points
  potentialPoints: number;
  earnedPoints: number;
  
  // Breakdown
  materialBreakdown: MaterialBreakdown[];
  destinationBreakdown: DestinationBreakdown[];
  facilityBreakdown: FacilityBreakdown[];
  
  // Timeline
  dailyMetrics: DailyMetric[];
  weeklyTrend: TrendData[];
  
  // Carbon
  carbonMetrics: CarbonMetrics;
  
  // Last Updated
  calculatedAt: Date;
}

export interface MaterialBreakdown {
  materialType: MaterialType;
  displayName: string;
  totalWeight: number;
  divertedWeight: number;
  landfillWeight: number;
  diversionRate: number;
  ticketCount: number;
  carbonSavings: number;
}

export interface DestinationBreakdown {
  destination: 'landfill' | 'recycling' | 'donation' | 'salvage';
  totalWeight: number;
  percentage: number;
  ticketCount: number;
}

export interface FacilityBreakdown {
  facilityId: string;
  facilityName: string;
  facilityType: string;
  totalWeight: number;
  ticketCount: number;
  permitStatus: 'valid' | 'expiring' | 'expired' | 'unknown';
  permitExpiration?: Date;
}

export interface DailyMetric {
  date: Date;
  totalWeight: number;
  divertedWeight: number;
  landfillWeight: number;
  diversionRate: number;
  ticketCount: number;
}

export interface TrendData {
  period: string;
  diversionRate: number;
  totalWeight: number;
  change: number;
}

export interface CarbonMetrics {
  totalCO2Avoided: number;       // metric tons CO2e
  treesEquivalent: number;
  carsOffRoad: number;           // car-years
  homesEnergy: number;           // home-years
  waterSaved: number;            // gallons
  energySaved: number;           // kWh
  byMaterial: CarbonByMaterial[];
}

export interface CarbonByMaterial {
  materialType: MaterialType;
  displayName: string;
  weightDiverted: number;
  co2Avoided: number;
  factor: number;
}

export interface FacilityPermit {
  id: string;
  facilityId: string;
  facilityName: string;
  permitNumber: string;
  permitType: PermitType;
  issuingAuthority: string;
  issueDate: Date;
  expirationDate: Date;
  status: PermitStatus;
  documentUrl?: string;
  notes?: string;
  alertDays: number;
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

export type PermitStatus = 'valid' | 'expiring_soon' | 'expired' | 'pending_renewal';

// ═══════════════════════════════════════════════════════════════════════════════
// CARBON EMISSION FACTORS (kg CO2e per ton of material diverted)
// ═══════════════════════════════════════════════════════════════════════════════

const CARBON_FACTORS: Record<MaterialType, number> = {
  concrete: 23,
  asphalt: 45,
  metal_ferrous: 1850,
  metal_nonferrous: 9100,
  wood_clean: 890,
  wood_treated: 450,
  cardboard: 3100,
  paper: 3700,
  plastic: 1400,
  glass: 314,
  drywall: 178,
  insulation: 230,
  roofing: 89,
  brick_masonry: 34,
  soil_land_clearing: 12,
  mixed_c_and_d: 156,
  hazardous: 0,
  other: 100
};

// LEED v5 Point thresholds
const LEED_THRESHOLDS = {
  v5: {
    50: { rate: 0.50, points: 1 },
    75: { rate: 0.75, points: 2 }
  },
  'v4.1': {
    50: { rate: 0.50, points: 1 },
    75: { rate: 0.75, points: 2 }
  },
  v4: {
    50: { rate: 0.50, points: 1 },
    75: { rate: 0.75, points: 2 }
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// LEED ANALYTICS ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export class LEEDAnalyticsEngine {
  private cache: Map<string, { data: LEEDMetrics; expiry: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  async calculateMetrics(
    projectId: string,
    tickets: WeightTicket[],
    project: Project,
    facilities: Facility[]
  ): Promise<LEEDMetrics> {
    // Check cache
    const cached = this.cache.get(projectId);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    // Filter verified/closed tickets only (exclude pending)
    const validTickets = tickets.filter(t => 
      t.status === 'verified' || t.status === 'closed'
    );

    // Calculate totals
    const totals = this.calculateTotals(validTickets);
    
    // Calculate breakdowns
    const materialBreakdown = this.calculateMaterialBreakdown(validTickets);
    const destinationBreakdown = this.calculateDestinationBreakdown(validTickets);
    const facilityBreakdown = this.calculateFacilityBreakdown(validTickets, facilities);
    
    // Calculate timeline data
    const dailyMetrics = this.calculateDailyMetrics(validTickets);
    const weeklyTrend = this.calculateWeeklyTrend(dailyMetrics);
    
    // Calculate carbon metrics
    const carbonMetrics = this.calculateCarbonMetrics(materialBreakdown);
    
    // Determine LEED thresholds
    const thresholds = LEED_THRESHOLDS[project.leedCertification];
    const diversionRate = totals.totalWaste > 0 
      ? totals.totalDiverted / totals.totalWaste 
      : 0;

    const metrics: LEEDMetrics = {
      projectId,
      projectName: project.name,
      certification: project.leedCertification,
      
      totalWaste: this.roundWeight(totals.totalWaste),
      totalDiverted: this.roundWeight(totals.totalDiverted),
      totalLandfill: this.roundWeight(totals.totalLandfill),
      weightUnit: 'tons',
      
      diversionRate: Math.round(diversionRate * 1000) / 10,
      targetRate: project.targetDiversion,
      threshold50Achieved: diversionRate >= thresholds[50].rate,
      threshold75Achieved: diversionRate >= thresholds[75].rate,
      
      potentialPoints: thresholds[75].points,
      earnedPoints: diversionRate >= thresholds[75].rate 
        ? thresholds[75].points 
        : diversionRate >= thresholds[50].rate 
          ? thresholds[50].points 
          : 0,
      
      materialBreakdown,
      destinationBreakdown,
      facilityBreakdown,
      dailyMetrics,
      weeklyTrend,
      carbonMetrics,
      
      calculatedAt: new Date()
    };

    // Cache results
    this.cache.set(projectId, { data: metrics, expiry: Date.now() + this.CACHE_TTL });

    return metrics;
  }

  private calculateTotals(tickets: WeightTicket[]): { totalWaste: number; totalDiverted: number; totalLandfill: number } {
    let totalWaste = 0;
    let totalDiverted = 0;
    let totalLandfill = 0;

    for (const ticket of tickets) {
      const weightTons = this.convertToTons(ticket.netWeight, ticket.weightUnit);
      totalWaste += weightTons;

      if (ticket.destination === 'landfill') {
        totalLandfill += weightTons;
      } else {
        totalDiverted += weightTons;
      }
    }

    return { totalWaste, totalDiverted, totalLandfill };
  }

  private calculateMaterialBreakdown(tickets: WeightTicket[]): MaterialBreakdown[] {
    const breakdown = new Map<MaterialType, {
      total: number;
      diverted: number;
      landfill: number;
      count: number;
    }>();

    for (const ticket of tickets) {
      const weightTons = this.convertToTons(ticket.netWeight, ticket.weightUnit);
      const material = ticket.materialType;

      const current = breakdown.get(material) || { total: 0, diverted: 0, landfill: 0, count: 0 };
      current.total += weightTons;
      current.count++;

      if (ticket.destination === 'landfill') {
        current.landfill += weightTons;
      } else {
        current.diverted += weightTons;
      }

      breakdown.set(material, current);
    }

    return Array.from(breakdown.entries())
      .map(([materialType, data]) => ({
        materialType,
        displayName: this.formatMaterialName(materialType),
        totalWeight: this.roundWeight(data.total),
        divertedWeight: this.roundWeight(data.diverted),
        landfillWeight: this.roundWeight(data.landfill),
        diversionRate: data.total > 0 ? Math.round((data.diverted / data.total) * 1000) / 10 : 0,
        ticketCount: data.count,
        carbonSavings: this.roundWeight(data.diverted * (CARBON_FACTORS[materialType] || 0) / 1000)
      }))
      .sort((a, b) => b.totalWeight - a.totalWeight);
  }

  private calculateDestinationBreakdown(tickets: WeightTicket[]): DestinationBreakdown[] {
    const breakdown = new Map<string, { weight: number; count: number }>();
    let totalWeight = 0;

    for (const ticket of tickets) {
      const weightTons = this.convertToTons(ticket.netWeight, ticket.weightUnit);
      totalWeight += weightTons;

      const current = breakdown.get(ticket.destination) || { weight: 0, count: 0 };
      current.weight += weightTons;
      current.count++;
      breakdown.set(ticket.destination, current);
    }

    return Array.from(breakdown.entries())
      .map(([destination, data]) => ({
        destination: destination as DestinationBreakdown['destination'],
        totalWeight: this.roundWeight(data.weight),
        percentage: totalWeight > 0 ? Math.round((data.weight / totalWeight) * 1000) / 10 : 0,
        ticketCount: data.count
      }))
      .sort((a, b) => b.totalWeight - a.totalWeight);
  }

  private calculateFacilityBreakdown(tickets: WeightTicket[], facilities: Facility[]): FacilityBreakdown[] {
    const facilityMap = new Map(facilities.map(f => [f.id, f]));
    const breakdown = new Map<string, { weight: number; count: number; facility?: Facility }>();

    for (const ticket of tickets) {
      const weightTons = this.convertToTons(ticket.netWeight, ticket.weightUnit);
      
      const current = breakdown.get(ticket.facilityId) || { 
        weight: 0, 
        count: 0, 
        facility: facilityMap.get(ticket.facilityId) 
      };
      current.weight += weightTons;
      current.count++;
      breakdown.set(ticket.facilityId, current);
    }

    return Array.from(breakdown.entries())
      .map(([facilityId, data]) => {
        const permit = data.facility;
        const permitStatus = this.getPermitStatus(permit?.permitExpiration);

        return {
          facilityId,
          facilityName: data.facility?.name || 'Unknown Facility',
          facilityType: data.facility?.type || 'unknown',
          totalWeight: this.roundWeight(data.weight),
          ticketCount: data.count,
          permitStatus,
          permitExpiration: permit?.permitExpiration
        };
      })
      .sort((a, b) => b.totalWeight - a.totalWeight);
  }

  private calculateDailyMetrics(tickets: WeightTicket[]): DailyMetric[] {
    const dailyMap = new Map<string, DailyMetric>();

    for (const ticket of tickets) {
      const date = new Date(ticket.timestamps.grossCaptured);
      const dateKey = date.toISOString().split('T')[0];
      const weightTons = this.convertToTons(ticket.netWeight, ticket.weightUnit);

      const current = dailyMap.get(dateKey) || {
        date: new Date(dateKey),
        totalWeight: 0,
        divertedWeight: 0,
        landfillWeight: 0,
        diversionRate: 0,
        ticketCount: 0
      };

      current.totalWeight += weightTons;
      current.ticketCount++;

      if (ticket.destination === 'landfill') {
        current.landfillWeight += weightTons;
      } else {
        current.divertedWeight += weightTons;
      }

      dailyMap.set(dateKey, current);
    }

    // Calculate diversion rates
    const dailyMetrics = Array.from(dailyMap.values())
      .map(d => ({
        ...d,
        totalWeight: this.roundWeight(d.totalWeight),
        divertedWeight: this.roundWeight(d.divertedWeight),
        landfillWeight: this.roundWeight(d.landfillWeight),
        diversionRate: d.totalWeight > 0 
          ? Math.round((d.divertedWeight / d.totalWeight) * 1000) / 10 
          : 0
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    return dailyMetrics;
  }

  private calculateWeeklyTrend(dailyMetrics: DailyMetric[]): TrendData[] {
    if (dailyMetrics.length === 0) return [];

    const weeklyMap = new Map<string, { diverted: number; total: number }>();

    for (const day of dailyMetrics) {
      const weekStart = this.getWeekStart(day.date);
      const weekKey = weekStart.toISOString().split('T')[0];

      const current = weeklyMap.get(weekKey) || { diverted: 0, total: 0 };
      current.diverted += day.divertedWeight;
      current.total += day.totalWeight;
      weeklyMap.set(weekKey, current);
    }

    const weeks = Array.from(weeklyMap.entries())
      .map(([period, data]) => ({
        period,
        diversionRate: data.total > 0 ? Math.round((data.diverted / data.total) * 1000) / 10 : 0,
        totalWeight: this.roundWeight(data.total),
        change: 0
      }))
      .sort((a, b) => a.period.localeCompare(b.period));

    // Calculate week-over-week change
    for (let i = 1; i < weeks.length; i++) {
      const prev = weeks[i - 1].diversionRate;
      const curr = weeks[i].diversionRate;
      weeks[i].change = prev > 0 ? Math.round((curr - prev) * 10) / 10 : 0;
    }

    return weeks;
  }

  private calculateCarbonMetrics(materialBreakdown: MaterialBreakdown[]): CarbonMetrics {
    let totalCO2 = 0;
    const byMaterial: CarbonByMaterial[] = [];

    for (const material of materialBreakdown) {
      const factor = CARBON_FACTORS[material.materialType] || 0;
      const co2 = (material.divertedWeight * factor) / 1000; // Convert kg to metric tons
      totalCO2 += co2;

      if (co2 > 0) {
        byMaterial.push({
          materialType: material.materialType,
          displayName: material.displayName,
          weightDiverted: material.divertedWeight,
          co2Avoided: this.roundWeight(co2),
          factor
        });
      }
    }

    return {
      totalCO2Avoided: this.roundWeight(totalCO2),
      treesEquivalent: Math.round(totalCO2 * 16.5), // ~16.5 trees per metric ton CO2
      carsOffRoad: Math.round(totalCO2 / 4.6 * 10) / 10, // ~4.6 metric tons CO2 per car per year
      homesEnergy: Math.round(totalCO2 / 7.5 * 10) / 10, // ~7.5 metric tons CO2 per home per year
      waterSaved: Math.round(totalCO2 * 2500), // Estimated gallons saved
      energySaved: Math.round(totalCO2 * 4100), // Estimated kWh saved
      byMaterial: byMaterial.sort((a, b) => b.co2Avoided - a.co2Avoided)
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  private convertToTons(weight: number, unit: string): number {
    switch (unit) {
      case 'tons': return weight;
      case 'lbs': return weight / 2000;
      case 'kg': return weight / 907.185;
      default: return weight;
    }
  }

  private roundWeight(weight: number): number {
    return Math.round(weight * 100) / 100;
  }

  private formatMaterialName(type: MaterialType): string {
    return type
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
      .replace('C And D', 'C&D');
  }

  private getPermitStatus(expiration?: Date): FacilityBreakdown['permitStatus'] {
    if (!expiration) return 'unknown';
    
    const now = new Date();
    const daysUntilExpiry = Math.floor(
      (expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilExpiry < 0) return 'expired';
    if (daysUntilExpiry <= 30) return 'expiring';
    return 'valid';
  }

  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  }

  clearCache(projectId?: string): void {
    if (projectId) {
      this.cache.delete(projectId);
    } else {
      this.cache.clear();
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACILITY PERMIT VAULT
// ═══════════════════════════════════════════════════════════════════════════════

export class FacilityPermitVault {
  private readonly API_BASE = '/api/facilities';

  async getPermits(facilityId?: string): Promise<FacilityPermit[]> {
    const url = facilityId 
      ? `${this.API_BASE}/${facilityId}/permits`
      : `${this.API_BASE}/permits`;

    const response = await fetch(url, {
      headers: auth.getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to fetch permits');
    return response.json();
  }

  async addPermit(permit: Omit<FacilityPermit, 'id' | 'status' | 'createdAt' | 'updatedAt'>): Promise<FacilityPermit> {
    const response = await fetch(`${this.API_BASE}/${permit.facilityId}/permits`, {
      method: 'POST',
      headers: auth.getAuthHeaders(),
      body: JSON.stringify(permit)
    });

    if (!response.ok) throw new Error('Failed to add permit');
    return response.json();
  }

  async updatePermit(permitId: string, updates: Partial<FacilityPermit>): Promise<FacilityPermit> {
    const response = await fetch(`${this.API_BASE}/permits/${permitId}`, {
      method: 'PATCH',
      headers: auth.getAuthHeaders(),
      body: JSON.stringify(updates)
    });

    if (!response.ok) throw new Error('Failed to update permit');
    return response.json();
  }

  async deletePermit(permitId: string): Promise<void> {
    const response = await fetch(`${this.API_BASE}/permits/${permitId}`, {
      method: 'DELETE',
      headers: auth.getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to delete permit');
  }

  async uploadPermitDocument(permitId: string, file: File): Promise<string> {
    const formData = new FormData();
    formData.append('document', file);

    const response = await fetch(`${this.API_BASE}/permits/${permitId}/document`, {
      method: 'POST',
      headers: {
        'Authorization': auth.getAuthHeaders()['Authorization']
      },
      body: formData
    });

    if (!response.ok) throw new Error('Failed to upload document');
    const { url } = await response.json();
    return url;
  }

  async getExpiringPermits(daysAhead: number = 30): Promise<FacilityPermit[]> {
    const response = await fetch(`${this.API_BASE}/permits/expiring?days=${daysAhead}`, {
      headers: auth.getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to fetch expiring permits');
    return response.json();
  }

  async getExpiredPermits(): Promise<FacilityPermit[]> {
    const response = await fetch(`${this.API_BASE}/permits/expired`, {
      headers: auth.getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to fetch expired permits');
    return response.json();
  }

  calculatePermitStatus(permit: FacilityPermit): PermitStatus {
    const now = new Date();
    const expiration = new Date(permit.expirationDate);
    const daysUntilExpiry = Math.floor(
      (expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilExpiry < 0) return 'expired';
    if (daysUntilExpiry <= permit.alertDays) return 'expiring_soon';
    return 'valid';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ESG REPORT GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

export class ESGReportGenerator {
  async generateReport(
    metrics: LEEDMetrics,
    format: 'json' | 'pdf' | 'csv' = 'json'
  ): Promise<ESGReport> {
    const report: ESGReport = {
      generatedAt: new Date(),
      reportingPeriod: this.getReportingPeriod(metrics.dailyMetrics),
      
      summary: {
        projectName: metrics.projectName,
        leedCertification: metrics.certification,
        diversionRate: metrics.diversionRate,
        earnedPoints: metrics.earnedPoints,
        totalWasteManaged: metrics.totalWaste,
        wasteUnit: metrics.weightUnit
      },

      environmental: {
        co2Avoided: metrics.carbonMetrics.totalCO2Avoided,
        co2Unit: 'metric tons CO2e',
        treesEquivalent: metrics.carbonMetrics.treesEquivalent,
        carsOffRoad: metrics.carbonMetrics.carsOffRoad,
        homesEnergyEquivalent: metrics.carbonMetrics.homesEnergy,
        waterConserved: metrics.carbonMetrics.waterSaved,
        energyConserved: metrics.carbonMetrics.energySaved
      },

      wasteStream: {
        totalDiverted: metrics.totalDiverted,
        totalLandfill: metrics.totalLandfill,
        recyclingRate: this.calculateRecyclingRate(metrics),
        materialBreakdown: metrics.materialBreakdown.map(m => ({
          material: m.displayName,
          weight: m.totalWeight,
          diversionRate: m.diversionRate,
          co2Savings: m.carbonSavings
        }))
      },

      compliance: {
        leedCompliant: metrics.threshold50Achieved,
        threshold50Met: metrics.threshold50Achieved,
        threshold75Met: metrics.threshold75Achieved,
        facilitiesWithValidPermits: this.countValidFacilities(metrics.facilityBreakdown),
        totalFacilities: metrics.facilityBreakdown.length
      },

      trends: {
        weeklyDiversionRates: metrics.weeklyTrend.map(w => ({
          week: w.period,
          rate: w.diversionRate,
          change: w.change
        }))
      }
    };

    return report;
  }

  private getReportingPeriod(dailyMetrics: DailyMetric[]): { start: Date; end: Date } {
    if (dailyMetrics.length === 0) {
      const now = new Date();
      return { start: now, end: now };
    }

    return {
      start: dailyMetrics[0].date,
      end: dailyMetrics[dailyMetrics.length - 1].date
    };
  }

  private calculateRecyclingRate(metrics: LEEDMetrics): number {
    const recycled = metrics.destinationBreakdown
      .find(d => d.destination === 'recycling')?.totalWeight || 0;
    return metrics.totalWaste > 0 
      ? Math.round((recycled / metrics.totalWaste) * 1000) / 10 
      : 0;
  }

  private countValidFacilities(facilities: FacilityBreakdown[]): number {
    return facilities.filter(f => f.permitStatus === 'valid').length;
  }
}

export interface ESGReport {
  generatedAt: Date;
  reportingPeriod: { start: Date; end: Date };
  
  summary: {
    projectName: string;
    leedCertification: string;
    diversionRate: number;
    earnedPoints: number;
    totalWasteManaged: number;
    wasteUnit: string;
  };

  environmental: {
    co2Avoided: number;
    co2Unit: string;
    treesEquivalent: number;
    carsOffRoad: number;
    homesEnergyEquivalent: number;
    waterConserved: number;
    energyConserved: number;
  };

  wasteStream: {
    totalDiverted: number;
    totalLandfill: number;
    recyclingRate: number;
    materialBreakdown: Array<{
      material: string;
      weight: number;
      diversionRate: number;
      co2Savings: number;
    }>;
  };

  compliance: {
    leedCompliant: boolean;
    threshold50Met: boolean;
    threshold75Met: boolean;
    facilitiesWithValidPermits: number;
    totalFacilities: number;
  };

  trends: {
    weeklyDiversionRates: Array<{
      week: string;
      rate: number;
      change: number;
    }>;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export const leedAnalytics = new LEEDAnalyticsEngine();
export const permitVault = new FacilityPermitVault();
export const esgReporter = new ESGReportGenerator();
