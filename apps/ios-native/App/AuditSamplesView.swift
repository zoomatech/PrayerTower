#if DEBUG
import PrayerTowerKit
import SwiftUI

/// Debug builds only: every feed layout and the darkest and lightest built-in skins with sample
/// requests, no server needed, so the UI tests (UITests/AccessibilityAuditTests.swift) can run
/// Xcode's accessibility audit on each. Opened with the launch argument -PTAuditSamples.
struct AuditSamplesView: View {
    static let launchArgument = "-PTAuditSamples"

    /// Names match the buttons the UI tests tap; tokens follow the supabase/migrations seeds.
    static let skins: [FeedTheme] = [
        FeedTheme(slug: "beanstalk", name: "Beanstalk", layout: "vine", tokens: ["vineStyle": .string("beanstalk"), "stemWidth": .number(12)]),
        FeedTheme(slug: "golden-wood", name: "Golden Wood", layout: "vine", tokens: ["vineStyle": .string("ink"), "ink": .string("#3A2E1F"), "backdrop": .string("#F4ECD8")]),
        FeedTheme(slug: "moonlit-gate", name: "Moonlit Gate", layout: "vine", tokens: [
            "vineStyle": .string("gate"), "backdrop": .string("#0B1324"), "stem": .string("#CFE0F5"), "leaf": .string("#E6EEF9"),
            "leafSoft": .string("#EEF3FA"), "tendril": .string("#9FC3E8"), "branch": .string("#8FA6BD"), "stemWidth": .number(2),
        ]),
        FeedTheme(slug: "neon-cinderella", name: "Neon Cinderella", layout: "vine", tokens: [
            "vineStyle": .string("neon"), "backdrop": .string("#0B0820"), "stem": .string("#FF5FD2"), "stemGlow": .bool(true), "stemWidth": .number(3),
            "branch": .string("#FFD36E"), "leaf": .string("#8FB3FF"), "leafSoft": .string("#F3EDFF"), "tendril": .string("#FFD36E"),
            "leafShape": .string("star"), "scenery": .string("fairytale"), "leafEvery": .number(4),
        ]),
        // Tron-style neon (Steve, 2026-10-30): glass tubes only, straight runs with small curved
        // corners, growing downward. No scenery: Cinderella is its own style.
        FeedTheme(slug: "neon", name: "Neon", layout: "vine", tokens: [
            "vineStyle": .string("neon"), "backdrop": .string("#02040A"), "stem": .string("#00C8FF"), "stemWidth": .number(3),
            "branch": .string("#FF2B1C"), "leaf": .string("#00C8FF"), "leafSoft": .string("#EAFBFF"), "tendril": .string("#FF2B1C"),
        ]),
        FeedTheme(slug: "blossom-garden", name: "Blossom Garden", layout: "vine", tokens: ["vineStyle": .string("floral"), "stemWidth": .number(3)]),
        FeedTheme(slug: "christmas-star", name: "Christmas Star", layout: "vine", tokens: [
            "backdrop": .string("#0D1B36"), "stem": .string("#E8C15A"), "leaf": .string("#FFF4C2"), "leafSoft": .string("#FFF8E1"),
            "tendril": .string("#FFD36E"), "stemGlow": .bool(true), "leafShape": .string("star"),
        ]),
        FeedTheme(slug: "wall", name: "Wall", layout: "wall", tokens: ["backdrop": .string("#101418")]),
        FeedTheme(slug: "prayer-tower", name: "Prayer Tower", layout: "tower", tokens: [:]),
        FeedTheme(slug: "neon-circuit", name: "Neon Circuit", layout: "circuit", tokens: [
            "backdrop": .string("#05070D"), "wire": .string("#00E5FF"), "burst": .string("#FFFFFF"), "screen": .string("#FF2BD6"), "tilt": .number(10),
        ]),
        FeedTheme(slug: "swipe", name: "Swipe to pray", layout: "carousel", tokens: [:]),
        FeedTheme(slug: "flip", name: "Flip", layout: "flip", tokens: [:]),
    ]

    var body: some View {
        NavigationStack {
            List(Self.skins, id: \.slug) { skin in
                NavigationLink(skin.name) {
                    SkinnedFeed(theme: skin, cards: SkinMaker.sampleCards(.faith), wording: .faith, hasMore: false, row: { card in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(card.author.displayName).font(.subheadline.bold())
                            Text(card.body)
                        }
                        .accessibilityElement(children: .combine)
                    }, onEnd: {})
                    .navigationTitle(skin.name)
                    .navigationBarTitleDisplayMode(.inline)
                    // As FeedView does: the bar takes the skin's backdrop, light text on a dark one.
                    .skinBars(Skin.backdrop(skin))
                }
            }
            .navigationTitle("Skins")
        }
    }
}
#endif
