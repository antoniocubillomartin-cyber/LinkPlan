'use client';

import { useState } from 'react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/authContext';
import type { User } from '@/types';

type Mode = 'idle' | 'register' | 'login';

export function LoginScreen() {
  const { setUser } = useAuth();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [mode, setMode] = useState<Mode>('idle');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const normalized = username.trim().toLowerCase();

  async function handleContinue(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (normalized.length < 3) {
      setError('El nombre de usuario debe tener al menos 3 caracteres.');
      return;
    }
    setBusy(true);
    try {
      const options = await api.auth.loginOptions({ username: normalized });
      setMode('login');
      const response = await startAuthentication({ optionsJSON: options as Parameters<typeof startAuthentication>[0]['optionsJSON'] });
      const user = await api.auth.loginVerify({ username: normalized, response });
      setUser(user);
    } catch (err) {
      const e = err as Error & { status?: number };
      if (e.status === 404) {
        setMode('register');
        setBusy(false);
        return;
      }
      setError(e.message ?? 'No se pudo entrar.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (displayName.trim().length < 1) {
      setError('Pon tu nombre.');
      return;
    }
    setBusy(true);
    try {
      const options = await api.auth.registerOptions({ username: normalized, name: displayName.trim() });
      const response = await startRegistration({ optionsJSON: options as Parameters<typeof startRegistration>[0]['optionsJSON'] });
      const user: User = await api.auth.registerVerify({ username: normalized, name: displayName.trim(), response });
      setUser(user);
    } catch (err) {
      const e = err as Error;
      setError(e.message ?? 'No se pudo crear la cuenta.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-[#EFE9E0] bg-white shadow-xl shadow-[#1A1714]/5">
        <div className="h-1.5 bg-gradient-to-r from-[#C4673A] via-[#E0A258] to-[#6B8F71]" />
        <div className="p-8">
          <div className="mb-6 flex flex-col items-center text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Gatos y Cañas" className="h-16 w-auto object-contain" />
            <p className="mt-2 text-xs uppercase tracking-[0.28em] text-[#B79B68]">Gatos y Cañas</p>
            <h1 className="mt-1 text-3xl font-semibold">Entra con tu huella</h1>
            <p className="mt-2 text-sm text-[#6B5D4F]">
              Sin contraseñas. Sin emails. Tu dispositivo guarda una clave única que solo se desbloquea con tu huella, Face ID o PIN.
            </p>
          </div>

        {mode !== 'register' ? (
          <form onSubmit={handleContinue} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium">Nombre de usuario</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ej: claudia"
                autoFocus
                autoComplete="username webauthn"
                className="mt-1 w-full px-4 py-3 rounded-xl border border-[#EFE9E0] focus:outline-none focus:border-[#B79B68]"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full px-4 py-3 rounded-xl bg-[#1A1714] text-white font-medium hover:bg-black disabled:opacity-50"
            >
              {busy ? 'Conectando…' : 'Continuar'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <p className="text-sm bg-[#FAF7F2] border border-[#EFE9E0] rounded-xl p-3">
              <strong>{normalized}</strong> no existe todavía. Vamos a crear tu cuenta.
            </p>
            <label className="block">
              <span className="text-sm font-medium">Tu nombre (para mostrar)</span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Claudia"
                autoFocus
                className="mt-1 w-full px-4 py-3 rounded-xl border border-[#EFE9E0] focus:outline-none focus:border-[#B79B68]"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full px-4 py-3 rounded-xl bg-[#1A1714] text-white font-medium hover:bg-black disabled:opacity-50"
            >
              {busy ? 'Creando…' : 'Crear cuenta con passkey'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('idle');
                setDisplayName('');
                setError(null);
              }}
              className="w-full px-4 py-2 text-sm text-[#6B5D4F] hover:text-[#1A1714]"
            >
              Volver
            </button>
          </form>
        )}

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
