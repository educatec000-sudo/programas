import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../services/resources.js';
import { Button, Field, Input, Alert } from '../components/ui.jsx';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await authApi.forgotPassword({ email });
      setResult(res);
    } catch (err) {
      setResult({ message: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-aside">
        <h1>Recuperar acesso</h1>
        <p>Informe seu e-mail cadastrado. Enviaremos um link seguro para redefinir sua senha.</p>
      </div>
      <div className="auth-form-side">
        <div className="auth-card">
          <div className="card card-pad">
            <h2 style={{ fontSize: 18, marginBottom: 6 }}>Esqueci minha senha</h2>
            <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 18 }}>
              O link expira em 24 horas e pode ser usado uma única vez.
            </p>

            {result ? (
              <>
                <Alert type="success">{result.message}</Alert>
                {result.resetUrl && (
                  <Alert type="info">
                    Ambiente de desenvolvimento — link gerado:
                    <div style={{ marginTop: 6 }}>
                      <Link to={result.resetUrl}>{result.resetUrl}</Link>
                    </div>
                  </Alert>
                )}
              </>
            ) : (
              <form onSubmit={submit}>
                <Field label="E-mail cadastrado" required>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
                </Field>
                <Button type="submit" block disabled={busy}>
                  {busy ? 'Enviando...' : 'Enviar link de redefinição'}
                </Button>
              </form>
            )}

            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <Link to="/login" style={{ fontSize: 13 }}>← Voltar ao login</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
