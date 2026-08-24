import { useEffect, useReducer, useRef, useState } from "react";
import { UsernameGate } from "@/components/UsernameGate";
import { ModeSelect, type PlayMode } from "@/components/ModeSelect";
import { ResultOverlay } from "@/components/ResultOverlay";
import { SoundToggleButton } from "@/components/SoundToggleButton";
import { PlayingCardView } from "@/components/cards/PlayingCardView";
import { CardBackView } from "@/components/cards/WhotCardView";
import { useUsername } from "@/context/UsernameContext";
import { useSound } from "@/context/SoundContext";
import { getPokerBalance, setPokerBalance, recordMatch } from "@/lib/storage";
import { strategyMeta, type StrategyProfile } from "@/lib/aiStrategy";
import { applyAction, callAmount, canCheck, startNewHand } from "@/games/poker/engine";
import { chooseAiPokerAction } from "@/games/poker/ai";
import type { PokerAction, PokerGameState, PokerSeat } from "@/games/poker/types";

const OPPONENT_PROFILE: StrategyProfile = "balanced";
const AI_STARTING_STACK = 12;

type ReducerAction =
  | { type: "START"; playerStack: number; aiStack: number; handNumber: number; dealerIsPlayer: boolean }
  | { type: "ACTION"; who: PokerSeat; action: PokerAction };

function reducer(state: PokerGameState, action: ReducerAction): PokerGameState {
  switch (action.type) {
    case "START":
      return startNewHand(action.playerStack, action.aiStack, action.handNumber, action.dealerIsPlayer);
    case "ACTION":
      return applyAction(state, action.who, action.action);
    default:
      return state;
  }
}

export function PokerPage() {
  return (
    <UsernameGate>
      <PokerContainer />
    </UsernameGate>
  );
}

function PokerContainer() {
  const [mode, setMode] = useState<PlayMode | null>(null);
  const [balance, setBalance] = useState(() => getPokerBalance());

  if (balance <= 0) {
    return (
      <div className="container section" style={{ maxWidth: 480, textAlign: "center" }}>
        <div className="panel" style={{ padding: "2.25rem" }}>
          <h2 style={{ fontSize: "1.4rem", marginBottom: "0.75rem" }}>You're out of RITUAL</h2>
          <p style={{ color: "var(--gray-400)", marginBottom: "1.5rem" }}>
            Your mock bankroll hit zero. Top up to keep playing — no real funds involved in demo mode.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => {
              setPokerBalance(10);
              setBalance(10);
            }}
          >
            Rebuy 10 RITUAL
          </button>
        </div>
      </div>
    );
  }

  if (!mode) {
    return <ModeSelect gameName="Poker" wagerLabel="Blinds 0.1 / 0.2 RITUAL" onStart={setMode} />;
  }

  return <PokerBoard mode={mode} balance={balance} onBalanceChange={setBalance} onExit={() => setMode(null)} />;
}

