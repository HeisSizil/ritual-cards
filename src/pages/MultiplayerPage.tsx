import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { UsernameGate } from "@/components/UsernameGate";
import { ResultOverlay } from "@/components/ResultOverlay";
import { SoundToggleButton } from "@/components/SoundToggleButton";
import { WhotCardView, CardBackView } from "@/components/cards/WhotCardView";
import { WhotIntro } from "@/components/whot/WhotIntro";
import { useUsername } from "@/context/UsernameContext";
import { useSound } from "@/context/SoundContext";
import { supabase, generateRoomCode, getPersistentPlayerId } from "@/lib/supabase";
import { recordMatch } from "@/lib/storage";
import { STRATEGIES, strategyMeta, type StrategyProfile } from "@/lib/aiStrategy";
import { createWhotGame, endTurn, getPlayableCards, playCard, resolvePickThree, topCard, voluntaryDraw } from "@/games/whot/engine";
import { chooseWhotMove, pickSuitToCall, shouldPlayDrawnCard } from "@/games/whot/ai";
import { REAL_SUITS } from "@/games/whot/types";
import type { WhotGameState, WhotPlayer, WhotSuit } from "@/games/whot/types";
import { applyRoundResult, computeRoundResult, createTournament, handScore, type RoundResult, type TournamentState } from "@/games/whot/tournament";

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
  tournament: TournamentState | null; // set when the table started with 3+ players (Highest Hand Knockout)
}

