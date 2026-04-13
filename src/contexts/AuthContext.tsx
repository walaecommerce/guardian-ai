import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  amazon_store_url: string | null;
  onboarding_complete: boolean;
  disabled: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  isAdmin: boolean;
  isDisabled: boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  markOnboardingComplete: (amazonStoreUrl?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const fetchAdminRole = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    setIsAdmin(!!data);
  }, []);

  const fetchProfile = useCallback(async (userId: string, userMeta?: Record<string, any>) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code === 'PGRST116') {
        // No profile found — upsert one (trigger may not have fired yet)
        const { data: newProfile, error: upsertError } = await supabase
          .from('user_profiles')
          .upsert({
            id: userId,
            email: userMeta?.email || null,
            full_name: userMeta?.full_name || userMeta?.name || null,
            avatar_url: userMeta?.avatar_url || userMeta?.picture || null,
            onboarding_complete: false,
          })
          .select()
          .single();

        if (upsertError) {
          console.error('Profile upsert error:', upsertError);
          // Create in-memory fallback so user isn't blocked
          setProfile({
            id: userId,
            email: userMeta?.email || null,
            full_name: userMeta?.full_name || userMeta?.name || null,
            avatar_url: userMeta?.avatar_url || userMeta?.picture || null,
            amazon_store_url: null,
            onboarding_complete: false,
          });
          return;
        }

        setProfile(newProfile as UserProfile);
        return;
      }

      if (error) {
        console.error('Profile fetch error:', error);
        // Fallback profile
        setProfile({
          id: userId,
          email: userMeta?.email || null,
          full_name: userMeta?.full_name || userMeta?.name || null,
          avatar_url: userMeta?.avatar_url || userMeta?.picture || null,
          amazon_store_url: null,
          onboarding_complete: false,
        });
        return;
      }

      setProfile(data as UserProfile);
    } catch (err) {
      console.error('Unexpected profile error:', err);
      setProfile({
        id: userId,
        email: null,
        full_name: null,
        avatar_url: null,
        amazon_store_url: null,
        onboarding_complete: false,
      });
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await fetchProfile(user.id, user.user_metadata);
    }
  }, [user, fetchProfile]);

  const markOnboardingComplete = useCallback(async (amazonStoreUrl?: string) => {
    if (!user) return;
    const updates: Record<string, any> = { onboarding_complete: true };
    if (amazonStoreUrl) updates.amazon_store_url = amazonStoreUrl;

    await supabase
      .from('user_profiles')
      .update(updates)
      .eq('id', user.id);

    await refreshProfile();
  }, [user, refreshProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  }, []);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (newSession?.user) {
          setTimeout(() => {
            (async () => {
              const { data: validatedUser, error: validateError } = await supabase.auth.getUser();

              if (validateError || !validatedUser.user) {
                await supabase.auth.signOut();
                setSession(null);
                setUser(null);
                setProfile(null);
                setIsLoading(false);
                return;
              }

              setSession(newSession);
              setUser(validatedUser.user);
              await fetchProfile(validatedUser.user.id, validatedUser.user.user_metadata);
              await fetchAdminRole(validatedUser.user.id);
              setIsLoading(false);
            })();
          }, 0);
        } else {
          setSession(null);
          setUser(null);
          setProfile(null);
          setIsLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session: existingSession } }) => {
      if (existingSession?.user) {
        const { data: validatedUser, error: validateError } = await supabase.auth.getUser();

        if (validateError || !validatedUser.user) {
          await supabase.auth.signOut();
          setSession(null);
          setUser(null);
          setProfile(null);
          setIsLoading(false);
          return;
        }

        setSession(existingSession);
        setUser(validatedUser.user);
        fetchProfile(validatedUser.user.id, validatedUser.user.user_metadata)
          .then(() => fetchAdminRole(validatedUser.user.id))
          .finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile, fetchAdminRole]);

  return (
    <AuthContext.Provider value={{ user, session, profile, isAdmin, isLoading, signOut, refreshProfile, markOnboardingComplete }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuthContext must be used within AuthProvider');
  return context;
}
