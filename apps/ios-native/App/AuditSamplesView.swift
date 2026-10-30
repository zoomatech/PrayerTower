#if DEBUG
import PrayerTowerKit
import SwiftUI

/// Debug builds only: every feed layout and the darkest and lightest built-in skins with sample
/// requests, no server needed, for the skin screenshots. Opened with the launch argument
/// -PTAuditSamples.
struct AuditSamplesView: View {
    static let launchArgument = "-PTAuditSamples"

    /// Tokens follow the supabase/migrations seeds.
    static let skins: [FeedTheme] = [
        FeedTheme(slug: "beanstalk", name: "Beanstalk", layout: "vine", tokens: ["vineStyle": .string("beanstalk"), "stemWidth": .number(12)]),
        FeedTheme(slug: "golden-wood", name: "Golden Wood", layout: "vine", tokens: ["vineStyle": .string("ink"), "ink": .string("#3A2E1F"), "backdrop": .string("#F4ECD8")]),
        FeedTheme(slug: "moonlit-gate", name: "Moonlit Gate", layout: "vine", tokens: [
            "vineStyle": .string("gate"), "backdrop": .string("#0B1324"), "stem": .string("#CFE0F5"), "leaf": .string("#E6EEF9"),
            "leafSoft": .string("#EEF3FA"), "tendril": .string("#9FC3E8"), "branch": .string("#8FA6BD"), "stemWidth": .number(2),
        ]),
        FeedTheme(slug: "neon-cinderella", name: "Neon Cinderella", layout: "vine", tokens: [
            "vineStyle": .string("neon"), "backdrop": .string("#0B0820"), "leaf": .string("#8FB3FF"), "stemWidth": .number(3), "scenery": .string("fairytale"),
        ]),
        FeedTheme(slug: "blossom-garden", name: "Blossom Garden", layout: "vine", tokens: ["vineStyle": .string("floral"), "stemWidth": .number(3)]),
        FeedTheme(slug: "christmas-star", name: "Christmas Star", layout: "vine", tokens: [
            "backdrop": .string("#0D1B36"), "stem": .string("#E8C15A"), "leaf": .string("#FFF4C2"), "leafSoft": .string("#FFF8E1"),
            "tendril": .string("#FFD36E"), "stemGlow": .bool(true), "leafShape": .string("star"),
        ]),
        FeedTheme(slug: "wall", name: "Wall", layout: "wall", tokens: ["backdrop": .string("#101418")]),
        FeedTheme(slug: "prayer-tower", name: "Prayer Tower", layout: "tower", tokens: [:]),
        FeedTheme(slug: "neon-circuit", name: "Neon Circuit", layout: "circuit", tokens: [:]),
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
                    // The same bars as the feed, so the title stays readable on a dark skin.
                    .skinBars(Skin.backdrop(skin))
                }
            }
            .navigationTitle("Skins")
        }
    }
}
#endif
