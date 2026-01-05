/**
 * DivertScan™ Apex Enterprise - Analytics Dashboard Module
 * Real-time LEED v5 Diversion Tracking & ESG Metrics
 * iPad Optimized | Production Build
 */

import React, { useState, useEffect, useMemo } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface DashboardProps {
  projectId: string;
}

interface LEEDMetrics {
  diversionRate: number;
  targetRate: number;
  totalWaste: number;
  totalDiverted: number;
  totalLandfill: number;
  threshold50Achieved: boolean;
  threshold75Achieved: boolean;
  earnedPoints: number;
  carbonMetrics: CarbonMetrics;
  materialBreakdown: MaterialBreakdown[];
  destinationBreakdown: DestinationBreakdown[];
  dailyMetrics: DailyMetric[];
}

interface CarbonMetrics {
  totalCO2Avoided: number;
  treesEquivalent: number;
  carsOffRoad: number;
}

interface MaterialBreakdown {
  materialType: string;
  displayName: string;
  totalWeight: number;
  diversionRate: number;
  carbonSavings: number;
}

interface DestinationBreakdown {
  destination: string;
  totalWeight: number;
  percentage: number;
}

interface DailyMetric {
  date: string;
  diversionRate: number;
  totalWeight: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function AnalyticsDashboard({ projectId }: DashboardProps) {
  const [metrics, setMetrics] = useState<LEEDMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

  useEffect(() => {
    loadMetrics();
  }, [projectId, timeRange]);

  const loadMetrics = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/analytics?range=${timeRange}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      
      if (!response.ok) throw new Error('Failed to load metrics');
      
      const data = await response.json();
      setMetrics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error || !metrics) {
    return <DashboardError message={error || 'No data available'} onRetry={loadMetrics} />;
  }

