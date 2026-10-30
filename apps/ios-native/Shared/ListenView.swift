import AVFoundation
import PrayerTowerKit
import SwiftUI
#if os(macOS)
import CoreAudio
#endif

// Listener mode on the iPhone and the Mac (the Expo Listen screen, natively): decode Prayer Tower
// radio bursts live from the microphone or another audio input, such as a receiver's audio out
// through a USB sound card. Decoding runs on the device with PrayerTowerKit's BurstDecoder; the
// sound never leaves it. Off until Admin → Radio turns the listening page on. With receipts on,
// the listener may send a signal report: call sign, preset, SNR and prayer fingerprints, never the
// words. With no server (`api` nil) it runs on sample data: it still decodes, and offers a
// recorded sample burst, but sends nothing.

struct ListenView: View {
    let api: APIClient?
    let words: Words
    var signedIn = true
    /// Offer the recorded sample burst (sample data, or the UI walks).
    var sample = false
    @State private var model = ListenModel()

    var body: some View {
        @Bindable var m = model
        let w = words
        Form {
            if let error = m.error { Section { Text(error).foregroundStyle(.red) } }
            if m.config == nil && m.error == nil { ProgressView() }
            if let c = m.config, !c.enabled { Text(w("listen.off")) }
            if let c = m.config, c.enabled {
                Section {
                    Text(w("listen.intro"))
                    if sample || api == nil {
                        Text(w("listen.sampleNote")).font(.footnote)
                        Button(w("listen.sample")) { m.playSample() }
                    }
                    Button(m.listening ? w("listen.stop") : w("listen.start")) {
                        if m.listening { m.stop() } else { Task { await m.start(micNeeded: w("listen.micNeeded")) } }
                    }
                    Text(m.listening ? (m.heard.isEmpty ? w("listen.waiting") : w("listen.heardCount", count: m.heard.count)) : w("listen.stopped"))
                        .font(.footnote)
                        .accessibilityAddTraits(.updatesFrequently)
                    ProgressView(value: Double(m.meter))
                        .accessibilityLabel(w("listen.level"))
                        .accessibilityValue("\(Int(m.meter * 100))%")
                }
                Section {
                    Picker(w("listen.input"), selection: $m.inputID) {
                        Text(w("listen.inputDefault")).tag(String?.none)
                        ForEach(m.inputs) { Text($0.name).tag(Optional($0.id)) }
                    }
                    .disabled(m.listening)
                    Text(w("listen.inputHint")).font(.footnote)
                    Toggle(w("listen.hf"), isOn: $m.hf)
                    Text(w("listen.hfHint")).font(.footnote)
                    if c.receipts && api != nil {
                        Toggle(w("listen.tell"), isOn: $m.tell)
                        Text(w("listen.tellHint")).font(.footnote)
                    }
                    if c.readAloud == true {
                        Toggle(w("readAloud.toggle"), isOn: $m.aloud)
                        Text(w("readAloud.hint")).font(.footnote)
                    }
                    // Prayer panels sent as SSTV pictures (PrayerPanelView), while the admin's switch is on.
                    if c.panel == true {
                        Toggle(w("panel.sstv"), isOn: $m.sstv)
                        Text(w("panel.sstvHint")).font(.footnote)
                        NavigationLink(w("panel.title")) { PrayerPanelView(api: api, words: w) }
                    }
                }
                ForEach(m.heard) { h in
                    Section {
                        Text(w("listen.from", ["callSign": h.frame.callSign, "time": h.at.formatted(date: .omitted, time: .standard)])).font(.headline)
                        Text((h.frame.preset == PrayerPanel.sstvPreset ? w("panel.sstvMeta") : w("listen.meta", ["preset": h.frame.preset, "snr": String(format: "%.1f", h.frame.snrDb)]))
                             + (h.frame.corrected ? ", \(w("listen.corrected"))" : ""))
                            .font(.footnote)
                        if let prayers = h.frame.prayers {
                            ForEach(Array(prayers.enumerated()), id: \.offset) { Text("• \($0.element)") }
                        } else {
                            Text(w("listen.otherCodec", ["codec": String(h.frame.codec)]))
                        }
                        if let told = h.told {
                            Text(told > 0 ? w("listen.told") : w("listen.report", count: told)).font(.footnote)
                        }
                    }
                }
                Section { Text(w("listen.tips")).font(.footnote) }
            }
        }
        .navigationTitle(w("listen.title"))
        .task { await m.load(api: api, signedIn: signedIn) }
        .onDisappear { m.stop() }
    }
}

