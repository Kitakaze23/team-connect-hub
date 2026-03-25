import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface CompanyMembership {
  company_id: string;
  company_name: string;
  role: "admin" | "user";
  status: "pending" | "approved" | "rejected";
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  membership: CompanyMembership | null;
  membershipLoading: boolean;
  isPlatformAdmin: boolean;
  signOut: () => Promise<void>;
  refreshMembership: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [membership, setMembership] = useState<CompanyMembership | null>(null);
  const [membershipLoading, setMembershipLoading] = useState(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const currentUserRef = useRef<User | null>(null);
  const currentMembershipRef = useRef<CompanyMembership | null>(null);

  useEffect(() => {
    currentUserRef.current = user;
  }, [user]);

  useEffect(() => {
    currentMembershipRef.current = membership;
  }, [membership]);

  const fetchMembership = async (userId: string) => {
    setMembershipLoading(true);
    try {
      const { data, error } = await supabase
        .from("company_members")
        .select("company_id, status, role")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        setMembership(null);
        setMembershipLoading(false);
        return;
      }

      // Fetch company name and status
      const { data: company } = await supabase
        .from("companies")
        .select("name, status")
        .eq("id", data.company_id)
        .maybeSingle();

      setMembership({
        company_id: data.company_id,
        company_name: company?.name || "",
        role: data.role as "admin" | "user",
        status: data.status as "pending" | "approved" | "rejected",
        company_status: (company?.status as "active" | "suspended") || "active",
      });
    } catch {
      setMembership(null);
    }
    setMembershipLoading(false);
  };

  const refreshMembership = async () => {
    if (user) await fetchMembership(user.id);
  };

  const checkPlatformAdmin = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "platform_admin")
      .maybeSingle();
    setIsPlatformAdmin(!!data);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          const isSameUser = currentUserRef.current?.id === session.user.id;
          const hasLoadedMembership = currentMembershipRef.current !== null;
          const isBackgroundAuthRefresh = (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")
            && isSameUser
            && hasLoadedMembership;

          if (!isBackgroundAuthRefresh) {
            setTimeout(() => {
              fetchMembership(session.user.id);
              checkPlatformAdmin(session.user.id);
            }, 0);
          }
        } else {
          setMembership(null);
          setMembershipLoading(false);
          setIsPlatformAdmin(false);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchMembership(session.user.id);
        checkPlatformAdmin(session.user.id);
      } else {
        setMembershipLoading(false);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Realtime subscription for membership changes
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("my-membership")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "company_members", filter: `user_id=eq.${user.id}` },
        () => fetchMembership(user.id)
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setMembership(null);
    setIsPlatformAdmin(false);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, membership, membershipLoading, isPlatformAdmin, signOut, refreshMembership }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
