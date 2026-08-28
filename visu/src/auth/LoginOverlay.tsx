import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, LoaderCircle, LockKeyhole, UserRound } from 'lucide-react';
import portalRobotLogo from '../assets/branding/portal-robot-logo.png';

export function LoginOverlay({ loading, error, onLogin }: {
  loading: boolean;
  error: string;
  onLogin: (username: string, password: string) => Promise<void>;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!loading && username.trim() && password) void onLogin(username, password);
  };

  return <div className="auth-glass" role="dialog" aria-modal="true" aria-labelledby="auth-title">
    <form className="login-card" onSubmit={submit}>
      <header>
        <img src={portalRobotLogo} alt="Portal Robot" />
        <span>СИСТЕМА УПРАВЛЕНИЯ ЯЧЕЙКОЙ</span>
        <h1 id="auth-title">Вход в систему</h1>
        <p>Авторизуйтесь для доступа к мониторингу и управлению оборудованием.</p>
      </header>
      <label className="auth-field">
        <span>Логин</span>
        <div><UserRound aria-hidden="true" /><input autoFocus autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} disabled={loading} /></div>
      </label>
      <label className="auth-field">
        <span>Пароль</span>
        <div><LockKeyhole aria-hidden="true" /><input type={passwordVisible ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={loading} /><button type="button" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? 'Скрыть пароль' : 'Показать пароль'}>{passwordVisible ? <EyeOff /> : <Eye />}</button></div>
      </label>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <button className="auth-submit" type="submit" disabled={loading || !username.trim() || !password}>
        {loading ? <LoaderCircle className="spin" aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}
        {loading ? 'Проверка…' : 'Войти'}
      </button>
    </form>
  </div>;
}