/// An audio input the listener can pick: a USB sound card from a receiver, a headset, the built-in mic.
struct AudioInput: Identifiable, Hashable {
    let id: String
    let name: String
}

/// Keeps the rolling window and decodes it off the main thread (BurstListener in PrayerTowerKit).
actor ListenWorker {
    private var listener: BurstListener?
    /// Prayer panels sent as SSTV pictures, while the listener has that on.
    private var sstv: SstvListener?
    private var sstvOn = false

    func push(_ samples: [Float], rate: Int) {
        if listener?.rate != rate { listener = BurstListener(rate: rate) }
        listener?.push(samples)
        if sstvOn {
            if sstv?.inputRate != rate { sstv = SstvListener(rate: rate) }
            sstv?.push(samples)
        }
    }

    func setSstv(_ on: Bool) {
        sstvOn = on
        if !on { sstv = nil }
    }

    /// A whole SSTV picture with a panel in it, read once.
    func readSstv() -> HeardFrame? {
        guard let r = sstv?.read(), let panel = r.panel else { return nil }
        return .sstv(panel, end: r.end)
    }

    func decode(searchHz: Int) -> (frames: [HeardFrame], meter: Float) {
        let frames = listener?.decode(searchHz: searchHz) ?? []
        return (frames, listener?.meter ?? 0)
    }
}

@MainActor @Observable
final class ListenModel {
    struct Heard: Identifiable {
        let id = UUID()
        let frame: HeardFrame
        let at: Date
        /// How many prayers a signal report matched; nil when none was sent.
        var told: Int?
    }

    var config: ListenConfig?
    var error: String?
    var listening = false
    var meter: Float = 0
    var heard: [Heard] = []
    var hf = false
    var tell = true
    /// Also read prayer panels sent as SSTV pictures (offered while the admin's switch is on).
    var sstv = false {
        didSet { let on = sstv && config?.panel == true; let w = worker; Task { await w.setSstv(on) } }
    }
    /// Read decoded prayers aloud with the device's own voice (offered while the admin's switch is on).
    var aloud = false {
        didSet { if !aloud { speech.stopSpeaking(at: .immediate) } }
    }
    @ObservationIgnored private let speech = AVSpeechSynthesizer()
    var inputs: [AudioInput] = []
    var inputID: String?
    private var api: APIClient?
    private var worker = ListenWorker()
    private let engine = AVAudioEngine()
    private var feed: AsyncStream<[Float]>.Continuation?
    private var tasks: [Task<Void, Never>] = []

    func load(api: APIClient?, signedIn: Bool) async {
        self.api = api
        inputs = Self.availableInputs()
        guard let api else {
            config = .sample
            return
        }
        do {
            config = try await api.listenConfig(signedIn: signedIn)
        } catch {
            self.error = error.localizedDescription
        }
    }

    func start(micNeeded: String) async {
        guard !listening else { return }
        guard await Self.micAllowed() else {
            error = micNeeded
            return
        }
        error = nil
        do {
            try prepareInput()
            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            let (stream, feed) = AsyncStream.makeStream(of: [Float].self, bufferingPolicy: .bufferingNewest(200))
            self.feed = feed
            worker = ListenWorker()
            await worker.setSstv(sstv && config?.panel == true)
            Self.tap(input, format: format, into: feed)
            try engine.start()
            let rate = Int(format.sampleRate)
            let worker = worker
            tasks = [
                Task.detached { for await samples in stream { await worker.push(samples, rate: rate) } },
                Task { [weak self] in
                    while !Task.isCancelled {
                        let hf = self?.hf ?? false
                        try? await Task.sleep(for: .seconds(hf ? 4 : 2))
                        guard let self, !Task.isCancelled else { return }
                        let (frames, meter) = await worker.decode(searchHz: hf ? 50 : 0)
                        self.meter = meter
                        self.add(frames)
                    }
                },
                // Looking for an SSTV picture takes a moment, so only every six seconds.
                Task { [weak self] in
                    while !Task.isCancelled {
                        try? await Task.sleep(for: .seconds(6))
                        guard let self, !Task.isCancelled else { return }
                        if self.sstv, let f = await worker.readSstv() { self.add([f]) }
                    }
                },
            ]
            listening = true
        } catch {
            stop()
            self.error = error.localizedDescription
        }
    }

