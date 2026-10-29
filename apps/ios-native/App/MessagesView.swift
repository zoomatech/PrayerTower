import PrayerTowerKit
import SwiftUI

/// The Messages tab, as the Expo app's: kind notes between people and the ones they supported,
/// direct messages, and group chats. Requests and invites come first.
struct MessagesView: View {
    @Environment(AppModel.self) private var model
    @State private var items: [ConversationSummary] = []
    @State private var loaded = false
    @State private var error: String?

    private var w: Words { model.words }
    private var groupsOn: Bool { model.me?.community?.shows("groups") ?? true }
    private var eventsOn: Bool { model.me?.community?.shows("events") ?? true }
    private var careOn: Bool { model.me?.community?.shows("care") ?? true }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(w("messages.privacy")).font(.footnote).foregroundStyle(.secondary)
                    if groupsOn { NavigationLink(w("messages.groups")) { GroupsView() } }
                    if eventsOn { NavigationLink(w("messages.events")) { EventsView() } }
                    if careOn { NavigationLink(w("messages.care")) { CareView() } }
                }
                if let error {
                    Section {
                        Text(error).foregroundStyle(.red)
                        Button(w("common.tryAgain")) { Task { await load() } }
                    }
                }
                let parts = Messages.split(items)
                if !parts.requests.isEmpty {
                    Section(w("messages.requests")) { ForEach(parts.requests) { row($0) } }
                }
                if !parts.rest.isEmpty {
                    Section(parts.requests.isEmpty ? "" : w("messages.conversations")) { ForEach(parts.rest) { row($0) } }
                }
                if loaded && items.isEmpty {
                    Section { Text(w("messages.empty")).foregroundStyle(.secondary) }
                }
            }
            .overlay { if !loaded && error == nil { ProgressView() } }
            .navigationTitle(w("tabs.messages"))
            .navigationDestination(for: String.self) { ConversationScreen(id: $0) }
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private func row(_ c: ConversationSummary) -> some View {
        NavigationLink(value: c.id) {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(c.title).font(.headline).lineLimit(1)
                    Spacer()
                    Text(w("messages.kinds.\(c.kind)")).font(.caption).foregroundStyle(.secondary)
                }
                if c.kind == "group" {
                    Text(w("groups.members", count: c.memberCount)).font(.caption).foregroundStyle(.secondary)
                }
                if let last = c.lastMessage { Text(last).lineLimit(2) }
                if c.unread > 0 {
                    Text("\(c.unread) new").font(.caption.bold()).foregroundStyle(.white)
                        .padding(.horizontal, 8).background(.tint, in: .capsule)
                }
            }
            .accessibilityElement(children: .combine)
        }
    }

    private func load() async {
        do {
            items = try await model.store.api.conversations()
            loaded = true
            error = nil
        } catch let e as APIError where e.signedOut {
            model.state = .signedOut
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// One conversation. New messages are fetched every few seconds while it is shown.
struct ConversationScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let id: String
    @State private var view: ConversationView?
    @State private var text = ""
    @State private var busy = false
    @State private var support = false
    @State private var coolDown = false
    @State private var reporting: ChatMessage?
    @State private var reason = ""
    @State private var reported: Set<String> = []
    @State private var inviting = false
    @State private var openedPost: String?
    @State private var error: String?

    private var w: Words { model.words }

    var body: some View {
        ScrollViewReader { proxy in
            List {
                if let c = view?.conversation {
                    Section { header(c) }
                    if support || view?.messages.contains(where: \.crisis) == true { Section { CrisisBox() } }
                    if c.isRequest { Section { request(c) } }
                }
                Section {
                    ForEach(view?.messages ?? []) { m in bubble(m).id(m.id).listRowSeparator(.hidden) }
                }
                if let c = view?.conversation {
                    if let error { Section { Text(error).foregroundStyle(.red) } }
                    if c.awaitingReply { Section { Text(w("conversation.waiting")).font(.footnote) } }
                    if c.canWrite { Section { composer(c) } }
                    if !c.isRequest { Section { tools(c) } }
                }
            }
            .onChange(of: view?.messages.last?.id) { _, last in if let last { withAnimation { proxy.scrollTo(last, anchor: .bottom) } } }
        }
        .navigationTitle(view?.conversation.title ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(item: $openedPost) { PostDetailView(postId: $0) }
        .task {
            // Polls while shown, as the Expo app does; stops when the screen goes away.
            while !Task.isCancelled {
                await load()
                try? await Task.sleep(for: .seconds(Messages.pollSeconds))
            }
        }
        .sheet(item: $reporting) { m in reportSheet(m) }
        .sheet(isPresented: $inviting) { InviteSheet(conversationId: id) { Task { await load() } } }
        .alert(w("coolDown.title"), isPresented: $coolDown) {
            Button(w("coolDown.breather")) { dismiss() }
            Button(w("coolDown.okay"), role: .cancel) {}
        } message: {
            Text(w("coolDown.lines.l\(Int.random(in: 0...3))"))
        }
    }

    @ViewBuilder private func header(_ c: ConversationView.Info) -> some View {
        if let topic = c.topic { Text(topic) }
        if c.isGroup {
            Text(w("groups.members", count: c.members.count + 1)).font(.caption).foregroundStyle(.secondary)
        }
        if let post = c.post {
            Button { openedPost = post.id } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(w("conversation.about")).font(.caption).foregroundStyle(.secondary)
                    Text(post.excerpt)
                }
            }
            .buttonStyle(.plain)
        }
    }

    @ViewBuilder private func request(_ c: ConversationView.Info) -> some View {
        Text(c.isGroup ? w("conversation.invited") : w("conversation.wantsToTalk", ["name": c.title]))
        HStack {
            Button(w(c.isGroup ? "conversation.join" : "conversation.accept")) {
                Task {
                    await act {
                        if c.isGroup { _ = try await model.store.api.joinGroup(id) } else { _ = try await model.store.api.acceptConversation(id) }
                    }
                }
            }
            .buttonStyle(.borderedProminent)
            Button(w("conversation.noThanks")) { Task { await act(leave: true) { _ = try await model.store.api.leaveConversation(id) } } }
                .buttonStyle(.bordered)
            if let other = c.other?.id {
                Button(w("conversation.block"), role: .destructive) { Task { await act(leave: true) { _ = try await model.store.api.block(other) } } }
                    .buttonStyle(.borderless)
            }
        }
    }

    private func bubble(_ m: ChatMessage) -> some View {
        HStack {
            if m.mine { Spacer(minLength: 40) }
            VStack(alignment: .leading, spacing: 2) {
                if !m.mine && view?.conversation.isGroup == true { Text(m.author).font(.caption.bold()).foregroundStyle(.tint) }
                Text(m.body).foregroundStyle(m.mine ? .white : .primary)
                HStack(spacing: 12) {
                    if let d = try? Date(m.createdAt, strategy: .iso8601) {
                        Text(d.formatted(date: .omitted, time: .shortened)).font(.caption2)
                    }
                    if !m.mine {
                        if reported.contains(m.id) {
                            Text(w("conversation.reported")).font(.caption2)
                        } else {
                            Button { reporting = m } label: { Text(w("post.report")).tapTarget() }.font(.caption2).buttonStyle(.borderless)
                        }
                    }
                }
                .foregroundStyle(m.mine ? .white.opacity(0.8) : .secondary)
            }
            .padding(10)
            .background(m.mine ? AnyShapeStyle(.tint) : AnyShapeStyle(.thinMaterial), in: .rect(cornerRadius: 16))
            .accessibilityElement(children: .combine)
            if !m.mine { Spacer(minLength: 40) }
        }
    }

    @ViewBuilder private func composer(_ c: ConversationView.Info) -> some View {
        TextField(w(c.isGroup ? "conversation.writeGroup" : "conversation.write"), text: $text, axis: .vertical)
            .lineLimit(1...8)
            .onChange(of: text) { _, new in if new.count > Messages.maxChars { text = String(new.prefix(Messages.maxChars)) } }
        KindCloudView(text: text)
        ReplyHelpersView(lastFromOther: view?.messages.last(where: { !$0.mine })?.body, empty: view?.messages.isEmpty ?? true, text: $text)
        Button(w("actions.send")) { Task { await send() } }
            .disabled(busy || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    @ViewBuilder private func tools(_ c: ConversationView.Info) -> some View {
        if c.canInvite { Button(w("conversation.invite")) { inviting = true } }
        if c.isGroup { NavigationLink(w("events.groupTitle")) { EventsView(groupId: id) } }
        if let other = c.other, let otherId = other.id {
            Button(w("person.block", ["name": other.name]), role: .destructive) { Task { await act(leave: true) { _ = try await model.store.api.block(otherId) } } }
        }
        Button(w(c.isGroup ? "conversation.leave" : "conversation.close"), role: .destructive) {
            Task { await act(leave: true) { _ = try await model.store.api.leaveConversation(id) } }
        }
    }

    private func reportSheet(_ m: ChatMessage) -> some View {
        NavigationStack {
            Form {
                Section { Text(m.body).foregroundStyle(.secondary) }
                Section {
                    TextField(w("conversation.whatsWrong"), text: $reason, axis: .vertical).lineLimit(2...6)
                } footer: { Text(w("conversation.reportNote")) }
            }
            .navigationTitle(w("conversation.reportTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(w("common.cancel")) { reporting = nil } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(w("actions.sendReport")) { Task { await report(m) } }
                        .disabled(reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    private func load() async {
        do {
            view = try await model.store.api.conversation(id)
            _ = try? await model.store.api.markConversationRead(id)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func send() async {
        busy = true
        defer { busy = false }
        do {
            let before = view?.messages ?? []
            let r = try await model.store.api.sendMessage(id, body: text)
            if r.message.crisis { support = true }
            // Counting patterns: move labels only, and only when the switch is on and the member shares.
            if model.features["talkCounts"], model.talkPrefs?.shareCounts == true, before.count >= 2,
               let chain = Talk.chain(before[before.count - 2].body, before[before.count - 1].body, text) {
                _ = try? await model.store.api.talkCount(chain: chain)
            }
            if r.coolDown == true { coolDown = true }
            text = ""
            error = nil
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func report(_ m: ChatMessage) async {
        do {
            _ = try await model.store.api.report(targetType: "message", targetId: m.id, reason: reason.trimmingCharacters(in: .whitespacesAndNewlines))
            reported.insert(m.id)
            reason = ""
            reporting = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func act(leave: Bool = false, _ work: () async throws -> Void) async {
        do {
            try await work()
            if leave { dismiss() } else { await load() }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Invite people you follow into a group.
struct InviteSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let conversationId: String
    let done: () -> Void
    @State private var people: [Connection]?
    @State private var picked: Set<String> = []
    @State private var error: String?

    private var w: Words { model.words }

    var body: some View {
        NavigationStack {
            List {
                if people?.isEmpty == true { Text(w("conversation.followToInvite")).foregroundStyle(.secondary) }
                ForEach(people ?? []) { p in
                    Button {
                        if picked.contains(p.id) { picked.remove(p.id) } else { picked.insert(p.id) }
                    } label: {
                        HStack {
                            Text(p.displayName.isEmpty ? w("conversation.member") : p.displayName)
                            Spacer()
                            if picked.contains(p.id) { Image(systemName: "checkmark").accessibilityHidden(true) }
                        }
                    }
                    .accessibilityAddTraits(picked.contains(p.id) ? .isSelected : [])
                }
                if let error { Text(error).foregroundStyle(.red) }
            }
            .overlay { if people == nil && error == nil { ProgressView() } }
            .navigationTitle(w("conversation.inviteTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(w("common.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(w("conversation.sendInvites")) { Task { await invite() } }.disabled(picked.isEmpty)
                }
            }
            .task {
                do { people = try await model.store.api.connections() } catch { self.error = error.localizedDescription }
            }
        }
    }

    private func invite() async {
        do {
            _ = try await model.store.api.inviteToGroup(conversationId, userIds: Array(picked))
            done()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Group chats: find open groups or start one.
struct GroupsView: View {
    @Environment(AppModel.self) private var model
    @State private var groups: [PublicGroup] = []
    @State private var loaded = false
    @State private var creating = false
    @State private var title = ""
    @State private var topic = ""
    @State private var isPublic = true
    @State private var busy = false
    @State private var opened: String?
    @State private var error: String?

    private var w: Words { model.words }

    var body: some View {
        List {
            Section { Text(w("groups.intro")) }
            if let error { Section { Text(error).foregroundStyle(.red) } }
            Section {
                if creating {
                    TextField(w("groups.namePlaceholder"), text: $title)
                        .onChange(of: title) { _, new in if new.count > 80 { title = String(new.prefix(80)) } }
                        .accessibilityLabel(w("groups.name"))
                    TextField(w("groups.topicPlaceholder"), text: $topic, axis: .vertical)
                        .onChange(of: topic) { _, new in if new.count > 280 { topic = String(new.prefix(280)) } }
                        .accessibilityLabel(w("groups.topic"))
                    Toggle(isOn: $isPublic) {
                        Text(w("groups.public"))
                        Text(w(isPublic ? "groups.publicHint" : "groups.privateHint"))
                    }
                    Button(w("groups.create")) { Task { await create() } }
                        .disabled(busy || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    Button(w("common.cancel")) { creating = false }
                } else {
                    Button(w("groups.start")) { creating = true }
                }
            }
            if loaded && groups.isEmpty { Section { Text(w("groups.empty")).foregroundStyle(.secondary) } }
            ForEach(groups) { g in
                Button { Task { await open(g) } } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(g.title).font(.headline)
                        if let topic = g.topic { Text(topic) }
                        Text("\(w("groups.members", count: g.memberCount)) · \(w(g.joined ? "groups.joined" : "groups.tapToJoin"))")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .navigationTitle(w("messages.groups"))
        .navigationDestination(item: $opened) { ConversationScreen(id: $0) }
        .refreshable { await load() }
        .task { await load() }
    }

    private func load() async {
        do {
            groups = try await model.store.api.groups()
            loaded = true
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func create() async {
        busy = true
        defer { busy = false }
        do {
            opened = try await model.store.api.createGroup(NewGroup(title: title, topic: topic, isPublic: isPublic))
            creating = false
            title = ""
            topic = ""
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func open(_ g: PublicGroup) async {
        do {
            if !g.joined { _ = try await model.store.api.joinGroup(g.id) }
            opened = g.id
        } catch {
            self.error = error.localizedDescription
        }
    }
}
