import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { UsernameGate } from "@/components/UsernameGate";
import { ResultOverlay } from "@/components/ResultOverlay";
import { WhotCardView, CardBackView } from "@/components/cards/WhotCardView";
import { WhotIntro } from "@/components/whot/WhotIntro";
import { useUsername } from "@/context/UsernameContext";
import { supabase, generateRoomCode, getPersistentPlayerId } from "@/lib/supabase";
import { recordMatch } from "@/lib/storage";
import { STRATEGIES, strategyMeta, type StrategyProfile } from "@/lib/aiStrategy";
import { createWhotGame, endTurn, getPlayableCards, playCard, resolvePickThree, topCard, voluntaryDraw } from "@/games/whot/engine";
import { chooseWhotMove, pickSuitToCall, shouldPlayDrawnCard } from "@/games/whot/ai";
import { REAL_SUITS } from "@/games/whot/types";
import type { WhotGameState, WhotPlayer, WhotSuit } from "@/games/whot/types";

type SeatId = WhotPlayer;

interface SeatInfo {
  id: SeatId;
  playerId: string;
  name: string;
}

interface RoomState {
  seats: SeatInfo[];
  hostPlayerId: string;
  game: WhotGameState | null; // null while the room is still in the lobby
  aiAssist: Record<SeatId, boolean>;
  aiProfile: Record<SeatId, StrategyProfile>;
}

const WAGER = 0.5;
const AI_ASSIST_MOVE_DELAY = 2500;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;

export function MultiplayerPage() {
  return (
    <UsernameGate>
      <MultiplayerContainer />
    </UsernameGate>
  );
}

