import PrayerTowerKit
import SwiftUI
import WidgetKit
#if canImport(ActivityKit)
import ActivityKit
#endif

/// Sends the Pray now widget its content after each feed load, as src/lib/pray-widget.ts does.
@MainActor enum WidgetBridge {
    static func update(_ page: FeedPage?, model: AppModel) async {
        var snapshot = PrayNow.snapshot(page.flatMap(PrayNow.nextRequest), words: model.words)
        // Signed in: also say who prayed for the member today, while an admin has it on.
        if page != nil, model.features["prayedForWidget"], let p = try? await model.store.api.prayedFor() {
            snapshot.prayedFor = PrayNow.prayedForLine(p, words: model.words)
        }
        guard snapshot != PrayNow.load() else { return }
        PrayNow.save(snapshot)
        WidgetCenter.shared.reloadTimelines(ofKind: "PrayNow")
    }
}

#if os(iOS)
/// "Show on my Lock Screen" for the member's own open request: how many people prayed, and first
/// names, for up to 8 hours. Off until Admin → Growth turns on the Live Activity switch.
struct LiveFollowView: View {
    @Environment(AppModel.self) private var model
    let card: Card
    @State private var running = false
    @State private var error: String?

    private var w: Words { model.words }

    var body: some View {
        if model.features["prayedForLive"], card.isMine, card.postType == "prayer_request", card.state != "answered", ActivityAuthorizationInfo().areActivitiesEnabled {
            VStack(alignment: .leading, spacing: 6) {
                if running {
                    Button(w("growth.liveStop")) { Task { await stop() } }
                } else {
                    Button(w("growth.liveStart")) { Task { await start() } }
                    Text(w("growth.liveHint")).font(.footnote)
                }
                if let error { Text(error).font(.footnote).foregroundStyle(.red) }
            }
            .task(id: card.id) { running = activity != nil }
        }
    }

    private var activity: Activity<PrayedForAttributes>? { Activity<PrayedForAttributes>.activities.first { $0.attributes.postId == card.id } }

    private func start() async {
        do {
            let first = PrayedForProps.waiting(w)
            let a = try Activity.request(
                attributes: PrayedForAttributes(postId: card.id),
                content: .init(state: PrayedForState(first), staleDate: .now.addingTimeInterval(8 * 3600)),
                pushType: .token
            )
            running = true
            error = nil
            let api = model.store.api
            let postId = card.id
            let appId = Bundle.main.bundleIdentifier ?? "com.zoomatech.prayertower.native"
            let id = a.id
            // The server learns each push token as soon as iOS gives it, and answers with the words to show now.
            Task {
                for await data in a.pushTokenUpdates {
                    let token = data.map { String(format: "%02x", $0) }.joined()
                    if let props = try? await api.startLiveActivity(postId: postId, pushToken: token, appId: appId) {
                        await Self.update(id, props)
                    }
                }
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    // Activity's update and end run off the main actor, so each finds its activity there by id
    // rather than taking one from the main actor (Swift 6 data-race checks).
    nonisolated private static func update(_ id: String, _ props: PrayedForProps) async {
        await Activity<PrayedForAttributes>.activities.first { $0.id == id }?.update(.init(state: PrayedForState(props), staleDate: nil))
    }

    nonisolated private static func end(_ id: String) async {
        await Activity<PrayedForAttributes>.activities.first { $0.id == id }?.end(nil, dismissalPolicy: .immediate)
    }

    private func stop() async {
        guard let a = activity else { running = false; return }
        let token = a.pushToken.map { $0.map { String(format: "%02x", $0) }.joined() }
        await Self.end(a.id)
        running = false
        if let token { _ = try? await model.store.api.endLiveActivity(pushToken: token) }
    }
}
#else
/// Live Activities are iPhone and iPad only.
struct LiveFollowView: View {
    let card: Card
    var body: some View { EmptyView() }
}
#endif
