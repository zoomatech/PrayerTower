import PrayerTowerKit
import SwiftUI

/// The prayer feed: each card with ONE row of action icons (docs/SWIFT_PORT.md, phase 1).
struct FeedView: View {
    @Environment(AppModel.self) private var model
    @State private var posts: [Card] = []
    /// The member's feed skin; nil is the plain column.
    @State private var theme: FeedTheme?
    @State private var nextPage: Int?
    @State private var done: [String: Set<CardAction>] = [:]
    @State private var encouraging: Card?
    @State private var notice: String?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Group {
                if let theme, theme.kind != .column {
                    SkinnedFeed(theme: theme, cards: posts, wording: model.wording, hasMore: nextPage != nil, row: row, onEnd: more) { act(.prayingNow, on: $0) }
                } else {
                    List {
                        ForEach(posts) { card in
                            row(card).task { if card.id == posts.last?.id { await more() } }
                        }
                    }
                }
            }
            .overlay {
                if let error { ContentUnavailableView("Couldn’t load the feed", systemImage: "wifi.exclamationmark", description: Text(error)) }
            }
            .navigationTitle(model.wording == .neutral ? "Requests" : "Prayers")
            .refreshable { await load() }
            .task(id: model.feedStyle) { await load() }
            .sheet(item: $encouraging) { card in EncourageSheet(card: card) { note in Task { await encourage(card, note) } } }
            .alert(notice ?? "", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) { Button("OK") {} }
        }
    }

    private func row(_ card: Card) -> some View {
        CardRow(card: card, active: done[card.id] ?? [], onAction: { act($0, on: card) }, onMeaning: { item, meaning in
            Task { await choose(meaning, of: item, on: card) }
        })
    }

    private func load() async {
        do {
            let page = try await model.store.api.feed()
            posts = page.posts
            theme = page.theme
            nextPage = page.nextPage
            error = nil
        } catch let e as APIError where e.needsCode {
            model.state = .needsCode
        } catch let e as APIError where e.signedOut {
            model.state = .signedOut
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func more() async {
        guard let page = nextPage, let next = try? await model.store.api.feed(page: page) else { return }
        posts += next.posts.filter { p in !posts.contains { $0.id == p.id } }
        nextPage = next.nextPage
    }

    private func act(_ action: CardAction, on card: Card) {
        switch action {
        case .prayingNow: Task { await run(card, action) { _ = try await model.store.api.prayingNow(postId: card.id) } }
        case .wellWishes: Task { await run(card, action) { _ = try await model.store.api.react(postId: card.id, kind: "well_wishes") } }
        case .encouragement: encouraging = card
        case .share: Task { await run(card, action) { _ = try await model.store.api.react(postId: card.id, kind: "share") } }
        // Not ported yet: these open in the pilot app for now (docs/SWIFT_PORT.md, phase 2 and 4).
        case .commit, .giftTokens: notice = "\(action.name(model.wording)) is coming to this app soon. For now, use it in the Prayer Tower app."
        }
    }

    private func encourage(_ card: Card, _ note: String) async {
        await run(card, .encouragement) { _ = try await model.store.api.react(postId: card.id, kind: "encouragement", note: note) }
        encouraging = nil
    }

    private func choose(_ meaning: MeaningEmoji.Meaning, of item: ActionItem, on card: Card) async {
        guard let emoji = item.meanings?.key else { return }
        do {
            _ = try await model.store.api.chooseMeaning(postId: card.id, emoji: emoji, meaning: meaning.key)
            AccessibilityNotification.Announcement(meaning.word(model.wording)).post()
        } catch {
            notice = error.localizedDescription
        }
    }

    private func run(_ card: Card, _ action: CardAction, _ call: () async throws -> Void) async {
        do {
            try await call()
            done[card.id, default: []].insert(action)
            AccessibilityNotification.Announcement("\(action.name(model.wording)): done").post()
        } catch {
            notice = error.localizedDescription
        }
    }
}

struct CardRow: View {
    @Environment(AppModel.self) private var model
    let card: Card
    let active: Set<CardAction>
    let onAction: (CardAction) -> Void
    let onMeaning: (ActionItem, MeaningEmoji.Meaning) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 8) {
                Text(card.author.displayName).font(.subheadline.bold())
                Text(card.preview)
                if card.counts.prayers > 0 {
                    Text(model.wording == .neutral ? "\(card.counts.prayers) people thinking of this" : "\(card.counts.prayers) praying")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .accessibilityElement(children: .combine)
            ActionRowView(
                items: ActionRow.items(actions: card.actions ?? (card.isMine ? [] : ["praying_now"]), features: model.features, tree: model.tree, wording: model.wording),
                wording: model.wording,
                active: active,
                onAction: onAction,
                onMeaning: onMeaning
            )
        }
        .padding(.vertical, 4)
    }
}

/// A short encouragement, with the kind cloud under the text box.
struct EncourageSheet: View {
    let card: Card
    let send: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""

    var body: some View {
        NavigationStack {
            Form {
                Section { Text(card.preview).foregroundStyle(.secondary) }
                Section { KindComposer(title: "A few kind words", text: $text, limit: 77) }
            }
            .navigationTitle("Encourage")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Send") { send(text.trimmingCharacters(in: .whitespacesAndNewlines)) }
                        .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}
