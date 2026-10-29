import SwiftUI

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
    /// At least 44 by 44 points to tap (Apple's minimum), however small the label.
    func tapTarget() -> some View { frame(minWidth: 44, minHeight: 44).contentShape(.rect) }
}
