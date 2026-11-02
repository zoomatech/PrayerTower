import AVFoundation
import PhotosUI
import PrayerTowerKit
import SwiftUI
#if os(iOS)
import UIKit
#endif
import UniformTypeIdentifiers

/// Post a request, as apps/mobile/src/app/compose.tsx: the community's kinds of post, up to
/// 1,000 words with the kind cloud under them, up to 10 photos or short videos (or a background
/// for text), kind, realm, urgency, and the switches the admin has on.
struct ComposeView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var onPosted: (Card) -> Void = { _ in }
    /// Words to start from: three good things shared as praise, or a removed post being changed and shared again.
    var start: NewPost?

    @State private var draft = NewPost()
    @State private var picked: [PhotosPickerItem] = []
    @State private var media: [PickedMedia] = []
    @State private var busy = false
    @State private var error: String?
    /// Post my PrayerCast publicly, or PrayerCast privately: none until the member picks.
    @State private var castChoice: CastVisibility?
    /// Posted publicly, but the radio couldn't take it: only Close is left.
    @State private var posted = false
    @FocusState private var focused: Bool

    private var w: Words { model.words }
    private var words: Int { Compose.wordCount(draft.body) }
    private var videoCap: Int { Int(model.features.number("videoMaxSeconds") ?? Double(Compose.defaultVideoSeconds)) }
    private var background: Compose.Background? { media.isEmpty ? Compose.backgrounds.first { $0.id == draft.background } : nil }

    var body: some View {
        NavigationStack {
            Form {
                // No welcome line and no kind-of-post buttons: the send button says what can be posted
                // (Steve, 2026-11-02).
                Section {
                    TextField(w("compose.placeholder"), text: $draft.body, axis: .vertical)
                        .lineLimit(6...20)
                        .focused($focused)
                        .accessibilityLabel(w("compose.bodyLabel"))
                        .padding(background == nil ? 0 : 10)
                        .background(background.map { Color(hex: $0.color) } ?? .clear, in: .rect(cornerRadius: 12))
                        .foregroundStyle(background.map { Color(hex: $0.text) } ?? .primary)
                    KindCloudView(text: draft.body)
                    Text(w("compose.words", ["count": String(words), "max": String(Compose.maxWords)]))
                        .font(.footnote)
                        .foregroundStyle(words > Compose.maxWords ? .red : .secondary)
                }
                Section {
                    ScrollView(.horizontal) {
                        HStack {
                            ForEach(media) { m in
                                Button {
                                    media.removeAll { $0.id == m.id }
                                } label: {
                                    VStack {
                                        m.thumbnail.resizable().scaledToFill().frame(width: 72, height: 72).clipShape(.rect(cornerRadius: 8))
                                        Text(w("compose.remove")).font(.caption)
                                    }
                                }
                                .accessibilityLabel(w("compose.removeAttachment"))
                            }
                        }
                    }
                    if media.count < Compose.maxMedia {
                        PhotosPicker(w("compose.addMedia"), selection: $picked, maxSelectionCount: Compose.maxMedia - media.count, matching: .any(of: [.images, .videos]))
                    }
                    if media.isEmpty {
                        ScrollView(.horizontal) {
                            HStack {
                                Swatch(color: Color.softBackground, on: draft.background == nil, label: w("compose.noBackground")) { draft.background = nil }
                                ForEach(Compose.backgrounds) { b in
                                    Swatch(color: Color(hex: b.color), on: draft.background == b.id, label: w("compose.backgroundNamed", ["name": b.label])) { draft.background = b.id }
                                }
                            }
                        }
                        .accessibilityLabel(w("compose.background"))
                    }
                }
                Section(w("compose.realm")) {
                    ChoiceRow(options: Compose.realms, selected: draft.realm, label: { w("enums.prayerRealm.\($0)") }) { draft.realm = draft.realm == $0 ? nil : $0 }
                }
                if draft.postType == "prayer_request" {
                    Section(w("compose.urgency")) {
                        ChoiceRow(options: ["0", "1", "2", "3"], selected: String(draft.urgency), label: { w("compose.urgencies.\($0)") }) { draft.urgency = Int($0) ?? 0 }
                    }
                }
                Section {
                    Toggle(isOn: $draft.isAnonymous) { LabelHint(w("compose.anonymous"), w("compose.anonymousHint")) }
                    Toggle(isOn: $draft.isSensitive) { LabelHint(w("compose.sensitive"), w("compose.sensitiveHint")) }
                    if model.features["supportLabel"] {
                        Toggle(isOn: $draft.allSupportWelcome) { LabelHint(w("notebook.supportToggle"), w("notebook.supportHint")) }
                    }
                    if model.features["lament"] {
                        Toggle(isOn: Binding(get: { draft.isLament == true }, set: { draft.isLament = $0 })) { LabelHint(w("lament.toggle"), w("lament.toggleHint")) }
                        if draft.isLament == true {
                            Toggle(isOn: Binding(get: { draft.lamentRadio == true }, set: { draft.lamentRadio = $0 })) { LabelHint(w("lament.radio"), w("lament.radioHint")) }
                        }
                    }
                }
                if let error { Text(error).foregroundStyle(Color.danger) }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(w("common.cancel")) { dismiss() } }
            }
            // Two ways to send (Steve, 2026-11-02): a post, or a prayer PrayerCast to heaven, which is
            // also posted to the feed. Prayers and posts are kept apart so answered prayers can be counted.
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 8) {
                    if posted {
                        Button { dismiss() } label: { Text(w("common.close")).font(.headline).frame(maxWidth: .infinity).padding(.vertical, 6) }
                            .buttonStyle(.borderedProminent)
                    } else {
                    if casts {
                        // A required choice before a PrayerCast: neither is picked to start with (Steve, 2026-11-02).
                        CastChoice(label: w("compose.castPublic"), on: castChoice == .public) { castChoice = .public }
                        CastChoice(label: w("compose.castPrivate"), on: castChoice == .private) { castChoice = .private }
                        Button { Task { await submit(cast: true) } } label: {
                            Text(w("compose.cast")).font(.headline).frame(maxWidth: .infinity).padding(.vertical, 6)
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(castChoice == nil)
                        .accessibilityIdentifier("compose-cast")
                        // What "heaven*" means (Steve, 2026-11-02).
                        Text(w("compose.castNote")).font(.caption).foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    Button { Task { await submit(cast: false) } } label: {
                        Text(w("compose.post")).font(.headline).frame(maxWidth: .infinity).padding(.vertical, 6)
                    }
                    // Equal options: both solid blue (Steve, 2026-11-02).
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("compose-post")
                    }
                }
                .disabled(busy || (!posted && (draft.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || words > Compose.maxWords)))
                .padding(.horizontal)
                .padding(.vertical, 8)
                .background(.bar)
            }
            .onAppear {
                if let start, draft == NewPost() { draft = start }
                draft.isAnonymous = model.me?.profile.anonymousByDefault ?? false
                focused = true
            }
            .onChange(of: picked) { _, items in
                guard !items.isEmpty else { return }
                picked = []
                Task { await add(items) }
            }
        }
    }

    private func add(_ items: [PhotosPickerItem]) async {
        var tooLong = false
        for item in items {
            guard let m = await PickedMedia.load(item) else { continue }
            if m.video && !Compose.videoFits(seconds: m.seconds, cap: videoCap) { tooLong = true; continue }
            if media.count < Compose.maxMedia { media.append(m) }
        }
        error = tooLong ? w("compose.videoTooLong", ["count": String(videoCap)]) : nil
    }

    /// A prayer is PrayerCast; anything else is a post. Open Circle has no PrayerCast.
    private var casts: Bool { model.wording != .neutral }

    private func submit(cast: Bool) async {
        busy = true
        defer { busy = false }
        error = nil
        do {
            var p = draft
            // Post: a post that isn't a prayer (shared thanks stay praise).
            p.postType = cast || !casts ? (draft.postType == "praise" && !cast ? "praise" : "prayer_request") : (draft.postType == "praise" ? "praise" : "discussion")
            p.allSupportWelcome = model.features["supportLabel"] && draft.allSupportWelcome
            if !model.features["lament"] || draft.isLament != true { p.isLament = nil; p.lamentRadio = nil }
            if p.postType != "prayer_request" { p.urgency = 0 }
            p.media = []
            for m in media {
                p.media.append(try await model.store.api.uploadMedia(m.data, contentType: m.contentType, video: m.video, durationMs: m.seconds.map { Int($0 * 1000) }))
            }
            if cast, let choice = castChoice {
                // Posted and sent by radio together; if it can't be sent, nothing is saved.
                let sent = try await model.store.api.prayerCast(p, visibility: choice)
                if let card = sent.post { onPosted(card) }
                if let why = sent.castError {
                    // Posted, but not sent by radio: say so, and leave only Close.
                    posted = true
                    error = w("compose.castFailed", ["reason": why])
                    return
                }
            } else {
                onPosted(try await model.store.api.createPost(p).post)
            }
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// A photo or video the member picked, ready to upload.
struct PickedMedia: Identifiable {
    let id = UUID()
    let data: Data
    let contentType: String
    let video: Bool
    let seconds: Double?
    let thumbnail: Image

    static func load(_ item: PhotosPickerItem) async -> PickedMedia? {
        let video = item.supportedContentTypes.contains { $0.conforms(to: .movie) }
        if video {
            guard let movie = try? await item.loadTransferable(type: Movie.self) else { return nil }
            defer { try? FileManager.default.removeItem(at: movie.url) }
            guard let data = try? Data(contentsOf: movie.url) else { return nil }
            let asset = AVURLAsset(url: movie.url)
            let seconds = try? await asset.load(.duration).seconds
            let mime = UTType(filenameExtension: movie.url.pathExtension)?.preferredMIMEType
            return PickedMedia(data: data, contentType: Compose.contentType(mime, video: true), video: true, seconds: seconds, thumbnail: Image(systemName: "video.fill"))
        }
        guard let data = try? await item.loadTransferable(type: Data.self) else { return nil }
        let mime = item.supportedContentTypes.first?.preferredMIMEType
        #if os(iOS)
        let image = UIImage(data: data).map(Image.init(uiImage:)) ?? Image(systemName: "photo")
        #else
        let image = NSImage(data: data).map(Image.init(nsImage:)) ?? Image(systemName: "photo")
        #endif
        return PickedMedia(data: data, contentType: Compose.contentType(mime, video: false), video: false, seconds: nil, thumbnail: image)
    }
}

/// A picked video, copied out of the photo library so it can be read and measured.
struct Movie: Transferable {
    let url: URL
    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { SentTransferredFile($0.url) } importing: { received in
            let copy = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).\(received.file.pathExtension)")
            try FileManager.default.copyItem(at: received.file, to: copy)
            return Movie(url: copy)
        }
    }
}

