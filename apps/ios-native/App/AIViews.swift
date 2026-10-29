import PrayerTowerKit
import StoreKit
import SwiftUI

// The AI role-play, preparing for a restorative circle, cross-posting and buying tokens, as
// the Expo app's ai-chat, circle-prep, crosspost and token-store screens.

/// Runs a call and shows its error.
@MainActor private func run(_ failure: Binding<String?>, _ call: () async throws -> Void) async {
    do {
        try await call()
        failure.wrappedValue = nil
    } catch {
        failure.wrappedValue = error.localizedDescription
    }
}

/// The links on Me: each AI screen while it's on, cross-posting, and the token store.
struct MoreToolsSection: View {
    @Environment(AppModel.self) private var model
    @State private var chat = false
    @State private var facilitator = false
    @State private var store = false
    private var w: Words { model.words }

    var body: some View {
        let crosspost = model.features["crosspost"] && (model.me?.community?.shows("crosspost") ?? true)
        Section {
            if chat { NavigationLink(w("ai.chatLink")) { AiChatView() } }
            if facilitator { NavigationLink(w("ai.facLink")) { CirclePrepView() } }
            if crosspost { NavigationLink(w("crosspost.link")) { CrosspostView() } }
            if store { NavigationLink(w("tokenStore.open")) { TokenStoreView() } }
        }
        .task {
                chat = (try? await model.store.api.aiChatInfo())?.enabled ?? false
                facilitator = (try? await model.store.api.facilitatorInfo())?.enabled ?? false
                store = (try? await model.store.api.tokenStore())?.enabled ?? false
            }
    }
}

/// The conversation so far, with the AI's turns labeled.
struct AiTurnsView: View {
    let turns: [AiTurn]
    let you: String
    let ai: String

    var body: some View {
        ForEach(Array(turns.enumerated()), id: \.offset) { _, t in
            VStack(alignment: .leading, spacing: 2) {
                Text(t.role == "user" ? you : ai).font(.caption.bold()).foregroundStyle(t.role == "user" ? Color.accentColor : Color.secondary)
                Text(t.content)
            }
            .frame(maxWidth: .infinity, alignment: t.role == "user" ? .trailing : .leading)
        }
    }
}

// MARK: - AI chat

