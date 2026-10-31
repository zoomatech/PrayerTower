import PrayerTowerKit
import SwiftUI

/// Me → Make your own feed skin (apps/mobile/src/app/skin-idea.tsx): a layout, colors, a comment
/// shape and the stem, with a live preview drawn by the real feed skins. On iPad and Mac the
/// preview stays in view beside the form.
struct ThemeMakerView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var maker = SkinMaker()
    @State private var mine: [ThemeProposal] = []
    @State private var busy = false
    @State private var sent = false
    @State private var error: String?

    var body: some View {
        Group {
            if sizeClass == .regular {
                HStack(alignment: .top, spacing: 24) {
                    form
                    VStack(alignment: .leading) {
                        Text("Preview").font(.headline)
                        SkinPreview(theme: maker.preview, wording: model.wording).frame(height: 420)
                    }
                    .frame(width: 380)
                    .padding(.trailing)
                }
            } else {
                form
            }
        }
        .navigationTitle("Make your own feed skin")
        .task { await loadMine() }
    }

    private var form: some View {
        Form {
            Section {
                Text("Pick a layout, colors and shapes, and watch the preview. You can use your skin in Feed style right away. Everyone else can choose it once an admin approves it.")
                if sent {
                    Text("Saved! Your skin is ready in Feed style. Others see it once an admin approves it.").bold().foregroundStyle(.tint)
                }
                if let error { Text(error).foregroundStyle(.red) }
                TextField("Name", text: $maker.name).onChange(of: maker.name) { maker.name = String(maker.name.prefix(40)) }
                TextField("What it looks like", text: $maker.description, axis: .vertical)
                    .onChange(of: maker.description) { maker.description = String(maker.description.prefix(500)) }
            }
            Section("Layout") {
                Picker("Layout", selection: $maker.layout) {
                    ForEach(SkinMaker.Layout.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.inline)
                .labelsHidden()
                if sizeClass != .regular {
                    SkinPreview(theme: maker.preview, wording: model.wording).frame(height: 260).listRowInsets(EdgeInsets())
                }
            }
            Section {
                ForEach(maker.layout.colorFields, id: \.key) { field in
                    ColorRow(label: SkinMaker.colorLabel(field.key), hex: Binding(get: { maker.color(field.key) }, set: { maker.setColor(field.key, $0) }))
                }
                if !maker.colorsOk { Text("Colors are written like #6E8B4E.").font(.footnote) }
                if !maker.commentsReadable {
                    Text("The comment background is too dark for comments to be read. Pick a lighter color.").font(.footnote).foregroundStyle(.red)
                }
            } header: { Text("Colors") }
            if maker.layout == .vine {
                Section("Drawing style") {
                    Picker("Drawing style", selection: $maker.style) {
                        ForEach(SkinMaker.styles, id: \.style) { Text($0.label).tag($0.style) }
                    }
                }
                Section("Comment shape") {
                    Picker("Comment shape", selection: $maker.shape) {
                        ForEach(SkinMaker.shapes, id: \.shape) { Text($0.label).tag($0.shape) }
                    }
                }
                Section("Stem") {
                    Picker("Stem", selection: $maker.width) {
                        ForEach(SkinMaker.widths, id: \.width) { Text($0.label).tag($0.width) }
                    }
                    .pickerStyle(.segmented)
                    Toggle("Double outline stem", isOn: $maker.double)
                    Toggle("Glowing stem", isOn: $maker.glowing)
                    Toggle(isOn: $maker.fairytale) {
                        Text("Fairy-tale scenery")
                        Text("Neon castle, coach, clock and slipper drawings between posts.")
                    }
                }
            }
            Section {
                Button {
                    Task { await save() }
                } label: {
                    if busy { ProgressView() } else { Text("Save my skin") }
                }
                .disabled(!maker.canSave || busy)
            }
            Section("Your skins") {
                if mine.isEmpty { Text("No skins yet.").foregroundStyle(.secondary) }
                ForEach(mine) { p in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(p.name).bold()
                        Text(p.statusLine).font(.footnote)
                        if let note = p.reviewNote, !note.isEmpty { Text(note).font(.footnote).foregroundStyle(.secondary) }
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }

    private func loadMine() async {
        if let list = try? await model.store.api.myThemeProposals() { mine = list }
    }

    private func save() async {
        busy = true
        defer { busy = false }
        do {
            _ = try await model.store.api.proposeTheme(maker)
            sent = true
            error = nil
            maker.name = ""
            maker.description = ""
            await loadMine()
        } catch { self.error = error.localizedDescription }
    }
}

/// A color written as #RRGGBB, with a swatch and the system color picker beside it.
private struct ColorRow: View {
    let label: String
    @Binding var hex: String

    var body: some View {
        HStack {
            TextField(label, text: $hex)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onChange(of: hex) { hex = String(hex.prefix(7)) }
            ColorPicker(label, selection: Binding(get: { RGB(hex: hex).map { Color($0) } ?? .clear }, set: { hex = Self.hex($0) ?? hex }),
                        supportsOpacity: false)
                .labelsHidden()
        }
        .accessibilityElement(children: .contain)
    }

    private static func hex(_ color: Color) -> String? {
        let c = color.resolve(in: EnvironmentValues())
        let v = [c.red, c.green, c.blue].map { Int((min(max($0, 0), 1) * 255).rounded()) }
        return String(format: "#%02X%02X%02X", v[0], v[1], v[2])
    }
}

/// The skin drawn by the real feed, with two made-up requests. It's a picture only: no taps, hidden from VoiceOver.
struct SkinPreview: View {
    let theme: FeedTheme
    let wording: Wording

    var body: some View {
        SkinnedFeed(theme: theme, cards: SkinMaker.sampleCards(wording), wording: wording, row: { card in
            VStack(alignment: .leading, spacing: 4) {
                Text(card.author.displayName).font(.caption.bold())
                Text(card.body).font(.callout)
            }
            .padding(10)
        })
        .allowsHitTesting(false)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(.separator))
        .accessibilityHidden(true)
    }
}
