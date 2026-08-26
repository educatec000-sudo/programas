import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const remove = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message, { type = 'info', title, duration = 4800 } = {}) => {
      const id = ++idRef.current;
      setToasts((list) => [...list, { id, message, type, title }]);
      setTimeout(() => remove(id), duration);
      return id;
    },
    [remove],
  );

  const success = useCallback((message, opts) => toast(message, { ...opts, type: 'success', title: 'Sucesso' }), [toast]);
  const error = useCallback((message, opts) => toast(message, { ...opts, type: 'error', title: 'Erro', duration: 7000 }), [toast]);
  const warning = useCallback((message, opts) => toast(message, { ...opts, type: 'warning', title: 'Atenção' }), [toast]);

  const value = useMemo(() => ({ toast, success, error, warning }), [toast, success, error, warning]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`} onClick={() => remove(t.id)} role="alert">
            <div className="toast-msg">
              {t.title && <strong>{t.title}</strong>}
              <span>{t.message}</span>
              {t.detail && <div className="detail">{t.detail}</div>}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast deve ser usado dentro de ToastProvider');
  return ctx;
}
