import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPanel } from "@/components/ChatPanel";

describe("ChatPanel", () => {
  it("submits a message and shows it", async () => {
    render(<ChatPanel />);

    await userEvent.type(screen.getByPlaceholderText(/type a message/i), "Hello");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(screen.getByText("You asked: Hello")).toBeInTheDocument();
  });
});
