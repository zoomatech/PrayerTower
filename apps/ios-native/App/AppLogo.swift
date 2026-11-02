import PrayerTowerKit
import SwiftUI
#if os(macOS)
import AppKit
#endif

/// The final Prayer Tower logo in the top-right corner of each main screen, as the Expo app's
/// logo bar (Steve, 2026-10-31). Hidden wherever the words are neutral (Open Circle, either
/// edition): Open Circle has its own brand.
/// The image is App/PrayerTowerLogo(@2x,@3x).png, loaded as App/ActionIcons are. On a dark
/// background (dark mode, or a skin with a dark header) it is the reversed logo,
/// App/PrayerTowerLogoDark(@2x,@3x).png: "prayer tower" and the cross stay red and the rest of the
/// logo is light blue (Steve, 2026-11-02).
struct AppLogo: ViewModifier {
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var scheme
    @Environment(\.logoOnDark) private var skinIsDark

    private static func load(_ name: String) -> Image? {
        #if os(iOS)
        UIImage(named: name).map { Image(uiImage: $0) }
        #else
        NSImage(named: name).map { Image(nsImage: $0) }
        #endif
    }
    private static let light = load("PrayerTowerLogo")
    private static let dark = load("PrayerTowerLogoDark")

    /// A skin decides for itself; otherwise the system's light or dark mode does.
    private var image: Image? {
        (skinIsDark ?? (scheme == .dark)) ? (Self.dark ?? Self.light) : Self.light
    }

    private var placement: ToolbarItemPlacement {
        #if os(iOS)
        .topBarTrailing
        #else
        .primaryAction
        #endif
    }

    func body(content: Content) -> some View {
        content.toolbar {
            if model.wording != .neutral, let logo = image {
                ToolbarItem(placement: placement) {
                    logo
                        .resizable()
                        .scaledToFit()
                        // 34 points tall, centered in the bar's 44-point row: the Home and Menu
                        // buttons on the left are the same height, so their feet line up with its foot.
                        .frame(height: AppLogo.height)
                        .accessibilityLabel("The Prayer Tower")
                        .accessibilityAddTraits(.isImage)
                        .accessibilityIdentifier("app-logo")
                        // A bar item can't grow with the text size; held down at the larger sizes it
                        // shows enlarged in the Large Content Viewer, as Apple asks for bar items.
                        .accessibilityShowsLargeContentViewer {
                            logo.resizable().scaledToFit()
                            Text("The Prayer Tower")
                        }
                }
            }
        }
    }
}

extension AppLogo {
    /// The logo's height in the bar, which the Home and Menu buttons match.
    static let height: CGFloat = 34
}

extension View {
    /// Adds the logo to the top-right of the navigation bar this view is in.
    func appLogo() -> some View { modifier(AppLogo()) }
}

extension EnvironmentValues {
    /// Set by a skin that draws its own header: true when that header is dark, so the reversed
    /// logo shows. nil (the plain column) follows the system's light or dark mode.
    @Entry var logoOnDark: Bool? = nil
}
