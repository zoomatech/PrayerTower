import PrayerTowerKit
import SwiftUI

private func eventDate(_ iso: String) -> Date? {
    (try? Date(iso, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true))) ?? (try? Date(iso, strategy: .iso8601))
}

private func whenText(_ iso: String) -> String {
    eventDate(iso)?.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day().hour().minute()) ?? iso
}

/// Meetings, meet-ups, seminars and outreach: upcoming events and a form to host one. With a
/// group, the list and the new event belong to it.
struct EventsView: View {
    @Environment(AppModel.self) private var model
    var groupId: String?
    @State private var events: [PrayerEvent]?
    @State private var creating = false
    @State private var kind = "prayer_meeting"
    @State private var title = ""
    @State private var about = ""
    @State private var when = "wed"
    @State private var custom = Date.now.addingTimeInterval(86_400)
    @State private var minutes = "60"
    @State private var videoUrl = ""
    @State private var location = ""
    @State private var busy = false
    @State private var opened: String?
    @State private var error: String?

    private var w: Words { model.words }
    private var startsAt: Date { Events.whens.first { $0.key == when }.map { GiftSchedule.next($0) } ?? custom }

    var body: some View {
        List {
            Section { Text(w("events.intro")) }
            if let error { Section { Text(error).foregroundStyle(.red) } }
            Section {
                if creating { form } else { Button(w("events.hostAn")) { creating = true } }
            }
            if events?.isEmpty == true { Section { Text(w("events.empty")).foregroundStyle(Color.subtle) } }
            ForEach(events ?? []) { e in
                Button { opened = e.id } label: { EventRow(event: e) }.buttonStyle(.plain)
            }
        }
        .overlay { if events == nil && error == nil { ProgressView() } }
        .navigationTitle(w(groupId == nil ? "messages.events" : "events.groupTitle"))
        .navigationDestination(item: $opened) { EventDetailView(id: $0) }
        .refreshable { await load() }
        .task { await load() }
    }

