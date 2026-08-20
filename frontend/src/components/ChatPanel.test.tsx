import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { ChatPanel } from "@/components/ChatPanel";

const mockBoard = { columns: [], cards: {} };

describe("ChatPanel", () => {
  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ assistant_message: "OK", board: mockBoard }),
      }) as Promise<Response>
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits a message and shows the assistant response", async () => {
    const onBoardUpdate = vi.fn();

    render(
      <ChatPanel
        board={mockBoard}
        boardId="board-1"
        token="tok-1"
        onBoardUpdate={onBoardUpdate}
      />
    );

    await userEvent.type(screen.getByPlaceholderText(/type a message/i), "Hello");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(screen.getByText("OK")).toBeInTheDocument());
    expect(onBoardUpdate).toHaveBeenCalledWith(mockBoard);

    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/chat");
    expect(options.method).toBe("POST");
    expect((options.headers as Headers).get("Authorization")).toBe("Bearer tok-1");
  });

  it("shows an error instead of sending when there is no active board", async () => {
    render(<ChatPanel board={mockBoard} boardId={null} token={null} onBoardUpdate={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText(/type a message/i), "Hello");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(
      await screen.findByText(/unable to send message without a signed-in user/i)
    ).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
