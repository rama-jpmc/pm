# Full repository review

Scope: whole codebase (git status clean, no diff), with primary focus on `backend/app/main.py` and `frontend/src/**`. This review is additional to `docs/code_review.md` (whose tracked items are resolved except #7, #12, #13, #15) — it does not re-list resolved items and focuses on newly identified issues found by inspecting the current code as it stands.

Findings are ordered most-severe first. Each includes files/lines, the concrete failure scenario, and a suggested action.

## 1. AI-returned board is only shallowly validated, then persisted and rendered unguarded — a hallucinated field can corrupt saved state and crash the board

**Files:** `backend/app/main.py:119-125` (`parse_ai_response_text`), `backend/app/main.py:232-233` (`chat()` persists `board_update` unconditionally); `frontend/src/components/KanbanBoard.tsx:183`; `frontend/src/components/KanbanColumn.tsx:51-58`; `frontend/src/components/KanbanCard.tsx:13`

`parse_ai_response_text` only checks `isinstance(board_candidate, dict) and "columns" in board_candidate and "cards" in board_candidate` — it never checks that `columns` is a list, that every column's `cardIds` entries exist as keys in `cards`, that `cards` values have the right shape, or that a card id isn't duplicated across columns. This unchecked object is immediately persisted via `persist_board` (main.py:233) and returned to the client, which applies it to shared state with no further validation.

**Failure scenario:** The model (free-form JSON, only loosely constrained by `response_format: json_object`) returns a board where a column's `cardIds` includes an id not present in `cards` (plausible after being asked to "add/move a card" and only partially updating the object). This board is written straight to SQLite — corrupting the user's saved board permanently — and handed to the frontend. `KanbanBoard.tsx:183` does `column.cardIds.map((cardId) => board.cards[cardId])`, producing `undefined` entries; `KanbanColumn.tsx` maps those into `<KanbanCard card={card} .../>`, and `KanbanCard.tsx:13`'s `useSortable({ id: card.id })` throws on `undefined.id`. There's no error boundary, so this is a full white-screen crash, and because the bad board is already saved, a reload does not fix it.

**Action:** Validate the AI-returned board (and the direct `/api/board` payload — see #2) against a real schema — e.g. a Pydantic `Card`/`Column`/`Board` model with a check that every `cardIds` entry has a matching `cards` key — before persisting or returning it. Reject (or repair) rather than trust.

## 2. `POST /api/board` accepts and persists any JSON shape with zero validation

**Files:** `backend/app/main.py:58-60` (`BoardPayload.board: dict[str, Any]`), `backend/app/main.py:167-170` (`save_board`)

Unlike the (already-insufficient) checks in the chat path, the direct board-save endpoint applies no shape validation at all before calling `persist_board`. Both callers write to the same SQLite row that `get_board` later returns verbatim to every client.

**Failure scenario:** A buggy frontend state, a stray manual `curl`, or a future client bug POSTs `{"user_id": "user", "board": {"columns": [{"id": "c1", "cardIds": ["ghost"]}], "cards": {}}}`. It's persisted unchanged. The next `GET /api/board` returns it as-is, and the same crash path as #1 is hit — with no server-side rejection ever surfacing the problem.

**Action:** Same schema validation as #1, applied uniformly to both `/api/board` and `/api/chat`'s persistence path (a single shared validator, not two divergent ad hoc checks).

## 3. Login-time race can silently overwrite a user's real saved board with the demo seed

**Files:** `frontend/src/app/page.tsx:13-28`; `frontend/src/components/KanbanBoard.tsx:26-52`

`page.tsx` seeds `board` state with the hardcoded `initialData` demo board and renders `<KanbanBoard board={board} userId={userId} .../>` immediately on login; its own `useEffect` (lines 15-28) then fetches the real saved board and only applies it if non-empty. Independently, `KanbanBoard.tsx` has an autosave `useEffect` (lines 42-52) that POSTs whatever `board` it currently holds — initially the same `initialData` seed — whenever `[board, userId]` changes, which includes the very first render after login.

**Failure scenario:** Both effects fire from the same login state transition. React fires child-component effects before the parent's, but there's no guarantee on which HTTP round-trip *completes* first — `KanbanBoard`'s save-the-demo-seed POST can commit to SQLite before `page.tsx`'s GET resolves. If it does, the GET reads back the just-written demo data (5 columns, so it passes the `columns.length > 0` check) and `setBoard(payload.board)` installs it as if it were the user's real board — silently and permanently discarding whatever was actually saved, since nothing re-fetches or reconciles afterward.

**Action:** Don't let `KanbanBoard` autosave before the initial fetched-board result is known — e.g. gate the autosave effect on a "board has been loaded from the server at least once" flag owned by `page.tsx`, or move the initial-load fetch above `KanbanBoard`'s mount so the seed is never a candidate for a premature save.

## 4. Chat endpoint auto-persists board updates, contradicting the documented design and double-writing on every AI edit

**Files:** `backend/app/main.py:232-233`; documented rule in `backend/AGENTS.md:7`

`backend/AGENTS.md` states explicitly: *"Keep board persistence separate from chat flow; chat can suggest board changes without saving automatically."* `chat()` does the opposite — it calls `persist_board(payload.user_id, board_update)` unconditionally whenever the model includes a `board` field, before the client ever confirms or explicitly saves it. This also causes a redundant duplicate write: `ChatPanel.tsx:88` calls `onBoardUpdate(payload.board)` → `page.tsx`'s `setBoard` → `KanbanBoard.tsx`'s render-time prop sync (lines 35-40) applies the new board → the autosave `useEffect` (lines 42-52) fires and re-POSTs the identical board to `/api/board` — the same JSON is written to SQLite twice for a single AI turn.

**Failure scenario:** Any AI suggestion (even one the user would reject) is committed to durable storage immediately and irreversibly, with no "confirm this change" step, directly contradicting the stated design; separately, every chat-driven edit costs two SQLite upserts instead of one.

**Action:** Either update `backend/AGENTS.md` to reflect the current auto-save behavior as an intentional decision, or make `chat()` return the suggested board without persisting it, requiring an explicit client save (which would also remove the double-write).

## 5. In-flight chat request can silently clobber concurrent user board edits (lost update)

**Files:** `frontend/src/components/ChatPanel.tsx:42-90`; `backend/app/main.py:216` (30s `httpx` timeout on the OpenRouter call)

`ChatPanel.handleSubmit` sends the `board` prop captured in its closure at submit time. The backend's OpenRouter call has a 30-second timeout, so a round trip can take several seconds. `isLoading` only disables the chat input — it does not lock the Kanban board — so the user can freely drag/rename/add/delete cards while waiting. When the response arrives, `ChatPanel.tsx:87-90` calls `onBoardUpdate(payload.board)` unconditionally, replacing whatever is currently on screen with the AI's board computed from the stale pre-request state. There is no staleness check or merge anywhere in `ChatPanel.tsx`, `page.tsx`, or `KanbanBoard.tsx`.

**Failure scenario:** User sends a chat message, then drags a card to "Done" while waiting; when the AI reply lands seconds later, it silently reverts the drag (and any other edits made in the interim) with zero warning.

**Action:** Version or timestamp the board so a stale AI response can be detected and either merged or discarded with a warning, or lock board editing while a chat request is in flight.

## 6. `GET`/`POST /api/board` silently swallow all failures — data loss looks like success

**Files:** `frontend/src/app/page.tsx:20-27`; `frontend/src/components/KanbanBoard.tsx:47-52`

Both fetches use `.catch(() => undefined)` and never check `response.ok`, unlike `ChatPanel.tsx:76-79`/`91-97`, which explicitly checks `response.ok` and surfaces errors to the user.

**Failure scenario:** The backend is briefly unreachable (container restart, network blip) while the user drags cards, renames columns, or adds/deletes cards. Every autosave POST fails silently with no visible indication; on the next page load, the GET also fails silently, `board` stays at `initialData`, and the user sees the stale demo board with no signal that their edits were never persisted.

**Action:** Surface fetch failures (at minimum a toast/banner) consistent with how `ChatPanel` already handles its own request failures.

## 7. Column rename POSTs the full board on every keystroke — no debounce

**Files:** `frontend/src/components/KanbanColumn.tsx:44` (`onChange={(event) => onRename(column.id, event.target.value)}`); `frontend/src/components/KanbanBoard.tsx:42-52,86-93`

Every keystroke in the column-title input calls `onRename` → `updateBoard` → `setBoard`, which re-fires the autosave `useEffect` unconditionally.

**Failure scenario:** Typing a 20-character column name fires 20 sequential `POST /api/board` requests, each carrying the entire board JSON, where one request (on blur/debounce) would do.

**Action:** Debounce the autosave effect (e.g. 300-500ms) or only persist column-title edits on blur/Enter.

## 8. "Fall back to demo data when board is empty" is implemented three times and has already drifted

**Files:** `frontend/src/components/KanbanBoard.tsx:26-31` (`useState` initializer), `frontend/src/components/KanbanBoard.tsx:35-40` (render-time prop-sync block), `frontend/src/app/page.tsx:23` (fetch `.then()`)

The same "empty board → use `initialData`" policy is duplicated across three call sites instead of one shared helper (or a single point of truth, e.g. the backend seeding new users with `initialData` instead of returning a genuinely empty board).

**Failure scenario:** The three copies already differ in when/how they check emptiness (`payload.board.columns.length > 0` in `page.tsx` vs. `initialBoard.columns.length > 0` inline in `KanbanBoard.tsx` twice). A future change to what counts as "empty" (e.g. a user who legitimately deleted every card) is easy to apply to only some of the three copies, producing an inconsistent, hard-to-repro bug where demo data reappears in one code path but not another.

**Action:** Extract a single `resolveBoard(board): BoardData` helper in `lib/kanban.ts` and use it everywhere a board is loaded, or move the fallback server-side so the frontend never needs to special-case emptiness.

## 9. `ChatPanel` status text hardcodes non-palette Tailwind colors

**File:** `frontend/src/components/ChatPanel.tsx:134,136`

`CLAUDE.md`'s "Color palette is fixed: accent yellow `#ecad0a`, blue primary `#209dd7`, purple secondary `#753991`, dark navy `#032147`, gray text `#888888`" is followed everywhere else in this file via CSS variables (e.g. line 128's `bg-[var(--secondary-purple)]`), but the board-updated/error messages use Tailwind's stock `text-green-700` (line 134) and `text-red-600` (line 136) instead.

**Failure scenario:** These two lines render colors outside the documented palette, inconsistent with the rest of the component and the rest of the app, and will not track any future palette adjustment made via the CSS variables.

**Action:** Use palette-derived tokens (e.g. new `--success`/`--error` variables defined from the fixed palette, or reuse `--secondary-purple`/an existing token) instead of Tailwind's default color scale.

## 10. `KanbanBoard` duplicates board state across three places with a render-phase state sync

**File:** `frontend/src/components/KanbanBoard.tsx:25-40`

`KanbanBoard` holds its own `board` state, a `syncedBoard` mirror that exists only to detect when the `initialBoard` prop reference changes, and calls `setSyncedBoard`/`setBoard` during render (lines 35-40) to keep them aligned — on top of `page.tsx` already owning the canonical `board` state and passing `onBoardChange`.

**Failure scenario:** Not a crash, but real maintenance cost: three copies of "the board" must stay in sync via a render-time side effect that's easy to get subtly wrong (as already happened once — see the "Addendum" entry in `docs/code_review.md` about a React "Cannot update a component while rendering a different component" error from this exact code path). Since `page.tsx` already owns canonical state and threads `onBoardChange` through, `KanbanBoard` could be a fully controlled component with no internal board state at all.

**Action:** Make `KanbanBoard` read `board` directly from props and call `onBoardChange` on every mutation, removing the internal `board`/`syncedBoard` state and the render-time sync block entirely.
