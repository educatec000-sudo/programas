import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import { Button, Field, Input, Alert } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';

export default function Login() {
  const { login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await login(email, password);
      toast(`Bem-vindo(a), ${user.name.split(' ')[0]}!`, { type: 'success', title: 'Sessão iniciada' });
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-aside">
        <h1>Controle de Programas Educacionais</h1>
        <p>
          Acompanhe programas, indicadores, metas e resultados das escolas — com rankings,
          análises e relatórios consolidados.
        </p>
        <div className="features">
          <div>{Icon.check()} Escolas, programas e indicadores integrados</div>
          <div>{Icon.check()} Metas x Resultados com pontuação e classificação</div>
          <div>{Icon.check()} Rankings e evolução por escola e por programa</div>
          <div>{Icon.check()} Importação CSV/XLSX com validação e prévia</div>
          <div>{Icon.check()} Relatórios em PDF, XLSX e CSV</div>
        </div>
      </div>

      <div className="auth-form-side">
        <div className="auth-card">
          <div className="card card-pad">
            <div className="auth-brand-row">
              <div className="logo">CPE</div>
              <div>
                <h2 style={{ fontSize: 19 }}>Acessar o sistema</h2>
                <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Use suas credenciais do CPE</div>
              </div>
            </div>

            {location.state?.sessionExpired && (
              <Alert type="warn">Sua sessão expirou. Entre novamente para continuar.</Alert>
            )}
            {error && <Alert type="error">{error}</Alert>}

            <form onSubmit={submit}>
              <Field label="E-mail" required>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.gov.br"
                  autoFocus
                  required
                />
              </Field>
              <Field label="Senha" required>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </Field>
              <div style={{ textAlign: 'right', marginBottom: 14 }}>
                <Link to="/esqueci-senha" style={{ fontSize: 12.5 }}>
                  Esqueci minha senha
                </Link>
              </div>
              <Button type="submit" block disabled={busy}>
                {busy ? 'Entrando...' : 'Entrar'}
              </Button>
            </form>

            <div className="demo-creds">
              <strong>Ambiente de demonstração</strong> — usuários seed:
              <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
                <code>admin@cpe.local · Admin@123</code>
                <code>coordenador@cpe.local · Coord@123</code>
                <code>tecnico@cpe.local · Tec@123</code>
                <code>consulta@cpe.local · Ver@123</code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
