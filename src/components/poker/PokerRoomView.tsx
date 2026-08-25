import { useEffect, useMemo, useRef, useState } from "react";
import { SoundToggleButton } from "@/components/SoundToggleButton";
import { TurnTimer } from "@/components/TurnTimer";
import { PlayingCardView } from "@/components/cards/PlayingCardView";
import { CardBackView } from "@/components/cards/WhotCardView";
import { WhotIntro } from "@/components/whot/WhotIntro";
import type { SfxType } from "@/context/SoundContext";
import { getPokerBalance, recordMatch, setPokerBalance } from "@/lib/storage";
import { applyAction, callAmount, canCheck } from "@/games/poker/multiplayerEngine";
import { dealNextPokerHand, eligiblePlayerCount, type PokerRoomState } from "@/games/poker/multiplayerRoom";
import type { MPPokerAction, MPPokerGameState, SeatId } from "@/games/poker/multiplayerTypes";
import "./multiplayer-poker.css";

const POKER_TURN_SECS = 45;
const POKER_WARN_SECS = 15;
const POKER_HOST_GRACE_SECS = 5;

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;

export function PokerRoomView({
  room,
  status,
  mySeatId,
  playerId,
  roomCode,
  username,
  onWriteRoom,
  onStartGame,
  onLeave,
  playSfx,
}: {
  room: PokerRoomState;
  status: "waiting" | "active" | "finished";
  mySeatId: SeatId;
  playerId: string;
  roomCode: string;
  username: string;
  onWriteRoom: (next: PokerRoomState) => void;
  onStartGame: () => void;
  onLeave: () => void;
  playSfx: (type: SfxType) => void;
}) {
  const roomRef = useRef(room);
  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  const isHost = room.hostPlayerId === playerId;
  const game = room.game;
  const seatName = (id: SeatId) => room.seats.find((s) => s.id === id)?.name ?? id;

  const [showIntro, setShowIntro] = useState(false);
  const lastIntroHandRef = useRef<number | null>(null);
  useEffect(() => {
    if (game && game.handNumber !== lastIntroHandRef.current) {
      setShowIntro(true);
      lastIntroHandRef.current = game.handNumber;
    }
  }, [game?.handNumber]);

  // Diff-based SFX + animation triggers, driven by the engine's `lastAction` field so every
  // player's device reacts identically to whichever action just synced in.
  const prevLastActionRef = useRef<MPPokerGameState["lastAction"]>(null);
  const [allInFlash, setAllInFlash] = useState<{ seatId: SeatId; token: number } | null>(null);
  const [chipFlights, setChipFlights] = useState<{ id: number; seatId: SeatId }[]>([]);
  const chipFlightIdRef = useRef(0);

  useEffect(() => {
    if (!game || !game.lastAction || game.lastAction === prevLastActionRef.current) return;
    prevLastActionRef.current = game.lastAction;
    const { seatId, action } = game.lastAction;

    if (action === "fold") playSfx("pokerFold");
    else if (action === "check") playSfx("pokerCheck");
    else if (action === "call" || action === "raise") playSfx("pokerChip");
    else if (action === "allin") {
      playSfx("pokerAllIn");
      setAllInFlash({ seatId, token: Date.now() });
      window.setTimeout(() => setAllInFlash((cur) => (cur?.seatId === seatId ? null : cur)), 700);
    }

    if (action === "call" || action === "raise" || action === "allin") {
      const id = ++chipFlightIdRef.current;
      setChipFlights((cur) => [...cur, { id, seatId }]);
      window.setTimeout(() => setChipFlights((cur) => cur.filter((c) => c.id !== id)), 650);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.lastAction]);

  // Flip newly-revealed community cards one at a time with a staggered snap sound.
  const prevCommunityLenRef = useRef(0);
  const [flippingIndices, setFlippingIndices] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (!game) return;
    const prevLen = prevCommunityLenRef.current;
    const newLen = game.community.length;
    if (newLen > prevLen) {
      const added = Array.from({ length: newLen - prevLen }, (_, i) => prevLen + i);
      setFlippingIndices(new Set(added));
      added.forEach((_, order) => window.setTimeout(() => playSfx("pokerFlip"), order * 150));
      window.setTimeout(() => setFlippingIndices(new Set()), added.length * 150 + 550);
    }
    prevCommunityLenRef.current = newLen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.community.length]);

  // Win sound + confetti, once per completed hand.
  const [showConfetti, setShowConfetti] = useState(false);
  const recordedHandRef = useRef<number | null>(null);
  useEffect(() => {
    if (!game || game.status !== "hand_complete") return;
    if (recordedHandRef.current === game.handNumber) return;
    recordedHandRef.current = game.handNumber;

    const iWon = game.winners.includes(mySeatId);
    const iPlayed = game.players.includes(mySeatId);
    if (iWon) {
      playSfx("pokerWin");
      setShowConfetti(true);
      window.setTimeout(() => setShowConfetti(false), 2000);
    }
    if (iPlayed) {
      const finalStack = game.seats[mySeatId].stack;
      setPokerBalance(finalStack);
      recordMatch({
        game: "poker",
        result: iWon ? "win" : "loss",
        wager: game.smallBlind + game.bigBlind,
        opponent: room.seats.filter((s) => s.id !== mySeatId && game.players.includes(s.id)).map((s) => s.name).join(", ") || "Opponent",
        aiAssisted: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.status, game?.handNumber]);

  // Host backup: auto-fold for any player whose timer has lapsed, with a grace period.
  useEffect(() => {
    if (!isHost || !game || game.status !== "betting") return;
    if (game.toAct === mySeatId) return; // Active player handles their own timeout
    const startedAt = room.turnStartedAt ?? null;
    if (!startedAt) return;

    const toActAtSchedule = game.toAct;
    if (!toActAtSchedule) return;
    const elapsedMs = Date.now() - startedAt;
    const delayMs = Math.max(100, (POKER_TURN_SECS + POKER_HOST_GRACE_SECS) * 1000 - elapsedMs);

    const id = window.setTimeout(() => {
      const current = roomRef.current;
      if (!current.game || current.game.toAct !== toActAtSchedule || current.game.status !== "betting") return;
      onWriteRoom({ ...current, game: applyAction(current.game, toActAtSchedule, { type: "fold" }), turnStartedAt: Date.now() });
    }, delayMs);

    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.toAct, room.turnStartedAt, isHost]);

  const [raiseTo, setRaiseTo] = useState(0);
  useEffect(() => {
    if (!game) return;
    setRaiseTo(Math.max(game.minRaiseTo, game.currentBet + game.bigBlind));
  }, [game?.street, game?.currentBet, game?.minRaiseTo, game?.bigBlind]);

  const seatAngle = useMemo(() => {
    const ids = game?.players ?? room.seats.map((s) => s.id);
    const map = new Map<SeatId, { x: number; y: number }>();
    const n = Math.max(ids.length, 1);
    ids.forEach((id, i) => {
      const angle = (90 - (360 / n) * i) * (Math.PI / 180);
      map.set(id, { x: Math.cos(angle) * 150, y: -Math.sin(angle) * 90 });
    });
    return map;
  }, [game?.players, room.seats]);

  if (showIntro && game) {
    return (
      <WhotIntro
        players={game.players.map((id) => ({ id, label: seatName(id) }))}
        handSize={2}
        onCardDealt={() => playSfx("pokerDeal")}
        onComplete={() => setShowIntro(false)}
      />
    );
  }

  if (status === "waiting" || !game) {
    return (
      <div className="container section" style={{ paddingBottom: "3rem" }}>
        <RoomHeader roomCode={roomCode} onLeave={onLeave} />
        <div className="panel" style={{ padding: "2.5rem", textAlign: "center", marginBottom: "1.5rem" }}>
          <div className="chip chip-gold" style={{ marginBottom: "1rem" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--gold)" }} className="pulse-dot" />
            Waiting for players ({room.seats.length}/{MAX_PLAYERS})
          </div>
          <p style={{ color: "var(--gray-400)", marginBottom: "1rem" }}>Share this room code:</p>
          <div className="mono" style={{ fontSize: "2rem", color: "var(--green)", letterSpacing: "0.2em", marginBottom: "1.75rem" }}>
            {roomCode}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0.6rem", marginBottom: "1.75rem" }}>
            {room.seats.map((seat) => (
              <span key={seat.id} className={`chip ${seat.id === mySeatId ? "chip-green" : ""}`}>
                {seat.name} · {(room.stacks[seat.id] ?? 0).toFixed(2)} RITUAL
                {seat.playerId === room.hostPlayerId ? " · Host" : ""}
                {seat.id === mySeatId ? " (you)" : ""}
              </span>
            ))}
          </div>
          {isHost ? (
            <button type="button" className="btn btn-primary" onClick={onStartGame} disabled={room.seats.length < MIN_PLAYERS}>
              {room.seats.length < MIN_PLAYERS ? `Need at least ${MIN_PLAYERS} players` : `Start Game (${room.seats.length} players)`}
            </button>
          ) : (
            <p style={{ color: "var(--gray-400)", fontSize: "0.9rem" }}>Waiting for the host to start the game…</p>
          )}
        </div>
      </div>
    );
  }

  const mySeat = game.seats[mySeatId];
  const iAmSeated = game.players.includes(mySeatId);
  const isMyTurn = iAmSeated && game.status === "betting" && game.toAct === mySeatId;
  const playerCanCheck = isMyTurn && canCheck(game, mySeatId);
  const toCall = isMyTurn ? callAmount(game, mySeatId) : 0;
  const maxRaise = mySeat ? mySeat.stack + mySeat.betThisStreet : 0;
  const showdownReveal = game.status === "hand_complete";
  const canDealNext = eligiblePlayerCount(room) >= MIN_PLAYERS;

  function act(action: MPPokerAction) {
    if (!game) return;
    onWriteRoom({ ...room, game: applyAction(game, mySeatId, action), turnStartedAt: Date.now() });
  }

  function handlePokerTimerTimeout() {
    const current = roomRef.current;
    if (!current.game || current.game.status !== "betting" || current.game.toAct !== mySeatId) return;
    onWriteRoom({ ...current, game: applyAction(current.game, mySeatId, { type: "fold" }), turnStartedAt: Date.now() });
  }

  function dealNext() {
    onWriteRoom(dealNextPokerHand(room));
    setShowConfetti(false);
  }

  return (
    <div className="container section" style={{ paddingBottom: "3rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
          <span className="chip chip-gold">Hand #{game.handNumber}</span>
          <span className="chip">{game.street === "showdown" ? "Showdown" : game.street.toUpperCase()}</span>
          <span className="chip chip-green">Pot {game.pot.toFixed(2)} RITUAL</span>
          <span className="chip">
            Room <span className="mono">{roomCode}</span>
          </span>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <SoundToggleButton />
          <button type="button" className="btn btn-ghost btn-sm" onClick={onLeave}>
            Leave room
          </button>
        </div>
      </div>

      {game.status === "betting" && (
        <TurnTimer
          turnStartedAt={room.turnStartedAt}
          durationSec={POKER_TURN_SECS}
          warnAtSec={POKER_WARN_SECS}
          turnLabel={game.toAct === mySeatId ? "Your Turn" : `${seatName(game.toAct ?? "")} is acting…`}
          isMyTurn={game.toAct === mySeatId}
          onTimeout={isMyTurn ? handlePokerTimerTimeout : undefined}
          onTickSound={() => playSfx("tick")}
        />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "1.5rem" }} className="poker-layout">
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1.5rem" }}>
            {room.seats
              .filter((s) => s.id !== mySeatId)
              .map((s) => {
                const seat = game.seats[s.id];
                const sittingOut = !seat;
                return (
                  <div
                    key={s.id}
                    className={`panel mp-seat-panel ${allInFlash?.seatId === s.id ? "allin-flash" : ""}`}
                    style={{ padding: "0.75rem 1rem", minWidth: 168, opacity: sittingOut ? 0.55 : 1 }}
                  >
                    <SeatLabel
                      label={s.name}
                      stack={seat?.stack ?? room.stacks[s.id] ?? 0}
                      bet={seat?.betThisStreet ?? 0}
                      isDealer={seat?.isDealer ?? false}
                      folded={seat?.folded ?? false}
                      allIn={seat?.allIn ?? false}
                      sittingOut={sittingOut}
                      active={game.toAct === s.id && game.status === "betting"}
                      accent="pink"
                    />
                    {!sittingOut && (
                      <div className={`mp-hole-cards ${seat.folded ? "folded" : ""}`} style={{ marginTop: "0.4rem" }}>
                        {seat.holeCards.map((c, i) =>
                          showdownReveal && !seat.folded ? (
                            <PlayingCardView key={c.id} card={c} size="sm" dealt className={game.winners.includes(s.id) ? "mp-win-glow" : ""} />
                          ) : (
                            <CardBackView key={i} size="sm" />
                          ),
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>

          <div className="panel" style={{ padding: "1.75rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", margin: "1.25rem 0", position: "relative" }}>
            <div className="data-label">Community</div>
            <div className="mp-community-row" style={{ display: "flex", gap: "0.5rem", minHeight: 108, alignItems: "center" }}>
              {game.community.length === 0 ? (
                <span className="hex">Waiting for flop…</span>
              ) : (
                game.community.map((c, i) => (
                  <PlayingCardView
                    key={c.id}
                    card={c}
                    dealt
                    className={[flippingIndices.has(i) ? "mp-flip-in" : "", game.status === "hand_complete" && game.winners.length ? "mp-win-glow" : ""]
                      .filter(Boolean)
                      .join(" ")}
                  />
                ))
              )}
            </div>
            {game.status === "hand_complete" && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", justifyContent: "center" }}>
                {game.winners.map((w) => (
                  <span key={w} className="chip chip-gold">
                    {seatName(w)} wins{game.winnerHandLabels[w] ? ` · ${game.winnerHandLabels[w]}` : ""}
                  </span>
                ))}
              </div>
            )}
            <div className="mp-table-fx">
              {chipFlights.map((f) => {
                const pos = seatAngle.get(f.seatId) ?? { x: 0, y: 120 };
                return <div key={f.id} className="mp-chip" style={{ "--tx": `${pos.x}px`, "--ty": `${pos.y}px` } as React.CSSProperties} />;
              })}
            </div>
          </div>

          {iAmSeated ? (
            <>
              <SeatLabel
                label={username}
                stack={mySeat.stack}
                bet={mySeat.betThisStreet}
                isDealer={mySeat.isDealer}
                folded={mySeat.folded}
                allIn={mySeat.allIn}
                sittingOut={false}
                active={game.toAct === mySeatId && game.status === "betting"}
                accent="green"
              />
              <div className={`mp-hole-cards ${mySeat.folded ? "folded" : ""}`} style={{ justifyContent: "center", marginTop: "0.5rem" }}>
                {mySeat.holeCards.map((c) => (
                  <PlayingCardView key={c.id} card={c} dealt className={game.status === "hand_complete" && game.winners.includes(mySeatId) ? "mp-win-glow" : ""} />
                ))}
              </div>
            </>
          ) : (
            <p style={{ textAlign: "center", color: "var(--gray-400)" }}>You're sitting out this hand — no chips left. Wait for the next hand.</p>
          )}

          {isMyTurn && (
            <div className="panel" style={{ padding: "1.25rem", marginTop: "1.25rem" }}>
              <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginBottom: "0.9rem" }}>
                <button type="button" className="btn btn-danger" onClick={() => act({ type: "fold" })}>
                  Fold
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => act(playerCanCheck ? { type: "check" } : { type: "call" })}>
                  {playerCanCheck ? "Check" : `Call ${toCall.toFixed(2)}`}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={raiseTo <= game.currentBet}
                  onClick={() => act({ type: "raise", to: raiseTo })}
                >
                  {game.currentBet > 0 ? "Raise to" : "Bet"} {raiseTo.toFixed(2)}
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <input
                  type="range"
                  min={Math.min(game.minRaiseTo, maxRaise)}
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
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRaiseTo(Math.max(game.minRaiseTo, Math.round((game.currentBet + game.pot * 0.5) * 100) / 100))}>
                  ½ Pot
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRaiseTo(Math.max(game.minRaiseTo, Math.round((game.currentBet + game.pot) * 100) / 100))}>
                  Pot
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRaiseTo(maxRaise)}>
                  All-In
                </button>
              </div>
            </div>
          )}

          {!isMyTurn && game.status === "betting" && iAmSeated && (
            <div style={{ textAlign: "center", marginTop: "1.25rem" }}>
              <span className="chip">
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--gray-500)" }} className="pulse-dot" />
                {game.toAct ? `${seatName(game.toAct)} is thinking…` : "Resolving…"}
              </span>
            </div>
          )}

          {game.status === "hand_complete" && (
            <div className="panel" style={{ padding: "1.5rem", marginTop: "1.5rem", textAlign: "center" }}>
              {isHost ? (
                canDealNext ? (
                  <button type="button" className="btn btn-primary" onClick={dealNext}>
                    Deal Next Hand
                  </button>
                ) : (
                  <p style={{ color: "var(--gray-400)" }}>Not enough players with chips left to deal another hand.</p>
                )
              ) : (
                <p style={{ color: "var(--gray-400)", fontSize: "0.9rem" }}>Waiting for the host to deal the next hand…</p>
              )}
            </div>
          )}
        </div>

        <aside className="panel" style={{ padding: "1rem", maxHeight: 520, display: "flex", flexDirection: "column" }}>
          <div className="data-label" style={{ marginBottom: "0.75rem" }}>
            Hand Log
          </div>
          <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {game.log.map((entry) => (
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
          </div>
        </aside>
      </div>

      {showConfetti && <Confetti />}
    </div>
  );
}

function RoomHeader({ roomCode, onLeave }: { roomCode: string; onLeave: () => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
      <span className="chip">
        Room <span className="mono">{roomCode}</span>
      </span>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <SoundToggleButton />
        <button type="button" className="btn btn-ghost btn-sm" onClick={onLeave}>
          Leave room
        </button>
      </div>
    </div>
  );
}

function SeatLabel({
  label,
  stack,
  bet,
  isDealer,
  folded,
  allIn,
  sittingOut,
  active,
  accent,
}: {
  label: string;
  stack: number;
  bet: number;
  isDealer: boolean;
  folded: boolean;
  allIn: boolean;
  sittingOut: boolean;
  active: boolean;
  accent: "green" | "pink";
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600, color: "var(--gray-200)" }}>{label}</span>
        {isDealer && <span className="chip chip-gold">D</span>}
        {sittingOut && <span className="chip">Sitting out</span>}
        {folded && <span className="chip">Folded</span>}
        {allIn && <span className="chip chip-pink">All in</span>}
        {active && (
          <span className={`chip ${accent === "green" ? "chip-green" : "chip-pink"}`}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: `var(--${accent})` }} className="pulse-dot" />
            Turn
          </span>
        )}
      </div>
      <span className="hex">Stack {stack.toFixed(2)} · Bet {bet.toFixed(2)}</span>
    </div>
  );
}

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.3,
        duration: 1.4 + Math.random() * 0.9,
        color: ["#19d184", "#facc15", "#ff1dce", "#0ea5e9"][i % 4],
      })),
    [],
  );
  return (
    <div className="mp-confetti-wrap">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="mp-confetti-piece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
