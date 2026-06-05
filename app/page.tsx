"use client";
import { StoreProvider, useStore } from "@/lib/store";
import { TopNav } from "@/components/top-nav";
import { SignalsPage } from "@/components/signals/page";
import { WipPage } from "@/components/wip/page";
import { SourcesPage } from "@/components/sources/page";
import { HistoryPage } from "@/components/history/page";
import { RoadmapPage } from "@/components/roadmap/page";
import { UndoToast } from "@/components/ui/undo-toast";
import { SplitEditView } from "@/components/signal-modal/split-edit-view";

function Shell() {
  const { route, density } = useStore();

  return (
    <div
      id="app"
      data-density={density}
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <TopNav />
      <main style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {route === "signals" && <SignalsPage />}
        {route === "wip" && <WipPage />}
        {route === "roadmap" && <RoadmapPage />}
        {route === "sources" && <SourcesPage />}
        {route === "history" && <HistoryPage />}
      </main>
      <UndoToast />
      <SplitEditView />
    </div>
  );
}

export default function Home() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
