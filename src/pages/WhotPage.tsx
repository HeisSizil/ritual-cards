import { useEffect, useReducer, useRef, useState } from "react";
import { UsernameGate } from "@/components/UsernameGate";
import { ModeSelect, type PlayMode } from "@/components/ModeSelect";
import { ResultOverlay } from "@/components/ResultOverlay";
import { SoundToggleButton } from "@/components/SoundToggleButton";
import { WhotCardView, CardBackView } from "@/components/cards/WhotCardView";
import { useUsername } from "@/context/UsernameContext";
import { useSound } from "@/context/SoundContext";
import { recordMatch } from "@/lib/storage";
import { strategyMeta, type StrategyProfile } from "@/lib/aiStrategy";
import {
  createWhotGame,
  endTurn,
  getPlayableCards,
  playCard,
  resolvePickThree,
  topCard,
  voluntaryDraw,
} from "@/games/whot/engine";
import { chooseWhotMove, pickSuitToCall, shouldPlayDrawnCard } from "@/games/whot/ai";
import { REAL_SUITS } from "@/games/whot/types";
import type { WhotGameState, WhotPlayer, WhotSuit } from "@/games/whot/types";

const WAGER = 0.5;
const OPPONENT_PROFILE: StrategyProfile = "balanced";
const AI_MOVE_DELAY = 2500;

type Action =
  | { type: "PLAY"; who: WhotPlayer; cardId: string; suit?: string }
  | { type: "VOLUNTARY_DRAW"; who: WhotPlayer }
  | { type: "RESOLVE_PICK_THREE"; who: WhotPlayer }
  | { type: "END_TURN" }
  | { type: "RESET" };

function reducer(state: WhotGameState, action: Action): WhotGameState {
  switch (action.type) {
    case "PLAY":
      return playCard(state, action.who, action.cardId, action.suit).state;
    case "VOLUNTARY_DRAW":
      return voluntaryDraw(state, action.who);
    case "RESOLVE_PICK_THREE":
      return resolvePickThree(state, action.who);
    case "END_TURN":
      return endTurn(state);
    case "RESET":
      return createWhotGame();
    default:
      return state;
  }
}

export function WhotPage() {
  return (
    <UsernameGate>
      <WhotGameContainer />
    </UsernameGate>
  );
}

function WhotGameContainer() {
  const [mode, setMode] = useState<PlayMode | null>(null);

  if (!mode) {
    return <ModeSelect gameName="Whot" wagerLabel={`${WAGER} RITUAL`} onStart={setMode} showVoicePicker />;
  }

  return <WhotBoard mode={mode} onExit={() => setMode(null)} />;
}

