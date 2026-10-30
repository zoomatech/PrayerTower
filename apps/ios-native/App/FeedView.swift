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
    @State private var composing = false
    @State private var opened: String?
    @State private var committing: Card?
    @State private var gifting: Card?
    @State private var sharing: Card?
    @State private var notice: String?
    @State private var error: String?
    /// Set while showing the feed saved on the device, because the server can't be reached.
    @State private var savedAt: Date?
    @State private var pending = 0
    @State private var dropped: [String] = []
    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var width
    /// iPad full screen or a wide split: the plain feed shows in several columns.
    private var wide: Bool { width == .regular }
    #else
    private let wide = true
    #endif

    var body: some View {
        NavigationStack {
            Group {
                if let theme, theme.kind != .column {
                    SkinnedFeed(theme: theme, cards: posts, wording: model.wording, hasMore: nextPage != nil, row: row, onEnd: more, onPray: { act(.prayingNow, on: $0) }, onOpen: { opened = $0.id })
                        .skinBars(Skin.backdrop(theme))
                } else if wide {
                    grid
                } else {
                    List {
                        banner
                        DailyPassageCard()
                        SurveyPrompts()
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
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { composing = true } label: { Label(model.words("compose.post"), systemImage: "square.and.pencil") }
                        .keyboardShortcut("n", modifiers: .command)
                }
                if wide {
                    // No pull-to-refresh with a pointer: a button, and ⌘R.
                    ToolbarItem(placement: .primaryAction) {
                        Button { Task { await load() } } label: { Label("Refresh", systemImage: "arrow.clockwise") }
                            .keyboardShortcut("r", modifiers: .command)
                    }
                }
            }
            .navigationDestination(item: $opened) { PostDetailView(postId: $0) }
            // A tap on the Pray now widget or the Live Activity opens its request.
            .onChange(of: model.openPost, initial: true) { _, id in
                guard let id else { return }
                opened = id
                model.openPost = nil
            }
            .sheet(item: $committing) { card in
                CommitSheet(card: card) { message in
                    done[card.id, default: []].insert(.commit)
                    notice = message
                }
            }
            .sheet(item: $gifting) { card in
                GiftSheet(card: card) { message in
                    done[card.id, default: []].insert(.giftTokens)
                    notice = message
                }
            }
            .sheet(item: $sharing) { card in
                ShareSheet(card: card) { message in
                    done[card.id, default: []].insert(.share)
                    notice = message
                }
            }
            .sheet(isPresented: $composing) { ComposeView { _ in Task { await load() } } }
            .refreshable { await load() }
            .task(id: model.feedStyle) { await load() }
            .sheet(item: $encouraging) { card in EncourageSheet(card: card) { note in Task { await encourage(card, note) } } }
            .alert(notice ?? "", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) { Button("OK") {} }
        }
    }

    private var banner: some View {
        OfflineBanner(savedAt: savedAt, pending: pending, dropped: dropped) { Task { await load() } } onDismiss: {
            dropped = []
            Task { await OfflineStore.shared.dismissDropped() }
        }
    }

    /// The plain feed in as many columns as fit (iPad, Mac), newest first, read left to right.
    private var grid: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                banner
                SurveyPrompts()
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 320), spacing: 16, alignment: .top)], spacing: 16) {
                    ForEach(posts) { card in
                        row(card)
                            .padding(14)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(.background.secondary, in: .rect(cornerRadius: 14))
                            .pointerHover()
                            .task { if card.id == posts.last?.id { await more() } }
                    }
                }
            }
            .padding(16)
        }
    }

    private func row(_ card: Card) -> some View {
        CardRow(card: card, active: done[card.id] ?? [], onAction: { act($0, on: card) }, onMeaning: { item, meaning in
            Task { await choose(meaning, of: item, on: card) }
        }, onOpen: { opened = card.id }, onOpenPost: { opened = $0 })
    }

    private func load() async {
        do {
            let saved = try await model.store.api.cachedFeed()
            let page = saved.value
            savedAt = saved.savedAt
            pending = await OfflineStore.shared.pending().count
            dropped = await OfflineStore.shared.droppedNow().map { "\(model.words.server($0.label)): \($0.message)" }
            posts = page.posts
            // Skin screenshots (scripts/mac-screenshots-native.sh) draw the sample feed in a built-in skin.
            theme = SampleServer.skin().flatMap { slug in AuditSamplesView.skins.first { $0.slug == slug } } ?? page.theme
            nextPage = page.nextPage
            error = nil
            await WidgetBridge.update(page, model: model)
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
        case .prayingNow:
            Task {
                await run(card, action) {
                    // Offline, the tap waits on the device and is sent once the server answers again.
                    if try await model.store.api.prayingNowOrQueue(postId: card.id) == nil { pending = await OfflineStore.shared.pending().count }
                }
            }
        case .wellWishes: Task { await run(card, action) { _ = try await model.store.api.react(postId: card.id, kind: "well_wishes") } }
        case .encouragement: encouraging = card
        case .share: sharing = card
        case .commit: committing = card
        case .giftTokens: gifting = card
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
    /// Opens the post with its comments.
    var onOpen: (() -> Void)?
    /// Opens another post by id: an answered-prayer story and the request it answers.
    var onOpenPost: ((String) -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 8) {
                // Answered: a gold mark, as the Expo card's banner and border.
                if card.isAnswered { Text(model.words("card.answered")).font(.subheadline.bold()).foregroundStyle(Color.answeredText) }
                Text(card.author.displayName).font(.subheadline.bold())
                Text(card.preview)
                if card.counts.prayers > 0 {
                    Text(model.wording == .neutral ? "\(card.counts.prayers) people thinking of this" : "\(card.counts.prayers) praying")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .contentShape(.rect)
            .onTapGesture { onOpen?() }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(onOpen == nil ? [] : .isButton)
            .accessibilityAction { onOpen?() }
            if model.features["answeredStories"] {
                if let a = card.answers {
                    Button("🌅 " + model.words("answeredStory.answers", ["preview": a.preview])) { onOpenPost?(a.id) }.font(.footnote).buttonStyle(.borderless)
                }
                if let id = card.storyId {
                    Button("🌅 " + model.words("answeredStory.read")) { onOpenPost?(id) }.font(.footnote).buttonStyle(.borderless)
                }
            }
            ActionRowView(
                items: ActionRow.items(actions: card.actions ?? (card.isMine ? [] : ["praying_now"]), features: model.features, tree: model.tree, wording: model.wording),
                wording: model.wording,
                active: active,
                onAction: onAction,
                onMeaning: onMeaning
            )
        }
        .padding(.vertical, 4)
        .overlay {
            if card.isAnswered { RoundedRectangle(cornerRadius: 10).stroke(Color.answeredGold, lineWidth: 2).padding(-6).accessibilityHidden(true) }
        }
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

extension Color {
    /// The Expo theme's gold: plain gold for lines and fills, and gold text that keeps 4.5:1
    /// (#7D6308 on light backgrounds, the brighter gold on dark ones).
    static let answeredGold = Color(red: 0xC9 / 255, green: 0xA2 / 255, blue: 0x27 / 255)
    #if os(iOS)
    static let answeredText = Color(uiColor: UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 0xC9 / 255, green: 0xA2 / 255, blue: 0x27 / 255, alpha: 1)
            : UIColor(red: 0x7D / 255, green: 0x63 / 255, blue: 0x08 / 255, alpha: 1)
    })
    #else
    static let answeredText = Color(nsColor: NSColor(name: nil) { a in
        a.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            ? NSColor(red: 0xC9 / 255, green: 0xA2 / 255, blue: 0x27 / 255, alpha: 1)
            : NSColor(red: 0x7D / 255, green: 0x63 / 255, blue: 0x08 / 255, alpha: 1)
    })
    #endif
}

/// "You're offline. Showing prayers saved …", how many actions wait to send, and any the
/// server refused once back online.
struct OfflineBanner: View {
    @Environment(AppModel.self) private var model
    let savedAt: Date?
    let pending: Int
    let dropped: [String]
    let onRetry: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        let w = model.words
        if savedAt != nil || pending > 0 || !dropped.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                if let savedAt {
                    Text("\(w("offline.notice")) \(w("offline.saved", ["when": savedAt.formatted(date: .abbreviated, time: .shortened)]))").bold()
                }
                if pending > 0 { Text(pending == 1 ? w("offline.waitingOne") : w("offline.waitingMany", count: pending)) }
                ForEach(dropped, id: \.self) { Text(w("offline.notSent", ["what": $0])).foregroundStyle(.red) }
                HStack {
                    if savedAt != nil { Button(w("offline.retry"), action: onRetry) }
                    if !dropped.isEmpty { Button(w("offline.ok"), action: onDismiss) }
                }
                .buttonStyle(.borderless)
            }
            .accessibilityElement(children: .contain)
        }
    }
}
