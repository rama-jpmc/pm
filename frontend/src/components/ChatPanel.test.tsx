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
        json: async () => ({ assistant_message: "OK", board: mockBoard }),
      }) as Promise<Response>
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits a message and shows the assistant response", async () => {
    const onBoardUpdate = vi.fn();

    render(<ChatPanel board={mockBoard} userId="user" onBoardUpdate={onBoardUpdate} />);

    await userEvent.type(screen.getByPlaceholderText(/type a message/i), "Hello");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(screen.getByText("OK")).toBeInTheDocument());
    expect(onBoardUpdate).toHaveBeenCalledWith(mockBoard);
  });
});
