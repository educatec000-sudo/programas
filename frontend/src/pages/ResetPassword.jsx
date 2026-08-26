import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../services/resources.js';
import { useToast } from '../contexts/ToastContext.jsx';
import { Button, Field, Input, Alert } from '../components/ui.jsx';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('As senhas não coincidem');
      return;
    }
    setBusy(true);
    try {
      await authApi.resetPassword({ token, password });
      toast('Senha redefinida com sucesso. Faça login.', { type: 'success' });
      navigate('/login');
    } catch (err) {
      setError(err.details?.[0]?.message || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-aside">
        <h1>Definir nova senha</h1>
        <p>Sua nova senha deve ter no mínimo 8 caracteres, com letras e números.</p>
      </div>
      <div className="auth-form-side">
        <div className="auth-card">
          <div className="card card-pad">
            <h2 style={{ fontSize: 18, marginBottom: 18 }}>Redefinir senha</h2>
            {!token ? (
              <>
                <Alert type="error">Link inválido — o token não foi encontrado na URL.</Alert>
                <Link to="/esqueci-senha">Solicitar novo link</Link>
              </>
            ) : (
              <form onSubmit={submit}>
                {error && <Alert type="error">{error}</Alert>}
                <Field label="Nova senha" required hint="Mínimo 8 caracteres, com letras e números">
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
                </Field>
                <Field label="Confirmar nova senha" required>
                  <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
                </Field>
                <Button type="submit" block disabled={busy}>
                  {busy ? 'Salvando...' : 'Redefinir senha'}
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
