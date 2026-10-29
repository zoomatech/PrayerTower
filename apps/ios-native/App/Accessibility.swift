import SwiftUI
#if os(iOS)
import UIKit
#else
import AppKit
#endif

/// Side by side, or one under another at the accessibility text sizes, so labels never shrink
/// or cut off at the largest Dynamic Type.
struct AdaptiveStack<Content: View>: View {
    @Environment(\.dynamicTypeSize) private var size
    var spacing: CGFloat?
    @ViewBuilder let content: () -> Content

    init(spacing: CGFloat? = nil, @ViewBuilder content: @escaping () -> Content) {
        self.spacing = spacing
        self.content = content
    }

    var body: some View {
        let layout = size.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: spacing)) : AnyLayout(HStackLayout(spacing: spacing))
        layout(content)
    }
}

extension View {
    /// The navigation bar always shows its background (iPhone and iPad), so the title keeps the
    /// system's contrast over a dark or busy skin.
    @ViewBuilder func solidNavigationBar() -> some View {
        #if os(iOS)
        toolbarBackground(.visible, for: .navigationBar)
        #else
        self
        #endif
    }

    /// At least 44 by 44 points to tap (Apple's minimum), however small the label.
    func tapTarget() -> some View { frame(minWidth: 44, minHeight: 44).contentShape(.rect) }
}

/// An emoji or symbol drawn purely as decoration (the sign-in dove, the tower's climber, a star
/// mark). It is drawn on a canvas, so it is no text at all to VoiceOver or the accessibility
/// audit: hidden text was still checked for contrast and Dynamic Type.
struct DecorativeGlyph: View {
    let glyph: String
    var size: CGFloat = 28
    var color: Color = .primary

    var body: some View {
        Canvas { ctx, box in
            ctx.draw(Text(glyph).font(.system(size: size)).foregroundStyle(color), at: CGPoint(x: box.width / 2, y: box.height / 2))
        }
        .frame(width: size * 1.3, height: size * 1.3)
        .accessibilityHidden(true)
    }
}

extension Color {
    /// One color for light mode and one for dark.
    static func adaptive(light: String, dark: String) -> Color {
        let l = RGBA(light), d = RGBA(dark)
        #if os(iOS)
        return Color(UIColor { $0.userInterfaceStyle == .dark ? d.ui : l.ui })
        #else
        return Color(NSColor(name: nil) { $0.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? d.ns : l.ns })
        #endif
    }

    /// Quieter text that still reads at 6:1 or more on the page and grouped backgrounds, in place
    /// of the system's secondary gray (about 3.5:1, which the accessibility audit flags).
    static let subtle = adaptive(light: "#545458", dark: "#AEAEB2")
    /// Links and buttons: system blue is about 4:1 on white; these keep 4.5:1 or more on the page
    /// and grouped backgrounds in both modes.
    static let accessibleAccent = adaptive(light: "#0061CC", dark: "#409CFF")
}

private struct RGBA {
    let r, g, b: CGFloat
    init(_ hex: String) {
        let v = Int(hex.dropFirst(), radix: 16) ?? 0
        r = CGFloat((v >> 16) & 0xFF) / 255
        g = CGFloat((v >> 8) & 0xFF) / 255
        b = CGFloat(v & 0xFF) / 255
    }
    #if os(iOS)
    var ui: UIColor { UIColor(red: r, green: g, blue: b, alpha: 1) }
    #else
    var ns: NSColor { NSColor(srgbRed: r, green: g, blue: b, alpha: 1) }
    #endif
}
