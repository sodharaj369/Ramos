import { useEffect, useState, useCallback } from "react";
import type { Session, User, AuthChangeEvent } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // 1. Fetch initial session asynchronously
    supabase.auth.getSession().then(({ data: { session: initSession } }) => {
      if (mounted) {
        setSession(initSession);
        setLoading(false);
      }
    });

    // 2. Subscribe to auth state transitions
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, nextSession: Session | null) => {
      if (!mounted) return;

      switch (event) {
        case "INITIAL_SESSION":
        case "SIGNED_IN":
        case "TOKEN_REFRESHED":
        case "USER_UPDATED":
          setSession(nextSession);
          setLoading(false);
          break;

        case "SIGNED_OUT":
          setSession(null);
          setLoading(false);
          break;

        case "PASSWORD_RECOVERY":
          setSession(nextSession);
          setLoading(false);
          break;

        default:
          setSession(nextSession);
          setLoading(false);
          break;
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("[Auth] Error during signOut:", err);
    } finally {
      setSession(null);
    }
  }, []);

  const user: User | null = session?.user ?? null;
  const isEmailConfirmed = Boolean(user?.email_confirmed_at);

  return { session, user, loading, isEmailConfirmed, signOut };
}
