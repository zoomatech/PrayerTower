import PrayerTowerKit
import SwiftUI

/// On the author's own post (`followupNudge`): "Share how it's going?", once, with three ways to
/// answer and "Prefer not to say", which closes it quietly.
struct FollowupSection: View {
    @Environment(AppModel.self) private var model
    let postId: String
    var onAnswered: () -> Void = {}
    @State private var pending = false
    @State private var choice: FollowupAnswer?
    @State private var text = ""
    @State private var done: String?
    @State private var error: String?
    @State private var busy = false

    private var w: Words { model.words }

    var body: some View {
        Group {
            if let done {
                Section { Text(done).foregroundStyle(.tint) }
            } else if pending {
                Section {
                    Text(w("practices.followupIntro")).font(.footnote)
                    if let choice {
                        TextField(w("practices.followupPlaceholder"), text: $text, axis: .vertical)
                            .accessibilityLabel(w(choice.wordKey))
                            .onChange(of: text) { text = String(text.prefix(2000)) }
                        Button(w("practices.followupSend")) { Task { await send(choice) } }.disabled(busy)
                        Button(w("practices.followupBack")) { self.choice = nil }
                    } else {
                        ForEach(FollowupAnswer.sharing, id: \.self) { a in Button(w(a.wordKey)) { choice = a } }
                        Button(w("practices.followupPrivate")) { Task { await send(.private) } }.disabled(busy)
                    }
                    if let error { Text(error).foregroundStyle(Color.danger) }
                } header: {
                    Text(w("practices.followupTitle"))
                }
            }
        }
        .task(id: postId) { pending = (try? await model.store.api.followup(postId: postId))?.pending ?? false }
    }

    private func send(_ a: FollowupAnswer) async {
        busy = true
        defer { busy = false }
        do {
            _ = try await model.store.api.answerFollowup(postId: postId, a, body: text)
            done = w(a.doneKey)
            AccessibilityNotification.Announcement(w(a.doneKey)).post()
            onAnswered()
        } catch { self.error = error.localizedDescription }
    }
}
