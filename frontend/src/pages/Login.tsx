import { useState } from 'react';
import { Eye, EyeOff, LockKeyhole, LogIn, ShieldCheck } from 'lucide-react';
import { useAuth } from '../api/auth-context';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { Button } from '../components/ui/Button';
import { Field, TextInput } from '../components/ui/Field';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation(['auth', 'common']);

  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!loginName.trim() || !password.trim()) {
      setError(t('auth:login.missingCredentials'));
      return;
    }

    setError(null);
    setIsPending(true);

    try {
      await login({
        login_name: loginName.trim(),
        password: password.trim(),
      });
      navigate('/');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t('auth:login.unexpectedError'));
      }
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-canvas p-4 font-sans text-slate-100 sm:p-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(124,58,237,0.16),transparent_36%),linear-gradient(145deg,#020617_0%,#0f172a_55%,#160c2c_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-[linear-gradient(transparent,rgba(2,6,23,0.72))]"
      />

      <header className="absolute top-4 right-4 z-10 sm:top-6 sm:right-6">
        <LanguageSwitcher compact />
      </header>

      <main className="relative z-10 grid w-full max-w-4xl overflow-hidden rounded-panel border border-border-subtle bg-surface-raised/90 shadow-2xl shadow-black/30 backdrop-blur-xl md:grid-cols-[0.9fr_1.1fr]">
        <aside className="hidden flex-col justify-between border-r border-border-subtle bg-[linear-gradient(155deg,rgba(124,58,237,0.16),rgba(15,23,42,0.15))] p-8 md:flex lg:p-10">
          <div>
            <div className="mb-10 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-control bg-accent-strong text-xl font-black text-white shadow-lg shadow-purple-950/40">
                D
              </div>
              <span className="text-xl font-black tracking-tight text-slate-100">DokerFace</span>
            </div>
            <p className="max-w-xs text-3xl font-black leading-tight tracking-tight text-slate-100">
              {t('auth:login.tagline')}
            </p>
            <div className="mt-8 flex items-center gap-2 text-xs font-semibold text-slate-400">
              <ShieldCheck className="h-4 w-4 text-success" />
              {t('auth:login.privateTable')}
            </div>
          </div>
          <p className="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
            {t('auth:login.footer')}
          </p>
        </aside>

        <section className="p-6 sm:p-8 lg:p-10">
          <div className="mb-8 flex items-center gap-3 md:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-control bg-accent-strong text-lg font-black text-white">
              D
            </div>
            <span className="text-xl font-black tracking-tight text-slate-100">
              {t('common:appName')}
            </span>
          </div>

          <div className="mb-8">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-control border border-accent-border bg-accent-muted text-accent-text">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-100">
              {t('auth:login.title')}
            </h1>
            <p className="mt-2 text-sm text-slate-400">{t('auth:login.subtitle')}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {error && (
              <div
                role="alert"
                className="animate-fade-in rounded-control border border-danger-border bg-danger-surface px-4 py-3 text-sm font-medium text-danger"
              >
                {error}
              </div>
            )}

            <Field label={t('auth:login.usernameLabel')}>
              {(props) => (
                <TextInput
                  {...props}
                  type="text"
                  autoComplete="username"
                  value={loginName}
                  onChange={(event) => setLoginName(event.target.value)}
                  disabled={isPending}
                  placeholder={t('auth:login.usernamePlaceholder')}
                />
              )}
            </Field>

            <Field label={t('auth:login.passwordLabel')}>
              {(props) => (
                <div className="relative">
                  <TextInput
                    {...props}
                    className="pr-11"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={isPending}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    aria-label={
                      showPassword ? t('auth:login.hidePassword') : t('auth:login.showPassword')
                    }
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="focus-ring absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-control text-slate-500 transition-colors hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              )}
            </Field>

            <Button
              type="submit"
              width="full"
              size="lg"
              disabled={isPending}
              className="mt-3 shadow-lg shadow-purple-950/20"
            >
              {isPending ? (
                <>
                  <span className="border-current h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />
                  {t('auth:login.submitting')}
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  {t('auth:login.submit')}
                </>
              )}
            </Button>
          </form>
        </section>
      </main>
    </div>
  );
}
