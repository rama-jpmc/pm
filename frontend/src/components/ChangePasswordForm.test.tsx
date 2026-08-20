import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

describe("ChangePasswordForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits the current and new password and shows a success message", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status: "password_updated" }),
      }) as Promise<Response>
    );

    render(<ChangePasswordForm token="tok-1" onClose={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/current password/i), "old-pw");
    await userEvent.type(screen.getByLabelText(/new password/i), "new-pw");
    await userEvent.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText(/password updated/i)).toBeInTheDocument();

    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/auth/password");
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body)).toEqual({
      current_password: "old-pw",
      new_password: "new-pw",
    });
  });

  it("shows an error when the current password is wrong", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        json: async () => ({ detail: "Current password is incorrect" }),
      }) as Promise<Response>
    );

    render(<ChangePasswordForm token="tok-1" onClose={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/current password/i), "wrong");
    await userEvent.type(screen.getByLabelText(/new password/i), "new-pw");
    await userEvent.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText(/current password is incorrect/i)).toBeInTheDocument();
  });

  it("calls onClose when Close is clicked", async () => {
    const onClose = vi.fn();
    render(<ChangePasswordForm token="tok-1" onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: /^close$/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
