import PrayerTowerKit
import SwiftUI

/// The hooks between a feed skin and the data (docs/SKIN_HOOKS.md). A skin decides only how
/// things look; what a button, a tap or a scroll DOES comes from here, so every skin's buttons
/// behave the same and a new skin can't get them wrong. FeedView fills it once and hands it to
/// whichever skin the member has; the card itself (`row`) gets its actions the same way.
struct FeedHooks {
    /// Every card action: Praying Now, like, Commit to Pray, encourage, well wishes, share, gift.
    var act: (CardAction, Card) -> Void = { _, _ in }
    /// Opens a post with all its comments; nil where nothing opens (a preview).
    var open: ((Card) -> Void)?
    /// A post's comments; nil uses the newest few the feed sent.
    var loadComments: ((Card) async -> [Comment])?
    /// Infinite scroll: the next page, and whether there is one.
    var loadMore: () async -> Void = {}
    var hasMore = false
}

extension View {
    /// Infinite scroll, the same in every skin: the next page loads once the last post shows.
    @MainActor func loadsMore(after card: Card, in cards: [Card], _ hooks: FeedHooks) -> some View {
        task { if card.id == cards.last?.id { await hooks.loadMore() } }
    }
}
