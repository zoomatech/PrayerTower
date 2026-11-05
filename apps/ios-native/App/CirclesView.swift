import PrayerTowerKit
import SwiftUI

/// Prayer circles: invite-only small groups of up to 12, each with a gentle feed.
/// Shown only while Admin → Growth practices turns circles on.
struct CirclesView: View {
    @Environment(AppModel.self) private var model
    @State private var circles: [CircleSummary] = []
    @State private var name = ""
    @State private var code = ""
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(circles) { c in
                        NavigationLink(value: c.id) {
                            VStack(alignment: .leading) {
                                Text(c.name).font(.headline)
                                Text("\(c.members) of 12").font(.caption).foregroundStyle(Color.subtle)
                            }
                        }
                    }
                    if circles.isEmpty { Text("Start a circle for a few people you trust, or join one with a code.").foregroundStyle(Color.subtle) }
                }
                Section("Start a circle") {
                    TextField("Circle name", text: $name)
                    Button("Start") { Task { await create() } }.disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || name.count > 60)
                }
                Section("Join with a code") {
                    TextField("Invite code", text: $code).textInputAutocapitalization(.characters).autocorrectionDisabled()
                    Button("Join") { Task { await join() } }.disabled(code.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                if let error { Text(error).foregroundStyle(Color.danger) }
            }
            .navigationTitle("Circles")
            .appLogo()
            .navigationDestination(for: String.self) { CircleDetailView(id: $0) }
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private func load() async {
        do {
            circles = try await model.store.api.myCircles().circles
            error = nil
        } catch { self.error = error.localizedDescription }
    }

    private func create() async {
        do {
            _ = try await model.store.api.createCircle(name: name.trimmingCharacters(in: .whitespaces))
            name = ""
            await load()
        } catch { self.error = error.localizedDescription }
    }

    private func join() async {
        do {
            _ = try await model.store.api.joinCircle(code: code.trimmingCharacters(in: .whitespaces))
            code = ""
            await load()
        } catch { self.error = error.localizedDescription }
    }
}

struct CircleDetailView: View {
    @Environment(AppModel.self) private var model
    let id: String
    @State private var view: CircleView?
    @State private var draft = ""
    @State private var invite: InviteCode?
    @State private var error: String?

    var body: some View {
        List {
            if let v = view {
                if let about = v.circle.about { Section { Text(about) } }
                if model.features["libraryStudies"] {
                    Section { NavigationLink(model.words("library.studies")) { StudyListView(circleId: id) } }
                }
                if let w = v.welcome, w.show {
                    // Circle welcome: the starter's own words, or the app's default, for first-time posters.
                    Section("Welcome") { Text(w.text ?? "This is a small, kind place. Share what's on your heart, and pray for each other.") }
                }
                Section("Share with the circle") {
                    KindComposer(title: model.wording == .neutral ? "What would you like support with?" : "What can we pray for?", text: $draft, limit: 2000)
                    Button("Share") { Task { await share() } }.disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                ForEach(v.posts) { p in
                    Section { CirclePostView(post: p) { await load() } }
                }
                Section("Members") {
                    ForEach(v.members) { Text($0.displayName ?? "A member") }
                    if v.circle.isOwner, !v.circle.full {
                        // The starter invites by a code that expires; a new code replaces the old one.
                        let current = invite.map { (code: $0.code, expiresAt: $0.expiresAt) } ?? v.invite.map { (code: $0.code, expiresAt: $0.expiresAt) }
                        if let current {
                            let w = model.words, line = w("circles.inviteCode", ["code": current.code])
                            Text(line).font(.headline).textSelection(.enabled)
                            Text(w("circles.inviteHint", ["date": monthDay(current.expiresAt)])).font(.footnote)
                            ShareLink(item: line) { Label(w("invites.share"), systemImage: "square.and.arrow.up") }
                        }
                        Button(model.words(current == nil ? "circles.invite" : "circles.newInvite")) {
                            Task { invite = try? await model.store.api.circleInvite(id) }
                        }
                    }
                }
            }
            if let error { Text(error).foregroundStyle(Color.danger) }
        }
        .navigationTitle(view?.circle.name ?? "Circle")
        .refreshable { await load() }
        .task { await load() }
    }

    private func load() async {
        do {
            view = try await model.store.api.circle(id)
            error = nil
        } catch { self.error = error.localizedDescription }
    }

    private func share() async {
        do {
            _ = try await model.store.api.circlePost(id, body: draft.trimmingCharacters(in: .whitespacesAndNewlines))
            draft = ""
            await load()
        } catch { self.error = error.localizedDescription }
    }
}

struct CirclePostView: View {
    @Environment(AppModel.self) private var model
    let post: CirclePost
    let changed: () async -> Void
    @State private var reply = ""
    @State private var updating = false
    @State private var updateText = ""
    @State private var answered = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("\(post.author.displayName ?? "A member")").font(.subheadline.bold())
            Text(post.body)
            if let u = post.update {
                VStack(alignment: .leading, spacing: 4) {
                    if u.answered { Text(model.wording == .neutral ? "Good news" : "Answered").font(.headline) }
                    if let t = u.text { Text(t) }
                }
                .padding(8)
                .background(.green.opacity(0.1), in: .rect(cornerRadius: 10))
                .accessibilityElement(children: .combine)
            }
            ForEach(post.replies) { r in
                Text("\(r.author.displayName ?? "A member"): \(r.body)").font(.callout).foregroundStyle(Color.subtle)
            }
            HStack {
                if post.isMine {
                    Text("\(post.prayed ?? 0) prayed").font(.caption).foregroundStyle(Color.subtle)
                } else {
                    Button(post.prayedByMe ? "Prayed" : (model.wording == .neutral ? "I'm thinking of you" : "I prayed")) {
                        Task { await call { _ = try await model.store.api.circlePray(postId: post.id) } }
                    }
                    .disabled(post.prayedByMe)
                }
                Spacer()
                // Circle updates: only the person who shared can say how it's going.
                if post.isMine, model.features["circleUpdates"], !updating {
                    Button("How it's going") {
                        updateText = post.update?.text ?? ""
                        answered = post.update?.answered ?? false
                        updating = true
                    }
                }
            }
            .buttonStyle(.bordered)
            if updating {
                KindComposer(title: "How it's going", text: $updateText, limit: 600)
                Toggle(model.wording == .neutral ? "It worked out" : "This prayer was answered", isOn: $answered)
                Button("Save update") {
                    Task {
                        await call { _ = try await model.store.api.circleUpdate(postId: post.id, text: updateText.trimmingCharacters(in: .whitespacesAndNewlines), answered: answered) }
                        updating = false
                    }
                }
                .disabled(updateText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !answered)
            }
            KindComposer(title: "Reply", text: $reply, limit: 1000)
            if !reply.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Button("Send reply") {
                    Task {
                        await call { _ = try await model.store.api.circleReply(postId: post.id, body: reply.trimmingCharacters(in: .whitespacesAndNewlines)) }
                        reply = ""
                    }
                }
            }
            if let error { Text(error).foregroundStyle(Color.danger).font(.footnote) }
        }
    }

    private func call(_ f: () async throws -> Void) async {
        do {
            try await f()
            error = nil
            await changed()
        } catch { self.error = error.localizedDescription }
    }
}