function WhotBoard({ mode, onExit }: { mode: PlayMode; onExit: () => void }) {
  const { username } = useUsername();
  const { speak, playSfx, playMusic, stopMusic } = useSound();
  const [state, dispatch] = useReducer(reducer, undefined, createWhotGame);
  const [pendingWhotCardId, setPendingWhotCardId] = useState<string | null>(null);
  const stateRef = useRef(state);
  const prevStateRef = useRef(state);
  const timeoutRef = useRef<number | null>(null);
  const recordedRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Background music plays for the life of the table and stops on leave/navigate-away.
  useEffect(() => {
    playMusic();
    return () => stopMusic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Announces only the exact moments the voice system cares about, by diffing each state
  // transition — this covers every dispatch path (manual click, AI orchestration, drawn-card
  // auto-play) from one place instead of scattering speak() calls at every call site.
  useEffect(() => {
    const prev = prevStateRef.current;
    if (prev !== state) {
      const actor = prev.turn;
      if (state.discard.length === prev.discard.length + 1) {
        const played = state.discard[state.discard.length - 1];
        if (played.suit === "Whot" && state.calledSuit) {
          speak(actor === "player" ? `I need ${state.calledSuit}` : `Give me ${state.calledSuit}`);
        } else if (played.number === 2) {
          speak("Pick Two!");
        } else if (played.number === 5) {
          speak("Pick Three!");
        } else if (played.number === 8) {
          speak("Skip you!");
        } else if (played.number === 14) {
          speak("General Market!");
        } else if (played.number === 1) {
          speak("Hold On!");
        }

        if (state.status === "playing" && state.hands[actor].length === 1) {
          speak(actor === "player" ? "Check up!" : "Opponent check up!");
        }
      }

      if (prev.turn !== state.turn && state.status === "playing" && state.hands[state.turn].length === 1) {
        speak(state.turn === "player" ? "Last card!" : "Opponent last card!");
      }

      prevStateRef.current = state;
    }
  }, [state, speak]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [state.log.length]);

  const playerIsAiControlled = mode.mode === "ai";
  const aiProfile = mode.mode === "ai" ? mode.profile : OPPONENT_PROFILE;

  // Orchestrates whichever seat is bot-controlled this turn (built-in opponent, or "AI plays for you").
  useEffect(() => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    if (state.status !== "playing") return;

    const who = state.turn;
    const controlled = who === "ai" || (who === "player" && playerIsAiControlled);
    if (!controlled) return;

    timeoutRef.current = window.setTimeout(() => {
      const s = stateRef.current;
      if (s.status !== "playing" || s.turn !== who) return;

      if (s.pendingPickThree > 0 && getPlayableCards(s, who).length === 0) {
        playSfx("whoosh");
        dispatch({ type: "RESOLVE_PICK_THREE", who });
        return;
      }

      const profile = who === "ai" ? OPPONENT_PROFILE : aiProfile;
      const move = chooseWhotMove(s, who, profile);

      if (move.action === "play") {
        playSfx("click");
        dispatch({ type: "PLAY", who, cardId: move.cardId, suit: move.suit });
        return;
      }

      playSfx("whoosh");
      dispatch({ type: "VOLUNTARY_DRAW", who });
      window.setTimeout(() => {
        const s2 = stateRef.current;
        if (s2.status !== "playing" || s2.turn !== who) return;
        const drawnCard = shouldPlayDrawnCard(s2, who);
        if (drawnCard) {
          const suit = drawnCard.suit === "Whot" ? pickSuitToCall(s2.hands[who], profile) : undefined;
          playSfx("click");
          dispatch({ type: "PLAY", who, cardId: drawnCard.id, suit });
        } else {
          dispatch({ type: "END_TURN" });
        }
      }, AI_MOVE_DELAY);
    }, AI_MOVE_DELAY);

    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, playerIsAiControlled, aiProfile]);

  // Record match once when a hand concludes.
  useEffect(() => {
    if (state.status === "playing" || recordedRef.current) return;
    recordedRef.current = true;
    if (state.status === "player_won") {
      playSfx("win");
      speak("You win!");
    } else {
      playSfx("lose");
      speak("Game over!");
    }
    recordMatch({
      game: "whot",
      result: state.status === "player_won" ? "win" : "loss",
      wager: WAGER,
      opponent: "Ritual AI",
      aiAssisted: playerIsAiControlled,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, playerIsAiControlled]);

  const top = topCard(state);
  const playerPlayable = getPlayableCards(state, "player");
  const isPlayerManualTurn = state.turn === "player" && !playerIsAiControlled && state.status === "playing";
  const canDraw = isPlayerManualTurn && playerPlayable.length === 0 && !state.hasDrawnThisTurn;
  const canPass = isPlayerManualTurn && playerPlayable.length === 0 && state.hasDrawnThisTurn;

  function handlePlayerCardClick(cardId: string, suit: string, isWhot: boolean) {
    if (!isPlayerManualTurn) return;
    const card = state.hands.player.find((c) => c.id === cardId);
    const playable = playerPlayable.some((c) => c.id === cardId);
    if (!playable || !card) return;
    playSfx("click");
    if (isWhot) {
      setPendingWhotCardId(cardId);
      return;
    }
    dispatch({ type: "PLAY", who: "player", cardId, suit });
  }

  function confirmSuit(suit: WhotSuit) {
    if (!pendingWhotCardId) return;
    dispatch({ type: "PLAY", who: "player", cardId: pendingWhotCardId, suit });
    setPendingWhotCardId(null);
  }

  function handlePlayerDraw() {
    playSfx("whoosh");
    if (state.pendingPickThree > 0) {
      dispatch({ type: "RESOLVE_PICK_THREE", who: "player" });
    } else {
      dispatch({ type: "VOLUNTARY_DRAW", who: "player" });
    }
  }

  function resetHand() {
    recordedRef.current = false;
    dispatch({ type: "RESET" });
  }

  const showResult = state.status !== "playing";
  const playerWon = state.status === "player_won";

  return (
    <div className="container section" style={{ paddingBottom: "3rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
          <span className="chip chip-gold">Wager {WAGER} RITUAL</span>
          {playerIsAiControlled && (
            <span className="chip chip-pink">AI playing for {username} · {strategyMeta(aiProfile).label}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <SoundToggleButton />
          <button type="button" className="btn btn-ghost btn-sm" onClick={onExit}>
            Leave table
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "1.5rem" }} className="whot-layout">
        <div>
          {/* Opponent */}
          <SeatBar
            label="Ritual AI"
            handCount={state.hands.ai.length}
            active={state.turn === "ai" && state.status === "playing"}
            accent="pink"
          />
          <div style={{ display: "flex", justifyContent: "center", gap: "0.3rem", marginBottom: "2rem", flexWrap: "wrap" }}>
            {state.hands.ai.map((_, i) => (
              <CardBackView key={i} size="sm" />
            ))}
          </div>

          {/* Table center */}
          <div className="panel" style={{ padding: "1.75rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "2rem", flexWrap: "wrap", marginBottom: "2rem" }}>
            <div style={{ textAlign: "center" }}>
              <div className="data-label" style={{ marginBottom: "0.6rem" }}>
                Draw Pile ({state.drawPile.length})
              </div>
              <button
                type="button"
                onClick={() => canDraw && handlePlayerDraw()}
                disabled={!canDraw}
                style={{ background: "none", border: "none", padding: 0, cursor: canDraw ? "pointer" : "default" }}
                aria-label="Draw a card"
              >
                <CardBackView />
              </button>
            </div>
            <div style={{ textAlign: "center" }}>
              <div className="data-label" style={{ marginBottom: "0.6rem" }}>
                Top Card
              </div>
              <WhotCardView card={top} size="md" dealt />
              {state.calledSuit && (
                <div className="chip chip-pink" style={{ marginTop: "0.75rem" }}>
                  Called: {state.calledSuit}
                </div>
              )}
              {state.pendingPickThree > 0 && (
                <div className="chip chip-gold" style={{ marginTop: "0.75rem" }}>
                  Pick Three pending — draw {state.pendingPickThree} or defend with a 5
                </div>
              )}
              {state.holdOnFreePlay && (
                <div className="chip chip-green" style={{ marginTop: "0.75rem" }}>
                  Hold On — play again, any suit
                </div>
              )}
            </div>
          </div>

          {(canDraw || canPass) && (
            <div style={{ display: "flex", justifyContent: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
              {canDraw && (
                <button type="button" className="btn btn-gold" onClick={handlePlayerDraw}>
                  {state.pendingPickThree > 0 ? `Draw ${state.pendingPickThree} (Pick Three)` : "Draw Card"}
                </button>
              )}
              {canPass && (
                <button type="button" className="btn btn-ghost" onClick={() => dispatch({ type: "END_TURN" })}>
                  Pass Turn
                </button>
              )}
            </div>
          )}

          {/* Player hand */}
          <SeatBar
            label={username ?? "You"}
            handCount={state.hands.player.length}
            active={state.turn === "player" && state.status === "playing"}
            accent="green"
          />
          <div style={{ display: "flex", justifyContent: "center", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
            {state.hands.player.map((card) => {
              const isPlayable = isPlayerManualTurn && playerPlayable.some((c) => c.id === card.id);
              return (
                <WhotCardView
                  key={card.id}
                  card={card}
                  interactive={isPlayerManualTurn}
                  disabled={isPlayerManualTurn && !isPlayable}
                  selected={pendingWhotCardId === card.id}
                  onClick={() => handlePlayerCardClick(card.id, card.suit, card.suit === "Whot")}
                />
              );
            })}
          </div>
        </div>

        {/* Log panel */}
        <aside className="panel" style={{ padding: "1rem", maxHeight: 520, display: "flex", flexDirection: "column" }}>
          <div className="data-label" style={{ marginBottom: "0.75rem" }}>
            Match Log
          </div>
          <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {state.log.map((entry) => (
              <div
                key={entry.id}
                style={{
                  fontSize: "0.8rem",
                  color: entry.tone === "good" ? "var(--green)" : entry.tone === "bad" ? "var(--red)" : entry.tone === "special" ? "var(--gold)" : "var(--gray-400)",
                }}
              >
                {entry.text}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </aside>
      </div>

      {pendingWhotCardId && (
        <SuitPicker onPick={confirmSuit} onCancel={() => setPendingWhotCardId(null)} />
      )}

      {showResult && (
        <ResultOverlay
          won={playerWon}
          title={playerWon ? "You Win!" : "AI Wins"}
          subtitle={playerWon ? "You emptied your hand first." : "Ritual AI emptied its hand first."}
          payoutText={playerWon ? `${(WAGER * 2).toFixed(2)} RITUAL to your wallet` : "Better luck next hand"}
          onPlayAgain={resetHand}
          onExit={onExit}
        />
      )}
    </div>
  );
}

function SeatBar({ label, handCount, active, accent }: { label: string; handCount: number; active: boolean; accent: "green" | "pink" }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ fontWeight: 600, color: "var(--gray-200)" }}>{label}</span>
        <span className="hex">{handCount} cards</span>
      </div>
      {active && (
        <span className={`chip ${accent === "green" ? "chip-green" : "chip-pink"}`}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: `var(--${accent})` }} className="pulse-dot" />
          Turn
        </span>
      )}
    </div>
  );
}

function SuitPicker({ onPick, onCancel }: { onPick: (suit: WhotSuit) => void; onCancel: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Call a suit"
      style={{ position: "fixed", inset: 0, background: "var(--bg-overlay)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 90 }}
    >
      <div className="panel float-in" style={{ padding: "1.75rem", maxWidth: 340, width: "100%" }}>
        <h3 style={{ fontSize: "1.1rem", marginBottom: "1rem", textAlign: "center" }}>Call a suit</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
          {REAL_SUITS.filter((s) => s !== "Whot").map((suit) => (
            <button key={suit} type="button" className="btn btn-ghost" onClick={() => onPick(suit)}>
              {suit}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: "0.85rem" }} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
