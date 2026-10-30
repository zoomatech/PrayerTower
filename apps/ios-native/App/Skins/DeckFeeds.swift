import PrayerTowerKit
import SwiftUI

/// Swipe to pray (the carousel): one request at a time, like a card deck. Swipe right (or tap
/// Pray) to pray, swipe left (or tap Next) to move on. A swipe never records a prayer by itself:
/// it asks first, so every prayer stays deliberate.
struct SwipeFeed<Row: View>: View {
    let cards: [Card]
    let wording: Wording
    let hasMore: Bool
    @ViewBuilder let row: (Card) -> Row
    let onEnd: () async -> Void
    let onPray: (Card) -> Void
    @State private var deck = SwipeDeck()
    @State private var drag: CGSize = .zero
    @State private var confirming: Card?
    @Environment(\.accessibilityReduceMotion) private var still

    var body: some View {
        let words = LayoutWords(wording)
        GeometryReader { geo in
            VStack(spacing: 16) {
                if deck.index < cards.count {
                    let card = cards[deck.index]
                    // The card scrolls when the words outgrow it; the bar flashes to say so.
                    ScrollView { row(card).padding(16) }
                        .scrollIndicatorsFlash(onAppear: true)
                        .background(.regularMaterial, in: .rect(cornerRadius: 18))
                        .offset(x: drag.width)
                        .rotationEffect(.degrees(still ? 0 : drag.width / 30))
                        .gesture(
                            DragGesture(minimumDistance: 24)
                                .onChanged { if abs($0.translation.width) > abs($0.translation.height) { drag = $0.translation } }
                                .onEnded { v in
                                    switch SwipeDeck.swipe(dx: v.translation.width, width: geo.size.width) {
                                    case .pray: confirming = card
                                    case .next: next()
                                    case .none: settle()
                                    }
                                }
                        )
                        .accessibilityAction(named: words.pray) { confirming = card }
                        .accessibilityAction(named: words.next) { next() }
                    AdaptiveStack {
                        Button("‹ \(words.next)") { next() }.buttonStyle(.bordered).tint(.primary)
                        Spacer(minLength: 0)
                        Button("\(words.pray) ›") { confirming = card }.buttonStyle(.borderedProminent)
                    }
                    Text("\(deck.index + 1) of \(cards.count)").font(.caption).foregroundStyle(Color.subtle)
                } else if hasMore {
                    ProgressView(words.loadingMore)
                } else {
                    Spacer()
                    Text(words.thanks).font(.headline)
                    Button(words.again) { deck.restart() }.buttonStyle(.bordered)
                    Spacer()
                }
            }
            .padding(16)
        }
        .confirmationDialog(words.confirm, isPresented: Binding(get: { confirming != nil }, set: { if !$0 { confirming = nil; settle() } }), presenting: confirming) { card in
            Button(words.pray) { onPray(card); next() }
            Button("Cancel", role: .cancel) { settle() }
        }
        .onChange(of: deck.index) { _, _ in
            if deck.needsMore(count: cards.count, atEnd: !hasMore) { Task { await onEnd() } }
        }
    }

    private func next() {
        // Reduce Motion: the card leaves at once instead of flying off.
        withAnimation(still ? nil : .easeOut(duration: 0.22)) { drag = .zero; deck.advance() }
    }

    private func settle() { withAnimation(still ? nil : .spring(duration: 0.3)) { drag = .zero } }
}

/// Flip: one request per page, turned with a fold, so each request gets the whole screen.
struct FlipFeed<Row: View>: View {
    let cards: [Card]
    let wording: Wording
    let hasMore: Bool
    @ViewBuilder let row: (Card) -> Row
    let onEnd: () async -> Void
    @Environment(\.accessibilityReduceMotion) private var still

    var body: some View {
        let words = LayoutWords(wording)
        // A plain copy, so the Sendable transition closure doesn't reach into the view.
        let fold = !still
        ScrollView(.vertical) {
            LazyVStack(spacing: 0) {
                ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
                    VStack(spacing: 12) {
                        ScrollView { row(card).padding(20) }.scrollBounceBehavior(.basedOnSize)
                        Text(words.folio(i, of: cards.count)).font(.caption).foregroundStyle(Color.subtle).padding(.bottom, 12)
                    }
                    .containerRelativeFrame([.horizontal, .vertical])
                    .scrollTransition { content, phase in
                        // Snaps without turning while Reduce Motion is on.
                        content
                            .rotation3DEffect(.degrees(fold ? phase.value * -55 : 0), axis: (x: 1, y: 0, z: 0), anchor: phase.value < 0 ? .bottom : .top, perspective: 0.6)
                            .opacity(fold ? 1 - abs(phase.value) * 0.4 : 1)
                    }
                    .task { if card.id == cards.last?.id { await onEnd() } }
                }
                if !hasMore {
                    VStack(spacing: 8) {
                        Text(words.lastPage).font(.title3.bold())
                        Text(words.allSeen).multilineTextAlignment(.center).foregroundStyle(Color.subtle)
                    }
                    .padding(32)
                    .containerRelativeFrame([.horizontal, .vertical])
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
    }
}
