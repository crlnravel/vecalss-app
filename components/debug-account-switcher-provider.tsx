"use client";

import { createContext, useContext } from "react";

const DebugAccountSwitcherContext = createContext(false);

function DebugAccountSwitcherProvider({
  children,
  enabled,
}: {
  children: React.ReactNode;
  enabled: boolean;
}) {
  return (
    <DebugAccountSwitcherContext.Provider value={enabled}>
      {children}
    </DebugAccountSwitcherContext.Provider>
  );
}

function useDebugAccountSwitcher() {
  return useContext(DebugAccountSwitcherContext);
}

export { DebugAccountSwitcherProvider, useDebugAccountSwitcher };
