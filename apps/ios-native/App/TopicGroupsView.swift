import PrayerTowerKit
import SwiftUI

/// Groups (Steve, 2026-10-31): open topic groups like Facebook groups, starting with Cancer
/// survivors. Anyone can find and join one; any member can start one and leads it.
struct TopicGroupsView: View {
    @Environment(AppModel.self) private var model
    @State private var groups: [TopicGroup] = []
    @State private var loaded = false
    @State private var name = ""
    @State private var about = ""
    @State private var opened: String?
    @State private var error: String?

    private var w: Words { model.words }

    var body: some View {
        List {
            Section {
                Text(w("topicGroups.intro")).font(.footnote).foregroundStyle(.secondary)
                ForEach(groups) { g in
                    NavigationLink { TopicGroupDetailView(id: g.id) } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(g.name).font(.headline)
                            if let about = g.about { Text(about).font(.subheadline) }
                            Text(w("topicGroups.members", count: g.members) + (g.isLeader ? " · " + w("topicGroups.youLead") : g.joined ? " · " + w("topicGroups.joined") : ""))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                if loaded, groups.isEmpty { Text(w("topicGroups.none")).foregroundStyle(.secondary) }
            }
            Section(w("topicGroups.start")) {
                TextField(w("topicGroups.name"), text: $name)
                TextField(w("topicGroups.about"), text: $about, axis: .vertical)
                Button(w("topicGroups.create")) { Task { await create() } }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || name.count > 60 || about.count > 300)
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle(w("topicGroups.title"))
        .navigationDestination(item: $opened) { TopicGroupDetailView(id: $0) }
        .refreshable { await load() }
        .task { await load() }
    }

    private func load() async {
        do {
            groups = try await model.store.api.topicGroups()
            loaded = true
            error = nil
        } catch { self.error = error.localizedDescription }
    }

    private func create() async {
        do {
            let made = try await model.store.api.createTopicGroup(name: name.trimmingCharacters(in: .whitespaces), about: about.trimmingCharacters(in: .whitespacesAndNewlines))
            name = ""
            about = ""
            await load()
            opened = made.id
        } catch { self.error = error.localizedDescription }
    }
}

/// One group's page: a feed, not a chat room. Members share, comment and pray with the kind cloud.
struct TopicGroupDetailView: View {
    @Environment(AppModel.self) private var model
    let id: String
    @State private var view: TopicGroupView?
    @State private var draft = ""
    @State private var error: String?

    private var w: Words { model.words }

    var body: some View {
        List {
            if let v = view {
                Section {
                    if let about = v.group.about { Text(about) }
                    Text(w("topicGroups.members", count: v.group.members) + leaderLine(v.group)).font(.caption).foregroundStyle(.secondary)
                }
                if v.group.joined {
                    Section(w("topicGroups.share")) {
                        KindComposer(title: w("topicGroups.shareLabel"), text: $draft, limit: 2000)
                        Button(w("topicGroups.post")) { Task { await call { _ = try await model.store.api.topicGroupPost(id, body: draft.trimmingCharacters(in: .whitespacesAndNewlines)); draft = "" } } }
                            .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                } else {
                    Section {
                        Text(w("topicGroups.joinToShare"))
                        Button(w("topicGroups.join")) { Task { await call { _ = try await model.store.api.joinTopicGroup(id) } } }
                    }
                }
                if v.posts.isEmpty { Section { Text(w("topicGroups.empty")).foregroundStyle(.secondary) } }
                ForEach(v.posts) { p in
                    Section { TopicGroupPostView(post: p, joined: v.group.joined) { await load() } }
                }
                if v.group.joined {
                    Section { Button(w("topicGroups.leave"), role: .destructive) { Task { await call { _ = try await model.store.api.leaveTopicGroup(id) } } } }
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .navigationTitle(view?.group.name ?? w("topicGroups.title"))
        .refreshable { await load() }
        .task { await load() }
    }

    private func leaderLine(_ g: TopicGroup) -> String {
        if g.isLeader { return " · " + w("topicGroups.youLead") }
        if let name = g.leader?.displayName { return " · " + w("topicGroups.leader", ["name": name]) }
        return ""
    }

    private func load() async {
        do {
            view = try await model.store.api.topicGroup(id)
            error = nil
        } catch { self.error = error.localizedDescription }
    }

    private func call(_ f: () async throws -> Void) async {
        do {
            try await f()
            await load()
        } catch { self.error = error.localizedDescription }
    }
}

struct TopicGroupPostView: View {
    @Environment(AppModel.self) private var model
    let post: TopicGroupPost
    let joined: Bool
    let changed: () async -> Void
    @State private var comment = ""
    @State private var error: String?

    private var w: Words { model.words }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(post.author.displayName ?? "A member").font(.subheadline.bold())
            Text(post.body)
            HStack {
                if post.prayed > 0 { Text(w("topicGroups.prayedCount", count: post.prayed)).font(.caption).foregroundStyle(.secondary) }
                Spacer()
                if post.prayedByMe {
                    Text(w("topicGroups.prayed")).font(.caption)
                } else if joined {
                    Button(w("topicGroups.pray")) { Task { await call { _ = try await model.store.api.topicGroupPray(postId: post.id) } } }
                        .buttonStyle(.bordered)
                }
                if post.canRemove {
                    Button(w("topicGroups.remove"), role: .destructive) { Task { await call { _ = try await model.store.api.removeTopicGroupPost(post.id) } } }
                        .buttonStyle(.bordered)
                }
            }
            ForEach(post.comments) { c in
                HStack(alignment: .top) {
                    Text("\(c.author.displayName ?? "A member"): \(c.body)").font(.callout).foregroundStyle(.secondary)
                    Spacer()
                    if c.canRemove {
                        Button(w("topicGroups.remove"), role: .destructive) { Task { await call { _ = try await model.store.api.removeTopicGroupComment(c.id) } } }
                            .font(.caption).buttonStyle(.borderless)
                    }
                }
            }
            if joined {
                KindComposer(title: w("topicGroups.commentLabel"), text: $comment, limit: 1000)
                if !comment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Button(w("topicGroups.send")) {
                        Task {
                            await call { _ = try await model.store.api.topicGroupComment(postId: post.id, body: comment.trimmingCharacters(in: .whitespacesAndNewlines)) }
                            comment = ""
                        }
                    }
                }
            }
            if let error { Text(error).foregroundStyle(.red).font(.footnote) }
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
