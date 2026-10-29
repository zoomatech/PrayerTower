import PrayerTowerKit
import SwiftUI
import UIKit

/// Photos on posts, kept in memory and on disk by their storage path. The signed URL changes
/// every time a post loads, so the system's URL cache never hits; this does, so going back to a
/// post or scrolling past a photo again doesn't download it again.
actor ImageCache {
    static let shared = ImageCache()

    private let memory = NSCache<NSString, UIImage>()
    private let folder: URL
    private var loading: [String: Task<UIImage?, Never>] = [:]

    init() {
        memory.totalCostLimit = 64 * 1024 * 1024
        folder = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("post-photos", isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    }

    func image(path: String, url: URL) async -> UIImage? {
        if let hit = memory.object(forKey: path as NSString) { return hit }
        // One download for a photo however many rows ask for it at once.
        if let running = loading[path] { return await running.value }
        let file = folder.appendingPathComponent(PhotoCacheKey.fileName(path))
        let task = Task<UIImage?, Never> {
            if let data = try? Data(contentsOf: file), let image = UIImage(data: data) { return image }
            guard let (data, response) = try? await URLSession.shared.data(from: url),
                  (response as? HTTPURLResponse)?.statusCode ?? 200 < 300,
                  let image = UIImage(data: data) else { return nil }
            try? data.write(to: file, options: .completeFileProtectionUntilFirstUserAuthentication)
            return image
        }
        loading[path] = task
        let image = await task.value
        loading[path] = nil
        if let image { memory.setObject(image, forKey: path as NSString, cost: Int(image.size.width * image.size.height * image.scale * image.scale * 4)) }
        return image
    }
}

/// A post's photo from the cache, with a placeholder while it loads.
struct CachedPhoto: View {
    let path: String
    let url: URL
    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFit()
            } else {
                Color.secondary.opacity(0.1).frame(height: 200)
            }
        }
        .task(id: path) { image = await ImageCache.shared.image(path: path, url: url) }
    }
}