    @ViewBuilder private var form: some View {
        Picker(w("events.title"), selection: $kind) {
            ForEach(Events.kinds(roles: model.me?.roles ?? []), id: \.self) { Text(w("enums.eventKind.\($0)")).tag($0) }
        }
        TextField(w("events.titlePlaceholder"), text: $title)
            .accessibilityLabel(w("events.title"))
            .onChange(of: title) { _, new in if new.count > 120 { title = String(new.prefix(120)) } }
        TextField(w("events.about"), text: $about, axis: .vertical)
            .lineLimit(2...6)
            .onChange(of: about) { _, new in if new.count > 2000 { about = String(new.prefix(2000)) } }
        Picker(w("actions.when"), selection: $when) {
            ForEach(Events.whens) { Text(w("actions.whenOptions.\($0.key)")).tag($0.key) }
            Text(w("events.otherTime")).tag("custom")
        }
        if when == "custom" {
            DatePicker(w("events.otherTime"), selection: $custom, in: Date.now..., displayedComponents: [.date, .hourAndMinute])
        } else {
            Text(startsAt.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day().hour().minute())).font(.footnote)
        }
        TextField(w("events.minutes"), text: $minutes).keyboardType(.numberPad)
        TextField(w("events.video"), text: $videoUrl)
            .keyboardType(.URL)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
        TextField(w("events.placePlaceholder"), text: $location)
            .accessibilityLabel(w("events.place"))
            .onChange(of: location) { _, new in if new.count > 200 { location = String(new.prefix(200)) } }
        if !location.trimmingCharacters(in: .whitespaces).isEmpty { Text(w("events.safety")).font(.footnote) }
        Button(w("events.host")) { Task { await create() } }
            .disabled(busy || !Events.canHost(title: title, videoUrl: videoUrl, location: location))
        Button(w("common.cancel")) { creating = false }
    }

    private func load() async {
        do {
            events = try await model.store.api.events(groupId: groupId)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func create() async {
        busy = true
        defer { busy = false }
        do {
            let e = try await model.store.api.createEvent(
                NewEvent(kind: kind, title: title, description: about, startsAt: startsAt, minutes: minutes, videoUrl: videoUrl, location: location, groupId: groupId)
            )
            creating = false
            title = ""
            about = ""
            videoUrl = ""
            location = ""
            opened = e.id
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct EventRow: View {
    @Environment(AppModel.self) private var model
    let event: PrayerEvent

    var body: some View {
        let w = model.words
        let e = event
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(e.title).font(.headline)
                Spacer()
                Text(w("enums.eventKind.\(e.kind)")).font(.caption).foregroundStyle(Color.subtle)
            }
            Text(e.live ? w("events.happening") : whenText(e.startsAt)).font(.subheadline.bold()).foregroundStyle(.tint)
            let place = [e.hasVideo ? w("events.videoMeeting") : nil, e.location, e.groupTitle.map { w("events.groupLabel", ["name": $0]) }].compactMap { $0 }
            if !place.isEmpty { Text(place.joined(separator: " · ")).font(.caption) }
            Text(hosted(e, w) + (e.myRsvp.map { " · " + w($0 == "going" ? "events.youreGoing" : "events.youreMaybe") } ?? ""))
                .font(.caption).foregroundStyle(Color.subtle)
        }
        .accessibilityElement(children: .combine)
    }
}

private func hosted(_ e: PrayerEvent, _ w: Words) -> String {
    e.isHost ? w("events.hostedYou", ["count": String(e.going)]) : w("events.hostedBy", ["name": e.host.name, "count": String(e.going)])
}

/// One event: details, RSVP, the meeting link once you're going, cancel (host), report.
struct EventDetailView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    let id: String
    @State private var event: PrayerEvent?
    @State private var reporting = false
    @State private var reason = ""
    @State private var reported = false
    @State private var error: String?

    private var w: Words { model.words }

    var body: some View {
        List {
            if let error { Section { Text(error).foregroundStyle(.red) } }
            if let e = event {
                Section {
                    Text(w("enums.eventKind.\(e.kind)")).font(.caption).foregroundStyle(Color.subtle)
                    Text(e.title).font(.title2.bold())
                    if e.cancelled { Text(w("events.cancelled")).foregroundStyle(.red).bold() }
                    Text("\(e.live ? w("events.happening") : whenText(e.startsAt)) · \(w("events.minutesShort", ["count": String(e.durationMinutes)]))")
                        .bold().foregroundStyle(.tint)
                    if !e.description.isEmpty { Text(e.description) }
                    if let place = e.location { Label(place, systemImage: "mappin.and.ellipse") }
                    if let group = e.groupTitle { Text(w("events.forGroup", ["name": group])).font(.caption) }
                    Text(hosted(e, w)).font(.caption).foregroundStyle(Color.subtle)
                }
                Section {
                    if let link = e.videoUrl.flatMap(URL.init(string:)) {
                        Button(w(e.live ? "events.joinNow" : "events.openLink")) { openURL(link) }
                    } else if e.hasVideo {
                        Text(w("events.rsvpForLink")).font(.footnote)
                    }
                    if !e.cancelled && !e.isHost {
                        Button(w(e.myRsvp == "going" ? "events.goingOn" : "events.going")) { Task { await run { try await model.store.api.rsvp(id, status: "going") } } }
                        Button(w("events.maybe")) { Task { await run { try await model.store.api.rsvp(id, status: "maybe") } } }
                            .accessibilityAddTraits(e.myRsvp == "maybe" ? .isSelected : [])
                        if e.myRsvp != nil {
                            Button(w("events.cantMake")) { Task { await run { try await model.store.api.unrsvp(id) } } }
                        }
                    }
                    if e.myRsvp == "going" && !e.cancelled { Text(w("events.reminder")).font(.footnote) }
                    if e.isHost && !e.cancelled {
                        Button(w("events.cancel"), role: .destructive) {
                            Task {
                                do {
                                    _ = try await model.store.api.cancelEvent(id)
                                    await load()
                                } catch {
                                    self.error = error.localizedDescription
                                }
                            }
                        }
                    }
                }
                if !e.isHost {
                    Section {
                        if reported {
                            Text(w("events.reportDone")).font(.footnote)
                        } else if reporting {
                            TextField(w("conversation.whatsWrong"), text: $reason, axis: .vertical).lineLimit(2...6)
                            Button(w("actions.sendReport")) { Task { await report() } }
                                .disabled(reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                            Button(w("common.cancel")) { reporting = false }
                        } else {
                            Button(w("events.report"), role: .destructive) { reporting = true }.font(.footnote)
                        }
                    }
                }
            }
        }
        .overlay { if event == nil && error == nil { ProgressView() } }
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
    }

    private func load() async {
        do {
            event = try await model.store.api.event(id)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func run(_ call: () async throws -> PrayerEvent) async {
        do {
            event = try await call()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func report() async {
        do {
            _ = try await model.store.api.report(targetType: "event", targetId: id, reason: reason.trimmingCharacters(in: .whitespacesAndNewlines))
            reported = true
            reporting = false
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Talk with someone: members ask for a listening partner or counselor; partners and counselors
/// see the queue here and reach out.
struct CareView: View {
    @Environment(AppModel.self) private var model
    @State private var options: CareOptions?
    @State private var kind = "pray_with_me"
    @State private var text = ""
    @State private var mine: [CareRequest] = []
    @State private var queue: [CareQueueItem] = []
    @State private var crisis = false
    @State private var sent = false
    @State private var busy = false
    @State private var opened: String?
    @State private var error: String?

    private var w: Words { model.words }
    private var staff: Bool { (model.me?.roles ?? []).contains(where: CareOptions.staffRoles.contains) }

    var body: some View {
        List {
            Section { Text(w("care.intro")) }
            if let error { Section { Text(error).foregroundStyle(.red) } }
            if crisis { Section { CrisisBox() } }
            if let options {
                Section {
                    if !options.enabled {
                        Text(w("care.unavailable")).font(.footnote)
                    } else if sent {
                        Text(w("care.sentTitle")).font(.headline)
                        Text(w("care.sent"))
                        Button(w("care.askElse")) { sent = false }
                    } else {
                        Picker(w("care.title"), selection: $kind) {
                            ForEach(options.kinds, id: \.self) { Text(w("enums.careKind.\($0)")).tag($0) }
                        }
                        if kind == "confession" {
                            let days = options.confessionRetentionDays ?? 7
                            Text(days == 0 ? w("care.confessionNoteNow") : w("care.confessionNote", count: days)).font(.footnote)
                        }
                        TextField(w("care.placeholder"), text: $text, axis: .vertical)
                            .lineLimit(3...8)
                            .onChange(of: text) { _, new in if new.count > 2000 { text = String(new.prefix(2000)) } }
                        Button(w("care.ask")) { Task { await ask() } }
                            .disabled(busy || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            }
            if !mine.isEmpty {
                Section(w("care.yours")) {
                    ForEach(mine) { r in
                        VStack(alignment: .leading, spacing: 4) {
                            Text("\(w("enums.careKind.\(r.kind)")) · \(w("care.status.\(r.status)"))").font(.caption).foregroundStyle(Color.subtle)
                            Text(r.body).lineLimit(3)
                            HStack {
                                if let c = r.conversationId { Button(w("care.open")) { opened = c }.buttonStyle(.bordered) }
                                if r.status != "closed" {
                                    Button(w("common.close")) { Task { await act { _ = try await model.store.api.closeCare(r.id) } } }
                                        .buttonStyle(.borderless)
                                }
                            }
                        }
                    }
                }
            }
            if staff {
                Section(w("care.queue")) {
                    if queue.isEmpty { Text(w("care.noneWaiting")).font(.footnote) }
                    ForEach(queue) { r in
                        VStack(alignment: .leading, spacing: 4) {
                            Text("\(r.crisis ? w("care.danger") : "")\(w("enums.careKind.\(r.kind)")) · \(r.name) · \(eventDate(r.createdAt)?.formatted(date: .abbreviated, time: .shortened) ?? "")")
                                .font(.caption).foregroundStyle(r.crisis ? .red : .secondary)
                            Text(r.body)
                            Button(w("care.reachOut")) { Task { await claim(r) } }.buttonStyle(.borderedProminent)
                        }
                    }
                }
            }
        }
        .navigationTitle(w("care.title"))
        .navigationDestination(item: $opened) { ConversationScreen(id: $0) }
        .refreshable { await load() }
        .task { await load() }
    }

    private func load() async {
        let api = model.store.api
        do {
            let o = try await api.careOptions()
            options = o
            if !o.kinds.isEmpty && !o.kinds.contains(kind) { kind = o.kinds[0] }
            mine = try await api.myCareRequests()
            if staff { queue = try await api.careQueue() }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func ask() async {
        busy = true
        defer { busy = false }
        do {
            crisis = try await model.store.api.askForCare(kind: kind, body: text)
            sent = true
            text = ""
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func claim(_ r: CareQueueItem) async {
        do {
            opened = try await model.store.api.claimCare(r.id)
        } catch {
            self.error = error.localizedDescription
            await load()
        }
    }

    private func act(_ work: () async throws -> Void) async {
        do { try await work() } catch { self.error = error.localizedDescription }
        await load()
    }
}