struct AiChatView: View {
    @Environment(AppModel.self) private var model
    @State private var enabled: Bool?
    @State private var warning: String?
    @State private var turns: [AiTurn] = []
    @State private var draft = ""
    @State private var busy = false
    @State private var crisis = false
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        Form {
            if enabled == false {
                Text(w("ai.chatUnavailable"))
            } else {
                if let warning {
                    Section { Text(warning).bold().foregroundStyle(.orange).accessibilityAddTraits(.isHeader) }
                }
                Section { Text(w("ai.chatIntro")) }
                if crisis { Section { CrisisBox() } }
                if !turns.isEmpty { Section { AiTurnsView(turns: turns, you: w("ai.you"), ai: w("ai.ai")) } }
                if busy { Text(w("ai.writing")).font(.caption) }
                if let error { Text(error).foregroundStyle(.red) }
                if enabled == true {
                    Section {
                        TextField(w("ai.placeholder"), text: $draft, axis: .vertical).lineLimit(2...8)
                        Button(w("ai.send")) { Task { await send() } }.disabled(busy || draft.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
        }
        .navigationTitle(w("ai.chatTitle"))
        .task {
            await run($error) {
                let info = try await model.store.api.aiChatInfo()
                enabled = info.enabled
                warning = info.warning
            }
        }
    }

    private func send() async {
        let message = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        busy = true
        defer { busy = false }
        await run($error) {
            let r = try await model.store.api.aiChat(message, history: turns)
            turns += [AiTurn(role: "user", content: message), AiTurn(role: "assistant", content: r.reply)]
            warning = r.warning
            if r.crisis { crisis = true }
            draft = ""
        }
    }
}

// MARK: - Circle prep

/// The restorative questions, one at a time. Nothing is saved unless the member sends a
/// summary to a moderator.
struct CirclePrepView: View {
    @Environment(AppModel.self) private var model
    @State private var info: FacilitatorInfo?
    @State private var role: String?
    @State private var turns: [AiTurn] = []
    @State private var draft = ""
    @State private var summary = ""
    @State private var aiOn = true
    @State private var busy = false
    @State private var crisis = false
    @State private var sent = false
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        Form {
            Section {
                Text(w("ai.facIntro"))
                if !aiOn { Text(w("ai.facNoAi")).font(.caption) }
            }
            if info?.enabled == true {
                Section(w("ai.facRole")) {
                    ChoiceRow(options: Circles.roles, selected: role, label: { w("ai.role.\($0)") }) { choose($0) }
                }
            }
            if crisis { Section { CrisisBox() } }
            if !turns.isEmpty { Section { AiTurnsView(turns: turns, you: w("ai.you"), ai: "AI") } }
            if busy { Text(w("ai.writing")).font(.caption) }
            if let error { Text(error).foregroundStyle(.red) }
            if role != nil && !sent {
                Section {
                    TextField(w("ai.answer"), text: $draft, axis: .vertical).lineLimit(2...8)
                    Button(w("ai.send")) { Task { await send() } }.disabled(busy || draft.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                Section(w("ai.summary")) {
                    TextField(w("ai.summary"), text: $summary, axis: .vertical).lineLimit(3...10)
                    Button(w("ai.askCircle")) { Task { await ask() } }.disabled(summary.trimmingCharacters(in: .whitespaces).isEmpty)
                    Button(w("ai.startOver")) { role = nil; turns = []; summary = "" }
                }
            }
            if sent { Text(w("ai.asked")) }
        }
        .navigationTitle(w("ai.facTitle"))
        .task { await run($error) { info = try await model.store.api.facilitatorInfo() } }
    }

    private func choose(_ r: String) {
        role = r
        // The first question comes from the card itself, so the member can begin answering.
        turns = info?.questions[r]?.first.map { [AiTurn(role: "assistant", content: $0)] } ?? []
    }

    private func send() async {
        guard let role else { return }
        let message = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        busy = true
        defer { busy = false }
        await run($error) {
            let r = try await model.store.api.facilitate(role: role, message: message, history: turns)
            aiOn = r.ai
            turns += [AiTurn(role: "user", content: message), AiTurn(role: "assistant", content: r.reply)]
            if let s = Circles.summary(in: r.reply) { summary = s }
            if r.crisis { crisis = true }
            draft = ""
        }
    }

    private func ask() async {
        guard let role else { return }
        await run($error) {
            _ = try await model.store.api.askForCircle(role: role, summary: summary.trimmingCharacters(in: .whitespacesAndNewlines))
            sent = true
        }
    }
}

// MARK: - Cross-posting

struct CrosspostView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    @State private var status: CrosspostStatus?
    @State private var key: String?
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        Form {
            Section { Text(w("crosspost.intro")) }
            if let error { Text(error).foregroundStyle(.red) }
            if let s = status, !s.enabled { Text(w("crosspost.off")) }
            if let s = status, s.enabled {
                Section(w("crosspost.extensionTitle")) {
                    Text(w("crosspost.extensionBody"))
                    Text(w("crosspost.extensionSteps", ["server": model.store.api.baseURL.absoluteString])).font(.caption)
                    if let key {
                        Text(w("crosspost.keyOnce")).font(.caption)
                        Text(key).font(.body.monospaced()).textSelection(.enabled).accessibilityLabel(w("crosspost.keyLabel"))
                        ShareLink(w("crosspost.shareKey"), item: key)
                    } else if let hint = s.extensionKeyHint {
                        Text(w("crosspost.keyInUse", ["hint": hint])).font(.caption)
                    }
                    Button(w(s.extensionKeyHint != nil ? "crosspost.newKey" : "crosspost.makeKey")) {
                        Task { await run($error) { key = try await model.store.api.newExtensionKey(); status = try await model.store.api.crosspostStatus() } }
                    }
                    if s.extensionKeyHint != nil {
                        Button(w("crosspost.revokeKey"), role: .destructive) {
                            key = nil
                            Task { await run($error) { _ = try await model.store.api.revokeExtensionKey(); status = try await model.store.api.crosspostStatus() } }
                        }
                    }
                }
                Section(w("crosspost.accountsTitle")) {
                    Text(w("crosspost.accountsBody"))
                    ForEach(CrosspostStatus.providers, id: \.self) { p in account(p, s) }
                }
                Section {
                    Toggle(isOn: Binding(get: { s.paused == true }, set: { on in Task { await run($error) { status = try await model.store.api.crosspostPaused(on) } } })) {
                        LabelHint(w("crosspost.paused"), w("crosspost.pausedHint"))
                    }
                    Text(w("crosspost.postAs")).font(.caption)
                    ChoiceRow(options: s.postTypes ?? [], selected: s.chosenType, label: { w("enums.postType.\($0)") }) { t in
                        Task { await run($error) { status = try await model.store.api.crosspostType(t) } }
                    }
                }
                Section(w("crosspost.recent")) {
                    let recent = s.recent ?? []
                    if recent.isEmpty { Text(w("crosspost.none")).font(.caption) }
                    ForEach(Array(recent.enumerated()), id: \.offset) { _, r in
                        let line = "\(r.createdAt.prefix(16).replacingOccurrences(of: "T", with: " ")) · \(CrosspostStatus.names[r.source] ?? r.source) · \(r.status == "posted" ? w("crosspost.copied") : w("crosspost.skipped", ["reason": r.reason ?? ""]))"
                        if let id = r.postId {
                            NavigationLink { PostDetailView(postId: id) } label: { Text(line).font(.caption) }
                        } else {
                            Text(line).font(.caption)
                        }
                    }
                }
            }
        }
        .navigationTitle(w("crosspost.title"))
        .task { await load() }
        .refreshable { await load() }
    }

    @ViewBuilder private func account(_ p: String, _ s: CrosspostStatus) -> some View {
        let name = CrosspostStatus.names[p] ?? p
        VStack(alignment: .leading, spacing: 4) {
            Text(name).bold()
            if let a = s.accounts?.first(where: { $0.provider == p }) {
                Text(a.status == "expired" ? w("crosspost.expired") : w("crosspost.connectedAs", ["name": a.username ?? name])).font(.caption)
                HStack {
                    if a.status == "expired" { Button(w("crosspost.reconnect")) { connect(p) } }
                    Button(w("crosspost.disconnect", ["name": name]), role: .destructive) {
                        Task { await run($error) { _ = try await model.store.api.disconnectCrosspost(p) }; await load() }
                    }
                }
                .buttonStyle(.borderless)
            } else if s.connectable?[p] == true {
                Button(w("crosspost.connect", ["name": name])) { connect(p) }.buttonStyle(.borderless)
            } else {
                Text(w("crosspost.notReady", ["name": name])).font(.caption)
            }
        }
    }

    private func load() async { await run($error) { status = try await model.store.api.crosspostStatus() } }

    private func connect(_ p: String) {
        Task { await run($error) { if let url = try await model.store.api.connectCrosspost(p) { openURL(url) } } }
    }
}

// MARK: - Token store

/// Buy tokens with an App Store purchase (StoreKit 2), or, in practice mode, for free. The
/// server checks every purchase with Apple before crediting it.
struct TokenStoreView: View {
    @Environment(AppModel.self) private var model
    @State private var listing: TokenStoreListing?
    @State private var products: [String: Product] = [:]
    @State private var purchases: [TokenPurchase] = []
    @State private var busy: String?
    @State private var notice: String?
    @State private var error: String?
    private var w: Words { model.words }
    private var practice: Bool { listing?.enabled == true && listing?.practice == true }

    var body: some View {
        Form {
            if let error { Text(error).foregroundStyle(.red) }
            if let listing, !listing.enabled { Text(w("tokenStore.off")) }
            if practice { Text(w("tokenStore.practice")).foregroundStyle(.orange) }
            if let listing, listing.enabled {
                Section {
                    Text(w("tokenStore.intro", ["percent": String(listing.commonFundPercent ?? 0)]))
                    if let notice { Text(notice).foregroundStyle(.orange) }
                }
                ForEach(listing.products.filter { $0.appleProductId != nil }) { p in
                    Section {
                        Text(w(p.currency == "priestly" ? "tokenStore.priestly" : "tokenStore.regular", count: p.tokens)).font(.headline)
                        Button(label(p)) { Task { await buy(p) } }
                            .disabled(busy != nil || (!practice && products[p.appleProductId ?? ""] == nil))
                    }
                }
            }
            if !purchases.isEmpty {
                Section(w("tokenStore.history")) {
                    ForEach(purchases) { p in
                        Text(historyLine(p)).font(.caption)
                    }
                }
            }
        }
        .navigationTitle(w("tokenStore.title"))
        .task { await load() }
        .task { await listenForUpdates() }
    }

    private func label(_ p: TokenProduct) -> String {
        if busy == p.sku { return w("tokenStore.finishing") }
        if practice { return w("tokenStore.practiceBuy") }
        return w("tokenStore.buy", ["price": products[p.appleProductId ?? ""]?.displayPrice ?? p.priceLabel ?? ""])
    }

    private func historyLine(_ p: TokenPurchase) -> String {
        var s = "\(p.purchased_at.map { String($0.prefix(10)) } ?? "") · \(w(p.currency == "priestly" ? "tokenStore.priestly" : "tokenStore.regular", count: p.tokens))"
        if p.status == "refunded" { s += " · " + w("tokenStore.refunded") }
        if p.practice == true { s += " · " + w("tokenStore.practiceLabel") }
        return s
    }

    private func load() async {
        await run($error) { listing = try await model.store.api.tokenStore() }
        purchases = (try? await model.store.api.tokenPurchases()) ?? []
        guard let listing, listing.enabled, listing.practice != true else { return }
        let ids = listing.products.compactMap(\.appleProductId)
        if let found = try? await Product.products(for: ids) {
            products = Dictionary(found.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        }
    }

    private func buy(_ p: TokenProduct) async {
        guard let productId = p.appleProductId, let userId = model.me?.profile.id else { return }
        busy = p.sku
        defer { busy = nil }
        notice = nil
        error = nil
        do {
            if practice {
                let r = try await model.store.api.buyTokens(signedTransaction: TokenStore.practiceTransaction(productId: productId, userId: userId))
                notice = w("tokenStore.practiceAdded", count: r.tokens)
            } else {
                guard let product = products[productId] else { return }
                var options: Set<Product.PurchaseOption> = []
                if let account = UUID(uuidString: userId) { options.insert(.appAccountToken(account)) }
                switch try await product.purchase(options: options) {
                case .success(let verification):
                    try await credit(verification)
                case .pending, .userCancelled:
                    break
                @unknown default:
                    break
                }
            }
            await load()
        } catch {
            self.error = w("tokenStore.failed")
        }
    }

    /// Sends Apple's signed transaction to the server, and finishes it once credited.
    private func credit(_ verification: VerificationResult<StoreKit.Transaction>) async throws {
        let r = try await model.store.api.buyTokens(signedTransaction: verification.jwsRepresentation)
        if case .verified(let t) = verification { await t.finish() }
        notice = w("tokenStore.added", count: r.tokens)
    }

    /// Purchases that finish later (Ask to Buy, interrupted ones) arrive here.
    private func listenForUpdates() async {
        for await update in StoreKit.Transaction.updates {
            try? await credit(update)
            await load()
        }
    }
}
