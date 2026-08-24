import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { getUsername, setUsername as persistUsername, clearUsername } from "@/lib/storage";

interface UsernameContextValue {
  username: string | null;
  setUsername: (name: string) => void;
  clear: () => void;
}

const UsernameContext = createContext<UsernameContextValue | null>(null);

export function UsernameProvider({ children }: { children: ReactNode }) {
  const [username, setUsernameState] = useState<string | null>(() => getUsername());

  const value = useMemo<UsernameContextValue>(
    () => ({
      username,
      setUsername: (name: string) => {
        const trimmed = name.trim().slice(0, 20);
        if (!trimmed) return;
        persistUsername(trimmed);
        setUsernameState(trimmed);
      },
      clear: () => {
        clearUsername();
        setUsernameState(null);
      },
    }),
    [username],
  );

  return <UsernameContext.Provider value={value}>{children}</UsernameContext.Provider>;
}

export function useUsername() {
  const ctx = useContext(UsernameContext);
  if (!ctx) throw new Error("useUsername must be used within UsernameProvider");
  return ctx;
}
