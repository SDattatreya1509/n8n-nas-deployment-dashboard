import { LucideIcon } from 'lucide-react';

interface Props {
  label: string;
  value: string | number;
  sub?: string;
  accent: 'teal' | 'blue' | 'purple' | 'orange';
  Icon: LucideIcon;
}

const ACCENT_COLORS: Record<string, { icon: string; bg: string }> = {
  teal:   { icon: '#2dd4bf', bg: 'rgba(45,212,191,0.1)' },
  blue:   { icon: '#60a5fa', bg: 'rgba(96,165,250,0.1)' },
  purple: { icon: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
  orange: { icon: '#fb923c', bg: 'rgba(251,146,60,0.1)' },
};

export default function StatCard({ label, value, sub, accent, Icon }: Props) {
  const colors = ACCENT_COLORS[accent] ?? ACCENT_COLORS.teal;
  return (
    <div className={`stat-card ${accent}`}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="stat-label">{label}</div>
          <div className="stat-value">{value}</div>
          {sub && <div className="stat-sub">{sub}</div>}
        </div>
        <div style={{
          width: 42, height: 42, borderRadius: '11px',
          background: colors.bg,
          border: `1px solid ${colors.icon}28`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, marginLeft: '0.75rem', marginTop: '0.125rem',
          boxShadow: `0 2px 8px ${colors.bg}`,
        }}>
          <Icon size={20} style={{ color: colors.icon }} />
        </div>
      </div>
    </div>
  );
}
