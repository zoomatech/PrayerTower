import AVFoundation
import PrayerTowerKit
import SwiftUI

/// Reads passages aloud with the device's own voice; nothing leaves the device.
@MainActor @Observable final class PassageSpeaker: NSObject, AVSpeechSynthesizerDelegate {
    static let shared = PassageSpeaker()
    private let synth = AVSpeechSynthesizer()
    /// The passage being read, by key.
    private(set) var speaking: String?

    override init() {
        super.init()
        synth.delegate = self
    }

    func toggle(_ key: String, text: String) {
        if speaking == key {
            stop()
            return
        }
        synth.stopSpeaking(at: .immediate)
        let u = AVSpeechUtterance(string: text)
        u.voice = AVSpeechSynthesisVoice(language: "en-US")
        speaking = key
        synth.speak(u)
    }

    func stop() {
        synth.stopSpeaking(at: .immediate)
        speaking = nil
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in self.speaking = nil }
    }
}

/// Listen under a passage, as the Expo app's ListenPassage: the device voice, and a LibriVox recording where one exists.
struct ListenRow: View {
    @Environment(AppModel.self) private var model
    let collection: String
    let key: String
    let text: String
    let citation: String
    /// nil: not looked up yet; .some(nil): no recording of this place.
    @State private var recording: LibraryRecording??
    @State private var player: AVPlayer?
    @State private var playing = false

    var body: some View {
        let w = model.words
        if model.features["libraryListen"] {
            let speaking = PassageSpeaker.shared.speaking == key
            Button(speaking ? w("library.listenStop") : w("library.listen")) { PassageSpeaker.shared.toggle(key, text: "\(text)\n\(citation)") }
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

    private func find() async {
        recording = .some((try? await model.store.api.libraryRecording(collection: collection, key: key)) ?? nil)
    }

    private func play(_ r: LibraryRecording) {
        if playing {
            player?.pause()
            playing = false
            return
        }
        PassageSpeaker.shared.stop()
        if player == nil, let url = URL(string: r.url) { player = AVPlayer(url: url) }
        player?.play()
        playing = true
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
