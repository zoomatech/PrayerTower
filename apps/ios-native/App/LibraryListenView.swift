import AVFoundation
import PrayerTowerKit
import SwiftUI

/// Reads passages aloud with the device's own voice; nothing leaves the device. It tells the reader how far it has got,
/// so the member's place can be kept and picked up later.
@MainActor @Observable final class PassageSpeaker: NSObject, AVSpeechSynthesizerDelegate {
    static let shared = PassageSpeaker()
    private let synth = AVSpeechSynthesizer()
    /// The passage being read, by key.
    private(set) var speaking: String?
    /// Where in the passage this reading began, how far it has got, and who hears about it when it stops.
    private var from = 0
    private var reached = 0
    private var length = 0
    private var place: ((_ reached: Int, _ finished: Bool) -> Void)?

    override init() {
        super.init()
        synth.delegate = self
    }

    /// Reads `text` from character `from`; `place` hears where it stopped, or that it finished.
    func toggle(_ key: String, text: String, from: Int = 0, citation: String? = nil, place: ((Int, Bool) -> Void)? = nil) {
        if speaking == key {
            stop()
            return
        }
        stop()
        let begin = from > 0 && from < text.count ? from : 0
        let said = begin > 0 ? String(text.dropFirst(begin)) : (citation.map { "\(text)\n\($0)" } ?? text)
        let u = AVSpeechUtterance(string: said)
        u.voice = AVSpeechSynthesisVoice(language: "en-US")
        self.from = begin
        reached = begin
        length = text.count
        self.place = place
        speaking = key
        place?(begin, false)
        synth.speak(u)
    }

    func stop() {
        let told = place
        place = nil
        synth.stopSpeaking(at: .immediate)
        if speaking != nil { told?(reached, false) }
        speaking = nil
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, willSpeakRangeOfSpeechString characterRange: NSRange, utterance: AVSpeechUtterance) {
        Task { @MainActor in self.reached = min(self.length, self.from + characterRange.location) }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in
            guard self.speaking != nil else { return }
            self.place?(self.length, true)
            self.place = nil
            self.speaking = nil
        }
    }
}

/// Listen under a passage, as the Expo app's ListenPassage: the device voice, and a LibriVox recording where one exists.
/// Both keep the member's place as they go; `start` picks up where they left off.
struct ListenRow: View {
    @Environment(AppModel.self) private var model
    let collection: String
    let key: String
    let text: String
    let citation: String
    var start: ListenPlace?
    /// nil: not looked up yet; .some(nil): no recording of this place.
    @State var recording: LibraryRecording??
    @State private var player: AVPlayer?
    @State private var watcher: Any?
    @State private var playing = false
    @State private var voiceFrom: Int?

    var body: some View {
        let w = model.words
        if model.features["libraryListen"] {
            let speaking = PassageSpeaker.shared.speaking == key
            Button(speaking ? w("library.listenStop") : w("library.listen")) { speak() }
                .accessibilityLabel(w(speaking ? "library.listenStopOne" : "library.listenOne", ["citation": citation]))
            switch recording {
            case .none:
                Button(w("library.listenFind")) { Task { await find() } }
                    .accessibilityLabel(w("library.listenFindOne", ["citation": citation]))
            case .some(.none):
                Text(w("library.listenNone")).font(.caption).foregroundStyle(.secondary)
            case let .some(.some(r)):
                Button(playing ? w("library.listenPause") : w("library.listenPlay")) { play(r) }
                    .accessibilityLabel(playing ? w("library.listenPause") : w("library.listenPlayOne", ["title": r.title]))
                if let url = URL(string: r.projectUrl) {
                    Link(r.credit, destination: url).font(.caption)
                } else {
                    Text(r.credit).font(.caption)
                }
            }
        }
    }

    private func keep(_ place: ListenPlace) {
        let api = model.store.api
        Task { try? await api.saveListening(place) }
    }

    private func speak() {
        let from = voiceFrom ?? (start?.kind == .voice ? Int(start!.position) : 0)
        PassageSpeaker.shared.toggle(key, text: text, from: from, citation: citation) { reached, finished in
            voiceFrom = finished ? 0 : reached
            keep(ListenPlace(collection: collection, key: key, kind: .voice, position: Double(reached), finished: finished))
        }
    }

    private func find() async {
        recording = .some((try? await model.store.api.libraryRecording(collection: collection, key: key)) ?? nil)
    }

    private func recordingPlace(_ r: LibraryRecording, finished: Bool = false) -> ListenPlace {
        let at = player?.currentTime().seconds ?? 0
        let length = player?.currentItem?.duration.seconds ?? .nan
        return ListenPlace(collection: collection, key: key, kind: .recording, position: finished ? Double(r.seconds) : max(0, at.isFinite ? at : 0),
                           duration: length.isFinite ? length : Double(r.seconds), finished: finished)
    }

