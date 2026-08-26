import React from "react";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({
  children,
  adminOnly = false,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
}) {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  if (adminOnly && user?.role !== "admin") {
    return <Redirect to="/" />;
  }

  return <>{children}</>;
}
