import AVKit
import PrayerTowerKit
import SwiftUI

/// One post with its comments, as the Expo app's post screen: the full text and media, how it
/// was answered, who prayed, and a threaded comment list with the kind cloud under the box.
struct PostDetailView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let postId: String
    /// Words to start the comment box with (a removed comment, posted again with changes).
    var draft: String?
    @State private var card: Card?
    @State private var comments: [ThreadedComment] = []
    @State private var prayers: Prayers?
    @State private var text = ""
    @State private var asUpdate = false
    @State private var replyTo: PrayerTowerKit.Comment?
    @State private var testimony: String?
    @State private var support = false
    @State private var harm: HarmNote?
    @State private var coolDown = false
    @State private var reporting: (type: String, id: String)?
    @State private var committing: Card?
    @State private var encouraging: Card?
    @State private var gifting: Card?
    @State private var deleteArmed = false
    @State private var replyChoice: ReplyChoiceState?
    @State private var busy = false
    @State private var notice: String?
    @State private var error: String?

    private var w: Words { model.words }
    private var prayable: Bool { card.map { !Compose.discussionTypes.contains($0.postType) } ?? true }

    var body: some View {
        List {
            if let card {
                Section { header(card) }
                if card.crisis || support { Section { CrisisBox() } }
                if let harm { Section { HarmBox(note: harm) } }
                if card.isMine && prayable { Section { ownerTools(card) } }
                if card.isMine, model.features["followupNudge"] { FollowupSection(postId: card.id) { Task { await load() } } }
                if prayable, let prayers { Section { prayedList(prayers) } }
                Section(w("post.comments")) { commentList }
                if let rc = replyChoice, rc.enabled, rc.isMine { Section { replyChoicePicker(rc) } }
                if ReplyChoiceState.showsComposer(replyChoice) {
                    Section { composer(card) }
                } else if let rc = replyChoice {
                    Section { Text(w(rc.noteKey)).font(.footnote) }
                }
                Section { reportButton(w("actions.reportPost")) { reporting = ("post", card.id) } }
            }
        }
        .overlay {
            if card == nil, let error {
                ContentUnavailableView(error, systemImage: "wifi.exclamationmark")
            } else if card == nil {
                ProgressView()
            }
        }
        .navigationTitle(card.map { w("enums.postType.\($0.postType)") } ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
        .confirmationDialog(w("post.report"), isPresented: Binding(get: { reporting != nil }, set: { if !$0 { reporting = nil } }), titleVisibility: .visible) {
            ForEach(0..<5, id: \.self) { i in
                Button(w("actions.reasons.\(i)")) { Task { await report(ReportReason.all[i]) } }
            }
        } message: {
            Text(w("actions.reportNote"))
        }
        .alert(w("coolDown.title"), isPresented: $coolDown) {
            Button(w("coolDown.breather")) { notice = w("coolDown.thanks") }
            Button(w("coolDown.okay"), role: .cancel) {}
        } message: {
            Text(w("coolDown.lines.l\(Int.random(in: 0...3))"))
        }
        .sheet(item: $committing) { card in CommitSheet(card: card) { notice = $0 } }
        .sheet(item: $gifting) { card in GiftSheet(card: card) { notice = $0 } }
        .sheet(item: $encouraging) { card in
            EncourageSheet(card: card) { note in
                Task {
                    await call { _ = try await model.store.api.react(postId: card.id, kind: "encouragement", note: note) }
                    encouraging = nil
                }
            }
        }
        .alert(notice ?? "", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) { Button("OK") {} }
    }

    // MARK: Post

    @ViewBuilder private func header(_ card: Card) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(card.author.displayName).font(.subheadline.bold())
            if card.state == "answered" {
                Text(w("card.answered"))
                    .font(.caption.bold()).foregroundStyle(.green)
            }
            let style = Compose.backgrounds.first { $0.id == card.background }
            Text(card.body)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(style == nil ? 0 : 16)
                .background(style.map { Color(hex: $0.color) } ?? .clear, in: .rect(cornerRadius: 12))
                .foregroundStyle(style.map { Color(hex: $0.text) } ?? .primary)
            ForEach(card.media ?? [], id: \.storagePath) { m in MediaView(media: m) }
            if let t = card.testimony, !t.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text(w("post.testimonyLabel")).font(.caption.bold())
                    Text(t)
                }
                .padding(10)
                .background(.green.opacity(0.1), in: .rect(cornerRadius: 12))
            }
        }
        .accessibilityElement(children: .contain)
        ActionRowView(
            items: ActionRow.items(actions: card.actions ?? (card.isMine ? [] : ["praying_now"]), features: model.features, tree: model.tree, wording: model.wording),
            wording: model.wording,
            active: [],
            onAction: { action in Task { await act(action, card) } },
            onMeaning: { item, meaning in Task { await choose(meaning, item, card) } }
        )
    }

    @ViewBuilder private func ownerTools(_ card: Card) -> some View {
        if card.state != "answered" {
            if let binding = testimonyBinding {
                TextField(w("post.testimonyOptional"), text: binding, axis: .vertical).lineLimit(2...6)
                KindCloudView(text: binding.wrappedValue)
                Button(w("post.markAnswered")) { Task { await markAnswered() } }.disabled(busy)
            } else {
                Button(w("post.markAnswered")) { testimony = "" }
            }
        } else if let binding = testimonyBinding {
            TextField(w("post.testimonyPlaceholder"), text: binding, axis: .vertical).lineLimit(2...8)
            KindCloudView(text: binding.wrappedValue)
            Button(w("post.testimonySave")) { Task { await saveTestimony() } }
                .disabled(busy || binding.wrappedValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        } else {
            Button(w(card.testimony?.isEmpty == false ? "post.testimonyEdit" : "post.testimonyShare")) { testimony = card.testimony ?? "" }
            if card.testimony?.isEmpty == false {
                Button(w("post.testimonyRemove"), role: .destructive) { Task { await removeTestimony() } }
            }
        }
        Button(w(deleteArmed ? "post.deleteConfirm" : "post.delete"), role: .destructive) {
            if deleteArmed { Task { await deletePost() } } else { deleteArmed = true }
        }
    }

    private var testimonyBinding: Binding<String>? {
        guard testimony != nil else { return nil }
        return Binding(get: { testimony ?? "" }, set: { testimony = $0 })
    }

    @ViewBuilder private func prayedList(_ p: Prayers) -> some View {
        Text(w("post.prayed", count: p.count)).font(.subheadline.bold())
        if !p.people.isEmpty {
            Text(p.people.map(\.displayName).joined(separator: ", ")).font(.footnote).foregroundStyle(.secondary)
        }
    }

    // MARK: Comments

    @ViewBuilder private var commentList: some View {
        if comments.isEmpty {
            Text(w("post.noComments")).foregroundStyle(.secondary)
        }
        ForEach(comments) { item in
            let c = item.comment
            VStack(alignment: .leading, spacing: 4) {
                Text((c.isUpdate ? w("card.update") : "") + c.author.displayName).font(.caption.bold())
                Text(c.body)
                HStack(spacing: 16) {
                    Button(w("post.reply")) { replyTo = c; asUpdate = false }
                    if c.isMine == true {
                        Button(w("post.deleteShort"), role: .destructive) { Task { await deleteComment(c) } }
                    } else {
                        Button(w("post.report")) { reporting = ("comment", c.id) }
                    }
                }
                .buttonStyle(.borderless)
                .font(.caption)
            }
            .padding(.leading, CGFloat(item.depth) * 16)
            .accessibilityElement(children: .combine)
        }
    }

    @ViewBuilder private func composer(_ card: Card) -> some View {
        if let replyTo {
            Button(w("post.replyingTo", ["name": replyTo.author.displayName])) { self.replyTo = nil }.font(.footnote)
        }
        TextField(w("post.commentPlaceholder"), text: $text, axis: .vertical)
            .lineLimit(2...8)
            .onChange(of: text) { _, new in if new.count > 2000 { text = String(new.prefix(2000)) } }
        KindCloudView(text: text)
        if card.isMine && replyTo == nil { Toggle(w("post.postUpdate"), isOn: $asUpdate) }
        if let error, self.card != nil { Text(error).font(.footnote).foregroundStyle(.red) }
        Button(w("post.comment")) { Task { await send() } }
            .disabled(busy || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    /// Who can reply: the author's choice, kept above the comment box.
    @ViewBuilder private func replyChoicePicker(_ rc: ReplyChoiceState) -> some View {
        Picker(w("replyChoice.title"), selection: Binding(get: { rc.audience }, set: { a in
            Task {
                if let next = try? await model.store.api.setReplyChoice(postId: postId, a) {
                    replyChoice = next
                    AccessibilityNotification.Announcement(w("replyChoice.\(a.rawValue)")).post()
                }
            }
        })) {
            ForEach(ReplyAudience.allCases, id: \.self) { a in Text(w("replyChoice.\(a.rawValue)")).tag(a) }
        }
        if rc.audience != .everyone { Text(w("replyChoice.updatesStill")).font(.footnote) }
    }

    private func reportButton(_ title: String, _ open: @escaping () -> Void) -> some View {
        Button(title, role: .destructive, action: open).font(.footnote)
    }

    // MARK: Calls

    private func load() async {
        let api = model.store.api
        do {
            let c = try await api.post(postId)
            card = c
            if let draft, text.isEmpty { text = draft }
            comments = CommentThread.ordered(try await api.comments(postId: postId))
            if !Compose.discussionTypes.contains(c.postType) { prayers = try? await api.prayers(postId: postId) }
            if model.features["replyChoice"] { replyChoice = try? await api.replyChoice(postId: postId) }
            error = nil
        } catch let e as APIError where e.needsCode {
            model.state = .needsCode
        } catch let e as APIError where e.signedOut {
            model.state = .signedOut
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func send() async {
        busy = true
        defer { busy = false }
        do {
            let r = try await model.store.api.addComment(postId: postId, NewComment(body: text, parentId: replyTo?.id, isUpdate: asUpdate ? true : nil))
            if r.comment.crisis { support = true }
            if r.comment.harm?.resources?.isEmpty == false { harm = r.comment.harm }
            if r.coolDown == true { coolDown = true }
            text = ""
            replyTo = nil
            asUpdate = false
            error = nil
            await load()
        } catch {
            // A resting thread's "reply again in N minutes" is shown as the server wrote it.
            self.error = error.localizedDescription
        }
    }

    private func deleteComment(_ c: PrayerTowerKit.Comment) async {
        await call { _ = try await model.store.api.deleteComment(c.id) }
        await load()
    }

    private func markAnswered() async {
        busy = true
        defer { busy = false }
        await call {
            card = try await model.store.api.markAnswered(postId: postId, testimony: testimony)
            testimony = nil
            AccessibilityNotification.Announcement(w("post.markAnswered")).post()
        }
    }

    private func saveTestimony() async {
        busy = true
        defer { busy = false }
        await call {
            card = try await model.store.api.setTestimony(postId: postId, testimony ?? "")
            testimony = nil
        }
    }

    private func removeTestimony() async {
        await call { card = try await model.store.api.removeTestimony(postId: postId) }
    }

    private func deletePost() async {
        await call {
            _ = try await model.store.api.deletePost(postId)
            dismiss()
        }
    }

    private func report(_ reason: String) async {
        guard let target = reporting else { return }
        reporting = nil
        await call {
            _ = try await model.store.api.report(targetType: target.type, targetId: target.id, reason: reason)
            notice = w("actions.reportDone")
        }
    }

    private func act(_ action: CardAction, _ card: Card) async {
        let api = model.store.api
        await call {
            switch action {
            case .prayingNow: _ = try await api.prayingNow(postId: card.id)
            case .wellWishes: _ = try await api.react(postId: card.id, kind: "well_wishes")
            case .share: _ = try await api.react(postId: card.id, kind: "share")
            case .commit:
                committing = card
                return
            case .encouragement:
                encouraging = card
                return
            case .giftTokens:
                gifting = card
                return
            }
            AccessibilityNotification.Announcement("\(action.name(model.wording)): done").post()
            prayers = try? await api.prayers(postId: card.id)
        }
    }

    private func choose(_ meaning: MeaningEmoji.Meaning, _ item: ActionItem, _ card: Card) async {
        guard let emoji = item.meanings?.key else { return }
        await call {
            _ = try await model.store.api.chooseMeaning(postId: card.id, emoji: emoji, meaning: meaning.key)
            AccessibilityNotification.Announcement(meaning.word(model.wording)).post()
        }
    }

    private func call(_ work: () async throws -> Void) async {
        do { try await work() } catch { notice = error.localizedDescription }
    }
}

/// The crisis line box, as the Expo app's `CrisisSupport`.
struct CrisisBox: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(CrisisLine.title).font(.headline)
            Text(CrisisLine.body)
            HStack {
                ForEach(CrisisLine.actions, id: \.url) { a in
                    if let url = URL(string: a.url) { Link(a.label, destination: url).buttonStyle(.bordered) }
                }
            }
        }
        .accessibilityElement(children: .contain)
    }
}

/// Hotlines from the harmful-words check; the comment still went up.
struct HarmBox: View {
    let note: HarmNote
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(note.message)
            ForEach(Array((note.resources ?? []).enumerated()), id: \.offset) { _, r in
                if let url = r.url.flatMap(URL.init(string:)) {
                    Link(r.label ?? r.name ?? url.host() ?? "Help", destination: url)
                } else if let phone = r.phone {
                    Text("\(r.label ?? r.name ?? "Call") \(phone)")
                }
            }
        }
        .font(.footnote)
    }
}

/// A photo, or a video that plays in place.
struct MediaView: View {
    let media: CardMedia
    var body: some View {
        if let url = media.url.flatMap(URL.init(string:)) {
            if media.kind == "video" {
                VideoPlayer(player: AVPlayer(url: url)).frame(height: 240).clipShape(.rect(cornerRadius: 12))
            } else {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFit()
                } placeholder: {
                    Color.secondary.opacity(0.1).frame(height: 200)
                }
                .clipShape(.rect(cornerRadius: 12))
                .accessibilityLabel("Photo")
            }
        }
    }
}
