import PrayerTowerKit
import SwiftUI

/// The prayer feed with "Praying Now", the first screen to port (docs/SWIFT_PORT.md).
struct FeedView: View {
    @Environment(AppModel.self) private var model
    @State private var posts: [Card] = []
    @State private var prayed: Set<String> = []
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List(posts) { card in
                VStack(alignment: .leading, spacing: 8) {
                    Text(card.author.displayName).font(.subheadline.bold())
                    Text(card.preview)
                    HStack {
                        Text("\(card.counts.prayers) prayers").font(.caption).foregroundStyle(.secondary)
                        Spacer()
                        if !card.isMine {
                            Button(prayed.contains(card.id) ? "Prayed" : "Praying Now") {
                                Task { await pray(card) }
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(prayed.contains(card.id))
                        }
                    }
                }
                .accessibilityElement(children: .combine)
            }
            .overlay {
                if let error { ContentUnavailableView("Couldn’t load the feed", systemImage: "wifi.exclamationmark", description: Text(error)) }
            }
            .navigationTitle("Prayers")
            .refreshable { await load() }
            .task { await load() }
            .toolbar {
                Button("Sign out") {
                    Task {
                        await model.store.signOut()
                        model.state = .signedOut
                    }
                }
            }
        }
    }

    private func load() async {
        do {
            posts = try await model.store.api.feed().posts
            error = nil
        } catch let e as APIError where e.needsCode {
            model.state = .needsCode
        } catch let e as APIError where e.signedOut {
            model.state = .signedOut
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func pray(_ card: Card) async {
        do {
            _ = try await model.store.api.prayingNow(postId: card.id)
            prayed.insert(card.id)
        } catch {
            self.error = error.localizedDescription
        }
    }
}
