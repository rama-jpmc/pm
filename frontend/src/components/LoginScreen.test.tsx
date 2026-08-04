import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginScreen } from "@/components/LoginScreen";

describe("LoginScreen", () => {
  it("submits demo credentials", async () => {
    const onLogin = vi.fn();
    render(<LoginScreen onLogin={onLogin} />);

    await userEvent.clear(screen.getByLabelText(/username/i));
    await userEvent.type(screen.getByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(onLogin).toHaveBeenCalledWith("user");
  });
});