function PokerBoard({
  mode,
  balance,
  onBalanceChange,
  onExit,
}: {
  mode: PlayMode;
  balance: number;
  onBalanceChange: (n: number) => void;
  onExit: () => void;
}) {
  const { username } = useUsername();
  const { playMusic, stopMusic } = useSound();
  const [dealerIsPlayer, setDealerIsPlayer] = useState(true);
  const [handNumber, setHandNumber] = useState(1);
  const [state, dispatch] = useReducer(
    reducer,
    { playerStack: balance, aiStack: AI_STARTING_STACK, handNumber: 1, dealerIsPlayer: true },
    (init) => startNewHand(init.playerStack, init.aiStack, init.handNumber, init.dealerIsPlayer),
  );
  const [raiseTo, setRaiseTo] = useState<number>(0);
  const stateRef = useRef(state);
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

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [state.log.length]);

  useEffect(() => {
    setRaiseTo(Math.max(state.minRaiseTo, state.currentBet + state.bigBlind));
  }, [state.street, state.currentBet, state.minRaiseTo, state.bigBlind]);

  const playerIsAiControlled = mode.mode === "ai";
  const aiProfile = mode.mode === "ai" ? mode.profile : OPPONENT_PROFILE;

  useEffect(() => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    if (state.status !== "betting") return;

    const who = state.toAct;
    const controlled = who === "ai" || (who === "player" && playerIsAiControlled);
    if (!controlled) return;

    timeoutRef.current = window.setTimeout(() => {
      const s = stateRef.current;
      if (s.status !== "betting" || s.toAct !== who) return;
      const profile = who === "ai" ? OPPONENT_PROFILE : aiProfile;
      const action = chooseAiPokerAction(s, who, profile);
      dispatch({ type: "ACTION", who, action });
    }, 1000);

    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, playerIsAiControlled, aiProfile]);

  useEffect(() => {
    if (state.status !== "hand_complete" || recordedRef.current) return;
    recordedRef.current = true;
    onBalanceChange(state.seats.player.stack);
    setPokerBalance(state.seats.player.stack);
    if (state.winner === "player" || state.winner === "ai") {
      recordMatch({
        game: "poker",
        result: state.winner === "player" ? "win" : "loss",
        wager: state.smallBlind + state.bigBlind,
        opponent: "Ritual AI",
        aiAssisted: playerIsAiControlled,
      });
    }
  }, [state.status]); // eslint-disable-line react-hooks/exhaustive-deps

  function nextHand() {
    recordedRef.current = false;
    const nextDealer = !dealerIsPlayer;
    const nextNum = handNumber + 1;
    setDealerIsPlayer(nextDealer);
    setHandNumber(nextNum);
    dispatch({
      type: "START",
      playerStack: state.seats.player.stack,
      aiStack: Math.max(state.seats.ai.stack, state.bigBlind * 4),
      handNumber: nextNum,
      dealerIsPlayer: nextDealer,
    });
  }

  const isPlayerTurn = state.toAct === "player" && state.status === "betting" && !playerIsAiControlled;
  const playerCanCheck = isPlayerTurn && canCheck(state, "player");
  const toCall = isPlayerTurn ? callAmount(state, "player") : 0;
  const maxRaise = state.seats.player.stack + state.seats.player.betThisStreet;
  const showdownReveal = state.status === "hand_complete" && !state.seats.ai.folded;

  return (
    <div className="container section" style={{ paddingBottom: "3rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
          <span className="chip chip-gold">Hand #{state.handNumber}</span>
          <span className="chip">{state.street === "showdown" ? "Showdown" : state.street.toUpperCase()}</span>
          <span className="chip chip-green">Pot {state.pot.toFixed(2)} RITUAL</span>
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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "1.5rem" }} className="poker-layout">
        <div>
          <PokerSeatRow
            label="Ritual AI"
            isDealer={state.seats.ai.isDealer}
            stack={state.seats.ai.stack}
            bet={state.seats.ai.betThisStreet}
            folded={state.seats.ai.folded}
            active={state.toAct === "ai" && state.status === "betting"}
            accent="pink"
          >
            {state.seats.ai.holeCards.map((c, i) =>
              showdownReveal ? <PlayingCardView key={c.id} card={c} size="sm" dealt /> : <CardBackView key={i} size="sm" />,
            )}
          </PokerSeatRow>

          <div className="panel" style={{ padding: "1.75rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", margin: "1.25rem 0" }}>
            <div className="data-label">Community</div>
            <div style={{ display: "flex", gap: "0.5rem", minHeight: 108, alignItems: "center" }}>
              {state.community.length === 0 ? (
                <span className="hex">Waiting for flop…</span>
              ) : (
                state.community.map((c) => <PlayingCardView key={c.id} card={c} dealt />)
              )}
            </div>
            {state.status === "hand_complete" && state.winnerHandLabel && (
              <div className="chip chip-gold">{state.winnerHandLabel}</div>
            )}
          </div>

          <PokerSeatRow
            label={username ?? "You"}
            isDealer={state.seats.player.isDealer}
            stack={state.seats.player.stack}
            bet={state.seats.player.betThisStreet}
            folded={state.seats.player.folded}
            active={state.toAct === "player" && state.status === "betting"}
            accent="green"
          >
            {state.seats.player.holeCards.map((c) => (
              <PlayingCardView key={c.id} card={c} dealt />
            ))}
          </PokerSeatRow>

          {isPlayerTurn && (
            <div className="panel" style={{ padding: "1.25rem", marginTop: "1.25rem" }}>
              <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginBottom: "0.9rem" }}>
                <button type="button" className="btn btn-danger" onClick={() => dispatch({ type: "ACTION", who: "player", action: { type: "fold" } })}>
                  Fold
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() =>
                    dispatch({ type: "ACTION", who: "player", action: playerCanCheck ? { type: "check" } : { type: "call" } })
                  }
                >
                  {playerCanCheck ? "Check" : `Call ${toCall.toFixed(2)}`}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={raiseTo <= state.currentBet}
                  onClick={() => dispatch({ type: "ACTION", who: "player", action: { type: "raise", to: raiseTo } })}
                >
                  {state.currentBet > 0 ? "Raise to" : "Bet"} {raiseTo.toFixed(2)}
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <input
                  type="range"
                  min={Math.min(state.minRaiseTo, maxRaise)}
                  max={maxRaise}
                  step={0.05}
                  value={Math.min(raiseTo, maxRaise)}
                  onChange={(e) => setRaiseTo(Number(e.target.value))}
                  style={{ flex: 1, accentColor: "#19d184" }}
                  aria-label="Raise amount"
                />
                <span className="mono" style={{ fontSize: "0.85rem", width: 68, textAlign: "right" }}>
                  {raiseTo.toFixed(2)}
                </span>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem" }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRaiseTo(Math.max(state.minRaiseTo, Math.round((state.currentBet + state.pot * 0.5) * 100) / 100))}>
                  ½ Pot
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRaiseTo(Math.max(state.minRaiseTo, Math.round((state.currentBet + state.pot) * 100) / 100))}>
                  Pot
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRaiseTo(maxRaise)}>
                  All-In
                </button>
              </div>
            </div>
          )}

          {!isPlayerTurn && state.status === "betting" && (
            <div style={{ textAlign: "center", marginTop: "1.25rem" }}>
              <span className="chip">
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--gray-500)" }} className="pulse-dot" />
                {playerIsAiControlled && state.toAct === "player" ? "Your AI agent is thinking…" : "Ritual AI is thinking…"}
              </span>
            </div>
          )}
        </div>

        <aside className="panel" style={{ padding: "1rem", maxHeight: 520, display: "flex", flexDirection: "column" }}>
          <div className="data-label" style={{ marginBottom: "0.75rem" }}>
            Hand Log
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

      {state.status === "hand_complete" && (
        <ResultOverlay
          won={state.winner === "player"}
          title={state.winner === "player" ? "You Win the Pot!" : state.winner === "split" ? "Split Pot" : "AI Wins the Pot"}
          subtitle={state.winnerHandLabel ?? ""}
          payoutText={
            state.winner === "player"
              ? `${state.seats.player.stack.toFixed(2)} RITUAL bankroll`
              : `Bankroll: ${state.seats.player.stack.toFixed(2)} RITUAL`
          }
          onPlayAgain={nextHand}
          onExit={onExit}
        />
      )}
    </div>
  );
}

function PokerSeatRow({
  label,
  isDealer,
  stack,
  bet,
  folded,
  active,
  accent,
  children,
}: {
  label: string;
  isDealer: boolean;
  stack: number;
  bet: number;
  folded: boolean;
  active: boolean;
  accent: "green" | "pink";
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        <span style={{ fontWeight: 600, color: "var(--gray-200)" }}>{label}</span>
        {isDealer && <span className="chip chip-gold">D</span>}
        {folded && <span className="chip">Folded</span>}
        {active && (
          <span className={`chip ${accent === "green" ? "chip-green" : "chip-pink"}`}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: `var(--${accent})` }} className="pulse-dot" />
            Acting
          </span>
        )}
        <span className="hex">Stack {stack.toFixed(2)} · Bet {bet.toFixed(2)}</span>
      </div>
      <div style={{ display: "flex", gap: "0.4rem" }}>{children}</div>
    </div>
  );
}
