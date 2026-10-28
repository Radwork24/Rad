import React from 'react';

interface LoadingHintProps {
  label?: string;
  compact?: boolean;
}

export const LoadingHint: React.FC<LoadingHintProps> = ({
  label = 'Loading…',
  compact = false,
}) => (
  <div
    style={{
      display: 'flex',
      flexDirection: compact ? 'row' : 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: compact ? '8px' : '10px',
      padding: compact ? '10px 8px' : '28px 16px',
      color: 'rgba(255,255,255,0.42)',
      fontSize: compact ? '12px' : '13px',
      fontWeight: 500,
    }}
  >
    <span className="rad-spinner" style={{ width: compact ? 14 : 18, height: compact ? 14 : 18 }} />
    <span>{label}</span>
  </div>
);

interface SkeletonListProps {
  rows?: number;
  variant?: 'chat' | 'user' | 'card';
}

export const SkeletonList: React.FC<SkeletonListProps> = ({ rows = 5, variant = 'chat' }) => {
  if (variant === 'card') {
    return (
      <>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="rad-skeleton"
            style={{
              minHeight: '180px',
              borderRadius: '14px',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          />
        ))}
      </>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: variant === 'user' ? '10px' : '8px', padding: variant === 'user' ? '4px 10px 16px' : '4px 8px 12px' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: variant === 'user' ? '8px 6px' : '6px 4px',
          }}
        >
          {variant === 'user' && (
            <div className="rad-skeleton" style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div className="rad-skeleton" style={{ height: 10, width: `${70 - i * 8}%`, borderRadius: 6 }} />
            {variant === 'user' && (
              <div className="rad-skeleton" style={{ height: 8, width: '42%', borderRadius: 6 }} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
