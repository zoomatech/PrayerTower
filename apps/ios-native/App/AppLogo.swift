import PrayerTowerKit
import SwiftUI
#if os(macOS)
import AppKit
#endif

/// The final Prayer Tower logo in the top-right corner of each main screen, as the Expo app's
/// logo bar (Steve, 2026-10-31). Prayer Tower edition only: Open Circle has its own brand.
/// The image is App/PrayerTowerLogo(@2x,@3x).png, loaded as App/ActionIcons are.
struct AppLogo: ViewModifier {
    private static let image: Image? = {
        #if os(iOS)
        UIImage(named: "PrayerTowerLogo").map { Image(uiImage: $0) }
        #else
        NSImage(named: "PrayerTowerLogo").map { Image(nsImage: $0) }
        #endif
    }()

    private var placement: ToolbarItemPlacement {
        #if os(iOS)
        .topBarTrailing
        #else
        .primaryAction
        #endif
    }

    func body(content: Content) -> some View {
        content.toolbar {
            if Edition.current == .prayerTower, let logo = Self.image {
                ToolbarItem(placement: placement) {
                    logo
                        .resizable()
                        .scaledToFit()
                        .frame(height: 34)
                        .accessibilityLabel("The Prayer Tower")
                        .accessibilityAddTraits(.isImage)
                        .accessibilityIdentifier("app-logo")
                }
            }
        }
    }
}

extension View {
    /// Adds the logo to the top-right of the navigation bar this view is in.
    func appLogo() -> some View { modifier(AppLogo()) }
}
