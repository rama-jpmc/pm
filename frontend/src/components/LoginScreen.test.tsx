import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { LoginScreen } from "@/components/LoginScreen";

const authPayload = { token: "tok-1", user_id: "user-1", username: "alice" };

describe("LoginScreen", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs in with valid credentials", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => authPayload,
      }) as Promise<Response>
    );

    const onAuthenticated = vi.fn();
    render(<LoginScreen onAuthenticated={onAuthenticated} />);

    await userEvent.type(screen.getByLabelText(/username/i), "alice");
    await userEvent.type(screen.getByLabelText(/password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(authPayload));
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/login"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("shows an error on invalid credentials", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        json: async () => ({ detail: "Invalid username or password" }),
      }) as Promise<Response>
    );

    render(<LoginScreen onAuthenticated={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/username/i), "alice");
    await userEvent.type(screen.getByLabelText(/password/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/invalid username or password/i)).toBeInTheDocument();
  });

  it("switches to register mode and creates an account", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 201,
        json: async () => authPayload,
      }) as Promise<Response>
    );

    const onAuthenticated = vi.fn();
    render(<LoginScreen onAuthenticated={onAuthenticated} />);

    await userEvent.click(screen.getByRole("button", { name: /need an account/i }));
    await userEvent.type(screen.getByLabelText(/username/i), "alice");
    await userEvent.type(screen.getByLabelText(/password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(authPayload));
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/register"),
      expect.objectContaining({ method: "POST" })
    );
  });
});
