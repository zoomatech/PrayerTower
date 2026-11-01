import SwiftUI
#if os(macOS)
import AppKit
#endif

// What differs between iPhone, iPad and the Mac app, kept here so the screens stay one set of
// SwiftUI code (docs/SWIFT_PORT.md → iPad and Mac).

extension View {
    /// iPad pointer: the card under the pointer lifts. The Mac shows no hover effect on cards.
    @ViewBuilder func pointerHover() -> some View {
        #if os(iOS)
        contentShape(.hoverEffect, .rect(cornerRadius: 14)).hoverEffect(.lift)
        #else
        self
        #endif
    }
}

extension Color {
    static var pageBackground: Color {
        #if os(iOS)
        Color(.systemBackground)
        #else
        Color(nsColor: .windowBackgroundColor)
        #endif
    }

    static var softBackground: Color {
        #if os(iOS)
        Color(.secondarySystemBackground)
        #else
        Color(nsColor: .controlBackgroundColor)
        #endif
    }
}

#if os(macOS)
// iPhone-only text-field and navigation-bar settings mean nothing on the Mac, where a field is
// typed into with a full keyboard and windows have no navigation bar. These let the same screens
// compile there and do nothing.
enum UIKeyboardType { case `default`, numberPad, decimalPad, emailAddress, URL, phonePad, numbersAndPunctuation, asciiCapable }

struct TextInputAutocapitalization: Sendable {
    static let never = Self(), characters = Self(), words = Self(), sentences = Self()
}

enum NavigationBarTitleMode { case automatic, inline, large }

extension View {
    func keyboardType(_ type: UIKeyboardType) -> some View { self }
    func textInputAutocapitalization(_ style: TextInputAutocapitalization?) -> some View { self }
    func navigationBarTitleDisplayMode(_ mode: NavigationBarTitleMode) -> some View { self }
    /// A full-screen cover is a sheet on the Mac.
    func fullScreenCover<Content: View>(isPresented: Binding<Bool>, onDismiss: (() -> Void)? = nil, @ViewBuilder content: @escaping () -> Content) -> some View {
        sheet(isPresented: isPresented, onDismiss: onDismiss, content: content)
    }
}
#endif
