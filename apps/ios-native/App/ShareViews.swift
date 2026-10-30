import PrayerTowerKit
import SwiftUI

// Sharing, as the Expo app's card share sheet (card-actions.tsx), outside-share.tsx and
// guest-share.tsx: a note to your own feed, asking people you follow to pray, and links sent
// outside the app, which with "sharing by consent" on only go out as the author allows.

/// The card's Share action: to your feed, to people you follow, or outside the app.
struct ShareSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let card: Card
    let done: (String) -> Void
    @State private var note = ""
    @State private var people: [Connection]?
    @State private var picked: [String] = []
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        let w = model.words
        NavigationStack {
            Form {
                Section(w("actions.shareTitle")) {
                    TextField(w("actions.shareIntro"), text: $note)
                        .onChange(of: note) { _, v in
                            let one = v.replacingOccurrences(of: "\n", with: " ")
                            if one.count > 140 || one != v { note = String(one.prefix(140)) }
                        }
                    Button(w("post.share")) { run(w("actions.shareDone")) { _ = try await model.store.api.react(postId: card.id, kind: "share", note: trimmed) } }
                        .disabled(busy)
                }
                Section(w("actions.askTitle")) { askPeople }
                Section { OutsideShareRow(card: card) }
                if let error { Section { Text(error).foregroundStyle(Color.danger) } }
            }
            .navigationTitle(w("post.share"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .task { people = (try? await model.store.api.connections()) ?? [] }
        }
    }

    private var trimmed: String? {
        let t = note.trimmingCharacters(in: .whitespaces)
        return t.isEmpty ? nil : t
    }

    @ViewBuilder private var askPeople: some View {
        let w = model.words
        if let people {
            if people.isEmpty { Text(w("actions.followToAsk")).foregroundStyle(Color.subtle) }
            ForEach(people) { p in
                Toggle(p.displayName, isOn: Binding(
                    get: { picked.contains(p.id) },
                    set: { on in picked = on ? Array((picked + [p.id]).prefix(20)) : picked.filter { $0 != p.id } }
                ))
            }
            if !people.isEmpty {
                Button(picked.isEmpty ? w("actions.choosePeople") : w("actions.askCount", ["count": String(picked.count)])) {
                    run(w("actions.askDone")) {
                        if try await model.store.api.askToPray(postId: card.id, people: picked, note: note) == 0 {
                            throw ShareProblem(message: w("actions.alreadyAsked"))
                        }
                    }
                }
                .disabled(picked.isEmpty || busy)
            }
        } else {
            Text(w("common.loading")).foregroundStyle(Color.subtle)
        }
    }

    private func run(_ message: String, _ work: @escaping () async throws -> Void) {
        busy = true
        Task {
            defer { busy = false }
            do {
                try await work()
                done(message)
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

private struct ShareProblem: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

/// "Share outside": the request's words and link, or only what its author allowed.
struct OutsideShareRow: View {
    @Environment(AppModel.self) private var model
    let card: Card
    @State private var state: ShareState?
    @State private var loaded = false

    var body: some View {
        let w = model.words
        let consent = model.features["shareConsent"]
        Group {
            if !consent {
                ShareLink(w("actions.shareOutside"), item: message(path: "/post/\(card.id)", words: true))
            } else if let state {
                if state.canShare {
                    ShareLink(w("actions.shareOutside"), item: message(path: state.path, words: state.words))
                } else {
                    Text(w("growth.shareKeptPrivate")).foregroundStyle(Color.subtle)
                }
            } else if !loaded {
                ProgressView()
            }
        }
        .task(id: consent) {
            guard consent else { return }
            state = try? await model.store.api.shareState(postId: card.id)
            loaded = true
        }
    }

    private func message(path: String, words: Bool) -> String {
        let url = model.shareURL(path)
        return words ? model.words("actions.shareMessage", ["preview": card.preview, "url": url]) : model.words("growth.shareLinkMessage", ["url": url])
    }
}

/// On the author's own post: who may share it outside the app.
struct ShareChoiceSection: View {
    @Environment(AppModel.self) private var model
    let card: Card
    @State private var state: ShareState?
    @State private var note: String?
    @State private var error: String?

    var body: some View {
        let w = model.words
        let on = model.features["shareConsent"] && card.isMine
        Group {
            if on, let state {
                Section {
                    Picker(w("growth.shareChoice"), selection: Binding(get: { state.level }, set: { choose($0) })) {
                        Text(w("growth.sharePrivate")).tag("private")
                        Text(w("growth.shareLink")).tag("link")
                        if state.cardAllowed { Text(w("growth.shareCard")).tag("card") }
                    }
                    .pickerStyle(.inline)
                    if state.level == "link" { Text(w("growth.shareLinkHint")).font(.footnote) }
                    if state.level == "card" { Text(w("growth.shareCardHint")).font(.footnote) }
                    if !state.cardAllowed { Text(w("growth.shareCardCrisis")).font(.footnote) }
                    if let note { Text(note).font(.footnote) }
                    if let error { Text(error).font(.footnote).foregroundStyle(Color.danger) }
                } header: {
                    Text(w("growth.shareChoice"))
                } footer: {
                    Text(w("growth.shareChoiceHint"))
                }
            }
        }
        .task(id: on) {
            guard on else { return }
            state = try? await model.store.api.shareState(postId: card.id)
        }
    }

    private func choose(_ level: String) {
        Task {
            do {
                state = try await model.store.api.setShareLevel(postId: card.id, level) ?? state
                error = nil
                note = model.words("growth.shareSaved")
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

/// On the asker's own open request: a link anyone can pray from without the app, and sending
/// the request to their prayer chain.
struct GuestShareSection: View {
    @Environment(AppModel.self) private var model
    let card: Card
    @State private var link: GuestLink?
    @State private var note: String?
    @State private var error: String?

    private var on: Bool {
        model.features["guestPrayer"] && card.isMine && card.postType == "prayer_request" && card.state != "answered"
    }

    var body: some View {
        let w = model.words
        Group {
            if on {
                Section {
                    if let link {
                        if link.guestPrayers > 0 {
                            Text(link.guestPrayers == 1 ? w("growth.guestCountOne") : w("growth.guestCount", ["count": String(link.guestPrayers)]))
                        }
                        ShareLink(w("growth.guestShareAgain"), item: message(link))
                        Button(w("growth.guestStop"), role: .destructive) { stop() }
                    } else {
                        Button(w("growth.guestShare")) { create() }
                        Text(w("growth.guestShareHint")).font(.footnote).foregroundStyle(Color.subtle)
                    }
                    if model.features["prayerChain"] { Button(w("growth.chainSend")) { toChain() } }
                    if let note { Text(note).font(.footnote) }
                    if let error { Text(error).font(.footnote).foregroundStyle(Color.danger) }
                }
            }
        }
        .task(id: on) { if on { await load() } }
    }

    private func load() async { link = try? await model.store.api.guestLink(postId: card.id) }

    private func message(_ l: GuestLink) -> String {
        model.words("growth.guestShareMessage", ["preview": card.preview.isEmpty ? card.body : card.preview, "url": model.shareURL(l.path)])
    }

    private func create() {
        Task {
            do {
                link = try await model.store.api.createGuestLink(postId: card.id)
                error = nil
                note = nil
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func stop() {
        Task {
            do {
                _ = try await model.store.api.revokeGuestLink(postId: card.id)
                link = nil
                note = model.words("growth.guestStopped")
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func toChain() {
        Task {
            do {
                let sent = try await model.store.api.sendToPrayerChain(postId: card.id)
                note = model.words("growth.chainSent", ["count": String(sent.recipients)])
                await load()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

/// "Answers: …" on a story and "Read how it turned out" on its request.
struct StoryLinks: View {
    @Environment(AppModel.self) private var model
    let card: Card
    let open: (String) -> Void

    var body: some View {
        if model.features["answeredStories"] {
            if let a = card.answers {
                Button("🌅 " + model.words("answeredStory.answers", ["preview": a.preview])) { open(a.id) }
                    .buttonStyle(.borderless).font(.footnote)
            }
            if let id = card.storyId {
                Button("🌅 " + model.words("answeredStory.read")) { open(id) }
                    .buttonStyle(.borderless).font(.footnote)
            }
        }
    }
}

/// On the asker's own request: a short story of how it turned out, posted as its own card.
struct AnsweredStorySection: View {
    @Environment(AppModel.self) private var model
    let card: Card
    let posted: (StoryPosted) -> Void
    @State private var text: String?
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        let w = model.words
        Section {
            if text != nil {
                Text(w("answeredStory.hint")).font(.footnote)
                KindComposer(title: w("answeredStory.placeholder"), text: Binding(get: { text ?? "" }, set: { text = $0 }), limit: 2000)
                HStack {
                    Button(w("answeredStory.post")) { send() }
                        .disabled(busy || (text ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    Spacer()
                    Button(w("common.cancel")) { text = nil }
                }
                .buttonStyle(.borderless)
                if let error { Text(error).font(.footnote).foregroundStyle(Color.danger) }
            } else {
                Button(w("answeredStory.open")) { text = "" }
            }
        } header: {
            if text != nil { Text(w("answeredStory.label")) }
        }
    }

    private func send() {
        busy = true
        Task {
            defer { busy = false }
            do {
                let r = try await model.store.api.answeredStory(postId: card.id, body: text ?? "")
                text = nil
                posted(r)
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
