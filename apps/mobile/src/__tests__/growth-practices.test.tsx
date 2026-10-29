// Growth practices: the author's "Share how it's going?" card (with "Prefer not to
// say"), and the private weekly "Three good things" card. Nothing shows while off.
import { act, fireEvent, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import { renderApp } from "@/__tests__/helpers";
import { FollowupCard } from "@/components/followup-card";
import { GratitudeCard } from "@/components/gratitude-card";
import { api } from "@/lib/api";
import { resetFeatures } from "@/lib/features";

jest.mock("@/lib/api", () => ({
  api: {
    features: jest.fn(),
    followup: jest.fn(),
    answerFollowup: jest.fn(),
    gratitude: jest.fn(),
    saveGratitude: jest.fn(),
    setGratitudeDay: jest.fn(),
  },
}));

const on = (f: { followupNudge?: boolean; gratitudeCard?: boolean }) =>
  jest
    .mocked(api.features)
    .mockResolvedValue({
      features: { followupNudge: false, gratitudeCard: false, ...f },
    } as Awaited<ReturnType<typeof api.features>>);

beforeEach(() => {
  resetFeatures();
  jest.mocked(api.followup).mockResolvedValue({ enabled: true, pending: true });
  jest
    .mocked(api.gratitude)
    .mockResolvedValue({
      enabled: true,
      weekday: null,
      weekStart: "2026-10-26",
      items: [],
    });
});

describe("Share how it is going", () => {
  it("shows nothing while off, or to anyone but the author", async () => {
    on({});
    await renderApp(<FollowupCard postId="p1" isMine />);
    expect(screen.queryByTestId("followup-card")).toBeNull();
    on({ followupNudge: true });
    resetFeatures();
    await renderApp(<FollowupCard postId="p1" isMine={false} />);
    expect(screen.queryByTestId("followup-card")).toBeNull();
    expect(api.followup).not.toHaveBeenCalled();
  });

  it("a grateful update sends the words; prefer-not-to-say closes it quietly", async () => {
    on({ followupNudge: true });
    jest
      .mocked(api.answerFollowup)
      .mockResolvedValue({ answer: "grateful", crisis: false });
    await renderApp(<FollowupCard postId="p1" isMine />);
    const grateful = await screen.findByTestId("followup-grateful");
    await act(async () => fireEvent.press(grateful));
    const words = await screen.findByPlaceholderText(
      "A few words for the people who prayed (optional)",
    );
    await act(async () => fireEvent.changeText(words, "It went well."));
    expect(screen.getByDisplayValue("It went well.")).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText("Share")));
    expect(api.answerFollowup).toHaveBeenCalledWith(
      "p1",
      "grateful",
      "It went well.",
    );
    expect(screen.getByText("Thank you for letting them know.")).toBeTruthy();
  });

  it("prefer not to say", async () => {
    on({ followupNudge: true });
    jest
      .mocked(api.answerFollowup)
      .mockResolvedValue({ answer: "private", crisis: false });
    await renderApp(<FollowupCard postId="p2" isMine />);
    const quiet = await screen.findByTestId("followup-private");
    await act(async () => fireEvent.press(quiet));
    expect(api.answerFollowup).toHaveBeenCalledWith("p2", "private", undefined);
    expect(screen.getByText("That's okay. Nothing was shared.")).toBeTruthy();
  });
});

describe("Three good things", () => {
  it("shows nothing while off", async () => {
    on({});
    await renderApp(<GratitudeCard />);
    expect(screen.queryByTestId("gratitude-card")).toBeNull();
  });

  it("saves up to three good things, picks a day, and can share them as a praise", async () => {
    on({ gratitudeCard: true });
    jest
      .mocked(api.saveGratitude)
      .mockResolvedValue({
        enabled: true,
        weekday: null,
        weekStart: "2026-10-26",
        items: ["A long walk"],
      });
    jest
      .mocked(api.setGratitudeDay)
      .mockResolvedValue({
        enabled: true,
        weekday: 5,
        weekStart: "2026-10-26",
        items: ["A long walk"],
      });
    await renderApp(<GratitudeCard />);
    await screen.findByTestId("gratitude-card");
    await act(async () =>
      fireEvent.changeText(
        screen.getAllByLabelText("Good thing 1")[0]!,
        "A long walk",
      ),
    );
    await act(async () => fireEvent.press(screen.getByText("Save")));
    expect(api.saveGratitude).toHaveBeenCalledWith(
      ["A long walk"],
      expect.any(String),
    );
    expect(screen.getByText("Saved. Well noticed.")).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText("Fri")));
    expect(api.setGratitudeDay).toHaveBeenCalledWith(5, expect.any(String));
    fireEvent.press(screen.getByText("Share as a praise"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/compose",
      params: { type: "praise", body: "A long walk" },
    });
  });
});
