import React, { useEffect } from 'react';

export function Button({ variant = 'primary', size, block, icon, children, className = '', ...props }) {
  return (
    <button
      className={`btn btn-${variant} ${size === 'sm' ? 'btn-sm' : ''} ${block ? 'btn-block' : ''} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

export function Field({ label, required, error, hint, children, className = '' }) {
  return (
    <div className={`field ${className}`}>
      {label && (
        <label>
          {label} {required && <span className="req">*</span>}
        </label>
      )}
      {children}
      {error && <div className="field-error">{error}</div>}
      {!error && hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

export const Input = React.forwardRef((props, ref) => <input ref={ref} className="input" {...props} />);
export const Select = React.forwardRef((props, ref) => <select ref={ref} className="select" {...props} />);
export const Textarea = React.forwardRef((props, ref) => <textarea ref={ref} className="textarea" {...props} />);

export function Badge({ cls = 'badge-gray', children, title }) {
  return (
    <span className={`badge ${cls}`} title={title}>
      {children}
    </span>
  );
}

export function Spinner({ lg }) {
  return <div className={`spinner ${lg ? 'spinner-lg' : ''}`} />;
}

export function LoadingBlock({ label = 'Carregando...' }) {
  return (
    <div className="centered">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ icon = '📋', title, hint }) {
  return (
    <div className="empty-state">
      <div className="big">{icon}</div>
      <div style={{ fontWeight: 600, color: 'var(--text-2)' }}>{title}</div>
      {hint && <div style={{ fontSize: 12.5 }}>{hint}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, size, children, footer }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${size === 'lg' ? 'modal-lg' : size === 'sm' ? 'modal-sm' : size === 'xl' ? 'modal-xl' : ''}`}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title = 'Confirmar operação', message, danger, confirmLabel = 'Confirmar', busy }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
            {busy ? 'Aguarde...' : confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{message}</p>
    </Modal>
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button
          key={t.key}
          className={`tab ${active === t.key ? 'active' : ''}`}
          onClick={() => onChange(t.key)}
          type="button"
        >
          {t.label}
          {t.count !== undefined && <span style={{ color: 'var(--text-3)', fontWeight: 500 }}> ({t.count})</span>}
        </button>
      ))}
    </div>
  );
}

export function StatCard({ icon, label, value, hint, tone = 'blue' }) {
  const tones = {
    blue: { bg: 'var(--primary-soft)', color: 'var(--primary-dark)' },
    green: { bg: 'var(--success-bg)', color: 'var(--success)' },
    yellow: { bg: 'var(--warning-bg)', color: 'var(--warning)' },
    red: { bg: 'var(--danger-bg)', color: 'var(--danger)' },
    cyan: { bg: 'var(--info-bg)', color: 'var(--info)' },
    violet: { bg: '#ede9fe', color: '#7c3aed' },
  };
  const t = tones[tone] || tones.blue;
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: t.bg, color: t.color }}>
        {icon}
      </div>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {hint && <div className="stat-hint">{hint}</div>}
      </div>
    </div>
  );
}

export function Alert({ type = 'info', children }) {
  return <div className={`alert alert-${type}`}>{children}</div>;
}
