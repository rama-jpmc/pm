import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

describe("KanbanBoard", () => {
  it("renders five columns", () => {
    render(<KanbanBoard />);
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("renames a column", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
  });

  it("adds and removes a card", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(within(column).getByText("New card")).toBeInTheDocument();

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
  });

  it("adds a card with a priority and due date", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();
    await userEvent.click(within(column).getByRole("button", { name: /add a card/i }));

    await userEvent.type(within(column).getByPlaceholderText(/card title/i), "Urgent task");
    await userEvent.selectOptions(within(column).getByLabelText("Priority"), "high");
    const dueDateInput = within(column).getByLabelText("Due date");
    await userEvent.type(dueDateInput, "2099-09-01");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    const newCard = within(column).getByText("Urgent task").closest("article");
    expect(newCard).not.toBeNull();
    expect(within(newCard as HTMLElement).getByText("high")).toBeInTheDocument();
    expect(within(newCard as HTMLElement).getByText("Due 2099-09-01")).toBeInTheDocument();
  });

  it("adds a new column via the header control", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("Ideas");
    render(<KanbanBoard />);

    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
    await userEvent.click(screen.getByRole("button", { name: /add column/i }));

    expect(screen.getAllByTestId(/column-/i)).toHaveLength(6);
    expect(screen.getByDisplayValue("Ideas")).toBeInTheDocument();
  });

  it("deletes a column along with its cards", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<KanbanBoard />);
    const column = getFirstColumn();
    const cardTitle = within(column).getAllByRole("heading")[0].textContent;

    await userEvent.click(within(column).getByLabelText(/delete backlog column/i));

    expect(screen.getAllByTestId(/column-/i)).toHaveLength(4);
    if (cardTitle) {
      expect(screen.queryByText(cardTitle)).not.toBeInTheDocument();
    }
  });

  it("edits an existing card's title, details, priority, and due date", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();

    await userEvent.click(within(column).getByLabelText("Edit Gather customer signals"));

    const titleInput = within(column).getByLabelText("Edit card title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Gather signals (updated)");

    await userEvent.selectOptions(within(column).getByLabelText("Edit card priority"), "high");
    await userEvent.type(within(column).getByLabelText("Edit card due date"), "2099-10-01");

    await userEvent.click(within(column).getByRole("button", { name: /^save$/i }));

    expect(within(column).queryByText("Gather customer signals")).not.toBeInTheDocument();
    const editedCard = within(column).getByText("Gather signals (updated)").closest("article");
    expect(editedCard).not.toBeNull();
    expect(within(editedCard as HTMLElement).getByText("Due 2099-10-01")).toBeInTheDocument();
  });

  it("cancels an edit without applying changes", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();

    await userEvent.click(within(column).getByLabelText("Edit Gather customer signals"));
    const titleInput = within(column).getByLabelText("Edit card title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Should not stick");
    await userEvent.click(within(column).getByRole("button", { name: /cancel/i }));

    expect(within(column).getByText("Gather customer signals")).toBeInTheDocument();
    expect(within(column).queryByText("Should not stick")).not.toBeInTheDocument();
  });

  it("shows an overdue label for a card with a past due date", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();

    await userEvent.click(within(column).getByLabelText("Edit Gather customer signals"));
    await userEvent.type(within(column).getByLabelText("Edit card due date"), "2020-01-01");
    await userEvent.click(within(column).getByRole("button", { name: /^save$/i }));

    const editedCard = within(column).getByText("Gather customer signals").closest("article");
    expect(within(editedCard as HTMLElement).getByText("Overdue 2020-01-01")).toBeInTheDocument();
  });

  it("filters cards by the search box", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();

    expect(within(column).getByText("Align roadmap themes")).toBeInTheDocument();
    expect(within(column).getByText("Gather customer signals")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Search cards"), "Align");

    expect(within(column).getByText("Align roadmap themes")).toBeInTheDocument();
    expect(within(column).queryByText("Gather customer signals")).not.toBeInTheDocument();
  });
});