    private func play(_ r: LibraryRecording) {
        if playing {
            player?.pause()
            playing = false
            keep(recordingPlace(r))
            return
        }
        PassageSpeaker.shared.stop()
        if player == nil, let url = URL(string: r.url) {
            let p = AVPlayer(url: url)
            if start?.kind == .recording, let at = start?.position, at > 0 { p.seek(to: CMTime(seconds: at, preferredTimescale: 1)) }
            // The place is kept every 15 seconds while it plays, and when it ends.
            watcher = p.addPeriodicTimeObserver(forInterval: CMTime(seconds: 15, preferredTimescale: 1), queue: .main) { _ in
                Task { @MainActor in if playing { keep(recordingPlace(r)) } }
            }
            NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: p.currentItem, queue: .main) { _ in
                Task { @MainActor in
                    playing = false
                    keep(recordingPlace(r, finished: true))
                }
            }
            player = p
        }
        player?.play()
        playing = true
        keep(recordingPlace(r))
    }
}

/// The Listening room, as the Expo app's listening-room.tsx: what the member has listened to, newest first, and each
/// time it opens, the question whether to pick up where they left off.
struct ListeningRoomView: View {
    @Environment(AppModel.self) private var model
    @State private var data: ListeningHistory?
    @State private var asking = false
    @State private var open: String?
    @State private var error: String?

