import React from "react";

export default function EmulatorModal({ children }) {
  return (
    <div
      className="w-screen min-h-screen bg-neutral-900 overflow-auto"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        justifyContent: "flex-start",
      }}
    >
      {children}
    </div>
  );
}
