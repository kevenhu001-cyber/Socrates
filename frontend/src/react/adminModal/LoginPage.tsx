import { useState, type FormEvent } from 'react';

import { loginAdmin } from './adminApi';

export function LoginPage({ onReady }: { onReady: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await loginAdmin(password);
      onReady();
    } catch (cause) {
      setError((cause as Error).message || 'Login failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-login">
      <h2>Admin console</h2>
      <p className="admin-hint">Enter the operator password to manage the system model and embedding provider.</p>
      <form onSubmit={submit}>
        <label>
          Admin password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            autoFocus
            required
          />
        </label>
        {error && <div className="admin-error" role="alert">{error}</div>}
        <button type="submit" className="admin-save" disabled={busy || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
