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
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="login-screen-v3">
      <div className="login-bg-v3" aria-hidden="true">
        <div className="login-bg-gradient-v3" />
        <div className="login-bg-grid-v3" />

        <div className="login-bg-panel-v3 panel-left">
          <div className="login-bg-panel-header-v3">
            <span>{Icon.book()}</span>
            <strong>Painel educacional</strong>
          </div>
          <div className="login-bg-panel-bars-v3">
            <div><span>Leitura</span><i style={{ width: '76%' }} /></div>
            <div><span>Escrita</span><i style={{ width: '61%' }} /></div>
            <div><span>Matemática</span><i style={{ width: '69%' }} /></div>
          </div>
        </div>

        <div className="login-bg-panel-v3 panel-right">
          <div className="login-bg-panel-header-v3">
            <span>{Icon.analytics()}</span>
            <strong>Análises e indicadores</strong>
          </div>
          <div className="login-bg-panel-lines-v3">
            <svg viewBox="0 0 220 90" preserveAspectRatio="none">
              <defs>
                <linearGradient id="loginLineGradientV3" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#93c5fd" />
                  <stop offset="100%" stopColor="#22d3ee" />
                </linearGradient>
              </defs>
              <path d="M6 72 C26 69, 40 36, 60 38 S92 76, 120 60 S154 20, 182 28 S206 42, 214 18" />
            </svg>
          </div>
          <div className="login-bg-panel-note-v3">Resultados, metas e acompanhamento institucional</div>
        </div>

        <div className="login-bg-icon-v3 icon-1">{Icon.school()}</div>
        <div className="login-bg-icon-v3 icon-2">{Icon.report()}</div>
        <div className="login-bg-icon-v3 icon-3">{Icon.goal()}</div>
        <div className="login-bg-icon-v3 icon-4">{Icon.chart()}</div>
      </div>

      <div className="login-card-wrap-v3">
        <div className="login-card-v3">
             <div className="login-logo-v3" >{Icon.cpeLogo()}</div>
          <div className="login-card-top-v3">
         
            <div>
              <div className="login-kicker-v3">Controle de Programas Educacionais</div>
              <h1 className="login-title-v3">Acessar o sistema</h1>
             
            </div>
          </div>

      

          {location.state?.sessionExpired && (
            <Alert type="warn">Sua sessão expirou. Entre novamente para continuar.</Alert>
          )}
          {error && <Alert type="error">{error}</Alert>}

          <form onSubmit={submit} className="login-form-v3">
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
              <div className="login-password-wrap-v3">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  className="login-password-toggle-v3"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.89 1 12c.73-2.06 2-3.84 3.6-5.2" />
                      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 8a10.96 10.96 0 0 1-4.24 5.36" />
                      <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" />
                      <path d="M1 1l22 22" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </Field>

            <div className="login-row-v3">
              <span>Use suas credenciais institucionais</span>
              <Link to="/esqueci-senha" className="login-link-v3">
                Esqueci minha senha
              </Link>
            </div>

            <Button type="submit" block disabled={busy} className="login-button-v3">
              {busy ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>

          <div className="login-footer-v3">
            <span>{Icon.lock()} Autenticação segura</span>
            <span>{Icon.chart()} Gestão educacional orientada por dados</span>
          </div>
        </div>
      </div>
    </div>
  );
}