const WAGER = 0.5;
const AI_ASSIST_MOVE_DELAY = 2500;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;
const KNOCKOUT_MIN_PLAYERS = 3;

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
  const { playMusic, stopMusic, speak, playSfx } = useSound();

  // Background music is armed the moment a player enters the multiplayer lobby, and the
  // SoundContext unlock listener starts it on the very first click/tap anywhere on the page.
  useEffect(() => {
    playMusic();
    return () => stopMusic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const subscribe = useCallback((code: string) => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const refetch = async () => {
      const { data, error: err } = await supabase.from("games").select("*").eq("room_code", code).single();
      if (err || !data) return;
      setStatus(data.status);
      setRoom(data.game_state as RoomState);
    };

    const channel = supabase
      .channel(`room-${code}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games", filter: `room_code=eq.${code}` },
        () => {
          refetch();
        },
      )
      .subscribe();
    channelRef.current = channel;
  }, []);

  useEffect(() => {
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
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
        tournament: null,
      };
      const { data, error: err } = await supabase
        .from("games")
        .insert({
          room_code: code,
          game_type: "whot",
          player1_id: playerId,
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
      subscribe(code);
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
        .update({ game_state: updatedRoom })
        .eq("id", found.id)
        .select()
        .single();
      if (updErr || !data) throw updErr ?? new Error("Could not join room");

      setRoomId(data.id);
      setRoomCode(code);
      setMySeatId(seatId);
      setStatus(data.status);
      setRoom(data.game_state as RoomState);
      subscribe(code);
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
      tournament: seatIds.length >= KNOCKOUT_MIN_PLAYERS ? createTournament(seatIds) : null,
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
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
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
      speak={speak}
      playSfx={playSfx}
    />
  );
}

function supabaseErrorMessage(e: unknown): string {
  const code = extractCode(e);
  const raw = extractMessage(e);
  const setupHint = "Multiplayer tables aren't set up yet — run supabase-cards-setup.sql (and supabase-cards-multiplayer-update.sql) against your Supabase project.";

  switch (code) {
    case "42P01": // undefined_table
      return setupHint;
    case "42703": // undefined_column
      return `${setupHint} (schema is out of date)`;
    case "42501": // insufficient_privilege (RLS)
      return "Access denied by row-level security — check your Supabase RLS policies for the games table.";
    case "PGRST116": // no rows for .single()
      return "Room not found or already started.";
    case "23505": // unique_violation
      return "That room code is already in use — try again.";
    case "PGRST301": // JWT expired / auth issue
      return "Supabase session expired — refresh the page and try again.";
  }

  if (!raw) return setupHint;
  if (/relation .* does not exist/i.test(raw) || /schema cache/i.test(raw) || /column .* does not exist/i.test(raw)) {
    return setupHint;
  }
  if (/room not found/i.test(raw) || /room is full/i.test(raw)) return raw;
  if (/failed to fetch/i.test(raw) || /network/i.test(raw)) {
    return "Couldn't reach Supabase — check your connection and try again.";
  }
  return `${setupHint} (${raw})`;
}

function extractCode(e: unknown): string | null {
  if (e && typeof e === "object" && "code" in e && typeof (e as { code: unknown }).code === "string") {
    return (e as { code: string }).code;
  }
  return null;
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
  speak,
  playSfx,
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
  speak: (text: string) => void;
  playSfx: (type: "click" | "whoosh" | "win" | "lose") => void;
}) {
  const roomRef = useRef(room);
  const timeoutRef = useRef<number | null>(null);
  const [pendingWhotCardId, setPendingWhotCardId] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(false);
  const hadGameRef = useRef(!!room.game);
  const prevGameRef = useRef<WhotGameState | null>(room.game);
  const processedFinishRef = useRef<WhotGameState | null>(null);

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
  const tournament = room.tournament ?? null;
  const amIEliminated = !!tournament?.eliminated.some((e) => e.seatId === mySeatId);

  // Announces game events by diffing each synced state transition -- runs identically on every
  // player's device, so everyone hears the moves that just happened regardless of who made them.
  useEffect(() => {
    const prev = prevGameRef.current;
    if (game && prev !== game) {
      if (prev && game.discard.length === prev.discard.length + 1) {
        const actor = prev.turn;
        const isMe = actor === mySeatId;
        const played = game.discard[game.discard.length - 1];
        if (played.suit === "Whot" && game.calledSuit) {
          speak(isMe ? `I need ${game.calledSuit}` : `${seatName(actor)} needs ${game.calledSuit}`);
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

        const actorHand = game.hands[actor];
        if (actorHand && actorHand.length === 0) {
          speak(isMe ? "Check up!" : `${seatName(actor)} check up!`);
        } else if (actorHand && actorHand.length === 1) {
          speak(isMe ? "Last card!" : `${seatName(actor)} last card!`);
        }
      }
      prevGameRef.current = game;
    }
  }, [game, mySeatId, speak]);

  // Announces knockouts the moment a round result becomes visible (once per result, on every device).
  const announcedResultRef = useRef<RoundResult | null>(null);
  useEffect(() => {
    const result = tournament?.lastRoundResult;
    if (!result || announcedResultRef.current === result) return;
    announcedResultRef.current = result;
    if (result.eliminatedSeat) {
      speak(`${seatName(result.eliminatedSeat)} is knocked out with ${result.scores[result.eliminatedSeat]} points!`);
    } else {
      speak("Perfect tie — everyone moves to the next round.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament?.lastRoundResult]);

  useEffect(() => {
    if (tournament?.champion) {
      speak(tournament.champion === mySeatId ? "You win the tournament!" : `${seatName(tournament.champion)} wins the tournament!`);
      playSfx(tournament.champion === mySeatId ? "win" : "lose");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament?.champion]);

  // Host resolves each round's outcome exactly once (deterministic from game state, so any double
  // write from a race would be idempotent, but gating to the host keeps a single writer per room).
  useEffect(() => {
    if (!isHost || !tournament || tournament.champion) return;
    if (!game || game.status !== "finished") return;
    if (processedFinishRef.current === game) return;
    processedFinishRef.current = game;

    if (tournament.remainingSeats.length <= 2) {
      const champion = game.winner;
      const loser = tournament.remainingSeats.find((s) => s !== champion) ?? null;
      const eliminated =
        loser && champion
          ? [...tournament.eliminated, { seatId: loser, round: tournament.round, score: handScore(game.hands[loser] ?? []) }]
          : tournament.eliminated;
      onWriteRoom({
        ...roomRef.current,
        tournament: {
          ...tournament,
          champion,
          remainingSeats: champion ? [champion] : tournament.remainingSeats,
          eliminated,
          lastRoundResult: null,
        },
      });
      return;
    }

    const result = computeRoundResult(game, tournament.round);
    onWriteRoom({ ...roomRef.current, tournament: applyRoundResult(tournament, result) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, isHost, tournament]);

  function startNextRound() {
    if (!tournament) return;
    const newGame = createWhotGame(tournament.remainingSeats);
    onWriteRoom({ ...room, game: newGame, tournament: { ...tournament, round: tournament.round + 1, lastRoundResult: null } });
  }

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

  // Records once the match is truly decided -- for a knockout table that's the tournament champion,
  // not any individual round's "safe" winner (a round ending isn't a win/loss by itself).
  useEffect(() => {
    if (!game) return;
    if (tournament) {
      if (!tournament.champion || recordedRef.current) return;
      recordedRef.current = true;
      const won = tournament.champion === mySeatId;
      const opponents = room.seats.filter((s) => s.id !== mySeatId).map((s) => s.name);
      recordMatch({
        game: "whot",
        result: won ? "win" : "loss",
        wager: WAGER,
        opponent: opponents.join(", ") || "Opponent",
        aiAssisted: room.aiAssist[mySeatId] ?? false,
      });
      return;
    }
    if (game.status === "playing" || recordedRef.current) return;
    recordedRef.current = true;
    const won = game.winner === mySeatId;
    playSfx(won ? "win" : "lose");
    speak(won ? "You win!" : "Game over!");
    const opponents = room.seats.filter((s) => s.id !== mySeatId).map((s) => s.name);
    recordMatch({
      game: "whot",
      result: won ? "win" : "loss",
      wager: WAGER,
      opponent: opponents.join(", ") || "Opponent",
      aiAssisted: room.aiAssist[mySeatId] ?? false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.status, tournament?.champion]);

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
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <SoundToggleButton />
            <button type="button" className="btn btn-ghost btn-sm" onClick={onLeave}>
              Leave room
            </button>
          </div>
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

  // Tournament decided -- show the champion and final standings.
  if (tournament?.champion) {
    const won = tournament.champion === mySeatId;
    return (
      <div className="container section" style={{ paddingBottom: "3rem" }}>
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
        <TournamentStandings tournament={tournament} seatName={seatName} mySeatId={mySeatId} />
        <ResultOverlay
          won={won}
          title={won ? "Tournament Champion!" : `${seatName(tournament.champion)} Wins the Tournament`}
          subtitle={won ? "You outlasted the whole table." : `${seatName(tournament.champion)} was the last player standing.`}
          payoutText={won ? `${(WAGER * room.seats.length).toFixed(2)} RITUAL to your wallet` : "Better luck next tournament"}
          onPlayAgain={() => {
            recordedRef.current = false;
            processedFinishRef.current = null;
            const seatIds = room.seats.map((s) => s.id);
            onWriteRoom({
              ...room,
              game: createWhotGame(seatIds),
              tournament: seatIds.length >= KNOCKOUT_MIN_PLAYERS ? createTournament(seatIds) : null,
            });
            setShowIntro(true);
          }}
          onExit={onLeave}
        />
      </div>
    );
  }

  // A round just ended and the host hasn't dealt the next one yet -- show the knockout result.
  if (tournament && game.status === "finished" && tournament.lastRoundResult) {
    const result = tournament.lastRoundResult;
    return (
      <div className="container section" style={{ paddingBottom: "3rem" }}>
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

        <div className="panel" style={{ padding: "2rem", marginBottom: "1.5rem", textAlign: "center" }}>
          <div className="chip chip-green" style={{ marginBottom: "1rem" }}>
            Round {result.round} complete
          </div>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>{seatName(result.safeSeat)} emptied their hand</h2>
          <p style={{ color: "var(--gray-400)", marginBottom: "1.5rem" }}>
            {result.eliminatedSeat
              ? `${seatName(result.eliminatedSeat)} had the highest hand and is knocked out.`
              : "Perfect tie on hand score — nobody is eliminated this round."}
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0.6rem", marginBottom: "1.5rem" }}>
            {game.players.map((seatId) => (
              <span
                key={seatId}
                className={`chip ${seatId === result.eliminatedSeat ? "chip-pink" : seatId === result.safeSeat ? "chip-green" : ""}`}
              >
                {seatName(seatId)} · {result.scores[seatId] ?? 0} pts
                {seatId === result.eliminatedSeat ? " · Knocked out" : ""}
              </span>
            ))}
          </div>

          {isHost ? (
            <button type="button" className="btn btn-primary" onClick={startNextRound}>
              Start Next Round
            </button>
          ) : (
            <p style={{ color: "var(--gray-400)", fontSize: "0.9rem" }}>Waiting for the host to start the next round…</p>
          )}
        </div>

        <TournamentStandings tournament={tournament} seatName={seatName} mySeatId={mySeatId} />
      </div>
    );
  }

  // I've already been knocked out in a previous round -- spectate the standings, not the board.
  if (tournament && amIEliminated) {
    return (
      <div className="container section" style={{ paddingBottom: "3rem" }}>
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
        <div className="panel" style={{ padding: "2rem", marginBottom: "1.5rem", textAlign: "center" }}>
          <div className="chip chip-pink" style={{ marginBottom: "1rem" }}>
            You're knocked out
          </div>
          <p style={{ color: "var(--gray-400)" }}>The remaining players are still battling it out. Standings update live below.</p>
        </div>
        <TournamentStandings tournament={tournament} seatName={seatName} mySeatId={mySeatId} />
      </div>
    );
  }

  const opponents = room.seats.filter((s) => s.id !== mySeatId && game.players.includes(s.id));
  const myPlayable = getPlayableCards(game, mySeatId);
  const isManualMyTurn = status === "active" && game.status === "playing" && game.turn === mySeatId && !room.aiAssist[mySeatId];
  // Standard Whot: a player may always choose to draw instead of playing, even with a valid card
  // in hand. Drawing this way (voluntary or forced) always ends the turn immediately.
  const canVoluntaryDraw = isManualMyTurn && !game.hasDrawnThisTurn;
  const top = topCard(game);

  function play(cardId: string, suit?: string) {
    if (!game) return;
    playSfx("click");
    const { state: nextGame } = playCard(game, mySeatId, cardId, suit);
    onWriteRoom({ ...room, game: nextGame });
  }

  function handleDraw() {
    if (!game) return;
    playSfx("whoosh");
    if (game.pendingPickThree > 0) {
      onWriteRoom({ ...room, game: resolvePickThree(game, mySeatId) });
    } else {
      onWriteRoom({ ...room, game: endTurn(voluntaryDraw(game, mySeatId)) });
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
          {tournament && (
            <span className="chip chip-gold">
              Knockout · Round {tournament.round} · {tournament.remainingSeats.length} left
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <SoundToggleButton />
          <button type="button" className="btn btn-ghost btn-sm" onClick={onLeave}>
            Leave room
          </button>
        </div>
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
                onClick={() => canVoluntaryDraw && handleDraw()}
                disabled={!canVoluntaryDraw}
                style={{ background: "none", border: "none", padding: 0, cursor: canVoluntaryDraw ? "pointer" : "default" }}
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

          {canVoluntaryDraw && (
            <div style={{ display: "flex", justifyContent: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
              <button type="button" className="btn btn-gold" onClick={handleDraw}>
                {game.pendingPickThree > 0 ? `Draw ${game.pendingPickThree} (Pick Three)` : "Draw from Market"}
              </button>
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

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {tournament && <TournamentStandings tournament={tournament} seatName={seatName} mySeatId={mySeatId} compact />}
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

/** Bracket/standings panel for Highest Hand Knockout: who's still in, and who's been knocked out and when. */
function TournamentStandings({
  tournament,
  seatName,
  mySeatId,
  compact = false,
}: {
  tournament: TournamentState;
  seatName: (id: SeatId) => string;
  mySeatId: SeatId;
  compact?: boolean;
}) {
  return (
    <div className="panel" style={{ padding: compact ? "1rem" : "1.5rem", marginBottom: compact ? 0 : "1.5rem" }}>
      <div className="data-label" style={{ marginBottom: "0.75rem" }}>
        {tournament.champion ? "Final Standings" : `Standings · Round ${tournament.round}`}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: tournament.eliminated.length ? "1rem" : 0 }}>
        {tournament.remainingSeats.map((seatId) => (
          <span key={seatId} className={`chip ${seatId === tournament.champion ? "chip-gold" : "chip-green"}`}>
            {seatId === tournament.champion ? "👑 " : ""}
            {seatName(seatId)}
            {seatId === mySeatId ? " (you)" : ""}
            {tournament.champion ? "" : " · still in"}
          </span>
        ))}
      </div>
      {tournament.eliminated.length > 0 && (
        <>
          <div className="data-label" style={{ marginBottom: "0.5rem" }}>
            Knocked Out
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {[...tournament.eliminated].reverse().map((e) => (
              <span key={e.seatId} className="chip" style={{ opacity: 0.75 }}>
                {seatName(e.seatId)}
                {e.seatId === mySeatId ? " (you)" : ""} · Round {e.round} · {e.score} pts
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
