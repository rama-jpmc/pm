import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { CollaboratorsPanel } from "@/components/CollaboratorsPanel";

const jsonResponse = (body: unknown, status = 200) =>
  Promise.resolve({
    ok: status < 400,
    status,
    json: async () => body,
  }) as Promise<Response>;

describe("CollaboratorsPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads and shows existing collaborators", async () => {
    global.fetch = vi.fn(() => jsonResponse([{ user_id: "u2", username: "bob" }]));

    render(<CollaboratorsPanel token="tok" boardId="board-1" isOwner onClose={vi.fn()} />);

    expect(await screen.findByText("bob")).toBeInTheDocument();
  });

  it("shows an empty state with no collaborators", async () => {
    global.fetch = vi.fn(() => jsonResponse([]));

    render(<CollaboratorsPanel token="tok" boardId="board-1" isOwner onClose={vi.fn()} />);

    expect(await screen.findByText(/no one else has access/i)).toBeInTheDocument();
  });

  it("lets the owner add a collaborator by username", async () => {
    global.fetch = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse([]))
      .mockImplementationOnce(() => jsonResponse([{ user_id: "u2", username: "bob" }], 201));

    render(<CollaboratorsPanel token="tok" boardId="board-1" isOwner onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/no one else has access/i)).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/add collaborator username/i), "bob");
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

    expect(await screen.findByText("bob")).toBeInTheDocument();
  });

  it("does not show add/remove controls for a non-owner", async () => {
    global.fetch = vi.fn(() => jsonResponse([{ user_id: "u2", username: "bob" }]));

    render(<CollaboratorsPanel token="tok" boardId="board-1" isOwner={false} onClose={vi.fn()} />);

    await screen.findByText("bob");
    expect(screen.queryByLabelText(/add collaborator username/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/remove bob/i)).not.toBeInTheDocument();
  });

  it("removes a collaborator when the owner clicks remove", async () => {
    global.fetch = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse([{ user_id: "u2", username: "bob" }]))
      .mockImplementationOnce(() => jsonResponse(undefined, 204));

    render(<CollaboratorsPanel token="tok" boardId="board-1" isOwner onClose={vi.fn()} />);
    await screen.findByText("bob");

    await userEvent.click(screen.getByLabelText(/remove bob/i));

    await waitFor(() => expect(screen.queryByText("bob")).not.toBeInTheDocument());
  });

  it("calls onClose when Close is clicked", async () => {
    global.fetch = vi.fn(() => jsonResponse([]));
    const onClose = vi.fn();

    render(<CollaboratorsPanel token="tok" boardId="board-1" isOwner onClose={onClose} />);
    await waitFor(() => expect(screen.getByText(/no one else has access/i)).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /^close$/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
