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
        // On a neon backdrop the icons sit from the card's left edge, evenly spaced, rather than
        // each centered in an equal share of the row.
        HStack(spacing: glow == nil ? 0 : 6) {
            ForEach(items) { item in
                Button { onAction(item.action) } label: {
                    glyph(item)
                        .frame(maxWidth: glow == nil ? .infinity : nil, minHeight: max(44, size + 12))
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
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Actions")
    }

    /// The icon drawn in Steve's post mockups (App/ActionIcons, the same art as the Expo app's
    /// assets/images/actions), except Share, the standard share icon, and Commit to Pray, a radio
    /// antenna with broadcast waves (Steve, 2026-10-30).
    /// Open Circle keeps its emoji for the two prayer actions, religious signs there. On a neon
    /// backdrop (`glow`), each is a techy neon button: a standard icon lit as neon in a glass frame.
    @ViewBuilder private func glyph(_ item: ActionItem) -> some View {
        let emojiOnly = wording == .neutral && (item.action == .prayingNow || item.action == .commit)
        if let glow {
            NeonButtonGlyph(symbol: Self.standardSymbol(item.action), color: glow, size: size, action: item.action)
        } else if item.action == .share || item.action == .commit {
            Image(systemName: Self.standardSymbol(item.action)).font(.system(size: size * 0.75, weight: .semibold)).foregroundStyle(Color.accessibleAccent)
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
        case .thumbsUp: "M2.5 10.5 L6.5 10.5 L6.5 21 L2.5 21 Z M6.5 11.5 L10 4.5 L11 3 L12.8 3.6 L13.2 6 L12.4 9.5 L19.6 9.5 L21 11 L20.6 12.6 L19.6 13 L20.4 14.6 L19.6 16.2 L18.6 16.4 L19 17.8 L18 19.4 L16.4 19.6 L16.4 20.4 L15.4 21 L6.5 21 M19.6 13 L14.5 13 M18.6 16.4 L14.5 16.4 M16.4 19.6 L14.5 19.6"
        case .commit: "antenna.radiowaves.left.and.right"
        case .encouragement: "paperplane"
        case .wellWishes: "M12 21 L3.2 12.2 L2.6 8.6 L4.4 5 L8 4 L12 7 L16 4 L19.6 5 L21.4 8.6 L20.8 12.2 Z M12 17 L6.2 11.2 L5.9 9.1 L7 7.2 L8.6 6.9"
        case .share: "square.and.arrow.up"
        case .giftTokens: "gift"
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

/// A neon icon, Tron style (Steve, 2026-10-30): straight lines with small smooth joins, drawn as a
/// neon glass tube glowing in the skin's color, on a 24-point grid.
struct NeonButtonGlyph: View {
    let symbol: String
    var art: Image? = nil
    let color: Color
    var size: CGFloat = 40
    /// The action drawn; nil draws `tron` instead.
    var action: CardAction? = nil
    var tron: String? = nil

    var body: some View {
        let d = tron ?? action.map(TronIcon.path) ?? ""
        let shape = TronShape(d: d)
        let w = max(1.6, size * 0.72 / 24 * 1.7)
        func line(_ k: CGFloat) -> StrokeStyle { StrokeStyle(lineWidth: max(1, w * k), lineCap: .round, lineJoin: .round) }
        // The same layers as `NeonGlassLook`: the glow, then glass deeper at its edges, then the white-hot core.
        return ZStack {
            shape.stroke(color.opacity(0.8), style: line(3)).blur(radius: w * 2.2)
            shape.stroke(color, style: line(1.6)).blur(radius: w * 0.9)
            shape.stroke(color, style: line(1))
            shape.stroke(Color.black.opacity(0.4), style: line(1))
            shape.stroke(color, style: line(0.72))
            shape.stroke(Color.white.opacity(0.4), style: line(0.45))
            shape.stroke(Color.white.opacity(0.66), style: line(0.2))
        }
        .frame(width: size * 0.72, height: size * 0.72)
        .frame(width: size + 4, height: size)
        .accessibilityHidden(true)
    }
}

/// A Tron icon's outline as a shape, from its path on the 24-point grid.
struct TronShape: Shape {
    let d: String
    func path(in r: CGRect) -> Path { TronIcon.shape(d, in: r) }
}

/// The Tron icons' outlines, as straight-line paths on a 24-point grid ("M x y L x y … Z").
enum TronIcon {
    static func path(_ action: CardAction) -> String {
        switch action {
        // Two hands pressed together in prayer, fingers up.
        case .prayingNow: "M12 3 L12 18 M12 3 L9 7 L7 13 L4 16 L4 21 L9 21 L12 18 M12 3 L15 7 L17 13 L20 16 L20 21 L15 21 L12 18 M9.5 8 L9.5 14 M14.5 8 L14.5 14"
        case .thumbsUp: "M2.5 10.5 L6.5 10.5 L6.5 21 L2.5 21 Z M6.5 11.5 L10 4.5 L11 3 L12.8 3.6 L13.2 6 L12.4 9.5 L19.6 9.5 L21 11 L20.6 12.6 L19.6 13 L20.4 14.6 L19.6 16.2 L18.6 16.4 L19 17.8 L18 19.4 L16.4 19.6 L16.4 20.4 L15.4 21 L6.5 21 M19.6 13 L14.5 13 M18.6 16.4 L14.5 16.4 M16.4 19.6 L14.5 19.6"
        case .wellWishes: "M12 21 L3.2 12.2 L2.6 8.6 L4.4 5 L8 4 L12 7 L16 4 L19.6 5 L21.4 8.6 L20.8 12.2 Z M12 17 L6.2 11.2 L5.9 9.1 L7 7.2 L8.6 6.9"
        // Commit to Pray: a radio antenna sending out broadcast waves (Steve, 2026-10-30).
        case .commit: "M12 4.5 L13.2 6 L12 7.5 L10.8 6 Z M12 7.5 L12 9.5 M12 9.5 L7 22 M12 9.5 L17 22 M10.4 13.5 L13.6 13.5 M9.2 17 L14.8 17 M8 20.3 L16 20.3 M10.4 13.5 L14.8 17 M9.2 17 L16 20.3 M8.6 3.4 L7 6 L8.6 8.6 M15.4 3.4 L17 6 L15.4 8.6 M5.4 1.8 L3 6 L5.4 10.2 M18.6 1.8 L21 6 L18.6 10.2"
        case .share: "M12 3 L12 15 M8 7 L12 3 L16 7 M8 10 L5 10 L5 21 L19 21 L19 10 L16 10"
        // An open hand reaching out to lend a helping hand.
        case .giftTokens: "M5 9 L5 20 M5 10.5 L9 8.5 L13.5 8.5 L15.5 4.5 L17.5 5 L16.5 9 L21.5 10 L22 11.5 L15 12 L21.5 13 L22 14.5 L15 15 L21 16 L21 17.5 L12 18.5 L5 18.5"
        case .encouragement: "M3 11 L21 4 L15 20 L11 13 Z M11 13 L21 4"
        }
    }

    /// A reply arrow, for a comment's icons.
    static let reply = "M10 6 L4 12 L10 18 M4 12 L15 12 L20 17 L20 20"

    static func shape(_ d: String, in r: CGRect) -> Path {
        var p = Path()
        // "M12 3": the command letter sits against its first number, so split them apart first.
        let spaced = d.replacingOccurrences(of: "M", with: "M ").replacingOccurrences(of: "L", with: "L ").replacingOccurrences(of: "Z", with: " Z ")
        let parts = spaced.split(separator: " ")
        var i = 0
        func point() -> CGPoint {
            let x = Double(parts[i]) ?? 0, y = Double(parts[i + 1]) ?? 0
            i += 2
            return CGPoint(x: r.minX + x / 24 * r.width, y: r.minY + y / 24 * r.height)
        }
        while i < parts.count {
            let c = parts[i]
            i += 1
            switch c {
            case "M": p.move(to: point())
            case "L": p.addLine(to: point())
            case "Z": p.closeSubpath()
            default: break
            }
        }
        return p
    }
}
