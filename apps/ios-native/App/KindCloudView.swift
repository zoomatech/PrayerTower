import PrayerTowerKit
import SwiftUI

/// The kind cloud ("What would Ted Lasso do?"): a small cloud beside a composer with a short
/// prayer and "Are you sure you want to put that out there?". It never stops a post; a person
/// reviews anything before it is blocked. Off until Admin turns on the kind cloud switch.
struct KindCloudView: View {
    @Environment(AppModel.self) private var model
    let text: String
    @State private var note: KindCloudNote?

    var body: some View {
        Group {
            if let note {
                VStack(alignment: .leading, spacing: 6) {
                    Text(note.prayer).font(.footnote.italic())
                    if let harm = note.harm {
                        Text(harm.message).font(.footnote)
                        ForEach(Array((harm.resources ?? []).enumerated()), id: \.offset) { _, r in
                            if let url = r.url.flatMap(URL.init(string:)) {
                                Link(r.label ?? r.name ?? url.host() ?? "Help", destination: url).font(.footnote)
                            } else if let phone = r.phone {
                                Text("\(r.label ?? r.name ?? "Call") \(phone)").font(.footnote)
                            }
                        }
                    }
                    Text(note.ask).font(.footnote.weight(note.strong ? .semibold : .regular))
                }
                .padding(10)
                .background(.thinMaterial, in: .rect(cornerRadius: 16))
                .accessibilityElement(children: .combine)
                .accessibilityLabel(KindCloud.label)
                .transition(.opacity)
            }
        }
        // Checked a moment after typing stops; the last answer stays up while the member edits.
        .task(id: text) {
            let draft = text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard model.features["kindCloud"] else { note = nil; return }
            guard !draft.isEmpty else { note = nil; return }
            try? await Task.sleep(for: KindCloud.wait)
            guard !Task.isCancelled else { return }
            let next = KindCloud.note(for: await model.store.api.precheck(draft), wording: model.wording)
            guard !Task.isCancelled else { return }
            if next != note, let next { AccessibilityNotification.Announcement(next.spoken).post() }
            note = next
        }
    }
}

/// A text box with the kind cloud under it, for every place a member writes.
struct KindComposer: View {
    let title: String
    @Binding var text: String
    var limit = 600

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField(title, text: $text, axis: .vertical)
                .lineLimit(2...8)
                .onChange(of: text) { _, new in if new.count > limit { text = String(new.prefix(limit)) } }
            KindCloudView(text: text)
        }
    }
}
