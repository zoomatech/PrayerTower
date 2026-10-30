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
    /// The icons' size; bigger where the row sits on a skin's backdrop.
    var size: CGFloat = 28
    /// Set on a dark skin's backdrop: the drawn icons light up in this color, with a glow.
    var glow: Color? = nil

    var body: some View {
        HStack(spacing: 0) {
            ForEach(items) { item in
                Button { onAction(item.action) } label: {
                    glyph(item)
                        .frame(maxWidth: .infinity, minHeight: max(44, size + 12))
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

    /// The icon drawn in Steve's post mockups (App/ActionIcons, the same art as the Expo app's
    /// assets/images/actions). Open Circle keeps its emoji for the two prayer actions, religious signs there.
    @ViewBuilder private func glyph(_ item: ActionItem) -> some View {
        let emojiOnly = wording == .neutral && (item.action == .prayingNow || item.action == .commit)
        if !emojiOnly, let art = Self.art("action-\(item.action.rawValue)") {
            if let glow {
                art.renderingMode(.template).resizable().scaledToFit().frame(width: size, height: size)
                    .foregroundStyle(glow).shadow(color: glow, radius: 6).accessibilityHidden(true)
            } else {
                art.resizable().scaledToFit().frame(width: size, height: size).accessibilityHidden(true)
            }
        } else {
            Text(item.icon).font(size > 28 ? .title : .title3)
        }
    }

    private static func art(_ name: String) -> Image? {
        #if canImport(UIKit)
        UIImage(named: name).map { Image(uiImage: $0) }
        #else
        NSImage(named: name).map { Image(nsImage: $0) }
        #endif
    }
}
