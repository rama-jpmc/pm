import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { BoardSwitcher } from "@/components/BoardSwitcher";

const boards = [
  {
    id: "board-1",
    name: "Board One",
    updated_at: "2026-01-01",
    is_owner: true,
    owner_username: "alice",
  },
  {
    id: "board-2",
    name: "Board Two",
    updated_at: "2026-01-02",
    is_owner: true,
    owner_username: "alice",
  },
];

describe("BoardSwitcher", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders every board and highlights the active one", () => {
    render(
      <BoardSwitcher
        boards={boards}
        activeBoardId="board-1"
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText("Board One")).toBeInTheDocument();
    expect(screen.getByText("Board Two")).toBeInTheDocument();
  });

  it("calls onSelect when a board is clicked", async () => {
    const onSelect = vi.fn();
    render(
      <BoardSwitcher
        boards={boards}
        activeBoardId="board-1"
        onSelect={onSelect}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    await userEvent.click(screen.getByText("Board Two"));
    expect(onSelect).toHaveBeenCalledWith("board-2");
  });

  it("prompts for a name and calls onCreate", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("New board");
    const onCreate = vi.fn();
    render(
      <BoardSwitcher
        boards={boards}
        activeBoardId="board-1"
        onSelect={vi.fn()}
        onCreate={onCreate}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /new board/i }));
    expect(onCreate).toHaveBeenCalledWith("New board");
  });

  it("renames a board via the inline input", async () => {
    const onRename = vi.fn();
    render(
      <BoardSwitcher
        boards={boards}
        activeBoardId="board-1"
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onRename={onRename}
        onDelete={vi.fn()}
      />
    );

    await userEvent.click(screen.getByLabelText("Rename Board One"));
    const input = screen.getByLabelText("Rename Board One");
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed{Enter}");

    expect(onRename).toHaveBeenCalledWith("board-1", "Renamed");
    expect(onRename).toHaveBeenCalledTimes(1);
  });

  it("does not call onRename when Escape cancels a rename", async () => {
    const onRename = vi.fn();
    render(
      <BoardSwitcher
        boards={boards}
        activeBoardId="board-1"
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onRename={onRename}
        onDelete={vi.fn()}
      />
    );

    await userEvent.click(screen.getByLabelText("Rename Board One"));
    const input = screen.getByLabelText("Rename Board One");
    await userEvent.clear(input);
    await userEvent.type(input, "Should not save{Escape}");

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByText("Board One")).toBeInTheDocument();
  });

  it("confirms before calling onDelete", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onDelete = vi.fn();
    render(
      <BoardSwitcher
        boards={boards}
        activeBoardId="board-1"
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onDelete={onDelete}
      />
    );

    await userEvent.click(screen.getByLabelText("Delete Board One"));
    expect(onDelete).toHaveBeenCalledWith("board-1");
  });

  it("hides delete and shows the owner for a board the user doesn't own", () => {
    const sharedBoards = [
      {
        id: "board-3",
        name: "Team board",
        updated_at: "2026-01-03",
        is_owner: false,
        owner_username: "bob",
      },
    ];

    render(
      <BoardSwitcher
        boards={sharedBoards}
        activeBoardId="board-3"
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText(/shared by bob/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Delete Team board")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Rename Team board")).toBeInTheDocument();
  });
});