/// Chips in a wrapping row; one selected at a time.
struct ChoiceRow: View {
    let options: [String]
    let selected: String?
    let label: (String) -> String
    let choose: (String) -> Void

    @Environment(\.dynamicTypeSize) private var size

    var body: some View {
        // At the accessibility text sizes the chips stack, so no choice runs off the edge.
        if size.isAccessibilitySize {
            VStack(alignment: .leading) { chips }
        } else {
            ScrollView(.horizontal, showsIndicators: false) { HStack { chips } }
        }
    }

    private var chips: some View {
        ForEach(options, id: \.self) { o in
            let on = o == selected
            Button { choose(o) } label: { Text(label(o)).multilineTextAlignment(.leading) }
                // The chosen chip is filled (white on the accent), the rest plain, so both read clearly in dark mode.
                .buttonStyle(ChipStyle(on: on))
                .accessibilityAddTraits(on ? .isSelected : [])
        }
    }
}

private struct ChipStyle: ButtonStyle {
    let on: Bool
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, 14).padding(.vertical, 8)
            .frame(minHeight: 44)
            .foregroundStyle(on ? Color.white : Color.primary)
            // #0061CC: white text on it reads at 5.8:1, where white on system blue is only about 4:1.
            .background(on ? Color(red: 0, green: 0.38, blue: 0.8) : Color.secondary.opacity(0.15), in: .rect(cornerRadius: 12))
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

