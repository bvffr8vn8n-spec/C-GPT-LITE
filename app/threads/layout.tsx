import { ReactNode } from "react";
import ThreadsSidebar from "./ThreadsSidebar";

export default function ThreadsLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "#0a0a0a",
        color: "#fff",
      }}
    >
      <ThreadsSidebar />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

