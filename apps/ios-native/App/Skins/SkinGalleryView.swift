import PrayerTowerKit
import SwiftUI

/// Me → Skin gallery (apps/mobile/src/app/skin-gallery.tsx), behind the `skinGallery` switch:
/// every skin the member can use now, with a small preview, who made it, likes and
/// "Use this skin". One column on iPhone, more on iPad and Mac.
struct SkinGalleryView: View {
    @Environment(AppModel.self) private var model
    @State private var skins: [GallerySkin]?
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Every feed skin you can use, including ones members made. Like your favorites, and tap “Use this skin” to wear one.")
                if let error {
                    HStack {
                        Text(error).foregroundStyle(.red)
                        Button("Try again") { Task { await run { try await model.store.api.skinGallery() } } }
                    }
                }
                if skins?.isEmpty == true { Text("No skins to show yet.").foregroundStyle(.secondary) }
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 300), spacing: 16)], spacing: 16) {
                    ForEach(skins ?? []) { skin in card(skin) }
                }
            }
            .padding()
        }
        .navigationTitle("Skin gallery")
        .task { await run { try await model.store.api.skinGallery() } }
    }

    private func card(_ s: GallerySkin) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SkinPreview(theme: s.theme, wording: model.wording).frame(height: 180)
            HStack {
                VStack(alignment: .leading) {
                    Text(s.displayName(model.wording)).bold()
                    Text(s.byline).font(.footnote).foregroundStyle(.secondary)
                }
                Spacer()
                Button {
                    Task { await run { try await model.store.api.likeSkin(s.slug, !s.liked) } }
                } label: {
                    Label("\(s.likes)", systemImage: s.liked ? "heart.fill" : "heart").frame(minWidth: 44, minHeight: 44)
                }
                .buttonStyle(.bordered)
                .accessibilityLabel(s.likeLabel(model.wording))
                .accessibilityAddTraits(s.liked ? .isSelected : [])
            }
            if s.inUse {
                Text("You’re using this skin").font(.footnote.bold()).foregroundStyle(.tint).frame(maxWidth: .infinity)
            } else {
                Button("Use this skin") { Task { await use(s.slug) } }.buttonStyle(.borderedProminent).frame(maxWidth: .infinity)
            }
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 16).fill(.background.secondary))
    }

    private func run(_ load: () async throws -> [GallerySkin]) async {
        do {
            skins = try await load()
            error = nil
        } catch { self.error = error.localizedDescription }
    }

    private func use(_ slug: String) async {
        do {
            _ = try await model.store.api.chooseFeedTheme(slug)
            model.feedStyle = slug
            await run { try await model.store.api.skinGallery() }
        } catch { self.error = error.localizedDescription }
    }
}
