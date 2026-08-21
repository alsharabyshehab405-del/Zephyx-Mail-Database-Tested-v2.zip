import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { User } from "@workspace/api-client-react";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  accessToken: string | null;
  login: (tokens: { accessToken: string; refreshToken: string }, user: User) => void;
  logout: () => void;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

function readStoredUser(): User | null {
  try {
    const saved = localStorage.getItem("novamail-user");
    return saved ? (JSON.parse(saved) as User) : null;
  } catch {
    localStorage.removeItem("novamail-user");
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(readStoredUser);
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    localStorage.getItem("novamail-access"),
  );

  const login = useCallback(
    (tokens: { accessToken: string; refreshToken: string }, nextUser: User) => {
      setAccessToken(tokens.accessToken);
      setUser(nextUser);
      localStorage.setItem("novamail-access", tokens.accessToken);
      localStorage.setItem("novamail-refresh", tokens.refreshToken);
      localStorage.setItem("novamail-user", JSON.stringify(nextUser));
    },
    [],
  );

  const logout = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    localStorage.removeItem("novamail-access");
    localStorage.removeItem("novamail-refresh");
    localStorage.removeItem("novamail-user");
  }, []);

  const updateUser = useCallback((updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem("novamail-user", JSON.stringify(updatedUser));
  }, []);

  useEffect(() => {
    const handleExpired = () => logout();
    const handleRefreshed = (event: Event) => {
      const detail = (event as CustomEvent<{ accessToken?: string; user?: User }>).detail;
      if (detail?.accessToken) setAccessToken(detail.accessToken);
      if (detail?.user) setUser(detail.user);
    };

    window.addEventListener("novamail-auth-expired", handleExpired);
    window.addEventListener("novamail-auth-refreshed", handleRefreshed);
    return () => {
      window.removeEventListener("novamail-auth-expired", handleExpired);
      window.removeEventListener("novamail-auth-refreshed", handleRefreshed);
    };
  }, [logout]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user && accessToken),
        accessToken,
        login,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
