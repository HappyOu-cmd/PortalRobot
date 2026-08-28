import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, LoaderCircle, Pencil, Plus, ShieldCheck, Trash2, UserRound, X } from 'lucide-react';
import { authApi, type AppUser, type UserDraft } from './client';

const EMPTY_DRAFT: UserDraft = { username: '', displayName: '', password: '', role: 'operator', enabled: true, shiftPlan: 0 };
const NEW_DISPLAY_NAME_MAX_LENGTH = 20;
const roleName = (role: AppUser['role']) => role === 'admin' ? 'Администратор' : 'Оператор';
const dateTime = (value: number | null) => value ? new Date(value).toLocaleString('ru-RU') : 'Никогда';

export function UserManagementPanel({ currentUser, onCurrentUserChange, onUnauthorized, onClose, className }: {
  currentUser: AppUser;
  onCurrentUserChange: (user: AppUser) => void;
  onUnauthorized: () => void;
  onClose: () => void;
  className?: string;
}) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [draft, setDraft] = useState<UserDraft>(EMPTY_DRAFT);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fail = (value: unknown) => {
    const message = value instanceof Error ? value.message : String(value);
    setError(message);
    if (typeof value === 'object' && value !== null && 'status' in value && Number(value.status) === 401) onUnauthorized();
  };
  const load = async () => {
    setLoading(true);
    try { setUsers(await authApi.listUsers()); setError(''); }
    catch (value) { fail(value); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const beginCreate = () => { setEditingId('new'); setDraft({ ...EMPTY_DRAFT }); setPasswordVisible(false); setError(''); };
  const beginEdit = (user: AppUser) => {
    setEditingId(user.id);
    setDraft({ username: user.username, displayName: user.displayName, role: user.role, enabled: user.enabled, shiftPlan: user.shiftPlan ?? 0, password: '' });
    setPasswordVisible(false);
    setError('');
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const saved = editingId === 'new'
        ? await authApi.createUser(draft)
        : await authApi.updateUser(Number(editingId), { ...draft, password: draft.password || undefined });
      setUsers((current) => editingId === 'new'
        ? [...current, saved].sort((a, b) => a.username.localeCompare(b.username))
        : current.map((user) => user.id === saved.id ? saved : user));
      if (saved.id === currentUser.id) onCurrentUserChange(saved);
      setEditingId(null);
    } catch (value) { fail(value); }
    finally { setSaving(false); }
  };
  const remove = async (user: AppUser) => {
    if (!window.confirm(`Удалить пользователя «${user.displayName}» (${user.username})? Это действие нельзя отменить.`)) return;
    setError('');
    try { await authApi.deleteUser(user.id); setUsers((current) => current.filter((item) => item.id !== user.id)); }
    catch (value) { fail(value); }
  };

  return <aside className={`side-panel user-management-panel ${className ?? ''}`}>
    <header className="panel-heading"><div><span>АДМИНИСТРИРОВАНИЕ</span><h2>Пользователи</h2></div><button type="button" onClick={onClose} aria-label="Закрыть"><X /></button></header>
    <div className="user-management-toolbar">
      <div><ShieldCheck /><span><b>Учётные записи</b><small>{users.length} зарегистрировано</small></span></div>
      <button type="button" onClick={beginCreate}><Plus />Новый пользователь</button>
    </div>
    {currentUser.mustChangePassword && <div className="bootstrap-warning"><LockWarning />Встроенная запись использует временный пароль. Откройте её и задайте новый пароль.</div>}
    {error && <div className="user-management-error" role="alert">{error}</div>}
    <div className="user-list">
      {loading ? <div className="user-list-loading"><LoaderCircle className="spin" />Загрузка пользователей…</div> : users.map((user) => <article className={!user.enabled ? 'disabled' : ''} key={user.id}>
        <div className="user-avatar"><UserRound /></div>
        <div className="user-identity"><strong>{user.displayName}</strong><span>@{user.username}</span></div>
        <div className={`user-role ${user.role}`}><ShieldCheck />{roleName(user.role)}</div>
        <div className="user-last-login"><span>Последний вход</span><b>{dateTime(user.lastLoginAt)}</b></div>
        <div className={`user-state ${user.enabled ? 'enabled' : ''}`}><i />{user.enabled ? 'Активен' : 'Отключён'}</div>
        <div className="user-actions"><button type="button" onClick={() => beginEdit(user)} aria-label={`Изменить ${user.username}`}><Pencil /></button><button type="button" disabled={user.id === currentUser.id} onClick={() => void remove(user)} aria-label={`Удалить ${user.username}`}><Trash2 /></button></div>
      </article>)}
    </div>
    {editingId !== null && <div className="user-editor-backdrop" role="dialog" aria-modal="true" aria-labelledby="user-editor-title">
      <form className="user-editor" onSubmit={submit}>
        <header><div><span>{editingId === 'new' ? 'РЕГИСТРАЦИЯ' : 'РЕДАКТИРОВАНИЕ'}</span><h3 id="user-editor-title">{editingId === 'new' ? 'Новый пользователь' : 'Параметры учётной записи'}</h3></div><button type="button" onClick={() => setEditingId(null)} aria-label="Закрыть"><X /></button></header>
        <div className="user-editor-grid">
          <label><span>Логин</span><input autoFocus value={draft.username} onChange={(event) => setDraft({ ...draft, username: event.target.value })} autoComplete="off" required /></label>
          <label><span>Отображаемое имя{editingId === 'new' && <small>до {NEW_DISPLAY_NAME_MAX_LENGTH} символов</small>}</span><input value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: editingId === 'new' ? event.target.value.slice(0, NEW_DISPLAY_NAME_MAX_LENGTH) : event.target.value })} maxLength={editingId === 'new' ? NEW_DISPLAY_NAME_MAX_LENGTH : undefined} required /></label>
          <label><span>Роль</span><select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as AppUser['role'] })}><option value="operator">Оператор</option><option value="admin">Администратор</option></select></label>
          <label><span>План деталей на смену</span><input type="number" min={0} max={1000000} step={1} value={draft.shiftPlan} onChange={(event) => setDraft({ ...draft, shiftPlan: Math.max(0, Math.round(Number(event.target.value) || 0)) })} disabled={draft.role !== 'operator'} /></label>
          <label className="user-password-field"><span>{editingId === 'new' ? 'Пароль' : 'Новый пароль (необязательно)'}</span><div><input type={passwordVisible ? 'text' : 'password'} value={draft.password ?? ''} onChange={(event) => setDraft({ ...draft, password: event.target.value })} autoComplete="new-password" minLength={editingId === 'new' ? 8 : undefined} required={editingId === 'new'} /><button type="button" onClick={() => setPasswordVisible((value) => !value)} aria-label={passwordVisible ? 'Скрыть пароль' : 'Показать пароль'}>{passwordVisible ? <EyeOff /> : <Eye />}</button></div></label>
        </div>
        <label className="user-enabled-toggle"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} disabled={editingId === currentUser.id} /><span><b>Учётная запись активна</b><small>Отключённый пользователь не сможет войти, а его сессии будут завершены.</small></span></label>
        <footer><button type="button" onClick={() => setEditingId(null)}>Отмена</button><button className="primary" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : null}{editingId === 'new' ? 'Создать' : 'Сохранить'}</button></footer>
      </form>
    </div>}
  </aside>;
}

function LockWarning() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5m0 4h.01M10 3.5 2.8 16a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L14 3.5a2.3 2.3 0 0 0-4 0Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}
