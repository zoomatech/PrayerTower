import PrayerTowerKit
import SwiftUI

/// Conversation helpers under a composer: one reply that fits the moment, a gentle question after
/// a downbeat answer, a greeting from another tradition, and kind closings. A tap only fills the
/// box; the member always edits and sends it. Each needs its Admin switch and the member's choice.
struct ReplyHelpersView: View {
    @Environment(AppModel.self) private var model
    let lastFromOther: String?
    let empty: Bool
    @Binding var text: String
    var postType: String?
    @State private var picked: String?

    var body: some View {
        if let prefs = model.talkPrefs {
            let chips = Talk.chips(features: model.features, prefs: prefs, words: model.words, lastFromOther: lastFromOther, empty: empty, postType: postType)
            let ownWords = model.features["ownWords"] && picked != nil && text == picked
            if !chips.isEmpty || ownWords {
                VStack(alignment: .leading, spacing: 6) {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack {
                            ForEach(chips, id: \.label) { chip in
                                Button(chip.label) { pick(chip.label) }
                                    .buttonStyle(.bordered)
                                    .accessibilityHint(chip.hint ?? model.words("talk.suggestionHint"))
                            }
                        }
                    }
                    .accessibilityElement(children: .contain)
                    .accessibilityLabel(model.words("talk.suggested"))
                    if ownWords { Text(model.words("talk.ownWords")).font(.footnote).foregroundStyle(.secondary) }
                }
            }
        }
    }

    private func pick(_ s: String) {
        picked = s
        text = s
        let w = model.words
        AccessibilityNotification.Announcement(model.features["ownWords"] ? "\(w("talk.picked")) \(w("talk.ownWords"))" : w("talk.picked")).post()
    }
}

/// On Me: the member's own choices for the helpers the admin turned on.
struct ConversationPrefsSection: View {
    @Environment(AppModel.self) private var model
    @State private var error: String?

    private var w: Words { model.words }
    private var f: Features { model.features }

    var body: some View {
        if let prefs = model.talkPrefs, f["replySuggestions"] || f["troubleNudge"] || f["kindClosings"] || f["greetingPacks"] || f["talkCounts"] {
            Section {
                if f["replySuggestions"] { toggle("talk.prefSuggestions", "talk.prefSuggestionsHint", "replySuggestions", prefs.replySuggestions) }
                if f["troubleNudge"] { toggle("talk.prefCare", "talk.prefCareHint", "troubleNudge", prefs.troubleNudge) }
                if f["kindClosings"] { toggle("talk.prefClosings", "talk.prefClosingsHint", "kindClosings", prefs.kindClosings) }
                if f["talkCounts"] { toggle("talk.prefShareCounts", "talk.prefShareCountsHint", "shareCounts", prefs.shareCounts) }
                if f["greetingPacks"] {
                    Picker(w("talk.prefPack"), selection: Binding(get: { prefs.greetingPack ?? "" }, set: { p in Task { await save(["greetingPack": p.isEmpty ? .null : .string(p)]) } })) {
                        Text(w("talk.prefPackNone")).tag("")
                        ForEach(Talk.packs, id: \.self) { Text(w("talk.packs.\($0).name")).tag($0) }
                    }
                }
                if let error { Text(error).foregroundStyle(.red) }
            } header: {
                Text(w("talk.prefsTitle"))
            } footer: {
                Text(w("talk.prefsIntro"))
            }
        }
    }

    private func toggle(_ label: String, _ hint: String, _ field: String, _ on: Bool) -> some View {
        Toggle(isOn: Binding(get: { on }, set: { v in Task { await save([field: .bool(v)]) } })) {
            Text(w(label))
            Text(w(hint))
        }
    }

    private func save(_ patch: [String: JSONValue]) async {
        do {
            model.talkPrefs = try await model.store.api.updateConversationPrefs(patch)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}
