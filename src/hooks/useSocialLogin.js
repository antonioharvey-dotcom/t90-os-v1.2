import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";

// Invoke directly within the tap handler so Safari popup user activation is
// preserved. The SDK can return void for redirects: that is not proof that
// navigation occurred. Recover when the wrapper blocks it or the user returns.
export function useSocialLogin({ onError }) {
  const [provider, setProvider] = useState(null);
  const attempt = useRef(0);
  const timer = useRef(null);
  const busy = useRef(false);
  const errorHandler = useRef(onError);
  errorHandler.current = onError;
  const reset = () => {
    attempt.current += 1;
    clearTimeout(timer.current);
    busy.current = false;
    setProvider(null);
  };
  useEffect(() => {
    window.addEventListener("pageshow", reset);
    return () => {
      window.removeEventListener("pageshow", reset);
      attempt.current += 1;
      clearTimeout(timer.current);
    };
  }, []);

  const start = (nextProvider, destination) => {
    if (busy.current) return;
    busy.current = true;
    setProvider(nextProvider);
    const currentAttempt = ++attempt.current;
    const fail = () => {
      if (attempt.current !== currentAttempt) return;
      reset();
      errorHandler.current(`We couldn't open ${nextProvider === "apple" ? "Sign in with Apple" : "Google sign-in"}. Please try again or sign in with email.`);
    };
    timer.current = setTimeout(fail, 20000);
    try {
      Promise.resolve(base44.auth.loginWithProvider(nextProvider, destination)).catch(fail);
    } catch (_error) {
      fail();
    }
  };
  return { socialLoading: provider, startSocialLogin: start };
}