    var body: some View {
        let w = model.words
        List {
            if let error { Section { Text(error).foregroundStyle(.red) } }
            if asking, let r = data?.resume {
                Section {
                    Text(w("library.listeningResume")).font(.headline)
                    Text("\(r.citation) · \(whereAt(r))").font(.caption)
                    Button(w("library.listeningResumeYes")) {
                        asking = false
                        open = r.id
                    }
                    Button(w("library.listeningResumeNo")) { asking = false }
                }
            }
            if let data {
                Section {
                    if data.history.isEmpty { Text(w("library.listeningNone")) }
                    ForEach(data.history) { l in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(l.citation)
                            Text(l.kind == .recording ? w("library.listeningRecording", ["title": l.recording?.title ?? ""]) : w("library.listeningVoice"))
                                .font(.caption).foregroundStyle(.secondary)
                            Text(whereAt(l)).font(.caption).foregroundStyle(.secondary)
                            if open == l.id {
                                ListenRow(collection: l.collection, key: l.key, text: l.text, citation: l.citation,
                                          start: l.finished ? nil : ListenPlace(collection: l.collection, key: l.key, kind: l.kind, position: l.position),
                                          recording: l.kind == .recording ? .some(l.recording) : nil)
                            } else {
                                Button(w("library.listeningOpen")) { open = l.id }
                                    .accessibilityLabel(w("library.listeningOpenOne", ["citation": l.citation]))
                            }
                        }
                    }
                } header: { Text(w("library.listeningIntro")) }
            } else if error == nil {
                ProgressView()
            }
        }
        .navigationTitle(w("library.listeningTitle"))
        // Asked each time the room opens.
        .task { await load() }
        .refreshable { await load() }
    }

    private func whereAt(_ l: LibraryListened) -> String {
        let w = model.words
        if l.finished { return w("library.listeningFinished") }
        if l.kind == .recording {
            return w("library.listeningRecordingAt", ["at": clock(l.position), "total": clock(l.duration ?? Double(l.recording?.seconds ?? 0))])
        }
        return w("library.listeningVoiceAt", ["percent": String(Int((100 * l.position / Double(max(1, l.text.count))).rounded()))])
    }

    private func clock(_ seconds: Double) -> String {
        let s = max(0, Int(seconds.rounded()))
        let h = s / 3600, m = (s % 3600) / 60, r = s % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, r) : String(format: "%d:%02d", m, r)
    }

    private func load() async {
        error = nil
        open = nil
        do {
            data = try await model.store.api.listening()
            asking = data?.resume != nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Study rooms

/// Study with a circle, under a passage or plan day: pick a circle and write a question to open the talk.
struct StudyStartRow: View {
    @Environment(AppModel.self) private var model
    let subject: StudySubject
    let citation: String
    @State private var open = false

    var body: some View {
        if model.features["libraryStudies"], model.features["prayerCircles"] {
            Button(model.words("library.studyStart")) { open = true }
                .accessibilityLabel(model.words("library.studyStartOne", ["citation": citation]))
                .sheet(isPresented: $open) { NavigationStack { StudyStartSheet(subject: subject, citation: citation) } }
        }
    }
}

struct StudyStartSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let subject: StudySubject
    let citation: String
    @State private var circles: [CircleSummary]?
    @State private var circleId: String?
    @State private var prompt = ""
    @State private var busy = false
    @State private var started: String?
    @State private var error: String?

    var body: some View {
        let w = model.words
        Group {
            if let started {
                StudyRoomView(id: started)
            } else {
                Form {
                    Section { Text(citation).font(.headline) }
                    if let circles {
                        if circles.isEmpty {
                            Text(w("library.studyNoCircles"))
                        } else {
                            Picker(w("library.studyWhich"), selection: $circleId) {
                                ForEach(circles) { Text($0.name).tag(String?.some($0.id)) }
                            }
                            Section(w("library.studyPrompt")) {
                                KindComposer(title: w("library.studyPromptHint"), text: $prompt, limit: 2000)
                            }
                        }
                    } else if error == nil {
                        ProgressView()
                    }
                    if let error { Text(error).foregroundStyle(.red) }
                }
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button(w("common.cancel")) { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button(w("library.studyBegin")) { Task { await start() } }
                            .disabled(busy || circleId == nil || prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            }
        }
        .navigationTitle(w("library.studyStart"))
        .task {
            guard circles == nil else { return }
            do {
                let mine = try await model.store.api.myCircles()
                circles = mine.circles
                circleId = circleId ?? mine.circles.first?.id
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func start() async {
        guard let circleId else { return }
        busy = true
        defer { busy = false }
        do {
            started = try await model.store.api.startStudy(circleId: circleId, prompt: prompt, of: subject)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// A circle's studies, newest talk first.
struct StudyListView: View {
    @Environment(AppModel.self) private var model
    let circleId: String
    @State private var list: StudyList?
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        List {
            if let error { Section { Text(error).foregroundStyle(.red) } }
            Section { Text(w("library.studyHow")) }
            if let list {
                if list.studies.isEmpty { Text(w("library.studiesNone")) }
                ForEach(list.studies) { s in
                    NavigationLink { StudyRoomView(id: s.id) } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(s.passage.citation).font(.headline)
                            Text(s.prompt)
                            Text(w("library.studyBy", ["name": s.author.displayName ?? w("library.studySomeone")], count: s.replies)).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .accessibilityLabel(w("library.studyOpenOne", ["citation": s.passage.citation]))
                }
            } else if error == nil {
                ProgressView()
            }
        }
        .navigationTitle(list.map { w("library.studiesIn", ["circle": $0.circle.name]) } ?? w("library.studies"))
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            list = try await model.store.api.studies(circle: circleId)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// One study: the passage, the opening question, and the talk, with answers under the reply they answer.
struct StudyRoomView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let id: String
    @State private var room: StudyRoom?
    @State private var draft = ""
    @State private var answering: StudyReply?
    @State private var busy = false
    @State private var error: String?
    private var w: Words { model.words }

    var body: some View {
        List {
            if let error { Section { Text(error).foregroundStyle(.red) } }
            if let room {
                let s = room.study
                Section {
                    if let plan = s.plan { Text(w("library.studyPlanDay", ["plan": plan.title, "day": String(plan.day)])).font(.caption).foregroundStyle(.secondary) }
                    Text(s.passage.quote).textSelection(.enabled)
                    Text(s.passage.citation).font(.caption).foregroundStyle(.secondary)
                    ListenRow(collection: s.passage.collection, key: s.passage.key, text: s.passage.quote, citation: s.passage.citation)
                }
                Section {
                    Text(s.author.displayName ?? w("library.studySomeone")).font(.caption).foregroundStyle(.secondary)
                    Text(s.prompt)
                    if s.canRemove {
                        Button(w("library.studyRemove"), role: .destructive) {
                            Task {
                                do {
                                    try await model.store.api.removeStudy(s.id)
                                    dismiss()
                                } catch {
                                    self.error = error.localizedDescription
                                }
                            }
                        }
                    }
                }
                if room.replies.isEmpty { Text(w("library.studyQuiet")) }
                ForEach(room.replies) { r in
                    Section {
                        reply(r)
                        ForEach(r.answers ?? []) { a in reply(a).padding(.leading, 24) }
                    }
                }
                Section {
                    if let answering {
                        HStack {
                            Text(w("library.studyAnswering", ["name": answering.author.displayName ?? w("library.studySomeone")])).font(.caption)
                            Button(w("common.cancel")) { self.answering = nil }
                        }
                    }
                    KindComposer(title: w("library.studyReply"), text: $draft, limit: 1000)
                    Button(w("library.studySend")) { Task { await send() } }
                        .disabled(busy || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            } else if error == nil {
                ProgressView()
            }
        }
        .navigationTitle(room?.study.passage.citation ?? w("library.studies"))
        .task { await load() }
        .refreshable { await load() }
    }

    @ViewBuilder private func reply(_ r: StudyReply) -> some View {
        let name = r.author.displayName ?? w("library.studySomeone")
        VStack(alignment: .leading, spacing: 4) {
            Text(name).font(.caption).foregroundStyle(.secondary)
            Text(r.body)
            HStack {
                Button(w("library.studyAnswer")) { answering = r }
                    .buttonStyle(.borderless)
                    .accessibilityLabel(w("library.studyAnswerOne", ["name": name]))
                if r.canRemove {
                    Button(w("library.studyTakeDown"), role: .destructive) { act { try await model.store.api.removeStudyReply(r.id) } }
                        .buttonStyle(.borderless)
                }
            }
        }
    }

    private func act(_ call: @escaping () async throws -> Void) {
        Task {
            do {
                try await call()
                await load()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func send() async {
        busy = true
        defer { busy = false }
        do {
            try await model.store.api.studyReply(id, body: draft, parentId: answering?.id)
            draft = ""
            answering = nil
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func load() async {
        do {
            room = try await model.store.api.study(id)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}
