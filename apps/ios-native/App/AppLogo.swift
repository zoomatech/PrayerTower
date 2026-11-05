import PrayerTowerKit
import SwiftUI
#if os(macOS)
import AppKit
#endif

/// The final Prayer Tower logo in the top-right corner of each main screen, as the Expo app's
/// logo bar (Steve, 2026-10-31). Hidden wherever the words are neutral (Open Circle, either
/// edition): Open Circle has its own brand.
/// The image is App/PrayerTowerLogo(@2x,@3x).png, loaded as App/ActionIcons are.
struct AppLogo: ViewModifier {
    @Environment(AppModel.self) private var model
    @Environment(\.logoPlate) private var plate
    @Environment(\.logoInCorner) private var inCorner

    static let image: Image? = {
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
            if model.wording != .neutral, !inCorner, let logo = Self.image {
                ToolbarItem(placement: placement) {
                    logo
                        .resizable()
                        .scaledToFit()
                        .frame(height: plate == nil ? 34 : 28)
                        // On a dark skin the logo's black and red sit on a light plate, edged in the
                        // skin's own line color, so it reads as itself (the logo is never recolored).
                        .padding(plate == nil ? 0 : 3)
                        .background { if let plate { RoundedRectangle(cornerRadius: 7).fill(Color.white).overlay(RoundedRectangle(cornerRadius: 7).stroke(plate, lineWidth: 2)).shadow(color: plate.opacity(0.6), radius: 4) } }
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

/// The logo in the top-right corner of the iPhone screens, twice the size it was in the bar
/// (Steve, 2026-11-02), on a light plate so its black and red read on every skin.
struct CornerLogo: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        if model.wording != .neutral, let logo = AppLogo.image {
            logo
                .resizable()
                .scaledToFit()
                .frame(height: 68)
                .padding(4)
                .background(Color.white, in: .rect(cornerRadius: 12))
                .shadow(color: .black.opacity(0.35), radius: 4, y: 1)
                .accessibilityLabel("The Prayer Tower")
                .accessibilityAddTraits(.isImage)
                .accessibilityIdentifier("app-logo")
        }
    }
}

extension View {
    /// Adds the logo to the top-right of the navigation bar this view is in.
    func appLogo() -> some View { modifier(AppLogo()) }
}

extension EnvironmentValues {
    /// A dark skin's line color: the logo then sits on a light plate edged in it.
    @Entry var logoPlate: Color? = nil
    /// True where the logo stands in the screen's corner instead of in the bar (iPhone).
    @Entry var logoInCorner: Bool = false
}