  return (
    <div className="analytics-dashboard">
      <style>{dashboardStyles}</style>

      {/* Header */}
      <div className="dash-header">
        <h1>LEED v5 Analytics</h1>
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <DiversionGauge 
          rate={metrics.diversionRate}
          target={metrics.targetRate}
          threshold50={metrics.threshold50Achieved}
          threshold75={metrics.threshold75Achieved}
        />
        
        <KPICard
          title="Total Waste"
          value={formatWeight(metrics.totalWaste)}
          subtitle="tons managed"
          icon="📦"
        />
        
        <KPICard
          title="Diverted"
          value={formatWeight(metrics.totalDiverted)}
          subtitle="tons recycled"
          icon="♻️"
          variant="success"
        />
        
        <KPICard
          title="Landfill"
          value={formatWeight(metrics.totalLandfill)}
          subtitle="tons disposed"
          icon="🗑️"
          variant="warning"
        />
        
        <KPICard
          title="LEED Points"
          value={`${metrics.earnedPoints}`}
          subtitle="of 2 possible"
          icon="🏆"
          variant="primary"
        />
      </div>

      {/* Charts Row */}
      <div className="charts-grid">
        <div className="chart-card wide">
          <h3>Diversion Rate Trend</h3>
          <TrendChart data={metrics.dailyMetrics} target={metrics.targetRate} />
        </div>

        <div className="chart-card">
          <h3>Destination Breakdown</h3>
          <DonutChart data={metrics.destinationBreakdown} />
        </div>
      </div>

      {/* Carbon Metrics */}
      <CarbonImpactSection metrics={metrics.carbonMetrics} />

      {/* Material Breakdown Table */}
      <div className="table-card">
        <h3>Material Breakdown</h3>
        <MaterialTable data={metrics.materialBreakdown} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function TimeRangeSelector({ value, onChange }: {
  value: string;
  onChange: (v: '7d' | '30d' | '90d' | 'all') => void;
}) {
  const options = [
    { value: '7d', label: '7 Days' },
    { value: '30d', label: '30 Days' },
    { value: '90d', label: '90 Days' },
    { value: 'all', label: 'All Time' }
  ];

  return (
    <div className="time-selector">
      {options.map(opt => (
        <button
          key={opt.value}
          className={`time-btn ${value === opt.value ? 'active' : ''}`}
          onClick={() => onChange(opt.value as any)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function DiversionGauge({ rate, target, threshold50, threshold75 }: {
  rate: number;
  target: number;
  threshold50: boolean;
  threshold75: boolean;
}) {
  const circumference = 2 * Math.PI * 80;
  const progress = (rate / 100) * circumference;
  const targetProgress = (target / 100) * circumference;

  const getStatusColor = () => {
    if (threshold75) return '#10b981';
    if (threshold50) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <div className="gauge-card">
      <svg viewBox="0 0 200 200" className="gauge-svg">
        {/* Background circle */}
        <circle
          cx="100"
          cy="100"
          r="80"
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="16"
        />
        
        {/* Target marker */}
        <circle
          cx="100"
          cy="100"
          r="80"
          fill="none"
          stroke="#94a3b8"
          strokeWidth="16"
          strokeDasharray={`${targetProgress} ${circumference}`}
          strokeLinecap="round"
          transform="rotate(-90 100 100)"
          opacity="0.3"
        />
        
        {/* Progress circle */}
        <circle
          cx="100"
          cy="100"
          r="80"
          fill="none"
          stroke={getStatusColor()}
          strokeWidth="16"
          strokeDasharray={`${progress} ${circumference}`}
          strokeLinecap="round"
          transform="rotate(-90 100 100)"
          style={{ transition: 'stroke-dasharray 0.5s ease' }}
        />
        
        {/* Center text */}
        <text x="100" y="90" textAnchor="middle" className="gauge-value">
          {rate.toFixed(1)}%
        </text>
        <text x="100" y="115" textAnchor="middle" className="gauge-label">
          Diversion Rate
        </text>
      </svg>
      
      <div className="gauge-thresholds">
        <div className={`threshold ${threshold50 ? 'achieved' : ''}`}>
          <span className="threshold-marker">50%</span>
          <span className="threshold-label">1 Point</span>
        </div>
        <div className={`threshold ${threshold75 ? 'achieved' : ''}`}>
          <span className="threshold-marker">75%</span>
          <span className="threshold-label">2 Points</span>
        </div>
      </div>
    </div>
  );
}

function KPICard({ title, value, subtitle, icon, variant = 'default' }: {
  title: string;
  value: string;
  subtitle: string;
  icon: string;
  variant?: 'default' | 'success' | 'warning' | 'primary';
}) {
  return (
    <div className={`kpi-card ${variant}`}>
      <div className="kpi-icon">{icon}</div>
      <div className="kpi-content">
        <span className="kpi-title">{title}</span>
        <span className="kpi-value">{value}</span>
        <span className="kpi-subtitle">{subtitle}</span>
      </div>
    </div>
  );
}

function TrendChart({ data, target }: { data: DailyMetric[]; target: number }) {
  if (data.length === 0) {
    return <div className="chart-empty">No data available</div>;
  }

  const maxRate = Math.max(...data.map(d => d.diversionRate), target, 100);
  const height = 200;
  const width = 100; // Percentage based

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = height - (d.diversionRate / maxRate) * height;
    return `${x},${y}`;
  }).join(' ');

  const areaPoints = `0,${height} ${points} 100,${height}`;
  const targetY = height - (target / maxRate) * height;

  return (
    <div className="trend-chart">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="trend-svg">
        {/* Grid lines */}
        {[25, 50, 75].map(pct => (
          <line
            key={pct}
            x1="0"
            y1={height - (pct / maxRate) * height}
            x2="100"
            y2={height - (pct / maxRate) * height}
            stroke="#e2e8f0"
            strokeWidth="0.5"
          />
        ))}
        
        {/* Target line */}
        <line
          x1="0"
          y1={targetY}
          x2="100"
          y2={targetY}
          stroke="#f59e0b"
          strokeWidth="1"
          strokeDasharray="2,2"
        />
        
        {/* Area fill */}
        <polygon
          points={areaPoints}
          fill="url(#trendGradient)"
        />
        
        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke="#1a5f2a"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Gradient definition */}
        <defs>
          <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a5f2a" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#1a5f2a" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      
      <div className="trend-legend">
        <span className="legend-item">
          <span className="legend-color primary" />
          Diversion Rate
        </span>
        <span className="legend-item">
          <span className="legend-color warning" />
          Target ({target}%)
        </span>
      </div>
    </div>
  );
}

function DonutChart({ data }: { data: DestinationBreakdown[] }) {
  const colors: Record<string, string> = {
    recycling: '#10b981',
    landfill: '#ef4444',
    donation: '#3b82f6',
    salvage: '#8b5cf6'
  };

  const total = data.reduce((sum, d) => sum + d.totalWeight, 0);
  let currentAngle = 0;

  const segments = data.map(d => {
    const angle = (d.totalWeight / total) * 360;
    const startAngle = currentAngle;
    currentAngle += angle;
    
    return {
      ...d,
      startAngle,
      endAngle: currentAngle,
      color: colors[d.destination] || '#94a3b8'
    };
  });

  const createArc = (startAngle: number, endAngle: number, radius: number) => {
    const start = polarToCartesian(50, 50, radius, endAngle);
    const end = polarToCartesian(50, 50, radius, startAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`;
  };

  return (
    <div className="donut-chart">
      <svg viewBox="0 0 100 100" className="donut-svg">
        {segments.map((seg, i) => (
          <path
            key={i}
            d={createArc(seg.startAngle, seg.endAngle, 35)}
            fill="none"
            stroke={seg.color}
            strokeWidth="15"
          />
        ))}
      </svg>
      
      <div className="donut-legend">
        {data.map((d, i) => (
          <div key={i} className="legend-row">
            <span className="legend-dot" style={{ background: colors[d.destination] }} />
            <span className="legend-name">{formatDestination(d.destination)}</span>
            <span className="legend-value">{d.percentage.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CarbonImpactSection({ metrics }: { metrics: CarbonMetrics }) {
  return (
    <div className="carbon-section">
      <h3>🌍 Environmental Impact</h3>
      <div className="carbon-grid">
        <div className="carbon-card">
          <div className="carbon-value">{formatNumber(metrics.totalCO2Avoided)}</div>
          <div className="carbon-label">Metric Tons CO₂e Avoided</div>
        </div>
        <div className="carbon-card">
          <div className="carbon-icon">🌳</div>
          <div className="carbon-value">{formatNumber(metrics.treesEquivalent)}</div>
          <div className="carbon-label">Trees Equivalent</div>
        </div>
        <div className="carbon-card">
          <div className="carbon-icon">🚗</div>
          <div className="carbon-value">{metrics.carsOffRoad.toFixed(1)}</div>
          <div className="carbon-label">Cars Off Road (Years)</div>
        </div>
      </div>
    </div>
  );
}

function MaterialTable({ data }: { data: MaterialBreakdown[] }) {
  return (
    <div className="material-table">
      <table>
        <thead>
          <tr>
            <th>Material</th>
            <th>Weight (tons)</th>
            <th>Diversion Rate</th>
            <th>CO₂ Savings</th>
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 10).map((m, i) => (
            <tr key={i}>
              <td>{m.displayName}</td>
              <td>{formatWeight(m.totalWeight)}</td>
              <td>
                <div className="rate-bar">
                  <div 
                    className="rate-fill"
                    style={{ width: `${Math.min(m.diversionRate, 100)}%` }}
                  />
                  <span>{m.diversionRate.toFixed(1)}%</span>
                </div>
              </td>
              <td>{formatWeight(m.carbonSavings)} t CO₂</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="dashboard-skeleton">
      <style>{dashboardStyles}</style>
      <div className="skeleton-header" />
      <div className="skeleton-grid">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="skeleton-card" />
        ))}
      </div>
      <div className="skeleton-charts">
        <div className="skeleton-chart wide" />
        <div className="skeleton-chart" />
      </div>
    </div>
  );
}

function DashboardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="dashboard-error">
      <style>{dashboardStyles}</style>
      <div className="error-content">
        <span className="error-icon">⚠️</span>
        <h3>Unable to Load Analytics</h3>
        <p>{message}</p>
        <button onClick={onRetry} className="retry-btn">
          Retry
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

function formatWeight(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toFixed(1);
}

function formatNumber(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toFixed(0);
}

function formatDestination(dest: string): string {
  return dest.charAt(0).toUpperCase() + dest.slice(1);
}

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  const rad = (angle - 90) * Math.PI / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad)
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const dashboardStyles = `
  .analytics-dashboard {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .dash-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .dash-header h1 {
    font-size: 24px;
    font-weight: 700;
    color: #1e293b;
  }

  .time-selector {
    display: flex;
    background: #f1f5f9;
    border-radius: 10px;
    padding: 4px;
  }

  .time-btn {
    padding: 8px 16px;
    border: none;
    background: transparent;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    color: #64748b;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .time-btn.active {
    background: white;
    color: #1a5f2a;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  /* KPI Grid */
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
  }

  .gauge-card {
    grid-column: span 1;
    background: white;
    border-radius: 16px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
  }

  .gauge-svg {
    width: 180px;
    height: 180px;
  }

  .gauge-value {
    font-size: 28px;
    font-weight: 700;
    fill: #1e293b;
  }

  .gauge-label {
    font-size: 12px;
    fill: #64748b;
  }

  .gauge-thresholds {
    display: flex;
    gap: 24px;
    margin-top: 16px;
  }

  .threshold {
    text-align: center;
    opacity: 0.5;
  }

  .threshold.achieved {
    opacity: 1;
  }

  .threshold-marker {
    display: block;
    font-size: 18px;
    font-weight: 700;
    color: #1e293b;
  }

  .threshold-label {
    font-size: 12px;
    color: #64748b;
  }

  .threshold.achieved .threshold-marker {
    color: #10b981;
  }

  .kpi-card {
    background: white;
    border-radius: 16px;
    padding: 20px;
    display: flex;
    gap: 16px;
    align-items: flex-start;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
  }

  .kpi-icon {
    font-size: 32px;
    line-height: 1;
  }

  .kpi-content {
    display: flex;
    flex-direction: column;
  }

  .kpi-title {
    font-size: 13px;
    font-weight: 500;
    color: #64748b;
  }

  .kpi-value {
    font-size: 28px;
    font-weight: 700;
    color: #1e293b;
    line-height: 1.2;
  }

  .kpi-subtitle {
    font-size: 12px;
    color: #94a3b8;
  }

  .kpi-card.success .kpi-value { color: #10b981; }
  .kpi-card.warning .kpi-value { color: #f59e0b; }
  .kpi-card.primary .kpi-value { color: #1a5f2a; }

  /* Charts */
  .charts-grid {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 16px;
  }

  .chart-card {
    background: white;
    border-radius: 16px;
    padding: 24px;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
  }

  .chart-card h3 {
    font-size: 16px;
    font-weight: 600;
    color: #1e293b;
    margin-bottom: 16px;
  }

  .chart-card.wide {
    grid-column: span 1;
  }

  .trend-chart {
    position: relative;
  }

  .trend-svg {
    width: 100%;
    height: 200px;
  }

  .trend-legend {
    display: flex;
    gap: 20px;
    justify-content: center;
    margin-top: 16px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #64748b;
  }

  .legend-color {
    width: 12px;
    height: 3px;
    border-radius: 2px;
  }

  .legend-color.primary { background: #1a5f2a; }
  .legend-color.warning { background: #f59e0b; }

  .donut-chart {
    display: flex;
    align-items: center;
    gap: 24px;
  }

  .donut-svg {
    width: 140px;
    height: 140px;
    flex-shrink: 0;
  }

  .donut-legend {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .legend-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .legend-name {
    flex: 1;
    font-size: 14px;
    color: #1e293b;
  }

  .legend-value {
    font-size: 14px;
    font-weight: 600;
    color: #1e293b;
  }

  /* Carbon Section */
  .carbon-section {
    background: linear-gradient(135deg, #1a5f2a 0%, #134420 100%);
    border-radius: 16px;
    padding: 24px;
    color: white;
  }

  .carbon-section h3 {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 20px;
  }

  .carbon-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
  }

  .carbon-card {
    background: rgba(255,255,255,0.1);
    border-radius: 12px;
    padding: 20px;
    text-align: center;
  }

  .carbon-icon {
    font-size: 32px;
    margin-bottom: 8px;
  }

  .carbon-value {
    font-size: 32px;
    font-weight: 700;
  }

  .carbon-label {
    font-size: 13px;
    opacity: 0.8;
    margin-top: 4px;
  }

  /* Material Table */
  .table-card {
    background: white;
    border-radius: 16px;
    padding: 24px;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
  }

  .table-card h3 {
    font-size: 16px;
    font-weight: 600;
    color: #1e293b;
    margin-bottom: 16px;
  }

  .material-table {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .material-table table {
    width: 100%;
    border-collapse: collapse;
  }

  .material-table th,
  .material-table td {
    padding: 12px 16px;
    text-align: left;
    border-bottom: 1px solid #e2e8f0;
  }

  .material-table th {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #64748b;
    background: #f8fafc;
  }

  .material-table td {
    font-size: 14px;
    color: #1e293b;
  }

  .rate-bar {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .rate-fill {
    height: 8px;
    background: linear-gradient(90deg, #1a5f2a, #2d8b47);
    border-radius: 4px;
    min-width: 4px;
    max-width: 100px;
  }

  /* Skeleton */
  .dashboard-skeleton {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .skeleton-header {
    height: 40px;
    background: #e2e8f0;
    border-radius: 8px;
    width: 200px;
  }

  .skeleton-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
  }

  .skeleton-card {
    height: 120px;
    background: #e2e8f0;
    border-radius: 16px;
    animation: pulse 1.5s ease infinite;
  }

  .skeleton-charts {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 16px;
  }

  .skeleton-chart {
    height: 280px;
    background: #e2e8f0;
    border-radius: 16px;
    animation: pulse 1.5s ease infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  /* Error State */
  .dashboard-error {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 400px;
  }

  .error-content {
    text-align: center;
    max-width: 300px;
  }

  .error-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }

  .error-content h3 {
    font-size: 18px;
    font-weight: 600;
    color: #1e293b;
    margin-bottom: 8px;
  }

  .error-content p {
    color: #64748b;
    margin-bottom: 20px;
  }

  .retry-btn {
    padding: 12px 24px;
    background: #1a5f2a;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }

  .chart-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: #94a3b8;
    font-size: 14px;
  }

  /* iPad Responsive */
  @media (max-width: 1024px) {
    .charts-grid {
      grid-template-columns: 1fr;
    }

    .carbon-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 768px) {
    .dash-header {
      flex-direction: column;
      gap: 16px;
      align-items: flex-start;
    }

    .donut-chart {
      flex-direction: column;
    }
  }
`;
