import PrayerTowerKit
import SwiftUI

/// Me → Notices: the member's in-app notes, newest first, marked read once seen. A note about a
/// post opens it; a removal the moderator allowed offers "Post again with changes" (`pathBack`).
struct NoticesView: View {
    @Environment(AppModel.self) private var model
    @State private var items: [AppNotice]?
    @State private var opened: Opened?
    @State private var composing: NewPost?
    @State private var error: String?

    struct Opened: Identifiable, Hashable { let postId: String; let draft: String?; var id: String { postId } }

    private var w: Words { model.words }

    var body: some View {
        List {
            if let error { Text(error).foregroundStyle(.red) }
            ForEach(items ?? []) { n in
                VStack(alignment: .leading, spacing: 4) {
                    Text(n.title).bold()
                    if !n.body.isEmpty { Text(n.body) }
                    Text(when(n.createdAt)).font(.caption).foregroundStyle(.secondary)
                    if model.features["pathBack"], let item = n.postAgainItem {
                        Button(w("pathBack.again")) { Task { await postAgain(item) } }.buttonStyle(.bordered)
                    }
                }
                .contentShape(.rect)
                .onTapGesture { if let id = n.postId { opened = Opened(postId: id, draft: nil) } }
                .accessibilityAddTraits(n.postId == nil ? [] : .isLink)
                .listRowBackground(n.readAt == nil ? Color.accentColor.opacity(0.08) : nil)
            }
        }
        .overlay {
            if items?.isEmpty == true { ContentUnavailableView(w("notices.empty"), systemImage: "bell") }
            else if items == nil, error == nil { ProgressView() }
        }
        .navigationTitle(w("tabs.notices"))
        .navigationDestination(item: $opened) { PostDetailView(postId: $0.postId, draft: $0.draft) }
        .sheet(item: Binding(get: { composing.map { Draft(post: $0) } }, set: { composing = $0?.post })) { d in ComposeView(start: d.post) }
        .refreshable { await load() }
        .task { await load() }
    }

    private struct Draft: Identifiable { let post: NewPost; var id: String { post.body } }

    private func load() async {
        do {
            let list = try await model.store.api.notices()
            items = list
            error = nil
            let unread = list.filter { $0.readAt == nil }.map(\.id)
            if !unread.isEmpty { try? await model.store.api.markRead(unread) }
        } catch { self.error = error.localizedDescription }
    }

    /// The author's own words open again: a post in the composer, a comment in its post's box.
    private func postAgain(_ item: String) async {
        do {
            let words = try await model.store.api.removedWords(item)
            if let post = words.newPost { composing = post }
            else if let id = words.postId { opened = Opened(postId: id, draft: words.body) }
        } catch { self.error = error.localizedDescription }
    }

    private func when(_ iso: String) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let d = f.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return iso }
        return d.formatted(date: .abbreviated, time: .shortened)
    }
}
