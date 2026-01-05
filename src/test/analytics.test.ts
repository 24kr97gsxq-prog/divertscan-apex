/**
 * DivertScan™ Apex Enterprise - LEED Analytics Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the analytics engine functions
const calculateDiversionRate = (totalWeight: number, divertedWeight: number): number => {
  if (totalWeight === 0) return 0;
  return (divertedWeight / totalWeight) * 100;
};

const getLEEDPoints = (diversionRate: number): number => {
  if (diversionRate >= 75) return 2;
  if (diversionRate >= 50) return 1;
  return 0;
};

const calculateCarbonSavings = (materialType: string, weight: number): number => {
  const factors: Record<string, number> = {
    'concrete': 23,
    'asphalt': 45,
    'metal_ferrous': 1850,
    'metal_nonferrous': 9100,
    'wood_clean': 890,
    'cardboard': 3100,
    'paper': 3700,
    'plastic': 1400,
    'glass': 314,
    'drywall': 178
  };
  
  const factor = factors[materialType] || 0;
  const tons = weight / 2000; // lbs to tons
  return (factor * tons) / 1000; // Convert to metric tons
};

describe('LEED Analytics Engine', () => {
  describe('Diversion Rate Calculations', () => {
    it('calculates correct diversion rate', () => {
      const rate = calculateDiversionRate(1000, 750);
      expect(rate).toBe(75);
    });

    it('handles zero total weight', () => {
      const rate = calculateDiversionRate(0, 0);
      expect(rate).toBe(0);
    });

    it('handles 100% diversion', () => {
      const rate = calculateDiversionRate(500, 500);
      expect(rate).toBe(100);
    });

    it('handles 0% diversion', () => {
      const rate = calculateDiversionRate(500, 0);
      expect(rate).toBe(0);
    });
  });

  describe('LEED Points', () => {
    it('awards 2 points for 75%+ diversion', () => {
      expect(getLEEDPoints(75)).toBe(2);
      expect(getLEEDPoints(85)).toBe(2);
      expect(getLEEDPoints(100)).toBe(2);
    });

    it('awards 1 point for 50-74% diversion', () => {
      expect(getLEEDPoints(50)).toBe(1);
      expect(getLEEDPoints(60)).toBe(1);
      expect(getLEEDPoints(74.9)).toBe(1);
    });

    it('awards 0 points for <50% diversion', () => {
      expect(getLEEDPoints(0)).toBe(0);
      expect(getLEEDPoints(25)).toBe(0);
      expect(getLEEDPoints(49.9)).toBe(0);
    });
  });

  describe('Carbon Savings Calculations', () => {
    it('calculates concrete carbon savings', () => {
      // 1 ton of concrete = 23 kg CO2e
      const savings = calculateCarbonSavings('concrete', 2000); // 1 ton
      expect(savings).toBeCloseTo(0.023, 3); // 0.023 metric tons
    });

    it('calculates metal ferrous carbon savings', () => {
      // 1 ton of ferrous metal = 1850 kg CO2e
      const savings = calculateCarbonSavings('metal_ferrous', 2000);
      expect(savings).toBeCloseTo(1.85, 2);
    });

    it('calculates cardboard carbon savings', () => {
      // 1 ton of cardboard = 3100 kg CO2e
      const savings = calculateCarbonSavings('cardboard', 4000); // 2 tons
      expect(savings).toBeCloseTo(6.2, 1);
    });

    it('returns 0 for unknown material', () => {
      const savings = calculateCarbonSavings('unknown', 2000);
      expect(savings).toBe(0);
    });
  });
});

describe('Weight Validation', () => {
  const validateWeights = (gross: number, tare: number): { valid: boolean; error?: string } => {
    if (gross <= 0) return { valid: false, error: 'Gross weight must be positive' };
    if (tare <= 0) return { valid: false, error: 'Tare weight must be positive' };
    if (tare > gross) return { valid: false, error: 'Tare weight cannot exceed gross weight' };
    return { valid: true };
  };

  it('validates correct weights', () => {
    const result = validateWeights(15000, 8000);
    expect(result.valid).toBe(true);
  });

  it('rejects tare > gross', () => {
    const result = validateWeights(8000, 15000);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceed');
  });

  it('rejects zero gross', () => {
    const result = validateWeights(0, 8000);
    expect(result.valid).toBe(false);
  });

  it('rejects negative weights', () => {
    const result = validateWeights(-100, 8000);
    expect(result.valid).toBe(false);
  });
});

describe('Material Classification', () => {
  const classifyMaterial = (input: string): string => {
    const normalized = input.toLowerCase().trim();
    const materialMap: Record<string, string> = {
      'concrete': 'concrete',
      'asphalt': 'asphalt',
      'metal': 'metal_ferrous',
      'ferrous': 'metal_ferrous',
      'non-ferrous': 'metal_nonferrous',
      'wood': 'wood_clean',
      'cardboard': 'cardboard',
      'occ': 'cardboard',
      'drywall': 'drywall',
      'roofing': 'roofing',
      'mixed': 'mixed_c_and_d',
      'c&d': 'mixed_c_and_d'
    };

    for (const [key, type] of Object.entries(materialMap)) {
      if (normalized.includes(key)) return type;
    }
    return 'other';
  };

  it('classifies concrete', () => {
    expect(classifyMaterial('Concrete Debris')).toBe('concrete');
    expect(classifyMaterial('CONCRETE')).toBe('concrete');
  });

  it('classifies cardboard/OCC', () => {
    expect(classifyMaterial('Cardboard')).toBe('cardboard');
    expect(classifyMaterial('OCC')).toBe('cardboard');
  });

  it('classifies metal', () => {
    expect(classifyMaterial('Metal Scrap')).toBe('metal_ferrous');
    expect(classifyMaterial('Non-Ferrous Metal')).toBe('metal_nonferrous');
  });

  it('returns other for unknown', () => {
    expect(classifyMaterial('Random Stuff')).toBe('other');
  });
});

describe('Destination Parsing', () => {
  const parseDestination = (input: string): string => {
    const normalized = input.toLowerCase().trim();
    if (normalized.includes('recycle') || normalized.includes('divert')) return 'recycling';
    if (normalized.includes('donate') || normalized.includes('donation')) return 'donation';
    if (normalized.includes('salvage')) return 'salvage';
    return 'landfill';
  };

  it('parses recycling destinations', () => {
    expect(parseDestination('Recycling Center')).toBe('recycling');
    expect(parseDestination('Diverted')).toBe('recycling');
  });

  it('parses donation destinations', () => {
    expect(parseDestination('Habitat for Humanity Donation')).toBe('donation');
  });

  it('parses salvage destinations', () => {
    expect(parseDestination('Salvage Yard')).toBe('salvage');
  });

  it('defaults to landfill', () => {
    expect(parseDestination('City Dump')).toBe('landfill');
    expect(parseDestination('Disposal')).toBe('landfill');
  });
});
