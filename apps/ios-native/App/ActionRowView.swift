import PrayerTowerKit
import SwiftUI

/// ONE row of the six action icons, in every design (Steve, 2026-10-29). Each icon's name is
/// its VoiceOver label and shows on a long press (and as a pointer tooltip on iPad and Mac).
/// With emoji meanings on, the long press also offers that emoji's meanings to choose from.
struct ActionRowView: View {
    let items: [ActionItem]
    let wording: Wording
    var active: Set<CardAction> = []
    let onAction: (CardAction) -> Void
    let onMeaning: (ActionItem, MeaningEmoji.Meaning) -> Void

    var body: some View {
        HStack(spacing: 0) {
            ForEach(items) { item in
                Button { onAction(item.action) } label: {
                    Text(item.icon)
                        .font(.title3)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(active.contains(item.action) ? Color.accentColor.opacity(0.15) : .clear, in: .capsule)
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .help(item.meaningWords(wording).map { "\(item.name)\n\($0)" } ?? item.name)
                .accessibilityLabel(item.name)
                .accessibilityAddTraits(active.contains(item.action) ? .isSelected : [])
                .contextMenu {
                    // The first entry is the name, so a long press always says what the icon does.
                    Button(item.name) { onAction(item.action) }
                    if let m = item.meanings {
                        Section("\(m.emoji) Choose what it means") {
                            ForEach(m.meanings) { meaning in
                                Button(meaning.word(wording)) { onMeaning(item, meaning) }
                            }
                        }
                    }
                }
                .accessibilityActions {
                    if let m = item.meanings {
                        ForEach(m.meanings) { meaning in
                            Button(meaning.word(wording)) { onMeaning(item, meaning) }
                        }
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Actions")
    }
}