struct Swatch: View {
    let color: Color
    let on: Bool
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Circle().fill(color).frame(width: 36, height: 36).overlay(Circle().stroke(on ? Color.accentColor : .secondary, lineWidth: on ? 3 : 1))
                // The circle stays 36 pt; the tap area is 44 pt (Apple's minimum).
                .frame(width: 44, height: 44)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// A switch's title with its hint under it.
struct LabelHint: View {
    let title: String
    let hint: String
    init(_ title: String, _ hint: String) {
        self.title = title
        self.hint = hint
    }

    var body: some View {
        VStack(alignment: .leading) {
            Text(title)
            Text(hint).font(.footnote).foregroundStyle(Color.subtle)
        }
    }
}

extension Color {
    /// "#RRGGBB".
    init(hex: String) {
        let v = UInt64(hex.dropFirst(), radix: 16) ?? 0
        self.init(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
    }
}

/// One of the two PrayerCast choices: a check box that reads as a choice between the two.
private struct CastChoice: View {
    let label: String
    let on: Bool
    let pick: () -> Void

    var body: some View {
        Button(action: pick) {
            Label(label, systemImage: on ? "checkmark.square.fill" : "square")
                .frame(maxWidth: .infinity, alignment: .leading)
                .frame(minHeight: 44)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? [.isSelected] : [])
    }
}
