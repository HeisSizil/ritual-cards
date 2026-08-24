import { Routes, Route } from "react-router-dom";
import { UsernameProvider } from "@/context/UsernameContext";
import { SoundProvider } from "@/context/SoundContext";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Landing } from "@/pages/Landing";
import { WhotPage } from "@/pages/WhotPage";
import { PokerPage } from "@/pages/PokerPage";
import { MultiplayerPage } from "@/pages/MultiplayerPage";
import { LeaderboardPage } from "@/pages/LeaderboardPage";
import { FairnessPage } from "@/pages/FairnessPage";

export default function App() {
  return (
    <UsernameProvider>
      <SoundProvider>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Header />
        <main id="main">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/whot" element={<WhotPage />} />
            <Route path="/poker" element={<PokerPage />} />
            <Route path="/multiplayer" element={<MultiplayerPage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/fairness" element={<FairnessPage />} />
          </Routes>
        </main>
        <Footer />
      </SoundProvider>
    </UsernameProvider>
  );
}