function MultiplayerContainer() {
  const { username } = useUsername();
  const playerId = useRef(getPersistentPlayerId()).current;

  const [screen, setScreen] = useState<"choose" | "room">("choose");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [mySeatId, setMySeatId] = useState<SeatId>("seat-0");
  const [status, setStatus] = useState<"waiting" | "active" | "finished">("waiting");
  const [room, setRoom] = useState<RoomState | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const recordedRef = useRef(false);

  const subscribe = useCallback((id: string) => {
    channelRef.current?.unsubscribe();
    const channel = supabase
      .channel(`room-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${id}` },
        (payload) => {
          const row = payload.new as { status: "waiting" | "active" | "finished"; game_state: RoomState };
          setStatus(row.status);
          setRoom(row.game_state);
        },
      )
      .subscribe();
    channelRef.current = channel;
  }, []);

  useEffect(() => {
    return () => {
      channelRef.current?.unsubscribe();
    };
  }, []);

  async function createRoom() {
    setBusy(true);
    setError("");
    try {
      const code = generateRoomCode();
      const hostSeat: SeatInfo = { id: "seat-0", playerId, name: username ?? "Player 1" };
      const initialRoom: RoomState = {
        seats: [hostSeat],
        hostPlayerId: playerId,
        game: null,
        aiAssist: {},
        aiProfile: {},
      };
      const { data, error: err } = await supabase
        .from("games")
        .insert({
          room_code: code,
          game_type: "whot",
          player_ids: [playerId],
          max_players: MAX_PLAYERS,
          game_state: initialRoom,
          status: "waiting",
        })
        .select()
        .single();
      if (err || !data) throw err ?? new Error("Could not create room");
      setRoomId(data.id);
      setRoomCode(code);
      setMySeatId("seat-0");
      setStatus("waiting");
      setRoom(initialRoom);
      subscribe(data.id);
      setScreen("room");
    } catch (e) {
      setError(supabaseErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom() {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setBusy(true);
    setError("");
    try {
      const { data: found, error: findErr } = await supabase
        .from("games")
        .select("*")
        .eq("room_code", code)
        .eq("status", "waiting")
        .single();
      if (findErr || !found) throw new Error("Room not found or already started.");

      const current = found.game_state as RoomState;
      const existing = current.seats.find((s) => s.playerId === playerId);
      let updatedRoom: RoomState;
      let seatId: SeatId;
      if (existing) {
        seatId = existing.id;
        updatedRoom = current;
      } else {
        if (current.seats.length >= MAX_PLAYERS) throw new Error("Room is full.");
        seatId = `seat-${current.seats.length}`;
        updatedRoom = {
          ...current,
          seats: [...current.seats, { id: seatId, playerId, name: username ?? `Player ${current.seats.length + 1}` }],
        };
      }

      const { data, error: updErr } = await supabase
        .from("games")
        .update({ player_ids: updatedRoom.seats.map((s) => s.playerId), game_state: updatedRoom })
        .eq("id", found.id)
        .select()
        .single();
      if (updErr || !data) throw updErr ?? new Error("Could not join room");

      setRoomId(data.id);
      setRoomCode(code);
      setMySeatId(seatId);
      setStatus(data.status);
      setRoom(data.game_state as RoomState);
      subscribe(data.id);
      setScreen("room");
    } catch (e) {
      setError(supabaseErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function writeRoom(next: RoomState) {
    setRoom(next);
    if (!roomId) return;
    try {
      await supabase.from("games").update({ game_state: next }).eq("id", roomId);
      if (next.game) {
        await supabase.from("moves").insert({
          game_id: roomId,
          player_id: playerId,
          move_data: { turn: next.game.turn, status: next.game.status },
        });
      }
    } catch {
      /* best-effort sync */
    }
  }

  async function startGame() {
    if (!room || room.seats.length < MIN_PLAYERS) return;
    const seatIds = room.seats.map((s) => s.id);
    const game = createWhotGame(seatIds);
    const next: RoomState = {
      ...room,
      game,
      aiAssist: Object.fromEntries(seatIds.map((id) => [id, false])),
      aiProfile: Object.fromEntries(seatIds.map((id) => [id, "balanced" as StrategyProfile])),
    };
    setRoom(next);
    setStatus("active");
    if (!roomId) return;
    try {
      await supabase.from("games").update({ game_state: next, status: "active" }).eq("id", roomId);
    } catch {
      /* best-effort sync */
    }
  }

  function leaveRoom() {
    channelRef.current?.unsubscribe();
    setScreen("choose");
    setRoomId(null);
    setRoom(null);
    setStatus("waiting");
    recordedRef.current = false;
  }

  if (screen === "choose") {
    return (
      <div className="container section" style={{ maxWidth: 640 }}>
        <div className="chip chip-pink" style={{ marginBottom: "1rem" }}>
          Multiplayer · Whot
        </div>
        <h1 style={{ fontSize: "clamp(1.9rem, 4vw, 2.4rem)", marginBottom: "0.75rem" }}>Play with friends, live</h1>
        <p style={{ color: "var(--gray-400)", marginBottom: "2rem" }}>
          Rooms sync in real time via Supabase and hold up to {MAX_PLAYERS} players. Any seat can hand control to an AI
          agent — so you can run any mix of Human vs Human vs AI at the table.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.25rem" }}>
          <div className="panel" style={{ padding: "1.75rem" }}>
            <h3 style={{ fontSize: "1.1rem", marginBottom: "0.6rem" }}>Create a room</h3>
            <p style={{ color: "var(--gray-400)", fontSize: "0.88rem", marginBottom: "1.25rem" }}>
              Get a room code to share with up to {MAX_PLAYERS - 1} friends.
            </p>
            <button type="button" className="btn btn-primary btn-block" onClick={createRoom} disabled={busy}>
              {busy ? "Creating…" : "Create Room"}
            </button>
          </div>
          <div className="panel" style={{ padding: "1.75rem" }}>
            <h3 style={{ fontSize: "1.1rem", marginBottom: "0.6rem" }}>Join a room</h3>
            <input
              className="input"
              placeholder="Enter room code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={5}
              style={{ marginBottom: "0.85rem" }}
            />
            <button type="button" className="btn btn-pink btn-block" onClick={joinRoom} disabled={busy || !joinCode}>
              {busy ? "Joining…" : "Join Room"}
            </button>
          </div>
        </div>

        {error && (
          <p className="shake" style={{ color: "var(--red)", marginTop: "1.25rem", fontSize: "0.9rem" }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  if (!room) {
    return (
      <div className="container section" style={{ textAlign: "center" }}>
        <p style={{ color: "var(--gray-400)" }}>Loading room…</p>
      </div>
    );
  }

  return (
    <RoomView
      room={room}
      status={status}
      mySeatId={mySeatId}
      playerId={playerId}
      roomCode={roomCode}
      username={username ?? "You"}
      onWriteRoom={writeRoom}
      onStartGame={startGame}
      onLeave={leaveRoom}
      recordedRef={recordedRef}
    />
  );
}

function supabaseErrorMessage(e: unknown): string {
  const raw = extractMessage(e);
  const setupHint = "Multiplayer tables aren't set up yet — run supabase-cards-setup.sql (and supabase-cards-multiplayer-update.sql) against your Supabase project.";
  if (!raw) return setupHint;
  if (/relation .* does not exist/i.test(raw) || /schema cache/i.test(raw) || /not found/i.test(raw) || /404/.test(raw) || /column .* does not exist/i.test(raw)) {
    return setupHint;
  }
  if (/room not found/i.test(raw) || /room is full/i.test(raw)) return raw;
  return `${setupHint} (${raw})`;
}

function extractMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return "";
}

function RoomView({
  room,
  status,
  mySeatId,
  playerId,
  roomCode,
  username,
  onWriteRoom,
  onStartGame,
  onLeave,
  recordedRef,
}: {
  room: RoomState;
  status: "waiting" | "active" | "finished";
  mySeatId: SeatId;
  playerId: string;
  roomCode: string;
  username: string;
  onWriteRoom: (next: RoomState) => void;
  onStartGame: () => void;
  onLeave: () => void;
  recordedRef: React.MutableRefObject<boolean>;
}) {
  const roomRef = useRef(room);
  const timeoutRef = useRef<number | null>(null);
  const [pendingWhotCardId, setPendingWhotCardId] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(false);
  const hadGameRef = useRef(!!room.game);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  // Play the shuffle/deal intro exactly once, the moment the host deals the game (lobby -> active).
  useEffect(() => {
    if (!hadGameRef.current && room.game) {
      setShowIntro(true);
    }
    hadGameRef.current = !!room.game;
  }, [room.game]);

  const seatName = (id: SeatId) => room.seats.find((s) => s.id === id)?.name ?? id;
  const isHost = room.hostPlayerId === playerId;

  const game = room.game;

  // Drive my own seat's auto-play when I've enabled "let AI play for me".
  useEffect(() => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    if (status !== "active" || !game || game.status !== "playing") return;
    if (game.turn !== mySeatId || !room.aiAssist[mySeatId]) return;

    timeoutRef.current = window.setTimeout(() => {
      const current = roomRef.current;
      if (!current.game || current.game.turn !== mySeatId || current.game.status !== "playing") return;
      const profile = current.aiProfile[mySeatId] ?? "balanced";

      if (current.game.pendingPickThree > 0 && getPlayableCards(current.game, mySeatId).length === 0) {
        onWriteRoom({ ...current, game: resolvePickThree(current.game, mySeatId) });
        return;
      }

      const move = chooseWhotMove(current.game, mySeatId, profile);
      if (move.action === "play") {
        const { state: nextGame } = playCard(current.game, mySeatId, move.cardId, move.suit);
        onWriteRoom({ ...current, game: nextGame });
        return;
      }
      const drawn = voluntaryDraw(current.game, mySeatId);
      onWriteRoom({ ...current, game: drawn });
      window.setTimeout(() => {
        const c2 = roomRef.current;
        if (!c2.game || c2.game.turn !== mySeatId || c2.game.status !== "playing") return;
        const card = shouldPlayDrawnCard(c2.game, mySeatId);
        if (card) {
          const suit = card.suit === "Whot" ? pickSuitToCall(c2.game.hands[mySeatId], profile) : undefined;
          const { state: nextGame } = playCard(c2.game, mySeatId, card.id, suit);
          onWriteRoom({ ...c2, game: nextGame });
        } else {
          onWriteRoom({ ...c2, game: endTurn(c2.game) });
        }
      }, AI_ASSIST_MOVE_DELAY);
    }, AI_ASSIST_MOVE_DELAY);

    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, status, mySeatId, game]);

  useEffect(() => {
    if (!game || game.status === "playing" || recordedRef.current) return;
    recordedRef.current = true;
    const won = game.winner === mySeatId;
    const opponents = room.seats.filter((s) => s.id !== mySeatId).map((s) => s.name);
    recordMatch({
      game: "whot",
      result: won ? "win" : "loss",
      wager: WAGER,
      opponent: opponents.join(", ") || "Opponent",
      aiAssisted: room.aiAssist[mySeatId] ?? false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.status]);

  if (showIntro && game) {
    return (
      <WhotIntro
        players={game.players.map((id) => ({ id, label: seatName(id) }))}
        handSize={game.hands[game.players[0]]?.length ?? 5}
        onComplete={() => setShowIntro(false)}
      />
    );
  }

  if (status === "waiting" || !game) {
    return (
      <div className="container section" style={{ paddingBottom: "3rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
          <span className="chip">
            Room <span className="mono">{roomCode}</span>
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onLeave}>
            Leave room
          </button>
        </div>

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
                {seat.name}
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

  const opponents = room.seats.filter((s) => s.id !== mySeatId);
  const myPlayable = getPlayableCards(game, mySeatId);
  const isManualMyTurn = status === "active" && game.status === "playing" && game.turn === mySeatId && !room.aiAssist[mySeatId];
  const canDraw = isManualMyTurn && myPlayable.length === 0 && !game.hasDrawnThisTurn;
  const canPass = isManualMyTurn && myPlayable.length === 0 && game.hasDrawnThisTurn;
  const top = topCard(game);

  function play(cardId: string, suit?: string) {
    if (!game) return;
    const { state: nextGame } = playCard(game, mySeatId, cardId, suit);
    onWriteRoom({ ...room, game: nextGame });
  }

  function drawOrResolve() {
    if (!game) return;
    if (game.pendingPickThree > 0) {
      onWriteRoom({ ...room, game: resolvePickThree(game, mySeatId) });
    } else {
      onWriteRoom({ ...room, game: voluntaryDraw(game, mySeatId) });
    }
  }

  function handleClick(cardId: string, isWhot: boolean) {
    if (!isManualMyTurn) return;
    if (!myPlayable.some((c) => c.id === cardId)) return;
    if (isWhot) {
      setPendingWhotCardId(cardId);
      return;
    }
    play(cardId);
  }

  function toggleAiAssist() {
    onWriteRoom({ ...room, aiAssist: { ...room.aiAssist, [mySeatId]: !room.aiAssist[mySeatId] } });
  }

  function setMyProfile(profile: StrategyProfile) {
    onWriteRoom({ ...room, aiProfile: { ...room.aiProfile, [mySeatId]: profile } });
  }

  const won = game.status === "finished" && game.winner === mySeatId;
  const showResult = game.status !== "playing";
  const winnerName = game.winner ? seatName(game.winner) : null;

  return (
    <div className="container section" style={{ paddingBottom: "3rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
          <span className="chip chip-gold">Wager {WAGER} RITUAL</span>
          <span className="chip">
            Room <span className="mono">{roomCode}</span>
          </span>
          {room.aiAssist[mySeatId] && <span className="chip chip-pink">AI playing for you · {strategyMeta(room.aiProfile[mySeatId] ?? "balanced").label}</span>}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onLeave}>
          Leave room
        </button>
      </div>

      <div className="panel" style={{ padding: "1.25rem", marginBottom: "1.5rem", display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className={`btn ${room.aiAssist[mySeatId] ? "btn-pink" : "btn-ghost"} btn-sm`} onClick={toggleAiAssist}>
          {room.aiAssist[mySeatId] ? "AI is playing for you" : "Let AI play for me"}
        </button>
        {room.aiAssist[mySeatId] && (
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {STRATEGIES.map((s) => (
              <button
                key={s.id}
                type="button"
                className="btn btn-sm"
                style={{
                  borderColor: room.aiProfile[mySeatId] === s.id ? `var(--${s.accent})` : "var(--gray-700)",
                  color: room.aiProfile[mySeatId] === s.id ? `var(--${s.accent})` : "var(--gray-400)",
                }}
                onClick={() => setMyProfile(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "1.5rem" }} className="whot-layout">
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1.5rem" }}>
            {opponents.map((seat) => (
              <div key={seat.id} className="panel" style={{ padding: "0.75rem 1rem", minWidth: 150 }}>
                <SeatLabel
                  label={seat.name + (room.aiAssist[seat.id] ? " · AI" : "")}
                  count={game.hands[seat.id]?.length ?? 0}
                  active={game.turn === seat.id}
                  accent="pink"
                />
              </div>
            ))}
          </div>

          <div className="panel" style={{ padding: "1.75rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "2rem", flexWrap: "wrap", marginBottom: "2rem" }}>
            <div style={{ textAlign: "center" }}>
              <div className="data-label" style={{ marginBottom: "0.6rem" }}>
                Draw Pile ({game.drawPile.length})
              </div>
              <button
                type="button"
                onClick={() => canDraw && drawOrResolve()}
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
              <WhotCardView card={top} dealt />
              {game.calledSuit && (
                <div className="chip chip-pink" style={{ marginTop: "0.75rem" }}>
                  Called: {game.calledSuit}
                </div>
              )}
              {game.pendingPickThree > 0 && (
                <div className="chip chip-gold" style={{ marginTop: "0.75rem" }}>
                  Pick Three pending — draw {game.pendingPickThree} or defend with a 5
                </div>
              )}
              {game.holdOnFreePlay && (
                <div className="chip chip-green" style={{ marginTop: "0.75rem" }}>
                  Hold On — play again, any suit
                </div>
              )}
            </div>
          </div>

          {(canDraw || canPass) && (
            <div style={{ display: "flex", justifyContent: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
              {canDraw && (
                <button type="button" className="btn btn-gold" onClick={drawOrResolve}>
                  {game.pendingPickThree > 0 ? `Draw ${game.pendingPickThree} (Pick Three)` : "Draw Card"}
                </button>
              )}
              {canPass && (
                <button type="button" className="btn btn-ghost" onClick={() => onWriteRoom({ ...room, game: endTurn(game) })}>
                  Pass Turn
                </button>
              )}
            </div>
          )}

          <SeatLabel label={username} count={game.hands[mySeatId]?.length ?? 0} active={game.turn === mySeatId} accent="green" />
          <div style={{ display: "flex", justifyContent: "center", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
            {(game.hands[mySeatId] ?? []).map((card) => {
              const isPlayable = isManualMyTurn && myPlayable.some((c) => c.id === card.id);
              return (
                <WhotCardView
                  key={card.id}
                  card={card}
                  interactive={isManualMyTurn}
                  disabled={isManualMyTurn && !isPlayable}
                  selected={pendingWhotCardId === card.id}
                  onClick={() => handleClick(card.id, card.suit === "Whot")}
                />
              );
            })}
          </div>
        </div>

        <aside className="panel" style={{ padding: "1rem", maxHeight: 460, display: "flex", flexDirection: "column" }}>
          <div className="data-label" style={{ marginBottom: "0.75rem" }}>
            Match Log
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

      {pendingWhotCardId && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: "fixed", inset: 0, background: "var(--bg-overlay)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 90 }}
        >
          <div className="panel float-in" style={{ padding: "1.75rem", maxWidth: 340, width: "100%" }}>
            <h3 style={{ fontSize: "1.1rem", marginBottom: "1rem", textAlign: "center" }}>Call a suit</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
              {REAL_SUITS.filter((s) => s !== "Whot").map((suit: WhotSuit) => (
                <button
                  key={suit}
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    if (pendingWhotCardId) play(pendingWhotCardId, suit);
                    setPendingWhotCardId(null);
                  }}
                >
                  {suit}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: "0.85rem" }} onClick={() => setPendingWhotCardId(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {showResult && (
        <ResultOverlay
          won={won}
          title={won ? "You Win!" : `${winnerName ?? "Opponent"} Wins`}
          subtitle={won ? "You emptied your hand first." : `${winnerName ?? "Your opponent"} emptied their hand first.`}
          payoutText={won ? `${(WAGER * 2).toFixed(2)} RITUAL to your wallet` : "Better luck next hand"}
          onPlayAgain={() => onWriteRoom({ ...room, game: createWhotGame(room.seats.map((s) => s.id)) })}
          onExit={onLeave}
        />
      )}
    </div>
  );
}

function SeatLabel({ label, count, active, accent }: { label: string; count: number; active: boolean; accent: "green" | "pink" }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ fontWeight: 600, color: "var(--gray-200)" }}>{label}</span>
        <span className="hex">{count} cards</span>
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
