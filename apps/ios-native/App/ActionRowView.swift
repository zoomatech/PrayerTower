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
    /// assets/images/actions), except Share, which is the standard share icon (Steve, 2026-10-30).
    /// Open Circle keeps its emoji for the two prayer actions, religious signs there. On a neon
    /// backdrop (`glow`), each is a techy neon button: a standard icon lit as neon in a glass frame.
    @ViewBuilder private func glyph(_ item: ActionItem) -> some View {
        let emojiOnly = wording == .neutral && (item.action == .prayingNow || item.action == .commit)
        if let glow {
            // Praying hands have no standard symbol, so that one is Steve's drawn hands, lit as neon.
            NeonButtonGlyph(symbol: Self.standardSymbol(item.action), art: item.action == .prayingNow ? Self.art("action-praying_now") : nil, color: glow, size: size)
        } else if item.action == .share {
            Image(systemName: "square.and.arrow.up").font(.system(size: size * 0.75, weight: .semibold)).foregroundStyle(Color.accessibleAccent)
                .frame(width: size, height: size).accessibilityHidden(true)
        } else if !emojiOnly, let art = Self.art("action-\(item.action.rawValue)") {
            art.resizable().scaledToFit().frame(width: size, height: size).accessibilityHidden(true)
        } else {
            Text(item.icon).font(size > 28 ? .title : .title3)
        }
    }

    /// The standard icon for each action, for the neon buttons.
    static func standardSymbol(_ action: CardAction) -> String {
        switch action {
        case .prayingNow: "hands.sparkles.fill"
        case .thumbsUp: "hand.thumbsup.fill"
        case .commit: "mountain.2.fill"
        case .encouragement: "paperplane.fill"
        case .wellWishes: "heart.fill"
        case .share: "square.and.arrow.up"
        case .giftTokens: "gift.fill"
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

/// A techy neon button: a standard icon lit like neon (a white-hot core glowing in the skin's
/// color) inside a small glass-tube frame with elegant rounded corners, Tron style.
struct NeonButtonGlyph: View {
    let symbol: String
    /// Drawn art used in place of the symbol, lit the same way.
    var art: Image? = nil
    let color: Color
    var size: CGFloat = 40

    @ViewBuilder private var icon: some View {
        if let art {
            art.renderingMode(.template).resizable().scaledToFit().frame(width: size * 0.62, height: size * 0.62)
        } else {
            Image(systemName: symbol).font(.system(size: size * 0.5, weight: .semibold))
        }
    }

    var body: some View {
        icon
            .foregroundStyle(.white)
            .shadow(color: color, radius: 2)
            .shadow(color: color, radius: 5)
            .shadow(color: color.opacity(0.8), radius: 10)
            .frame(width: size + 4, height: size)
            .background {
                ConnectorOutline(shape: NeonFrame(radius: 9), look: NeonGlassLook(color: color, white: 0.6), width: 3)
            }
            .accessibilityHidden(true)
    }
}
