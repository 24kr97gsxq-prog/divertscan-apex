/**
 * DivertScan™ Apex Enterprise - Test Setup
 * Global test configuration and mocks
 */

import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock IndexedDB
const indexedDB = {
  open: vi.fn(),
  deleteDatabase: vi.fn()
};
Object.defineProperty(window, 'indexedDB', { value: indexedDB });

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock navigator.geolocation
const geolocationMock = {
  getCurrentPosition: vi.fn((success) => {
    success({
      coords: {
        latitude: 32.8801,
        longitude: -96.6298,
        accuracy: 10
      },
      timestamp: Date.now()
    });
  }),
  watchPosition: vi.fn()
};
Object.defineProperty(navigator, 'geolocation', { value: geolocationMock });

// Mock fetch
global.fetch = vi.fn();

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
}));

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
});

// Mock canvas for signature capture
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  drawImage: vi.fn(),
  toDataURL: vi.fn(() => 'data:image/png;base64,mock'),
  scale: vi.fn()
}));

// Test utilities
export const mockAuthToken = 'mock-jwt-token';

export const mockUser = {
  id: 'user-001',
  email: 'test@dalmex.com',
  name: 'Test User',
  role: 'admin'
};

export const mockTenant = {
  id: 'tenant-001',
  name: 'Dalmex Recycling LLC',
  slug: 'dalmex'
};

export const mockProject = {
  id: 'proj-001',
  name: 'Downtown Office Tower',
  leedCertification: 'v5',
  targetDiversion: 75,
  status: 'active'
};

export const mockTicket = {
  id: 'ticket-001',
  ticketNumber: 'DS-240101-ABC1',
  projectId: 'proj-001',
  grossWeight: 15280,
  tareWeight: 8500,
  netWeight: 6780,
  materialType: 'concrete',
  destination: 'recycling',
  facilityName: 'Metro Recycling Center',
  status: 'verified'
};

// Helper to mock API responses
export function mockApiResponse(data: any, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data)
  });
}