    func stop() {
        speech.stopSpeaking(at: .word)
        guard listening || feed != nil else { return }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        feed?.finish()
        feed = nil
        tasks.forEach { $0.cancel() }
        tasks = []
        listening = false
        meter = 0
        #if os(iOS)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        #endif
    }

    /// Decode the recorded sample burst, as if a radio had just played it.
    func playSample() {
        guard let burst = BurstDecoder.sampleBurst() else { return }
        Task {
            let w = ListenWorker()
            await w.push(burst.samples, rate: burst.rate)
            add(await w.decode(searchHz: 0).frames)
        }
    }

    private func add(_ frames: [HeardFrame]) {
        if aloud && config?.readAloud == true {
            for line in ReadAloud.lines(frames) {
                let u = AVSpeechUtterance(string: line)
                u.voice = AVSpeechSynthesisVoice(language: "en-US")
                speech.speak(u)
            }
        }
        for f in frames {
            let h = Heard(frame: f, at: .now)
            heard.insert(h, at: 0)
            report(h)
        }
    }

    /// The signal report: only while receipts are on and the listener agreed, and never on sample data.
    private func report(_ h: Heard) {
        guard let api, config?.receipts == true, tell, let r = BurstDecoder.report(h.frame) else { return }
        Task {
            let matched = (try? await api.listenHeard(r)) ?? 0
            if let i = heard.firstIndex(where: { $0.id == h.id }) { heard[i].told = matched }
        }
    }

    /// The tap runs on the audio thread, so it's made outside the main actor; it only hands samples on.
    nonisolated private static func tap(_ node: AVAudioInputNode, format: AVAudioFormat, into feed: AsyncStream<[Float]>.Continuation) {
        node.installTap(onBus: 0, bufferSize: 4096, format: format) { @Sendable buffer, _ in
            guard let ch = buffer.floatChannelData else { return }
            feed.yield(Array(UnsafeBufferPointer(start: ch[0], count: Int(buffer.frameLength))))
        }
    }

    private static func micAllowed() async -> Bool {
        #if os(iOS)
        await AVAudioApplication.requestRecordPermission()
        #else
        await AVCaptureDevice.requestAccess(for: .audio)
        #endif
    }

    // MARK: - Inputs

    #if os(iOS)
    private static func availableInputs() -> [AudioInput] {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.record, mode: .measurement)
        return (session.availableInputs ?? []).map { AudioInput(id: $0.uid, name: $0.portName) }
    }

    private func prepareInput() throws {
        let session = AVAudioSession.sharedInstance()
        // Measurement mode turns off the voice processing that would smooth a burst's level away.
        // While reading aloud is offered, the session also plays (to the speaker), so it can be read.
        if config?.readAloud == true {
            try session.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker])
        } else {
            try session.setCategory(.record, mode: .measurement)
        }
        try session.setPreferredInput(session.availableInputs?.first { $0.uid == inputID })
        try session.setActive(true)
    }
    #else
    private static func availableInputs() -> [AudioInput] {
        var address = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyDevices, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
        var size: UInt32 = 0
        let system = AudioObjectID(kAudioObjectSystemObject)
        guard AudioObjectGetPropertyDataSize(system, &address, 0, nil, &size) == noErr else { return [] }
        var ids = [AudioDeviceID](repeating: 0, count: Int(size) / MemoryLayout<AudioDeviceID>.size)
        guard AudioObjectGetPropertyData(system, &address, 0, nil, &size, &ids) == noErr else { return [] }
        return ids.compactMap { id in
            var streams = AudioObjectPropertyAddress(mSelector: kAudioDevicePropertyStreams, mScope: kAudioDevicePropertyScopeInput, mElement: kAudioObjectPropertyElementMain)
            var streamSize: UInt32 = 0
            guard AudioObjectGetPropertyDataSize(id, &streams, 0, nil, &streamSize) == noErr, streamSize > 0 else { return nil }
            var nameAddress = AudioObjectPropertyAddress(mSelector: kAudioObjectPropertyName, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
            var name: Unmanaged<CFString>?
            var nameSize = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
            guard AudioObjectGetPropertyData(id, &nameAddress, 0, nil, &nameSize, &name) == noErr, let cf = name?.takeRetainedValue() else { return nil }
            return AudioInput(id: String(id), name: cf as String)
        }
    }

    private func prepareInput() throws {
        guard let inputID, let device = AudioDeviceID(inputID) else { return }
        try engine.inputNode.auAudioUnit.setDeviceID(device)
    }
    #endif
}
